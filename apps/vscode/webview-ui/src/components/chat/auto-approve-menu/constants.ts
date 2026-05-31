import { ActionMetadata } from "./types"

export const ACTION_METADATA: ActionMetadata[] = [
	{
		id: "readFiles",
		label: "autoApprove.actions.readProjectFiles",
		shortName: "autoApprove.actions.shortNames.readFiles",
		icon: "codicon-search",
		subAction: {
			id: "readFilesExternally",
			label: "autoApprove.actions.readAllFiles",
			shortName: "autoApprove.actions.shortNames.readFilesExternally",
			icon: "codicon-folder-opened",
			parentActionId: "readFiles",
		},
	},
	{
		id: "editFiles",
		label: "autoApprove.actions.editProjectFiles",
		shortName: "autoApprove.actions.shortNames.editFiles",
		icon: "codicon-edit",
		subAction: {
			id: "editFilesExternally",
			label: "autoApprove.actions.editAllFiles",
			shortName: "autoApprove.actions.shortNames.editFilesExternally",
			icon: "codicon-files",
			parentActionId: "editFiles",
		},
	},
	{
		id: "executeSafeCommands",
		label: "autoApprove.actions.executeSafeCommands",
		shortName: "autoApprove.actions.shortNames.executeSafeCommands",
		icon: "codicon-terminal",
		subAction: {
			id: "executeAllCommands",
			label: "autoApprove.actions.executeAllCommands",
			shortName: "autoApprove.actions.shortNames.executeAllCommands",
			icon: "codicon-terminal-bash",
			parentActionId: "executeSafeCommands",
		},
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

export const NOTIFICATIONS_SETTING: ActionMetadata = {
	id: "enableNotifications",
	label: "autoApprove.modal.enableNotifications",
	shortName: "autoApprove.modal.enableNotifications",
	icon: "codicon-bell",
}
