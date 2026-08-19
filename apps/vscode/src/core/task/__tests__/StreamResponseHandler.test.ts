import { strict as assert } from "node:assert"
import { StreamResponseHandler } from "@core/task/StreamResponseHandler"
import { describe, it } from "mocha"

/**
 * Regression tests for native tool-call streaming partial JSON extraction.
 *
 * Bug: extractPartialJsonFields previously accepted unclosed string values, so a
 * path that was still streaming (e.g. `"path": "Services/`) leaked as the
 * truncated value "Services/". Downstream, WriteToFileToolHandler treated any
 * non-empty path as actionable → EISDIR from fs.readFile(directory) plus a
 * poisoned diff-view state ("User closed text editor, unable to edit file..." x N).
 *
 * Fix: the closing quote of a streamed string value is now REQUIRED before the
 * value can be extracted.
 */
describe("StreamResponseHandler partial JSON field extraction", () => {
	const makeHandler = () => new StreamResponseHandler().getHandlers().toolUseHandler

	it("does not extract an unclosed trailing string value (truncated path)", () => {
		const handler = makeHandler()
		handler.processToolUseDelta(
			{
				id: "toolu_1",
				type: "tool_use",
				name: "replace_in_file",
				input: `{"diff": "------- SEARCH\\nold\\n=======\\nnew\\n+++++++ REPLACE", "path": "Services/`,
			},
			"call-1",
		)

		const partials = handler.getPartialToolUsesAsContent()
		assert.equal(partials.length, 1)
		assert.ok(partials[0].params.diff, "closed value (diff) should be extracted")
		assert.equal("path" in partials[0].params, false, "unclosed path value must NOT leak as a truncated value")
	})

	it("extracts closed values from incomplete JSON (missing closing brace)", () => {
		const handler = makeHandler()
		handler.processToolUseDelta(
			{
				id: "toolu_2",
				type: "tool_use",
				name: "replace_in_file",
				input: `{"diff": "x", "path": "Services/Docx.cs"`,
			},
			"call-2",
		)

		const partials = handler.getPartialToolUsesAsContent()
		assert.equal(partials[0].params.path, "Services/Docx.cs")
		assert.equal(partials[0].params.diff, "x")
	})

	it("accumulates deltas and only exposes the path once its closing quote arrives", () => {
		const handler = makeHandler()
		handler.processToolUseDelta(
			{
				id: "toolu_3",
				type: "tool_use",
				name: "replace_in_file",
				input: `{"diff": "abc", "path": "Serv`,
			},
			"call-3",
		)

		let partials = handler.getPartialToolUsesAsContent()
		assert.equal(partials.length, 1)
		assert.equal("path" in partials[0].params, false, "partial path prefix must stay hidden")

		handler.processToolUseDelta(
			{
				id: "toolu_3",
				type: "tool_use",
				input: `ices/a.cs"`,
			},
			"call-3",
		)

		partials = handler.getPartialToolUsesAsContent()
		assert.equal(partials[0].params.path, "Services/a.cs")
		assert.equal(partials[0].params.diff, "abc")
	})

	it("unescapes escaped characters in extracted values", () => {
		const handler = makeHandler()
		// Raw JSON payload: {"path": "a\"b.cs"   (value closed, object not)
		handler.processToolUseDelta(
			{
				id: "toolu_4",
				type: "tool_use",
				name: "replace_in_file",
				input: `{"path": "a\\"b.cs"`,
			},
			"call-4",
		)

		const partials = handler.getPartialToolUsesAsContent()
		assert.equal(partials[0].params.path, `a"b.cs`)
	})
})
