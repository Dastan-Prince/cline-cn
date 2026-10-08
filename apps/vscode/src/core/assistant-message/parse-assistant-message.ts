import { ClineDefaultTool, getToolUseNames } from "@shared/tools"
import { nanoid } from "nanoid"
import { AssistantMessageContent, TextStreamContent, ToolParamName, ToolUse, toolParamNames } from "." // Assuming types are defined in index.ts or a similar file

// parseAssistantmessageV1 removed in https://github.com/cline/cline/pull/5425

/**
 * Markers that indicate a model emitted a non-standard, hybrid tool-call syntax
 * instead of the documented XML tags. Observed in practice (e.g. the
 * cline-free/mimo-v2.6-flash output that motivated this fallback):
 *
 *   <tool_call><function=execute_command>
 *   <command>git status</parameter><parameter=requires_approval>false</parameter></function>
 *   </tool_call>
 *
 * The lenient superset of the parser is only enabled when one of these markers is
 * present so the documented format keeps its exact previous behaviour.
 */
const LENIENT_TOOL_SYNTAX_MARKER = /<tool_call>|<function=[a-z_]+>|<parameter[= ]/

/** `<parameter name="foo">` -- supported in every mode (used by e.g. dots models). */
const PARAMETER_NAME_ATTR_PATTERN = /<parameter\s+name="([^"]+)">\s*$/

/** `<parameter=foo>` / `<parameter="foo">` -- lenient-mode only alias. */
const PARAMETER_EQUALS_PATTERN = /<parameter\s*=\s*"?([^"\s>]+)"?>\s*$/

/** Closing tag accepted for every parameter in lenient mode. */
const LENIENT_PARAMETER_CLOSE_TAG = "</parameter>"

/** Tool closers accepted in lenient mode, on top of `</toolName>`. */
const LENIENT_TOOL_CLOSE_TAGS = ["</function>", "</tool_call>"]

/** Wrapper tags that carry no payload and must not leak into assistant text. */
const LENIENT_NOISE_TAGS = ["<tool_call>", "</tool_call>", "</function>"]

/**
 * @description **Version 2**
 * Parses an assistant message string potentially containing mixed text and tool usage blocks
 * marked with XML-like tags into an array of structured content objects.
 *
 * This version aims for efficiency by avoiding the character-by-character accumulator of V1.
 * It iterates through the string using an index `i`. At each position, it checks if the substring
 * *ending* at `i` matches any known opening or closing tags for tools or parameters using `startsWith`
 * with an offset.
 * It uses pre-computed Maps (`toolUseOpenTags`, `toolParamOpenTags`) for quick tag lookups.
 * State is managed using indices (`currentTextContentStart`, `currentToolUseStart`, `currentParamValueStart`)
 * pointing to the start of the current block within the original `assistantMessage` string.
 * Slicing is used to extract content only when a block (text, parameter, or tool use) is completed.
 * Special handling for `write_to_file` and `new_rule` content parameters is included, using `indexOf`
 * and `lastIndexOf` on the relevant slice to handle potentially nested closing tags.
 * If the input string ends mid-block, the last open block is added and marked as partial.
 *
 * @param assistantMessage The raw string output from the assistant.
 * @returns An array of `AssistantMessageContent` objects, which can be `TextContent` or `ToolUse`.
 *          Blocks that were not fully closed by the end of the input string will have their `partial` flag set to `true`.
 */
export function parseAssistantMessageV2(assistantMessage: string): AssistantMessageContent[] {
	const contentBlocks: AssistantMessageContent[] = []
	let currentTextContentStart = 0 // Index where the current text block started
	let currentTextContent: TextStreamContent | undefined
	let currentToolUseStart = 0 // Index *after* the opening tag of the current tool use
	let currentToolUse: ToolUse | undefined
	let currentParamValueStart = 0 // Index *after* the opening tag of the current param
	let currentParamName: ToolParamName | undefined
	let currentParamCloseTag: string | undefined // Closing tag for current parameter (may be "</parameter>" for generic format)

	// Precompute tags for faster lookups
	const toolUseOpenTags = new Map<string, string>()
	const toolParamOpenTags = new Map<string, ToolParamName>()
	for (const name of getToolUseNames()) {
		toolUseOpenTags.set(`<${name}>`, name)
	}
	for (const name of toolParamNames) {
		toolParamOpenTags.set(`<${name}>`, name)
	}

	// Lenient superset (see LENIENT_TOOL_SYNTAX_MARKER) only kicks in for hybrid
	// tool-call syntax. `<function=name>` is an alias for the documented `<name>`
	// open tag; params may then be closed with a bare `</parameter>`.
	const lenientMode = LENIENT_TOOL_SYNTAX_MARKER.test(assistantMessage)
	const lenientToolUseOpenTags = new Map<string, string>()
	if (lenientMode) {
		for (const name of toolUseOpenTags.values()) {
			lenientToolUseOpenTags.set(`<function=${name}>`, name)
			lenientToolUseOpenTags.set(`<function="${name}">`, name)
		}
	}

	// Push the pending text block (if any) that ends right before `endExclusive`.
	const flushPendingText = (endExclusive: number) => {
		const text = assistantMessage.slice(currentTextContentStart, endExclusive).trim()
		if (text.length > 0) {
			contentBlocks.push({
				type: "text",
				content: text,
				partial: false,
			})
		}
		currentTextContent = undefined
	}

	// Flush pending text and open a new tool use whose opening tag spans
	// [`tagStart`, `tagEnd`] (both inclusive).
	const startToolUse = (toolName: string, tagStart: number, tagEnd: number) => {
		flushPendingText(tagStart)
		currentToolUse = {
			type: "tool_use",
			name: toolName as ClineDefaultTool,
			params: {},
			partial: true, // Assume partial until closing tag is found
			call_id: nanoid(8),
			isNativeToolCall: false,
		}
		currentToolUseStart = tagEnd + 1 // Tool content starts after the opening tag
	}

	const len = assistantMessage.length
	for (let i = 0; i < len; i++) {
		const currentCharIndex = i

		// --- State: Parsing a Tool Parameter ---
		if (currentToolUse && currentParamName) {
			const primaryCloseTag = currentParamCloseTag || `</${currentParamName}>`
			let matchedCloseTag: string | undefined
			// Check if the string *ending* at index `i` matches the closing tag
			if (
				currentCharIndex >= primaryCloseTag.length - 1 &&
				assistantMessage.startsWith(
					primaryCloseTag,
					currentCharIndex - primaryCloseTag.length + 1, // Start checking from potential start of tag
				)
			) {
				matchedCloseTag = primaryCloseTag
			} else if (
				// Lenient mode: hybrid syntax opens params as `<command>` but closes them
				// with a bare `</parameter>`, so accept that as an extra closing tag too.
				lenientMode &&
				primaryCloseTag !== LENIENT_PARAMETER_CLOSE_TAG &&
				currentCharIndex >= LENIENT_PARAMETER_CLOSE_TAG.length - 1 &&
				assistantMessage.startsWith(
					LENIENT_PARAMETER_CLOSE_TAG,
					currentCharIndex - LENIENT_PARAMETER_CLOSE_TAG.length + 1,
				)
			) {
				matchedCloseTag = LENIENT_PARAMETER_CLOSE_TAG
			}

			if (matchedCloseTag) {
				// Found the closing tag for the parameter
				const value = assistantMessage
					.slice(
						currentParamValueStart, // Start after the opening tag
						currentCharIndex - matchedCloseTag.length + 1, // End before the closing tag
					)
					.trim()
				currentToolUse.params[currentParamName] = value
				currentParamName = undefined // Go back to parsing tool content
				// We don't continue loop here, need to check for tool close or other params at index i
			} else {
				continue // Still inside param value, move to next char
			}
		}

		// --- State: Parsing a Tool Use (but not a specific parameter) ---
		if (currentToolUse && !currentParamName) {
			// Ensure we are not inside a parameter already
			// Check if starting a new parameter
			let startedNewParam = false
			for (const [tag, paramName] of toolParamOpenTags.entries()) {
				if (currentCharIndex >= tag.length - 1 && assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)) {
					currentParamName = paramName
					currentParamCloseTag = `</${paramName}>`
					currentParamValueStart = currentCharIndex + 1 // Value starts after the tag
					startedNewParam = true
					break
				}
			}

			// Also check for <parameter name="..."> format (used by some models like
			// dots-3-note-preview) and, in lenient mode, the <parameter=...> alias.
			if (!startedNewParam && assistantMessage[currentCharIndex] === ">") {
				const searchStart = Math.max(0, currentCharIndex - 60)
				const preceding = assistantMessage.slice(searchStart, currentCharIndex + 1)
				const paramMatch =
					preceding.match(PARAMETER_NAME_ATTR_PATTERN) ??
					(lenientMode ? preceding.match(PARAMETER_EQUALS_PATTERN) : null)
				if (paramMatch) {
					const extractedName = paramMatch[1]
					if ((toolParamNames as readonly string[]).includes(extractedName)) {
						currentParamName = extractedName as ToolParamName
						currentParamCloseTag = "</parameter>"
						currentParamValueStart = currentCharIndex + 1
						startedNewParam = true
					}
				}
			}

			if (startedNewParam) {
				continue // Handled start of param, move to next char
			}

			// Check if closing the current tool use
			const primaryToolCloseTag = `</${currentToolUse.name}>`
			let toolCloseTag: string | undefined
			if (
				currentCharIndex >= primaryToolCloseTag.length - 1 &&
				assistantMessage.startsWith(primaryToolCloseTag, currentCharIndex - primaryToolCloseTag.length + 1)
			) {
				toolCloseTag = primaryToolCloseTag
			} else if (lenientMode) {
				// Lenient mode: the `<tool_call><function=name>` wrapper is closed either
				// by `</function>` or by the trailing `</tool_call>`.
				for (const tag of LENIENT_TOOL_CLOSE_TAGS) {
					if (
						currentCharIndex >= tag.length - 1 &&
						assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)
					) {
						toolCloseTag = tag
						break
					}
				}
			}
			if (toolCloseTag) {
				// End of the tool use found
				// Special handling for content params *before* finalizing the tool
				const toolContentSlice = assistantMessage.slice(
					currentToolUseStart, // From after the tool opening tag
					currentCharIndex - toolCloseTag.length + 1, // To before the tool closing tag
				)

				// Check if content parameter needs special handling (write_to_file/new_rule)
				// This check is important if the closing </content> tag was missed by the parameter parsing logic
				// (e.g., if content is empty or parsing logic prioritizes tool close)
				const contentParamName: ToolParamName = "content"
				if (
					currentToolUse.name === "write_to_file" /* || currentToolUse.name === "new_rule" */ &&
					toolContentSlice.includes(`<${contentParamName}>`)
				) {
					const contentStartTag = `<${contentParamName}>`
					const contentEndTag = `</${contentParamName}>`
					const contentStart = toolContentSlice.indexOf(contentStartTag)
					// Use lastIndexOf for robustness against nested tags
					const contentEnd = toolContentSlice.lastIndexOf(contentEndTag)

					if (contentStart !== -1 && contentEnd !== -1 && contentEnd > contentStart) {
						const contentValue = toolContentSlice.slice(contentStart + contentStartTag.length, contentEnd).trim()
						currentToolUse.params[contentParamName] = contentValue
					}
				}

				currentToolUse.partial = false // Mark as complete
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined // Reset state
				currentTextContentStart = currentCharIndex + 1 // Potential text starts after this tag
				continue // Move to next char
			}
			// If not starting a param and not closing the tool, continue accumulating tool content implicitly
			continue
		}

		// --- State: Parsing Text / Looking for Tool Start ---
		if (!currentToolUse) {
			// Check if starting a new tool use
			let startedNewTool = false
			for (const [tag, toolName] of toolUseOpenTags.entries()) {
				if (currentCharIndex >= tag.length - 1 && assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)) {
					startToolUse(toolName, currentCharIndex - tag.length + 1, currentCharIndex)
					startedNewTool = true
					break
				}
			}

			// Lenient mode: `<function=name>` (quoted or not) is an alias for the
			// documented `<name>` opening tag.
			if (!startedNewTool && lenientMode && assistantMessage[currentCharIndex] === ">") {
				for (const [tag, toolName] of lenientToolUseOpenTags.entries()) {
					if (
						currentCharIndex >= tag.length - 1 &&
						assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)
					) {
						startToolUse(toolName, currentCharIndex - tag.length + 1, currentCharIndex)
						startedNewTool = true
						break
					}
				}
			}

			if (startedNewTool) {
				continue // Handled start of tool, move to next char
			}

			// Lenient mode: swallow the `<tool_call>` / `</tool_call>` wrappers so they
			// never leak into the assistant text presented to the user.
			if (lenientMode) {
				let skippedNoise = false
				for (const tag of LENIENT_NOISE_TAGS) {
					if (
						currentCharIndex >= tag.length - 1 &&
						assistantMessage.startsWith(tag, currentCharIndex - tag.length + 1)
					) {
						flushPendingText(currentCharIndex - tag.length + 1)
						currentTextContentStart = currentCharIndex + 1
						skippedNoise = true
						break
					}
				}
				if (skippedNoise) {
					continue
				}
			}

			// If not starting a tool, it must be text content
			if (!currentTextContent) {
				// Start a new text block if we aren't already in one
				currentTextContentStart = currentCharIndex // Text starts at the current character
				// Check if the current char is the start of potential text *immediately* after a tag
				// This needs the previous state - simpler to let slicing handle it later.
				// Resetting start index accurately is key.
				// It should be the index *after* the last processed tag.
				// The logic managing currentTextContentStart after closing tags handles this.

				currentTextContent = {
					type: "text",
					content: "", // Will be determined by slicing at the end or when a tool starts
					partial: true,
				}
			}
			// Continue accumulating text implicitly; content is extracted later.
		}
	} // End of loop

	// --- Finalization after loop ---

	// Finalize any open parameter within an open tool use
	if (currentToolUse && currentParamName) {
		currentToolUse.params[currentParamName] = assistantMessage
			.slice(currentParamValueStart) // From param start to end of string
			.trim()
		// Tool use remains partial
	}

	// Finalize any open tool use (which might contain the finalized partial param)
	if (currentToolUse) {
		// Tool use is partial because the loop finished before its closing tag
		contentBlocks.push(currentToolUse)
	}
	// Finalize any trailing text content
	// Only possible if a tool use wasn't open at the very end
	else if (currentTextContent) {
		currentTextContent.content = assistantMessage
			.slice(currentTextContentStart) // From text start to end of string
			.trim()
		// Text is partial because the loop finished
		if (currentTextContent.content.length > 0) {
			contentBlocks.push(currentTextContent)
		}
	}

	return contentBlocks
}
