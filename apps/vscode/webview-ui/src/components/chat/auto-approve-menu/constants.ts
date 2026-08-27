import { ActionMetadata } from "./types"

export const ACTION_METADATA: ActionMetadata[] = [
	{
		id: "readFiles",
		label: "autoApprove.actions.readProjectFiles",
		shortName: "autoApprove.actions.shortNames.readFiles",
		icon: "codicon-search",
	},
	{
		id: "editFiles",
		label: "autoApprove.actions.editProjectFiles",
		shortName: "autoApprove.actions.shortNames.editFiles",
		icon: "codicon-edit",
	},
	{
		id: "executeSafeCommands",
		label: "autoApprove.actions.executeSafeCommands",
		shortName: "autoApprove.actions.shortNames.executeSafeCommands",
		icon: "codicon-terminal",
	},
	{
		id: "useBrowser",
		label: "autoApprove.actions.useBrowser",
		shortName: "autoApprove.actions.shortNames.useBrowser",
		icon: "codicon-globe",
	},
	{
		id: "useMcp",
		label: "autoApprove.actions.useMcpServers",
		shortName: "autoApprove.actions.shortNames.useMcp",
		icon: "codicon-server",
	},
]
