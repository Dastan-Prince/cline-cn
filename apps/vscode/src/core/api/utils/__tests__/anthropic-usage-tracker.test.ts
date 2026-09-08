import { expect } from "chai"
import { describe, it } from "mocha"
import { createAnthropicStreamUsageTracker } from "../anthropic-usage-tracker"

describe("anthropic-usage-tracker", () => {
	it("handles the standard Anthropic timing without double counting", () => {
		const tracker = createAnthropicStreamUsageTracker()

		const startChunk = tracker.track({
			input_tokens: 10,
			output_tokens: 2,
			cache_creation_input_tokens: 4,
			cache_read_input_tokens: 3,
		})
		expect(startChunk).to.deep.equal({
			type: "usage",
			inputTokens: 10,
			outputTokens: 2,
			cacheWriteTokens: 4,
			cacheReadTokens: 3,
		})

		// message_delta only carries the cumulative output_tokens
		const deltaChunk = tracker.track({ output_tokens: 9 })
		expect(deltaChunk).to.deep.equal({
			type: "usage",
			inputTokens: 0,
			outputTokens: 7,
			cacheWriteTokens: undefined,
			cacheReadTokens: undefined,
		})
	})

	it("captures the real usage GLM reports only in message_delta", () => {
		const tracker = createAnthropicStreamUsageTracker()

		// GLM's Anthropic-compatible endpoint returns zeros in message_start
		const startChunk = tracker.track({
			input_tokens: 0,
			output_tokens: 0,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
		})
		expect(startChunk).to.equal(undefined)

		// ...and the real values in the final message_delta
		const deltaChunk = tracker.track({
			input_tokens: 1601,
			output_tokens: 6951,
			cache_creation_input_tokens: 51,
			cache_read_input_tokens: 162432,
		})
		expect(deltaChunk).to.deep.equal({
			type: "usage",
			inputTokens: 1601,
			outputTokens: 6951,
			cacheWriteTokens: 51,
			cacheReadTokens: 162432,
		})

		// Downstream consumers accumulate chunks additively, so the resulting
		// context usage = 1601 + 51 + 162432 + 6951 = 171035 tokens.
	})

	it("does not double count when message_delta repeats cumulative values", () => {
		const tracker = createAnthropicStreamUsageTracker()

		tracker.track({
			input_tokens: 10,
			output_tokens: 2,
			cache_creation_input_tokens: 4,
			cache_read_input_tokens: 3,
		})

		const deltaChunk = tracker.track({
			input_tokens: 10,
			output_tokens: 9,
			cache_creation_input_tokens: 4,
			cache_read_input_tokens: 3,
		})
		expect(deltaChunk).to.deep.equal({
			type: "usage",
			inputTokens: 0,
			outputTokens: 7,
			cacheWriteTokens: undefined,
			cacheReadTokens: undefined,
		})
	})

	it("keeps the maximum when a later payload reports smaller values", () => {
		const tracker = createAnthropicStreamUsageTracker()

		tracker.track({ input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 200 })

		const smallerChunk = tracker.track({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 })
		expect(smallerChunk).to.equal(undefined)
	})

	it("ignores null or undefined usage payloads", () => {
		const tracker = createAnthropicStreamUsageTracker()
		expect(tracker.track(undefined)).to.equal(undefined)
		expect(tracker.track(null)).to.equal(undefined)
	})
})
