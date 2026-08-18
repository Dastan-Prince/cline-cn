import { getFileMentionFromPath } from "@/core/mentions";
import { singleFileDiagnosticsToProblemsString } from "@/integrations/diagnostics";
import { telemetryService } from "@/services/telemetry";
import { CommandContext, Empty } from "@/shared/proto/index.cline";
import { Logger } from "@/shared/services/Logger";
import { Controller } from "../index";
import { sendAddToInputEvent } from "../ui/subscribeToAddToInput";

// 'Add to Cline' context menu in editor, code action, explorer, and tab title
// Inserts the selected code or file reference into the chat.
export async function addToCline(
	controller: Controller,
	request: CommandContext,
	notebookContext?: string,
): Promise<Empty> {
	if (!request.selectedText?.trim() && !notebookContext) {
		// No text selected - if we have a file path, add just the file reference
		// (e.g., from explorer/context or editor/title/context menu)
		if (request.filePath) {
			const fileMention = await getFileMentionFromPath(request.filePath);
			await sendAddToInputEvent(fileMention);
			Logger.log("addToCline (file reference only)", request.filePath);
		} else {
			Logger.log(
				"❌ No text selected and no notebook context - returning early",
			);
		}
		return {};
	}

	const filePath = request.filePath || "";
	const fileMention = await getFileMentionFromPath(filePath);

	let input = `${fileMention}\n\`\`\`\n${request.selectedText}\n\`\`\``;

	// Add notebook context if provided (includes cell JSON)
	if (notebookContext) {
		Logger.log("Adding notebook context for enhanced editing");
		input += `\n${notebookContext}`;
	}

	if (request.diagnostics.length) {
		const problemsString = await singleFileDiagnosticsToProblemsString(
			filePath,
			request.diagnostics,
		);
		input += `\nProblems:\n${problemsString}`;
	}

	// Notebooks send immediately, regular adds just fill input
	if (notebookContext && controller.task) {
		await controller.task.handleWebviewAskResponse("messageResponse", input);
	} else if (notebookContext) {
		await controller.initTask(input);
	} else {
		await sendAddToInputEvent(input);
	}

	Logger.log("addToCline", request.selectedText, filePath, request.language);
	telemetryService.captureButtonClick(
		"codeAction_addToChat",
		controller.task?.ulid,
	);

	return {};
}
