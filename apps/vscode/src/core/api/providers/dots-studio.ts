import { DotsStudioModelId, dotsStudioDefaultModelId, dotsStudioModels, ModelInfo } from "@shared/api"
import { calculateApiCostOpenAI } from "@utils/cost"
import OpenAI from "openai"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { ClineStorageMessage } from "@/shared/messages/content"
import { fetch } from "@/shared/net"
import { ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { addReasoningContent } from "../transform/r1-format"
import { ApiStream } from "../transform/stream"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

interface DotsStudioHandlerOptions extends CommonApiHandlerOptions {
	dotsStudioApiKey?: string
	apiModelId?: string
}

export class DotsStudioHandler implements ApiHandler {
	private options: DotsStudioHandlerOptions
	private client: OpenAI | undefined

	constructor(options: DotsStudioHandlerOptions) {
		this.options = options
	}

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.dotsStudioApiKey) {
				throw new Error("Dots Studio API key is required")
			}
			try {
				this.client = new OpenAI({
					baseURL: "https://note3-prev-api.askdiandian.com/v1",
					apiKey: this.options.dotsStudioApiKey,
					fetch, // Use configured fetch with proxy support
				})
			} catch (error) {
				throw new Error(`Error creating Dots Studio client: ${error.message}`)
			}
		}
		return this.client
	}

	private async *yieldUsage(info: ModelInfo, usage: OpenAI.Completions.CompletionUsage | undefined): ApiStream {
		// Dots Studio may report cache reads/writes in either DeepSeek style
		// (prompt_cache_hit_tokens / prompt_cache_miss_tokens) or OpenAI style
		// (prompt_tokens_details.cached_tokens). Prefer DeepSeek style when present.
		interface DotsStudioUsage extends OpenAI.CompletionUsage {
			prompt_cache_hit_tokens?: number
			prompt_cache_miss_tokens?: number
		}
		const dotsUsage = usage as DotsStudioUsage

		const inputTokens = dotsUsage?.prompt_tokens || 0
		const outputTokens = dotsUsage?.completion_tokens || 0
		const cacheHitTokens = dotsUsage?.prompt_cache_hit_tokens
		if (cacheHitTokens !== undefined) {
			// DeepSeek style: prompt_tokens is the sum of cache hits and misses
			const cacheReadTokens = cacheHitTokens || 0
			const cacheWriteTokens = dotsUsage?.prompt_cache_miss_tokens || 0
			const totalCost = calculateApiCostOpenAI(info, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
			const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens)
			yield {
				type: "usage",
				inputTokens: nonCachedInputTokens,
				outputTokens: outputTokens,
				cacheWriteTokens: cacheWriteTokens,
				cacheReadTokens: cacheReadTokens,
				totalCost: totalCost,
			}
		} else {
			// OpenAI style: cached tokens are reported in prompt_tokens_details
			const cacheReadTokens = dotsUsage?.prompt_tokens_details?.cached_tokens || 0
			const totalCost = calculateApiCostOpenAI(info, inputTokens, outputTokens, 0, cacheReadTokens)
			yield {
				type: "usage",
				inputTokens: Math.max(0, inputTokens - cacheReadTokens),
				outputTokens: outputTokens,
				cacheWriteTokens: 0,
				cacheReadTokens: cacheReadTokens,
				totalCost: totalCost,
			}
		}
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[], tools?: OpenAITool[]): ApiStream {
		const client = this.ensureClient()
		const model = this.getModel()

		const convertedMessages = convertToOpenAiMessages(messages)
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			// Reasoning models require historical messages wrapped with reasoning_content
			...addReasoningContent(convertedMessages, messages),
		]

		const stream = await client.chat.completions.create({
			model: model.id,
			max_completion_tokens: model.info.maxTokens,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },
			// Reasoning models reject explicit temperature; omit it
			...getOpenAIToolParams(tools),
		})

		const toolCallProcessor = new ToolCallProcessor()

		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta
			if (delta && "reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					reasoning: (delta.reasoning_content as string | undefined) || "",
				}
			}

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (delta?.tool_calls) {
				yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls)
			}

			if (chunk.usage) {
				yield* this.yieldUsage(model.info, chunk.usage)
			}
		}
	}

	getModel(): { id: DotsStudioModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in dotsStudioModels) {
			const id = modelId as DotsStudioModelId
			return { id, info: dotsStudioModels[id] }
		}
		return {
			id: dotsStudioDefaultModelId,
			info: dotsStudioModels[dotsStudioDefaultModelId],
		}
	}
}
