/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "../../../../nls.js";
import {
	MenuId,
	MenuRegistry,
} from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";

// Register Kodik button in the CommandCenter (title bar)
// This adds the Kodik chat button next to the search box in the title bar
// Using a registered icon so it inherits text color and hover states like other icons

// Register the Kodik icon - using comment-discussion (chat bubble icon)
// Register the icon using VS Code's icon registry
const kodikIcon = registerIcon(
	"kodik-chat",
	Codicon.comment,
	localize("kodikIcon", "Icon for the Kodik chat action")
);

// Add next to the command center when command center is enabled
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	command: {
		id: "kodik.openChatFromEditor",
		title: localize("kodik.openChat", "Open Chat"),
		icon: kodikIcon, // Registered icon that inherits text color
	},
	order: 10002, // to the right of other command center items
});

// Add to the global title bar if command center is disabled
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	command: {
		id: "kodik.openChatFromEditor",
		title: localize("kodik.openChat.titleBar", "Open Chat"),
		icon: kodikIcon,
	},
	group: "navigation",
	when: ContextKeyExpr.has("config.window.commandCenter").negate(),
	order: 1,
});
