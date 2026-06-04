import { Anthropic } from "@anthropic-ai/sdk"
import { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/index"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { buildExternalBasicHeaders } from "@/services/EnvUtils"
import { XiaomiAthrapiModelId, ModelInfo, xiaomiAthrapiDefaultModelId, xiaomiAthrapiModels } from "@/shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { fetch } from "@/shared/net"
import { ClineTool } from "@/shared/tools"
import { ApiHandler, CommonApiHandlerOptions } from "../index"
import { withRetry } from "../retry"
import { ApiStream } from "../transform/stream"

interface XiaomiAthrapiHandlerOptions extends CommonApiHandlerOptions {
	xiaomiAthrapiKey?: string
	apiModelId?: string
	thinkingBudgetTokens?: number
}

export class XiaomiAthrapiHandler implements ApiHandler {
	private options: XiaomiAthrapiHandlerOptions
	private client: Anthropic | undefined

	constructor(options: XiaomiAthrapiHandlerOptions) {
		this.options = options
	}

	private ensureClient(): Anthropic {
		if (!this.client) {
			if (!this.options.xiaomiAthrapiKey) {
				throw new Error("Xiaomi Mimo AthrAPI key is required")
			}
			try {
				const externalHeaders = buildExternalBasicHeaders()
				this.client = new Anthropic({
					apiKey: this.options.xiaomiAthrapiKey,
					baseURL: "https://api.xiaomimimo.com/anthropic",
					defaultHeaders: externalHeaders,
					fetch,
				})
			} catch (error) {
				throw new Error(`Error creating Xiaomi Mimo AthrAPI client: ${error.message}`)
			}
		}
		return this.client
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[], tools?: ClineTool[]): ApiStream {
		const client = this.ensureClient()
		const model = this.getModel()

		const nativeToolsOn = tools?.length && tools?.length > 0

		const budget_tokens = this.options.thinkingBudgetTokens || 0
		const reasoningOn = (model.info.supportsReasoning ?? false) && budget_tokens !== 0

		const stream: AnthropicStream<Anthropic.RawMessageStreamEvent> = await client.messages.create({
			model: model.id,
			max_tokens: model.info.maxTokens || 8192,
			system: [{ text: systemPrompt, type: "text" }],
			messages,
			stream: true,
			tools: nativeToolsOn ? (tools as AnthropicTool[]) : undefined,
			thinking: reasoningOn ? { type: "enabled", budget_tokens: budget_tokens } : undefined,
			temperature: reasoningOn ? undefined : 1.0,
			tool_choice: nativeToolsOn && !reasoningOn ? { type: "any" } : undefined,
		})

		const lastStartedToolCall = { id: "", name: "", arguments: "" }

		for await (const chunk of stream) {
			switch (chunk?.type) {
				case "message_start": {
					const usage = chunk.message.usage
					yield {
						type: "usage",
						inputTokens: usage.input_tokens || 0,
						outputTokens: usage.output_tokens || 0,
						cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
						cacheReadTokens: usage.cache_read_input_tokens || undefined,
					}
					break
				}
				case "message_delta":
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}
					break
				case "message_stop":
					break
				case "content_block_start":
					switch (chunk.content_block.type) {
						case "thinking":
							yield {
								type: "reasoning",
								reasoning: chunk.content_block.thinking || "",
								signature: chunk.content_block.signature,
							}
							break
						case "redacted_thinking":
							yield {
								type: "reasoning",
								reasoning: "[Redacted thinking block]",
								redacted_data: chunk.content_block.data,
							}
							break
						case "tool_use":
							if (chunk.content_block.id && chunk.content_block.name) {
								lastStartedToolCall.id = chunk.content_block.id
								lastStartedToolCall.name = chunk.content_block.name
								lastStartedToolCall.arguments = ""
							}
							break
						case "text":
							if (chunk.index > 0) {
								yield {
									type: "text",
									text: "\n",
								}
							}
							yield {
								type: "text",
								text: chunk.content_block.text,
							}
							break
					}
					break
				case "content_block_delta":
					switch (chunk.delta.type) {
						case "thinking_delta":
							yield {
								type: "reasoning",
								reasoning: chunk.delta.thinking,
							}
							break
						case "signature_delta":
							if (chunk.delta.signature) {
								yield {
									type: "reasoning",
									reasoning: "",
									signature: chunk.delta.signature,
								}
							}
							break
						case "text_delta":
							yield {
								type: "text",
								text: chunk.delta.text,
							}
							break
						case "input_json_delta":
							if (lastStartedToolCall.id && lastStartedToolCall.name && chunk.delta.partial_json) {
								yield {
									type: "tool_calls",
									tool_call: {
										...lastStartedToolCall,
										function: {
											...lastStartedToolCall,
											id: lastStartedToolCall.id,
											name: lastStartedToolCall.name,
											arguments: chunk.delta.partial_json,
										},
									},
								}
							}
							break
					}
					break
				case "content_block_stop":
					lastStartedToolCall.id = ""
					lastStartedToolCall.name = ""
					lastStartedToolCall.arguments = ""
					break
			}
		}
	}

	getModel(): { id: XiaomiAthrapiModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId

		if (modelId && modelId in xiaomiAthrapiModels) {
			const id = modelId as XiaomiAthrapiModelId
			return { id, info: xiaomiAthrapiModels[id] }
		}
		return { id: xiaomiAthrapiDefaultModelId, info: xiaomiAthrapiModels[xiaomiAthrapiDefaultModelId] }
	}
}
