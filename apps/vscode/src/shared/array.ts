/**
 * Returns the index of the last element in the array where predicate is true, and -1
 * otherwise.
 * @param array The source array to search in
 * @param predicate find calls predicate once for each element of the array, in descending
 * order, until it finds one where predicate returns true. If such an element is found,
 * findLastIndex immediately returns that element index. Otherwise, findLastIndex returns -1.
 */
export function findLastIndex<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): number {
	let l = array.length
	while (l--) {
		if (predicate(array[l], l, array)) {
			return l
		}
	}
	return -1
}

export function findLast<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined {
	const index = findLastIndex(array, predicate)
	return index === -1 ? undefined : array[index]
}

/**
 * Coerces a parsed JSON array item into a string.
 * Models occasionally emit structured objects (e.g. {"label": "..."} or {"value": "..."} instead of
 * plain strings in ask_followup_question/plan_mode_respond option lists). Letting raw objects leak
 * into ClineMessage options crashes the webview renderer ("Objects are not valid as a React child").
 */
function coerceArrayItemToString(item: unknown): string {
	if (typeof item === "string") {
		return item
	}
	if (item != null && typeof item === "object") {
		const obj = item as Record<string, unknown>
		const preferred = obj.label ?? obj.value ?? obj.text
		if (typeof preferred === "string" && preferred.trim()) {
			return preferred
		}
		try {
			return JSON.stringify(item)
		} catch {
			return String(item)
		}
	}
	return String(item)
}

/**
 * Converts a partial or complete stringified array into an actual array.
 * Handles both complete JSON strings and incomplete array strings.
 * Splits on the specific tokens: ["  ", "  "]
 * Every parsed item is coerced to a string so malformed model output (object entries)
 * can never propagate into message payloads.
 * @param arrayString A string representation of an array, which may be incomplete
 * @returns Array of strings parsed from the input
 */
export function parsePartialArrayString(arrayString: string): string[] {
	try {
		// Try parsing as complete JSON first
		const parsed: unknown = JSON.parse(arrayString)
		if (!Array.isArray(parsed)) {
			return []
		}
		return parsed.map(coerceArrayItemToString)
	} catch {
		// If JSON parsing fails, handle as partial string
		const trimmed = arrayString.trim()
		if (!trimmed.startsWith('["')) {
			return []
		}

		// Remove leading ["
		let content = trimmed.slice(2)
		// Remove trailing "] if it exists
		content = content.replace(/"]$/, "")
		if (!content) {
			return []
		}

		// Split on ", " token and handle the parts
		return content
			.split('", "')
			.map((item) => item.trim())
			.filter(Boolean)
	}
}
