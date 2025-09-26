/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import {
	Extensions as WorkbenchExtensions,
	IWorkbenchContributionsRegistry,
} from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IChatAgentService } from "../common/chatAgents.js";
import { registerKodikAgent, IKodikExtensionApi } from "./kodikAgent.js";

class KodikAgentContribution extends Disposable {
	private _agentDisposable: { dispose: () => void } | undefined;

	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();
		this._register(
			this.extensionService.onDidChangeExtensions(() =>
				this._tryRegisterKodikAgent()
			)
		);
		this._tryRegisterKodikAgent();
	}

	private async _tryRegisterKodikAgent(): Promise<void> {
		// Check if we should register the agent (we'll do it unconditionally for now)
		// In a real implementation, you'd check if Kodik extension is available
		const shouldRegister = true;

		if (!shouldRegister) {
			this.logService.debug(
				"KodikAgentContribution: Kodik extension conditions not met"
			);
			return;
		}

		try {
			// Register the agent if not already registered
			if (!this._agentDisposable) {
				const { agent, dispose } = registerKodikAgent(
					this.instantiationService,
					this.chatAgentService,
					this.logService
				);

				// Create a bridge to the Kodik extension with autocomplete support
				const kodikApi: IKodikExtensionApi = {
					sendMessage: async (message: string): Promise<string> => {
						try {
							this.logService.info(
								`KodikAgent: Processing message: ${message}`
							);

							// Execute the command in the Kodik extension
							const result = await this.commandService.executeCommand(
								"kodik.inlineChat",
								message
							);
							return result as string;
						} catch (error) {
							this.logService.error(
								"KodikAgent: Error processing message:",
								error
							);
							return `❌ Error communicating with Kodik: ${error}`;
						}
					},
					// Autocomplete-specific API using dedicated command
					sendAutocompleteRequest: async (
						prompt: string,
						context?: any
					): Promise<string> => {
						try {
							this.logService.info(
								`KodikAgent: Processing autocomplete request: ${prompt.substring(
									0,
									100
								)}...`
							);

							// Execute the autocomplete command in the Kodik extension
							const result = await this.commandService.executeCommand(
								"kodik.requestAutocomplete",
								prompt,
								context
							);
							return result as string;
						} catch (error) {
							this.logService.warn(
								"KodikAgent: Autocomplete request failed, falling back to regular chat:",
								error
							);
							// Fallback to regular sendMessage with autocomplete formatting
							return await kodikApi.sendMessage(`[AUTOCOMPLETE]\n${prompt}`);
						}
					},
					isAutocompleteAvailable: (): boolean => {
						// Check if the autocomplete command exists
						return true; // Assume available for now
					},
					isAvailable: (): boolean => {
						return true; // Kodik is integrated as built-in extension
					},
					isAuthenticated: async (): Promise<boolean> => {
						try {
							// Call the authentication check command
							const result = await this.commandService.executeCommand(
								"kodik.isAuthenticated"
							);
							return Boolean(result);
						} catch (error) {
							this.logService.error(
								"KodikAgent: Error checking authentication:",
								error
							);
							return false;
						}
					},
					cancelCurrentTask: (): void => {
						// Cancel any current inline chat task
						this.commandService
							.executeCommand("kodik.cancelInlineChat")
							.catch((error) => {
								this.logService.error(
									"KodikAgent: Error cancelling task:",
									error
								);
							});
					},
				};
				agent.setKodikApi(kodikApi);
				this._agentDisposable = { dispose };
				this._register(this._agentDisposable);

				this.logService.info(
					"KodikAgentContribution: Kodik chat agent registered successfully"
				);
			}
		} catch (error) {
			this.logService.error(
				"KodikAgentContribution: Failed to register Kodik agent:",
				error
			);
		}
	}

	override dispose(): void {
		super.dispose();
		if (this._agentDisposable) {
			this._agentDisposable.dispose();
			this._agentDisposable = undefined;
		}
	}
}

// Register the contribution
Registry.as<IWorkbenchContributionsRegistry>(
	WorkbenchExtensions.Workbench
).registerWorkbenchContribution(
	KodikAgentContribution,
	LifecyclePhase.Eventually
);
