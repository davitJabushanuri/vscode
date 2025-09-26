/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Position } from "../../../../editor/common/core/position.js";
import { ITextModel } from "../../../../editor/common/model.js";
import {
	InlineCompletion,
	InlineCompletionContext,
	InlineCompletions,
	InlineCompletionsProvider,
} from "../../../../editor/common/languages.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IKodikExtensionApi } from "./kodikAgent.js";

interface ContextIndentation {
	prev: number | undefined;
	current: number;
	next: number | undefined;
}

export class KodikInlineCompletionsProvider
	extends Disposable
	implements InlineCompletionsProvider
{
	public readonly displayName = "Kodik AI Assistant";
	public readonly groupId = "kodik";

	// Debouncing and caching
	private _lastRequestPosition: Position | null = null;
	private _lastRequestModel: ITextModel | null = null;
	private _lastRequestTime = 0;
	private _debounceDelay = 300; // 300ms debounce
	private _currentRequest: Promise<InlineCompletions | null> | null = null;
	private _lastCompletion: { position: Position; text: string } | null = null;

	// Completion acceptance tracking
	private _lastAcceptedCompletion: {
		text: string;
		position: Position;
		timestamp: number;
	} | null = null;
	private _acceptanceCooldown = 1000; // 1 second cooldown after acceptance
	private _lastCompletionContent: string | null = null; // Track actual completion content

	constructor(
		private readonly _kodikApi: IKodikExtensionApi,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	async provideInlineCompletions(
		model: ITextModel,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken
	): Promise<InlineCompletions | null> {
		if (!this._kodikApi?.isAvailable()) {
			return null;
		}

		// Check if user is authenticated
		const isAuthenticated = await this._kodikApi.isAuthenticated();
		if (!isAuthenticated) {
			return null;
		}

		// Prevent rapid-fire requests - debounce
		const now = Date.now();
		if (now - this._lastRequestTime < this._debounceDelay) {
			return null;
		}

		// Check if position/model haven't changed significantly
		if (
			this._lastRequestPosition &&
			this._lastRequestModel === model &&
			Math.abs(this._lastRequestPosition.lineNumber - position.lineNumber) <=
				1 &&
			Math.abs(this._lastRequestPosition.column - position.column) <= 3
		) {
			// Too close to last request position, avoid spam
			return null;
		}

		// If there's already a request in progress, return null to avoid duplicate requests
		if (this._currentRequest) {
			return null;
		}

		try {
			// Track request state
			this._lastRequestTime = now;
			this._lastRequestPosition = position;
			this._lastRequestModel = model;

			// Clear old accepted completion if we're making a new request
			if (
				this._lastAcceptedCompletion &&
				now - this._lastAcceptedCompletion.timestamp > this._acceptanceCooldown
			) {
				this._lastAcceptedCompletion = null;
				this._lastCompletionContent = null;
			}

			// Skip if at middle of word (like GitHub Copilot does)
			if (this._isAtMidword(model, position)) {
				return null;
			}

			// Skip if we just provided a completion at this position
			if (
				this._lastCompletion &&
				this._lastCompletion.position.equals(position)
			) {
				return null;
			}

			// Skip if we recently accepted a completion near this position
			if (this._lastAcceptedCompletion) {
				const timeSinceAcceptance =
					now - this._lastAcceptedCompletion.timestamp;
				if (timeSinceAcceptance < this._acceptanceCooldown) {
					return null;
				}
				// Check if we're trying to complete the same text again
				const currentPrefix = this._getPrefix(model, position);
				if (currentPrefix.includes(this._lastAcceptedCompletion.text)) {
					return null;
				}
			}

			// Skip if we would generate the same completion content again
			if (this._lastCompletionContent) {
				const currentContext = this._getPrefix(model, position);
				if (
					currentContext.endsWith(this._lastCompletionContent.substring(0, 50))
				) {
					return null;
				}
			} // Create and track the request promise
			this._currentRequest = this._performCompletion(
				model,
				position,
				context,
				token
			);

			try {
				const result = await this._currentRequest;
				return result;
			} finally {
				this._currentRequest = null;
			}
		} catch (error) {
			this._currentRequest = null;
			if (!token.isCancellationRequested) {
				this._logService.error(
					"KodikInlineCompletionsProvider: Error providing completions",
					error
				);
			}
			return null;
		}
	}

	private async _performCompletion(
		model: ITextModel,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken
	): Promise<InlineCompletions | null> {
		// Get prefix and suffix context (simple approach like Microsoft's)
		const prefix = this._getPrefix(model, position);
		const suffix = this._getSuffix(model, position);
		const languageId = model.getLanguageId();

		// Calculate context indentation using Microsoft's logic
		const contextIndent = this._contextIndentation(model, position, languageId);

		// Get completion from Kodik API (following Microsoft's simple parameters)
		const completion = await this._getCompletion(
			prefix,
			suffix,
			languageId,
			contextIndent,
			token
		);
		if (!completion || token.isCancellationRequested) {
			return null;
		}

		// Apply Microsoft's block parsing to get optimal completion boundary
		const cutResult = this._completionCutOrContinue(completion, contextIndent);
		const finalCompletion =
			cutResult === "continue"
				? completion
				: completion.substring(0, cutResult);

		// Store completion to avoid immediate re-triggering
		this._lastCompletion = { position, text: finalCompletion };
		this._lastCompletionContent = finalCompletion;

		return {
			items: [
				{
					insertText: finalCompletion,
					range: {
						startLineNumber: position.lineNumber,
						startColumn: position.column,
						endLineNumber: position.lineNumber,
						endColumn: position.column,
					},
					additionalTextEdits: [],
					command: undefined,
				},
			],
		};
	}

	handleItemDidShow(
		completions: InlineCompletions,
		item: InlineCompletion
	): void {
		// Track acceptance to prevent immediate re-triggering
		if (typeof item.insertText === "string" && this._lastCompletion) {
			this._lastAcceptedCompletion = {
				text: item.insertText,
				position: this._lastCompletion.position,
				timestamp: Date.now(),
			};
			this._lastCompletionContent = item.insertText;
		}

		// Clear completion state to prevent immediate re-triggering
		this._lastCompletion = null;
		this._lastRequestPosition = null;

		this._logService.debug(
			"KodikInlineCompletionsProvider: Completion item accepted",
			{
				insertText:
					typeof item.insertText === "string"
						? item.insertText.substring(0, 50)
						: "snippet",
			}
		);
	}
	handlePartialAccept(
		completions: InlineCompletions,
		item: InlineCompletion,
		acceptedCharacters: number
	): void {
		this._logService.debug("KodikInlineCompletionsProvider: Partial accept", {
			acceptedCharacters,
		});

		// Send analytics to Kodik API if available
		if (
			this._kodikApi &&
			typeof (this._kodikApi as any).reportPartialAcceptance === "function"
		) {
			(this._kodikApi as any).reportPartialAcceptance(acceptedCharacters, item);
		}
	}

	handleEndOfLifetime(
		completions: InlineCompletions,
		item: InlineCompletion
	): void {
		this._logService.debug("KodikInlineCompletionsProvider: End of lifetime");

		// Report to Kodik API for analytics
		if (
			this._kodikApi &&
			typeof (this._kodikApi as any).reportCompletionLifetime === "function"
		) {
			(this._kodikApi as any).reportCompletionLifetime(item);
		}
	}

	disposeInlineCompletions(completions: InlineCompletions): void {
		// Cleanup if needed
		this._logService.debug(
			"KodikInlineCompletionsProvider: Disposing completions"
		);
	}

	// Microsoft's block parsing logic adapted for VS Code core APIs
	private static readonly _continuations = [
		// Brace control
		"\\{",
		"\\}",
		"\\[",
		"\\]",
		"\\(",
		"\\)",
	].concat(
		[
			// Keywords for same-level control flow
			"then",
			"else",
			"elseif",
			"elif",
			"catch",
			"finally",
			// End keywords
			"fi",
			"done",
			"end",
			"loop",
			"until",
			"where",
			"when",
		].map((s) => s + "\\b")
	);

	private static readonly _continuationRegex = new RegExp(
		`^(${this._continuations.join("|")})`
	);

	private _isContinuationLine(line: string): boolean {
		return KodikInlineCompletionsProvider._continuationRegex.test(
			line.trimStart().toLowerCase()
		);
	}

	private _indentationOfLine(line: string): number | undefined {
		const match = /^(\s*)([^]*)$/.exec(line);
		if (match && match[2] && match[2].length > 0) {
			return match[1].length;
		}
		return undefined;
	}

	private _contextIndentation(
		model: ITextModel,
		position: Position,
		languageId: string
	): ContextIndentation {
		const lineCount = model.getLineCount();

		// Get current line indentation
		let current = 0;
		let currentIdx = position.lineNumber - 1;

		// Look backwards for non-blank line to get current indentation
		for (let i = position.lineNumber; i >= 1; i--) {
			const line = model.getLineContent(i);
			const ind = this._indentationOfLine(line);
			if (ind !== undefined) {
				current = ind;
				currentIdx = i - 1;
				break;
			}
		}

		// Look backwards for previous smaller indentation
		let prev: number | undefined;
		for (let i = currentIdx; i >= 0; i--) {
			const line = model.getLineContent(i + 1);
			const ind = this._indentationOfLine(line);
			if (ind !== undefined && ind < current) {
				prev = ind;
				break;
			}
		}

		// Look forward for next line indentation
		let next: number | undefined;
		for (let i = position.lineNumber + 1; i <= lineCount; i++) {
			const line = model.getLineContent(i);
			const ind = this._indentationOfLine(line);
			if (ind !== undefined) {
				next = ind;
				break;
			}
		}

		return { prev, current, next };
	}

	private _completionCutOrContinue(
		completion: string,
		contextIndentation: ContextIndentation
	): number | "continue" {
		const completionLines = completion.split("\n");
		const startLine = 1; // We want to offer at least one line

		if (completionLines.length === startLine) {
			// A single line that did not yet end
			return "continue";
		}

		const breakIndentation = Math.max(
			contextIndentation.current,
			contextIndentation.next ?? 0
		);

		for (let i = startLine; i < completionLines.length; i++) {
			const line = completionLines[i];
			const ind = this._indentationOfLine(line);

			if (
				ind !== undefined &&
				(ind < breakIndentation ||
					(ind === breakIndentation && !this._isContinuationLine(line)))
			) {
				return completionLines.slice(0, i).join("\n").length;
			}
		}

		return "continue";
	}

	private _isAtMidword(model: ITextModel, position: Position): boolean {
		// Copied from Microsoft's implementation
		const line = model.getLineContent(position.lineNumber);
		if (position.column >= line.length) {
			return false;
		}
		const nextChar = line[position.column - 1];
		return /\w/.test(nextChar);
	}

	private _getPrefix(model: ITextModel, position: Position): string {
		// Get content up to cursor position
		const lines = [];

		// Add lines before current line
		const startLine = Math.max(1, position.lineNumber - 10);
		for (let i = startLine; i < position.lineNumber; i++) {
			lines.push(model.getLineContent(i));
		}

		// Add current line up to position
		const currentLine = model
			.getLineContent(position.lineNumber)
			.substring(0, position.column - 1);
		lines.push(currentLine);

		return lines.join("\n");
	}

	private _getSuffix(model: ITextModel, position: Position): string {
		// Get content after cursor position
		const lines = [];

		// Add remainder of current line
		const currentLine = model
			.getLineContent(position.lineNumber)
			.substring(position.column - 1);
		lines.push(currentLine);

		// Add lines after current line
		const endLine = Math.min(model.getLineCount(), position.lineNumber + 10);
		for (let i = position.lineNumber + 1; i <= endLine; i++) {
			lines.push(model.getLineContent(i));
		}

		return lines.join("\n");
	}

	private async _getCompletion(
		prefix: string,
		suffix: string,
		languageId: string,
		contextIndent: ContextIndentation,
		token: CancellationToken
	): Promise<string | undefined> {
		try {
			// Check for cancellation before making API call
			if (token.isCancellationRequested) {
				return undefined;
			}

			// Use specialized autocomplete API if available, otherwise fallback
			let response: string | undefined;

			if (this._kodikApi.sendAutocompleteRequest) {
				// Use dedicated autocomplete method with focused context
				const autocompleteContext = {
					language: languageId,
					prefix: prefix,
					suffix: suffix.substring(0, 500),
					indentation: contextIndent,
					mode: "inline_completion", // Signal this is for inline completions
				};

				// Get just the current line for better context
				const currentLinePrefix = prefix.split("\n").slice(-1)[0] || "";
				const nextLineStart = suffix.split("\n")[0] || "";

				const autocompletePrompt = `Complete the code at cursor position. Return only the immediate next code needed, NOT a full function or method.

Rules:
- Return only the minimal completion from cursor position
- Do not return complete functions/methods if user is just starting to type
- Focus on the immediate next logical piece of code
- No markdown, no explanations

Language: ${languageId}
Current line: ${currentLinePrefix}[CURSOR]${nextLineStart}

Complete:`;

				// Make API call with cancellation support and proper cleanup
				let disposable: any = null;
				try {
					response = await Promise.race([
						this._kodikApi.sendAutocompleteRequest(
							autocompletePrompt,
							autocompleteContext
						),
						new Promise<undefined>((_, reject) => {
							disposable = token.onCancellationRequested(() =>
								reject(new Error("Request cancelled"))
							);
						}),
					]);
				} finally {
					if (disposable) {
						disposable.dispose();
					}
				}
			} else {
				// Fallback to sendMessage with very explicit instructions
				const currentLinePrefix = prefix.split("\n").slice(-1)[0] || "";
				const nextLineStart = suffix.split("\n")[0] || "";

				const systemMessage = `You are a code completion assistant. Complete only the immediate next piece of code at cursor.

STRICT RULES:
1. Return only minimal completion from cursor
2. Do NOT return full functions if user just typed opening brace
3. Do NOT create files, tests, or documentation
4. No markdown, no explanations
5. Focus on immediate logical next code piece`;

				const prompt = `${systemMessage}\n\nLanguage: ${languageId}\nCurrent: ${currentLinePrefix}[CURSOR]${nextLineStart}\n\nComplete:`;

				// Make API call with cancellation support and proper cleanup
				let disposable2: any = null;
				try {
					response = await Promise.race([
						this._kodikApi.sendMessage(prompt),
						new Promise<undefined>((_, reject) => {
							disposable2 = token.onCancellationRequested(() =>
								reject(new Error("Request cancelled"))
							);
						}),
					]);
				} finally {
					if (disposable2) {
						disposable2.dispose();
					}
				}
			}

			// Check for cancellation after API response
			if (token.isCancellationRequested || !response) {
				return undefined;
			}

			// Simple post-processing (like Microsoft does minimal filtering)
			let completion = response.trim();

			// Remove markdown code blocks if present
			completion = completion
				.replace(/^```[\w]*\n?/, "")
				.replace(/\n?```$/, "");

			// Basic sanity check - don't return empty completions
			if (!completion) {
				return undefined;
			}

			return completion;
		} catch (error) {
			// Don't log cancellation errors
			if (!token.isCancellationRequested) {
				this._logService.error("Failed to get Kodik completion", error);
			}
			return undefined;
		}
	}
}
