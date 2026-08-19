import { strict as assert } from "node:assert"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import type { ToolUse } from "@core/assistant-message"
import { ClineIgnoreController } from "@core/ignore/ClineIgnoreController"
import { WriteToFileToolHandler } from "@core/task/tools/handlers/WriteToFileToolHandler"
import { ToolValidator } from "@core/task/tools/ToolValidator"
import { after, before, describe, it } from "mocha"

/**
 * Regression tests for the directory path guard in
 * WriteToFileToolHandler.validateAndPrepareFileOperation.
 *
 * Bug: a truncated streaming path value (e.g. "Services/") reached the diff
 * view, where fs.readFile(directory) threw EISDIR and left the provider in a
 * poisoned state that broke every subsequent edit ("User closed text editor").
 */
describe("WriteToFileToolHandler directory path guard", () => {
	let tmpRoot: string
	let handler: WriteToFileToolHandler

	before(async () => {
		tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cline-dirguard-"))
		await fs.mkdir(path.join(tmpRoot, "Services"), { recursive: true })
		await fs.writeFile(path.join(tmpRoot, "a.txt"), "hello world", "utf8")
		handler = new WriteToFileToolHandler(new ToolValidator(new ClineIgnoreController(tmpRoot)))
	})

	after(async () => {
		await fs.rm(tmpRoot, { recursive: true, force: true })
	})

	function makeConfig() {
		const userMessageContent: any[] = []
		const sayCalls: Array<{ type: string; text?: string }> = []
		const diffViewProvider: any = {
			editType: undefined,
			isEditing: false,
			originalContent: undefined,
			openCalled: false,
			open: async () => {
				diffViewProvider.openCalled = true
			},
		}
		const config: any = {
			cwd: tmpRoot,
			isMultiRootEnabled: false,
			workspaceManager: undefined,
			enableParallelToolCalling: false,
			taskState: {
				userMessageContent,
				toolUseIdMap: new Map(),
				consecutiveMistakeCount: 0,
				didAlreadyUseTool: false,
			},
			services: { diffViewProvider },
			callbacks: {
				say: async (type: string, text?: string) => {
					sayCalls.push({ type, text })
				},
			},
			api: { getModel: () => ({ id: "test-model", info: {} }) },
		}
		return { config, diffViewProvider, sayCalls, userMessageContent }
	}

	const makeBlock = (params: Record<string, string>, partial: boolean): ToolUse =>
		({
			type: "tool_use",
			name: "replace_in_file",
			params,
			partial,
		}) as ToolUse

	it("silently ignores a truncated directory path during partial streaming", async () => {
		const { config, diffViewProvider, userMessageContent } = makeConfig()
		const result = await handler.validateAndPrepareFileOperation(
			config,
			makeBlock({ path: "Services/", diff: "x" }, true),
			"Services/",
			"x",
		)

		assert.equal(result, undefined)
		assert.equal(diffViewProvider.openCalled, false, "must not open the diff view for a directory")
		assert.equal(userMessageContent.length, 0, "partial blocks must not push tool results")
		assert.equal(config.taskState.consecutiveMistakeCount, 0, "partial blocks must not count as a mistake")
	})

	it("rejects a trailing-slash directory path on the complete block with a clear error", async () => {
		const { config, diffViewProvider, userMessageContent, sayCalls } = makeConfig()
		const result = await handler.validateAndPrepareFileOperation(
			config,
			makeBlock({ path: "Services/", diff: "x" }, false),
			"Services/",
			"x",
		)

		assert.equal(result, undefined)
		assert.equal(diffViewProvider.openCalled, false, "must not open the diff view for a directory")
		assert.equal(config.taskState.consecutiveMistakeCount, 1)
		assert.equal(config.taskState.didAlreadyUseTool, true)
		assert.ok(
			sayCalls.some((c) => c.type === "error" && String(c.text).includes("directory")),
			"an error must be surfaced to the user",
		)
		// Without a call_id entry in toolUseIdMap, ToolResultUtils falls back to a
		// plain text block ("cline" id) — assert on the pushed content instead.
		assert.equal(userMessageContent.length, 1, "a result must be pushed for the model to self-correct")
		const pushedText = JSON.stringify(userMessageContent[0])
		assert.ok(pushedText.includes("directory"), "the pushed result must explain the directory problem")
	})

	it("rejects an existing directory without trailing slash (stat-based detection)", async () => {
		const { config, diffViewProvider } = makeConfig()
		const result = await handler.validateAndPrepareFileOperation(
			config,
			makeBlock({ path: "Services", diff: "x" }, false),
			"Services",
			"x",
		)

		assert.equal(result, undefined)
		assert.equal(diffViewProvider.openCalled, false)
		assert.equal(config.taskState.consecutiveMistakeCount, 1)
	})

	it("lets a regular file path pass through to the diff view", async () => {
		const { config, diffViewProvider } = makeConfig()
		diffViewProvider.originalContent = "hello world"
		diffViewProvider.editType = "modify"
		// SEARCH must match complete lines of the original content
		const diff = "------- SEARCH\nhello world\n=======\nHELLO WORLD\n+++++++ REPLACE"
		const result = await handler.validateAndPrepareFileOperation(
			config,
			makeBlock({ path: "a.txt", diff }, false),
			"a.txt",
			diff,
		)

		assert.ok(result, "the guard must not intercept regular file paths")
		assert.equal(diffViewProvider.openCalled, true, "the diff view should be opened for a regular file")
		assert.equal(config.taskState.consecutiveMistakeCount, 0)
	})
})
