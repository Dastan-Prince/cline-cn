import type { ApiStreamUsageChunk } from "../transform/stream"

/**
 * Raw usage fields as reported by Anthropic Messages API stream events
 * (`message_start.message.usage` or `message_delta.usage`).
 *
 * Per the Anthropic spec all values are cumulative for the current response:
 * `total_input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
 */
export interface RawAnthropicStreamUsage {
	input_tokens?: number | null
	output_tokens?: number | null
	cache_creation_input_tokens?: number | null
	cache_read_input_tokens?: number | null
}

export interface AnthropicStreamUsageTracker {
	/**
	 * Feeds a raw usage payload into the tracker and returns the usage chunk
	 * (the delta since the last emitted chunk) to forward downstream, or
	 * undefined when there is nothing new to report.
	 */
	track: (usage: RawAnthropicStreamUsage | null | undefined) => ApiStreamUsageChunk | undefined
}

/**
 * Creates a tracker for usage reported by Anthropic-compatible streaming endpoints.
 *
 * Standard Anthropic reports the full usage in `message_start` and cumulative
 * values in the final `message_delta`. GLM's Anthropic-compatible endpoint
 * (`https://open.bigmodel.cn/api/anthropic`) instead returns zeros in
 * `message_start` and only reports the real input/cache values in the final
 * `message_delta` event.
 *
 * To support both timings (and because downstream consumers accumulate usage
 * chunks additively), the tracker:
 * 1. keeps the running maximum per field (values are cumulative, so max never
 *    loses data and guards against late zeroed-out payloads)
 * 2. emits only the delta since the previously emitted chunk, so consumers can
 *    safely sum the chunks.
 */
export function createAnthropicStreamUsageTracker(): AnthropicStreamUsageTracker {
	let inputTokens = 0
	let outputTokens = 0
	let cacheWriteTokens = 0
	let cacheReadTokens = 0
	let lastEmitted = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }

	return {
		track: (usage) => {
			if (!usage) {
				return undefined
			}

			inputTokens = Math.max(inputTokens, usage.input_tokens ?? 0)
			outputTokens = Math.max(outputTokens, usage.output_tokens ?? 0)
			cacheWriteTokens = Math.max(cacheWriteTokens, usage.cache_creation_input_tokens ?? 0)
			cacheReadTokens = Math.max(cacheReadTokens, usage.cache_read_input_tokens ?? 0)

			const inputDelta = inputTokens - lastEmitted.inputTokens
			const outputDelta = outputTokens - lastEmitted.outputTokens
			const cacheWriteDelta = cacheWriteTokens - lastEmitted.cacheWriteTokens
			const cacheReadDelta = cacheReadTokens - lastEmitted.cacheReadTokens
			lastEmitted = { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens }

			const chunk: ApiStreamUsageChunk = {
				type: "usage",
				inputTokens: inputDelta,
				outputTokens: outputDelta,
				cacheWriteTokens: cacheWriteDelta > 0 ? cacheWriteDelta : undefined,
				cacheReadTokens: cacheReadDelta > 0 ? cacheReadDelta : undefined,
			}

			const hasNewUsage =
				inputDelta > 0 || outputDelta > 0 || (chunk.cacheWriteTokens ?? 0) > 0 || (chunk.cacheReadTokens ?? 0) > 0
			return hasNewUsage ? chunk : undefined
		},
	}
}
