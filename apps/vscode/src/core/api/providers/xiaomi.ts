import { XiaomiModelId, xiaomiDefaultModelId, xiaomiModels, ModelInfo } from "@shared/api"
import OpenAI from "openai"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { ClineStorageMessage } from "@/shared/messages/content"
import { fetch } from "@/shared/net"
import { version as extensionVersion } from "../../../../package.json"
import { ApiHandler, CommonApiHandlerOptions } from ".."
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"


interface XiaomiHandlerOptions extends CommonApiHandlerOptions {
	xiaomiApiKey?: string
	apiModelId?: string
}

export class XiaomiHandler implements ApiHandler {
	private options: XiaomiHandlerOptions
	private client: OpenAI | undefined

	constructor(options: XiaomiHandlerOptions) {
		this.options = options
	}

	private getApiBaseUrl(): string {
		return "https://api.xiaomimimo.com/v1"
	}

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.xiaomiApiKey) {
				throw new Error("Xiaomi Mimo API key is required")
			}
			try {
				this.client = new OpenAI({
					baseURL: this.getApiBaseUrl(),
					apiKey: this.options.xiaomiApiKey,
					defaultHeaders: {
						"HTTP-Referer": "https://cline.bot",
						"X-Title": "Cline",
						"X-Cline-Version": extensionVersion,
					},
					fetch, // Use configured fetch with proxy support
				})
			} catch (error: any) {
				throw new Error(`Error creating Xiaomi Mimo client: ${error.message}`)
			}
		}
		return this.client
	}

	getModel(): { id: XiaomiModelId; info: ModelInfo } {
		// Support both generic apiModelId and provider-specific model IDs
		const modelId = this.options.apiModelId
		if (modelId && modelId in xiaomiModels) {
			const id = modelId as XiaomiModelId
			return { id, info: xiaomiModels[id] }
		}
		return {
			id: xiaomiDefaultModelId,
			info: xiaomiModels[xiaomiDefaultModelId],
		}
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[], tools?: OpenAITool[]): ApiStream {
		const client = this.ensureClient()
		const model = this.getModel()
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		const stream = await client.chat.completions.create({
			model: model.id,
			max_completion_tokens: model.info.maxTokens,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },
			...getOpenAIToolParams(tools),
		})

		const toolCallProcessor = new ToolCallProcessor()

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
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
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
					cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
					cacheWriteTokens: 0,
				}
			}
		}
	}
}
