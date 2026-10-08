/**
 * Tests for `parseAssistantMessageV2`.
 *
 * The documented XML format is the contract, but some models emit a hybrid
 * syntax built out of a `<tool_call><function=name>` wrapper with a bare
 * `</parameter>` closing tag. Those payloads used to parse as plain text, which
 * made the task loop report "You did not use a tool in your previous response"
 * and eventually escalate to `mistake_limit_reached`.
 *
 * The fixture strings below are the verbatim assistant outputs recorded in the
 * failing task that motivated the lenient parser.
 */

import { expect } from "chai"
import { describe, it } from "mocha"
import { ToolUse } from "../index"
import { parseAssistantMessageV2 } from "../parse-assistant-message"

const toolUses = (message: string): ToolUse[] =>
	parseAssistantMessageV2(message).filter((block): block is ToolUse => block.type === "tool_use")

const textBlocks = (message: string): string[] =>
	parseAssistantMessageV2(message)
		.filter((block) => block.type === "text")
		.map((block) => block.content)

describe("parseAssistantMessageV2", () => {
	describe("documented XML format", () => {
		it("parses `<tool><param>value</param></tool>` blocks", () => {
			const message = `<execute_command>
<command>ls -la</command>
<requires_approval>false</requires_approval>
</execute_command>`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].name).to.equal("execute_command")
			expect(uses[0].params.command).to.equal("ls -la")
			expect(uses[0].params.requires_approval).to.equal("false")
			expect(uses[0].partial).to.equal(false)
		})

		it('still parses the `<parameter name="...">` form used by dots models', () => {
			const message = `<read_file>
<parameter name="path">src/index.ts</parameter>
</read_file>`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].name).to.equal("read_file")
			expect(uses[0].params.path).to.equal("src/index.ts")
		})

		it("keeps text untouched when no tool call is present", () => {
			const message = "Here is some plain text without any tool calls."
			expect(textBlocks(message)).to.deep.equal([message])
			expect(toolUses(message)).to.be.empty
		})
	})

	describe("hybrid `<tool_call><function=...>` syntax", () => {
		it("parses the recorded multi-tool output", () => {
			const message = `<tool_call><function=execute_command>
<command>git status --porcelain | head -50; echo "---"; git status --porcelain | wc -l</parameter><parameter=requires_approval>false</parameter></function>
</tool_call><tool_call><function=read_file>
<path>.buildconfig</parameter></function></tool_call>`

			const uses = toolUses(message)
			expect(uses).to.have.length(2)

			expect(uses[0].name).to.equal("execute_command")
			expect(uses[0].params.command).to.equal(
				`git status --porcelain | head -50; echo "---"; git status --porcelain | wc -l`,
			)
			expect(uses[0].params.requires_approval).to.equal("false")
			expect(uses[0].partial).to.equal(false)

			expect(uses[1].name).to.equal("read_file")
			expect(uses[1].params.path).to.equal(".buildconfig")
			expect(uses[1].partial).to.equal(false)
		})

		it("parses the recorded task_progress output", () => {
			const message = `<tool_call><function=execute_command>
<command>git status --porcelain | head -80; echo "---total---"; git status --porcelain | wc -l</parameter><parameter=requires_approval>false</parameter><parameter=task_progress>
- [ ] 分析项目结构与构建产物
- [ ] 检查 git status 中未忽略的生成文件
- [ ] 完善 .gitignore
- [ ] 验证结果
</parameter></function></tool_call>`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].name).to.equal("execute_command")
			expect(uses[0].params.command).to.equal(
				`git status --porcelain | head -80; echo "---total---"; git status --porcelain | wc -l`,
			)
			expect(uses[0].params.task_progress).to.contain("- [ ] 完善 .gitignore")
		})

		it('supports the quoted `<function="name">` variant', () => {
			const message = `<tool_call><function="read_file"><parameter name="path">src/index.ts</parameter></function></tool_call>`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].name).to.equal("read_file")
			expect(uses[0].params.path).to.equal("src/index.ts")
		})

		it("does not leak wrapper tags into the assistant text", () => {
			const message = `I will inspect the repo first.
<tool_call><function=execute_command>
<command>git status</parameter></function>
</tool_call>
Done.`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].name).to.equal("execute_command")
			expect(uses[0].params.command).to.equal("git status")

			const texts = textBlocks(message)
			expect(texts[0]).to.equal("I will inspect the repo first.")
			expect(texts[texts.length - 1]).to.equal("Done.")
			for (const text of texts) {
				expect(text).to.not.contain("<tool_call>")
				expect(text).to.not.contain("</tool_call>")
				expect(text).to.not.contain("<function=")
			}
		})

		it("recovers the real tool call that follows an empty `<use_mcp_tool>`", () => {
			const message = `<use_mcp_tool>
</use_mcp_tool><tool_call><function=execute_command>
<command>git status</parameter></function>`

			const uses = toolUses(message)
			expect(uses).to.have.length(2)
			expect(uses[0].name).to.equal("use_mcp_tool")
			expect(Object.keys(uses[0].params)).to.be.empty
			expect(uses[1].name).to.equal("execute_command")
			expect(uses[1].params.command).to.equal("git status")
		})

		it("marks a still-streaming tool call as partial", () => {
			const message = `Working on it.
<tool_call><function=execute_command>
<command>git stat`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].partial).to.equal(true)
			expect(uses[0].params.command).to.equal("git stat")
			expect(textBlocks(message)).to.deep.equal(["Working on it."])
		})
	})

	describe("write_to_file content handling", () => {
		it("keeps extracting the content parameter", () => {
			const message = `<write_to_file>
<path>a.txt</path>
<content>
line1
line2
</content>
</write_to_file>`

			const uses = toolUses(message)
			expect(uses).to.have.length(1)
			expect(uses[0].name).to.equal("write_to_file")
			expect(uses[0].params.path).to.equal("a.txt")
			expect(uses[0].params.content).to.equal("line1\nline2")
		})
	})
})
