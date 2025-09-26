/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CancellationToken,
	CancellationTokenSource,
} from "../../../../base/common/cancellation.js";
import {
	Disposable,
	DisposableStore,
} from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Position } from "../../../../editor/common/core/position.js";
import { TextEdit } from "../../../../editor/common/languages.js";
import { KODIK_AGENT_ICON } from "../../inlineChat/browser/inlineChatActions.js";
import {
	IChatAgentData,
	IChatAgentHistoryEntry,
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentService,
} from "../common/chatAgents.js";
import {
	IChatFollowup,
	IChatProgress,
	IChatTextEdit,
	IChatResponseErrorDetails,
	IChatEditorLocationData,
} from "../common/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../common/constants.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { KodikInlineCompletionsProvider } from "./kodikInlineCompletionsProvider.js";

const KODIK_AGENT_ID = "kodik";

export interface IKodikExtensionApi {
	sendMessage(message: string): Promise<string>;
	isAvailable(): boolean;
	isAuthenticated(): Promise<boolean>;
	cancelCurrentTask?(): void;
	// Enhanced capabilities for better session management
	createSession?(): string;
	endSession?(sessionId: string): void;
	getSessionState?(sessionId: string): any;
	// Autocomplete-specific methods using dedicated autocomplete mode
	sendAutocompleteRequest?(prompt: string, context?: any): Promise<string>;
	isAutocompleteAvailable?(): boolean;
}

// Enhanced session state tracking
interface IKodikSession {
	id: string;
	startTime: number;
	lastActivity: number;
	context: {
		filePath?: string;
		selection?: {
			startLine: number;
			startColumn: number;
			endLine: number;
			endColumn: number;
		};
		selectedText?: string;
	};
	cancellationTokenSource: CancellationTokenSource;
	disposables: DisposableStore;
}

export class KodikAgent extends Disposable implements IChatAgentImplementation {
	private _kodikApi: IKodikExtensionApi | undefined;
	private _activeSessions = new Map<string, IKodikSession>();
	private _sessionCounter = 0;
	private _inlineCompletionsProvider:
		| KodikInlineCompletionsProvider
		| undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageFeaturesService
		private readonly _languageFeaturesService: ILanguageFeaturesService
	) {
		super();

		// Clean up sessions on disposal
		this._register({
			dispose: () => {
				this._activeSessions.forEach((session) => {
					session.cancellationTokenSource.dispose(true);
					session.disposables.dispose();
				});
				this._activeSessions.clear();
			},
		});
	}

	setKodikApi(api: IKodikExtensionApi): void {
		this._kodikApi = api;

		// Register inline completions provider when API is available (following GitHub Copilot patterns)
		this._setupInlineCompletions();
	}

	private _setupInlineCompletions(): void {
		if (!this._kodikApi || this._inlineCompletionsProvider) {
			return;
		}

		// Create and register inline completions provider
		this._inlineCompletionsProvider = new KodikInlineCompletionsProvider(
			this._kodikApi,
			this._logService
		);

		// Register with language features service for all languages (* selector)
		const registration =
			this._languageFeaturesService.inlineCompletionsProvider.register(
				"*", // Support all languages like GitHub Copilot
				this._inlineCompletionsProvider
			);

		this._register(registration);
		this._register(this._inlineCompletionsProvider);

		this._logService.info("KodikAgent: Inline completions provider registered");
	}

	// Enhanced session management methods following VS Code patterns
	private _createSession(request: IChatAgentRequest): IKodikSession {
		const sessionId = `kodik-session-${++this._sessionCounter}`;
		const cancellationTokenSource = new CancellationTokenSource();
		const disposables = new DisposableStore();

		const session: IKodikSession = {
			id: sessionId,
			startTime: Date.now(),
			lastActivity: Date.now(),
			context: {},
			cancellationTokenSource,
			disposables,
		};

		// Extract context from request following VS Code patterns
		if (request.locationData?.type === ChatAgentLocation.Editor) {
			const locationData = request.locationData as IChatEditorLocationData;
			session.context = {
				filePath: locationData.document.fsPath,
				selection: {
					startLine: locationData.selection.selectionStartLineNumber,
					startColumn: locationData.selection.selectionStartColumn,
					endLine: locationData.selection.positionLineNumber,
					endColumn: locationData.selection.positionColumn,
				},
			};

			// Extract selected text with better error handling
			try {
				const textModel = this._modelService.getModel(locationData.document);
				if (textModel && session.context.selection) {
					const range = Range.fromPositions(
						new Position(
							session.context.selection.startLine,
							session.context.selection.startColumn
						),
						new Position(
							session.context.selection.endLine,
							session.context.selection.endColumn
						)
					);
					session.context.selectedText = textModel.getValueInRange(range);
				}
			} catch (error) {
				this._logService.warn(
					"KodikAgent: Failed to extract selected text",
					error
				);
			}
		}

		this._activeSessions.set(sessionId, session);

		// Auto-cleanup session after timeout (following VS Code patterns)
		disposables.add({
			dispose: () =>
				clearTimeout(
					setTimeout(() => {
						this._cleanupSession(sessionId);
					}, 30 * 60 * 1000)
				),
		});

		return session;
	}

	private _cleanupSession(sessionId: string): void {
		const session = this._activeSessions.get(sessionId);
		if (session) {
			session.cancellationTokenSource.dispose(true);
			session.disposables.dispose();
			this._activeSessions.delete(sessionId);
		}
	}

	private _updateSessionActivity(sessionId: string): void {
		const session = this._activeSessions.get(sessionId);
		if (session) {
			session.lastActivity = Date.now();
		}
	}

	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatAgentResult> {
		// Create session with enhanced management (following VS Code patterns)
		const session = this._createSession(request);

		try {
			if (!this._kodikApi || !this._kodikApi.isAvailable()) {
				const errorMessage = localize(
					"kodikNotAvailable",
					"Kodik extension is not available or not properly initialized."
				);
				const errorDetails: IChatResponseErrorDetails = {
					message: errorMessage,
					responseIsIncomplete: true,
				};
				return { errorDetails };
			}

			// Check if user is authenticated
			const isAuthenticated = await this._kodikApi.isAuthenticated();
			if (!isAuthenticated) {
				const authMessage = localize(
					"kodikNotAuthenticated",
					"Please authenticate to be able to chat with Kodik."
				);

				// Send authentication message instead of error
				progress([
					{
						kind: "markdownContent",
						content: {
							value: authMessage,
						},
					},
				]);

				return { metadata: { command: request.command } };
			}

			// Update session activity
			this._updateSessionActivity(session.id);

			// Detect inline chat mode early (vs regular chat panel)
			const isInlineChat =
				request.locationData?.type === ChatAgentLocation.Editor;

			// Send typing indicator only for regular chat (inline chat already has loading animation)
			if (!isInlineChat) {
				progress([
					{
						kind: "progressMessage",
						content: {
							value: localize("kodikThinking", "Kodik is thinking..."),
						},
					},
				]);
			}

			// Get the message from the request
			let message = request.message;

			// Enhanced context building using session data (following VS Code patterns)
			if (session.context.filePath) {
				// Build enhanced context message using session data
				const contextInfo = [
					`[Enhanced File Context]`,
					`File: ${session.context.filePath}`,
				];

				if (session.context.selection) {
					const { startLine, startColumn, endLine, endColumn } =
						session.context.selection;
					contextInfo.push(
						`Selection: Line ${startLine}:${startColumn} to Line ${endLine}:${endColumn}`,
						startLine !== endLine ? "(Multi-line selection)" : "(Single line)"
					);
				}

				if (session.context.selectedText) {
					contextInfo.push(
						`Selected text: \`\`\`\n${session.context.selectedText}\n\`\`\``
					);
				} else {
					contextInfo.push("(No text selected)");
				}

				contextInfo.push(`\nUser Request: ${message}`);
				message = contextInfo.join("\n");

				this._logService.info("KodikAgent: Enhanced context added", {
					sessionId: session.id,
					filePath: session.context.filePath,
					selection: session.context.selection,
					hasSelectedText: !!session.context.selectedText,
				});
			}

			// Enhanced cancellation handling using session token (following VS Code patterns)
			let responsePromise: Promise<string>;

			if (isInlineChat && this._kodikApi.sendAutocompleteRequest) {
				// Enhanced context for better AI understanding
				const contextInfo = [
					"File: " + (session.context.filePath || "unknown"),
					session.context.selectedText
						? "CURRENT CODE:\n```\n" + session.context.selectedText + "\n```"
						: "Cursor position: Line " +
						  (session.context.selection?.startLine || "unknown"),
					"USER REQUEST: " + request.message,
				].join("\n\n");

				// Improved AI prompting with better decision logic and emphasis on code modifications
				const promptToUse = [
					"You are a precise code assistant. Analyze the user's request and current code context:",
					"",
					"DECISION RULES:",
					"1. If user wants to MODIFY/CHANGE/UPDATE/RENAME/FIX existing code → CODE GENERATION",
					"2. If user wants to CREATE/WRITE new code → CODE GENERATION",
					"3. If user asks for EXPLANATION/UNDERSTANDING → EXPLANATION",
					"4. If request is unclear → CLARIFICATION",
					"",
					"IMPORTANT FOR CODE MODIFICATIONS:",
					"- Look at the CURRENT CODE carefully",
					"- Make the EXACT changes requested (rename variables, functions, etc.)",
					"- Update ALL occurrences consistently",
					"- Preserve existing logic and structure",
					"- Return ONLY the modified code, no explanations",
					"",
					"RESPONSE FORMAT:",
					"- CODE GENERATION: Start with '###CODE###' then provide ONLY the complete modified code",
					"- EXPLANATION: Start with '###EXPLAIN###' then provide clear explanation",
					"- CLARIFICATION: Start with '###CLARIFY###' then ask specific questions",
					"",
					"CONTEXT:",
					contextInfo,
					"",
					"Analyze and respond:",
				].join("\n");

				responsePromise = this._kodikApi.sendAutocompleteRequest(promptToUse, {
					mode: "inline_chat",
					filePath: session.context.filePath,
					selectedText: session.context.selectedText,
					selection: session.context.selection,
				});
			} else {
				// Use regular sendMessage for chat panel
				responsePromise = this._kodikApi.sendMessage(message);
			}

			// Create composite cancellation token combining request token and session token
			const compositeCancellationToken = session.cancellationTokenSource.token;

			// Handle cancellation with enhanced cleanup
			const response = await new Promise<string>((resolve, reject) => {
				const requestDisposable = token.onCancellationRequested(() => {
					this._logService.info("KodikAgent: Request cancellation requested");
					session.cancellationTokenSource.cancel();
					if (this._kodikApi && this._kodikApi.cancelCurrentTask) {
						this._kodikApi.cancelCurrentTask();
					}
					reject(new Error("Request cancelled"));
				});

				const sessionDisposable =
					compositeCancellationToken.onCancellationRequested(() => {
						this._logService.info("KodikAgent: Session cancellation requested");
						if (this._kodikApi && this._kodikApi.cancelCurrentTask) {
							this._kodikApi.cancelCurrentTask();
						}
						reject(new Error("Session cancelled"));
					});

				responsePromise
					.then(resolve)
					.catch(reject)
					.finally(() => {
						requestDisposable.dispose();
						sessionDisposable.dispose();
					});
			});

			// Parse AI's decision from structured response
			let aiIntent: "code" | "explain" | "clarify" = "explain"; // default to explanation
			let actualResponse = response;

			if (isInlineChat) {
				if (response.startsWith("###CODE###")) {
					aiIntent = "code";
					actualResponse = response.substring("###CODE###".length).trim();
				} else if (response.startsWith("###EXPLAIN###")) {
					aiIntent = "explain";
					actualResponse = response.substring("###EXPLAIN###".length).trim();
				} else if (response.startsWith("###CLARIFY###")) {
					aiIntent = "clarify";
					actualResponse = response.substring("###CLARIFY###".length).trim();
				}
			}

			// Send the response - use text edits for inline chat CODE GENERATION, markdown for explanations
			if (
				isInlineChat &&
				aiIntent === "code" &&
				request.locationData?.type === ChatAgentLocation.Editor
			) {
				// For inline chat CODE GENERATION, return text edits that modify the file directly
				const editorData = request.locationData as IChatEditorLocationData;
				const uri = editorData.document;

				if (uri && session.context.selection) {
					// Enhanced cleaning for better code extraction
					let cleanResponse = actualResponse
						// Remove code block markers
						.replace(/^```[\w]*\n?/gm, "")
						.replace(/\n?```$/gm, "")
						// Remove markdown headers
						.replace(/^#+\s.*$/gm, "")
						// Remove explanatory comments at the start
						.replace(/^\/\/.*$/gm, "")
						.replace(/^\/\*[\s\S]*?\*\/$/gm, "")
						// Remove leading/trailing whitespace
						.trim();

					// If response is empty after cleaning, use original response
					if (!cleanResponse) {
						cleanResponse = actualResponse.trim();
					}

					this._logService.info("KodikAgent: Code modification", {
						originalLength: actualResponse.length,
						cleanedLength: cleanResponse.length,
						hasSelection: !!session.context.selectedText,
						selectionLength: session.context.selectedText?.length || 0,
					});

					// Since AI decided this is code, insert it directly
					const edit: TextEdit = {
						range: new Range(
							session.context.selection.startLine,
							session.context.selection.startColumn,
							session.context.selection.endLine,
							session.context.selection.endColumn
						),
						text: cleanResponse,
					};

					const textEdit: IChatTextEdit = {
						kind: "textEdit",
						uri: uri,
						edits: [edit],
						done: true, // Mark as done to trigger auto-scroll
					};

					progress([textEdit]);
				} else {
					// Fallback to markdown if we can't get editor context
					progress([
						{
							kind: "markdownContent",
							content: {
								value: actualResponse,
							},
						},
					]);
				}
			} else {
				// For regular chat OR explanation requests, use markdown content
				progress([
					{
						kind: "markdownContent",
						content: {
							value: actualResponse,
						},
					},
				]);
			}

			return { metadata: { command: request.command } };
		} catch (error) {
			if (
				token.isCancellationRequested ||
				session.cancellationTokenSource.token.isCancellationRequested
			) {
				this._logService.info("KodikAgent: Chat was cancelled");
				return { metadata: { command: request.command } };
			}

			this._logService.error("KodikAgent: Error invoking Kodik:", error);
			const errorDetails: IChatResponseErrorDetails = {
				message: localize(
					"kodikError",
					"Error communicating with Kodik: {0}",
					String(error)
				),
				responseIsIncomplete: true,
			};
			return { errorDetails };
		} finally {
			// Cleanup session following VS Code patterns
			this._cleanupSession(session.id);
		}
	}

	async provideFollowups(
		request: IChatAgentRequest,
		result: IChatAgentResult,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatFollowup[]> {
		// No followups for inline chat to keep interface clean
		return [];
	}

	async provideChatTitle(
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<string | undefined> {
		if (history.length === 0) {
			return undefined;
		}

		const firstRequest = history[0]?.request?.message;
		if (firstRequest) {
			// Generate a title based on the first request
			const truncated =
				firstRequest.length > 50
					? firstRequest.substring(0, 47) + "..."
					: firstRequest;
			return localize("kodikChat", "Kodik: {0}", truncated);
		}

		return localize("kodikDefaultTitle", "Kodik Chat");
	}
}

export function registerKodikAgent(
	instantiationService: IInstantiationService,
	chatAgentService: IChatAgentService,
	logService: ILogService
): { agent: KodikAgent; dispose: () => void } {
	const kodikAgent = instantiationService.createInstance(KodikAgent);

	// Register the agent data
	const agentData: IChatAgentData = {
		id: KODIK_AGENT_ID,
		name: "kodik",
		fullName: "Kodik AI Assistant",
		description: localize(
			"kodikAgentDescription",
			"AI-powered coding assistant that helps you write, debug, and improve your code."
		),
		extensionId: new ExtensionIdentifier("kodik.chat"), // Kodik extension ID
		extensionVersion: "1.0.0",
		extensionPublisherId: "kodik",
		extensionDisplayName: "Kodik",
		isDefault: true,
		isDynamic: true,
		isCore: false,
		metadata: {
			sampleRequest: localize(
				"kodikExampleRequest",
				"Help me optimize this function"
			),
			supportIssueReporting: false,
			themeIcon: KODIK_AGENT_ICON,
		},
		slashCommands: [
			{
				name: "fix",
				description: localize("fixCommand", "Fix issues in the selected code"),
			},
		],
		locations: [ChatAgentLocation.Editor],
		modes: [ChatModeKind.Edit, ChatModeKind.Ask],
		disambiguation: [],
	};

	const agentRegistration = chatAgentService.registerAgent(
		KODIK_AGENT_ID,
		agentData
	);
	const implRegistration = chatAgentService.registerAgentImplementation(
		KODIK_AGENT_ID,
		kodikAgent
	);

	return {
		agent: kodikAgent,
		dispose: () => {
			kodikAgent.dispose();
			agentRegistration.dispose();
			implRegistration.dispose();
		},
	};
}
