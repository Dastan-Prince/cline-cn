import { Empty, EmptyRequest } from "@shared/proto/cline/common"
import { AuthService } from "@/sdk/auth-service"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."\n
/**
 * Signs out of OpenAI Codex by clearing stored credentials.
 * Uses the SDK-backed AuthService to clear provider settings.
 */
export async function openAiCodexSignOut(
	controller: Controller,
	_: EmptyRequest,
): Promise<Empty> {
	try {
		// Clear stored credentials via SDK-backed AuthService
		await AuthService.getInstance().clearCodexCredentials()\n
		// Update the state to reflect sign out
		await controller.postStateToWebview();
	} catch (error) {
		Logger.error("[openAiCodexSignOut] Failed to sign out:", error);
		throw error;
	}

	return {};
}
