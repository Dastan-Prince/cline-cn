import "should"
import sinon from "sinon"
import { ExecuteCommandToolHandler } from "@core/task/tools/handlers/ExecuteCommandToolHandler"
import { ToolResultUtils } from "@core/task/tools/utils/ToolResultUtils"
import { formatResponse } from "@core/prompts/responses"
import { ClineDefaultTool } from "@shared/tools"
import type { ToolUse } from "@core/assistant-message"

/**
 * Tests for the requires_approval fallback in ExecuteCommandToolHandler.
 *
 * Background: weaker models (e.g. dots-3-note-preview) over native tool calling
 * sometimes omit the `requires_approval` parameter entirely. Previously this was
 * treated as a fatal error (sayAndCreateMissingParamError) which triggered an
 * infinite retry loop. The fix defaults a missing `requires_approval` to "true"
 * (require user approval, fail-safe) and proceeds into the normal approval flow.
 */

function makeBlock(params: Record<string, string>, isNativeToolCall = true): ToolUse {
	return {
		type: "tool_use",
		name: ClineDefaultTool.BASH,
		params,
		isNativeToolCall,
	} as unknown as ToolUse
}

function makeConfig(callbacks: Record<string, sinon.SinonStub>) {
	return {
		yoloModeToggled: false,
		vscodeTerminalExecutionMode: "default",
		isSubagentExecution: false,
		isMultiRootEnabled: false,
		cwd: "/workspace",
		ulid: "test-ulid",
		api: { getModel: () => ({ id: "dots-3-note-preview" }) },
		autoApprover: { shouldAutoApproveTool: () => [false, false] },
		autoApprovalSettings: { enableNotifications: false },
		services: {
			commandPermissionController: { validateCommand: () => ({ allowed: true }) },
			clineIgnoreController: { validateCommand: () => undefined },
		},
		taskState: { consecutiveMistakeCount: 0 },
		callbacks: {
			say: callbacks.say ?? sinon.stub().resolves(),
			sayAndCreateMissingParamError: callbacks.sayAndCreateMissingParamError ?? sinon.stub().resolves(),
			removeLastPartialMessageIfExistsWithType: sinon.stub().resolves(),
			executeCommandTool: sinon.stub().resolves([false, { stdout: "", stderr: "" }]),
		},
	} as any
}

describe("ExecuteCommandToolHandler requires_approval fallback", () => {
	let handler: ExecuteCommandToolHandler
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		handler = new ExecuteCommandToolHandler({} as any)
		sandbox = sinon.createSandbox()
	})

	afterEach(() => {
		sandbox.restore()
	})

	it("should NOT call sayAndCreateMissingParamError when requires_approval is omitted", async () => {
		const sayAndCreateMissingParamError = sinon.stub().resolves()
		const say = sinon.stub().resolves()
		const config = makeConfig({ sayAndCreateMissingParamError, say })

		// User denies the (manual) approval so the command never actually executes.
		sandbox.stub(ToolResultUtils, "askApprovalAndPushFeedback").resolves(false)

		const block = makeBlock({ command: "ls -la" }) // no requires_approval
		const response = await handler.execute(config, block)

		sinon.assert.notCalled(sayAndCreateMissingParamError)
		// The command should have proceeded into the manual approval flow.
		sinon.assert.called(ToolResultUtils.askApprovalAndPushFeedback as any)
		// A denied approval yields a toolDenied response, not a missing-param error.
		response.should.deepEqual(formatResponse.toolDenied())
	})

	it("should NOT increment consecutiveMistakeCount when requires_approval is omitted", async () => {
		const config = makeConfig({})
		sandbox.stub(ToolResultUtils, "askApprovalAndPushFeedback").resolves(false)

		const block = makeBlock({ command: "ls -la" }) // no requires_approval
		await handler.execute(config, block)

		;(config.taskState.consecutiveMistakeCount as number).should.equal(0)
	})

	it("should still honor an explicit requires_approval=false", async () => {
		const sayAndCreateMissingParamError = sinon.stub().resolves()
		const config = makeConfig({ sayAndCreateMissingParamError })

		// autoApproveSafe is false in our config, so even explicit false won't auto-run;
		// the key assertion is that the missing-param error is not raised for explicit false.
		sandbox.stub(ToolResultUtils, "askApprovalAndPushFeedback").resolves(false)

		const block = makeBlock({ command: "ls -la", requires_approval: "false" })
		await handler.execute(config, block)

		sinon.assert.notCalled(sayAndCreateMissingParamError)
		sinon.assert.called(ToolResultUtils.askApprovalAndPushFeedback as any)
	})

	it("should still report a missing command parameter as a fatal error", async () => {
		const say = sinon.stub().resolves()
		const config = makeConfig({ say })
		sandbox.stub(ToolResultUtils, "askApprovalAndPushFeedback").resolves(false)

		const block = makeBlock({ requires_approval: "true" }) // no command
		const response = await handler.execute(config, block)

		sinon.assert.calledWithMatch(say, "error")
		response.should.deepEqual(formatResponse.toolError(formatResponse.executeCommandMissingCommandError()))
	})
})
