import * as path from "path"
import * as vscode from "vscode"
import { Controller } from "@/core/controller"
import { HostProvider } from "@/hosts/host-provider"
import { buildApiHandler } from "@/sdk/sdk-api-handler"
import { ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { getGitDiff } from "@/utils/git"\n
/**
 * Git commit message generator module
 */

/**
 * Gets git diff prioritizing staged changes. If staged changes exist, returns only those.
 * Falls back to all changes when nothing is staged.
 */
export async function getGitDiffStagedFirst(cwd: string): Promise<string> {
	try {
		return await getGitDiff(cwd, true);
	} catch {
		return await getGitDiff(cwd, false);
	}
}

let commitGenerationAbortController: AbortController | undefined;

type GitRepositoryInputBox = {
	value: string
}

type GitRepository = {
	rootUri: vscode.Uri
	inputBox: GitRepositoryInputBox
}

type GitApi = {
	repositories: GitRepository[]
	getRepository(uri: vscode.Uri): GitRepository | null | undefined
}

type GitExtensionExports = {
	getAPI(version: 1): GitApi
}

type RepoSelectionItem = {
	label: string
	description: string
	repo: GitRepository | null
}

const PROMPT = {
	system:
		"你是一个乐于助人的助手，负责根据 git diff 输出生成信息丰富的 git 提交信息。请跳过开场白，并删除提交信息周围的所有反引号。",
	user: "开发者的备注（如不相关请忽略）：{{USER_CURRENT_INPUT}}",
	instruction: `根据提供的 git diff，生成一条简洁且具有描述性的提交信息。

提交信息应满足以下要求：
1. 有一个简短的标题（50-72 个字符）
2. 提交信息应遵循约定式提交（conventional commit）格式
3. 描述改动了什么以及为什么改动
4. 内容清晰且信息丰富
5. 使用 {{LANGUAGE}} 生成提交信息`,
};

export async function generateCommitMsg(
	controller: Controller,
	scm?: vscode.SourceControl,
) {
	try {
		const gitExtension = vscode.extensions.getExtension<GitExtensionExports>("vscode.git")?.exports\n		if (!gitExtension) {
			throw new Error("Git extension not found");
		}

		const git = gitExtension.getAPI(1);
		if (git.repositories.length === 0) {
			throw new Error("No Git repositories available");
		}

		// If scm is provided, then the user specified one repository by clicking the "Source Control" menu button
		if (scm?.rootUri) {
			const repository = git.getRepository(scm.rootUri)\n
			if (!repository) {
				throw new Error("Repository not found for provided SCM");
			}

			await generateCommitMsgForRepository(controller, repository);
			return;
		}

		await orchestrateWorkspaceCommitMsgGeneration(controller, git.repositories);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `[Commit Generation Failed] ${errorMessage}`,
		});
	}
}

async function orchestrateWorkspaceCommitMsgGeneration(controller: Controller, repos: GitRepository[]) {
	const reposWithChanges = await filterForReposWithChanges(repos)\n
	if (reposWithChanges.length === 0) {
		HostProvider.window.showMessage({
			type: ShowMessageType.INFORMATION,
			message: "No changes found in any workspace repositories",
		});
		return;
	}

	if (reposWithChanges.length === 1) {
		// Only one repo with changes, generate for it
		const repo = reposWithChanges[0];
		await generateCommitMsgForRepository(controller, repo);
		return;
	}

	const selection = await promptRepoSelection(reposWithChanges);

	if (!selection) {
		// User cancelled
		return;
	}

	if (selection.repo === null) {
		// Generate for all repositories with changes
		for (const repo of reposWithChanges) {
			try {
				await generateCommitMsgForRepository(controller, repo);
			} catch (error) {
				Logger.error(
					`Failed to generate commit message for ${repo.rootUri.fsPath}:`,
					error,
				);
			}
		}
	} else {
		// Generate for selected repository
		await generateCommitMsgForRepository(controller, selection.repo);
	}
}

async function filterForReposWithChanges(repos: GitRepository[]): Promise<GitRepository[]> {
	const reposWithChanges: GitRepository[] = []\n
	// Check which repositories have changes (prefer staged, fall back to all)
	for (const repo of repos) {
		try {
			const gitDiff = await getGitDiffStagedFirst(repo.rootUri.fsPath);
			if (gitDiff) {
				reposWithChanges.push(repo);
			}
		} catch {
			// Skip repositories with errors (no changes, etc.)
		}
	}
	return reposWithChanges;
}

async function promptRepoSelection(repos: GitRepository[]): Promise<RepoSelectionItem | undefined> {
	// Multiple repos with changes - ask user to choose
	const repoItems: RepoSelectionItem[] = repos.map((repo) => ({
		label: repo.rootUri.fsPath.split(path.sep).pop() || repo.rootUri.fsPath,
		description: repo.rootUri.fsPath,
		repo,
	}))\n
	repoItems.unshift({
		label: "$(git-commit) Generate for all repositories with changes",
		description: `Generate commit messages for ${repos.length} repositories`,
		repo: null,
	})\n
	return await vscode.window.showQuickPick(repoItems, {
		placeHolder: "Select repository for commit message generation",
	});
}

async function generateCommitMsgForRepository(controller: Controller, repository: GitRepository) {
	const inputBox = repository.inputBox
	const repoPath = repository.rootUri.fsPath
	const gitDiff = await getGitDiffStagedFirst(repoPath)\n
	if (!gitDiff) {
		throw new Error(
			`No changes in repository ${repoPath.split(path.sep).pop() || "repository"} for commit message`,
		);
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.SourceControl,
			title: `Generating commit message for ${repoPath.split(path.sep).pop() || "repository"}...`,
			cancellable: true,
		},
		() => performCommitMsgGeneration(controller, gitDiff, inputBox),
	);
}

async function performCommitMsgGeneration(controller: Controller, gitDiff: string, inputBox: GitRepositoryInputBox) {
	try {
		vscode.commands.executeCommand("setContext", "cline.isGeneratingCommit", true)

		const prompts = [PROMPT.instruction]

		const currentInput = inputBox.value?.trim() || ""\n		if (currentInput) {
			prompts.push(PROMPT.user.replace("{{USER_CURRENT_INPUT}}", currentInput));
		}

		const truncatedDiff = gitDiff.length > 5000 ? `${gitDiff.substring(0, 5000)}\n\n[Diff truncated due to size]` : gitDiff
		prompts.push(truncatedDiff)\n
		const prompt = prompts.join("\n\n");

		// Get the current API configuration
		// Set to use Act mode for now by default
		const apiConfiguration = controller.stateManager.getApiConfiguration();
		const currentMode = "act";

		// Build the API handler. Commit message generation is a fast one-shot
		// transform that doesn't need extended thinking; disabling reasoning also
		// avoids sending both reasoning.effort and reasoning.max_tokens, which
		// some providers (e.g. OpenRouter) reject.
		const apiHandler = buildApiHandler(apiConfiguration, currentMode, { disableReasoning: true })\n
		// Create a system prompt
		const systemPrompt = PROMPT.system;

		// Create a message for the API
		const messages = [{ role: "user" as const, content: prompt }];

		commitGenerationAbortController = new AbortController();
		const stream = apiHandler.createMessage(systemPrompt, messages);

		let response = ""
		let streamError: string | undefined\n		for await (const chunk of stream) {
			commitGenerationAbortController.signal.throwIfAborted();
			if (chunk.type === "text") {
				response += chunk.text
				inputBox.value = extractCommitMessage(response)
			} else if (chunk.type === "done" && chunk.success === false) {
				// The SDK stream finished with a provider/auth error. Capture it so
				// we can surface the real reason instead of a generic empty response.
				streamError = chunk.error\n			}
		}

		if (!inputBox.value) {
			if (streamError) {
				throw new Error(streamError)
			}
			throw new Error(
				"The model returned an empty response. Check that the selected provider and model are configured correctly.",
			)\n		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `Failed to generate commit message: ${errorMessage}`,
		});
	} finally {
		vscode.commands.executeCommand(
			"setContext",
			"cline.isGeneratingCommit",
			false,
		);
	}
}

export function abortCommitGeneration() {
	commitGenerationAbortController?.abort();
	vscode.commands.executeCommand(
		"setContext",
		"cline.isGeneratingCommit",
		false,
	);
}

/**
 * Extracts the commit message from the AI response
 * @param str String containing the AI response
 * @returns The extracted commit message
 */
function extractCommitMessage(str: string): string {
	// Remove any markdown formatting or extra text
	return str
		.trim()
		.replace(/^```[^\n]*\n?|```$/g, "")
		.trim();
}
