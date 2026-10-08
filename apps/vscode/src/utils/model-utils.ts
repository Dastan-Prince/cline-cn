import { ApiHandlerModel, ApiProviderInfo } from "@core/api"
import { AnthropicModelId, anthropicModels } from "@/shared/api"

export { supportsReasoningEffortForModel } from "@shared/utils/reasoning-support"

const CLAUDE_VERSION_MATCH_REGEX = /[-_ ]([\d](?:\.[05])?)[-_ ]?/
export const GEMINI_FLASH_MAX_OUTPUT_TOKENS = 8_192

/**
 * Providers that speak the Anthropic Messages API (tool_use / input_json_delta)
 * through the Anthropic SDK. Unlike OpenAI-compatible providers, the protocol is
 * fixed by the SDK/endpoint, so provider capability -- not the model-family
 * heuristic -- is the meaningful signal for whether native tool calling works.
 */
export const ANTHROPIC_COMPATIBLE_PROVIDERS = [
	"xiaomi-athrapi",
	"mimo-tp-athrapi",
	"zhipu-athrapi",
	"dots-studio-athrapi",
	"anthropic-comp",
] as const

export function isAnthropicCompatibleProvider(providerInfo: ApiProviderInfo): boolean {
	return ANTHROPIC_COMPATIBLE_PROVIDERS.includes(
		normalize(providerInfo.providerId) as (typeof ANTHROPIC_COMPATIBLE_PROVIDERS)[number],
	)
}

/**
 * OpenAI-compatible providers with fixed model catalogs whose endpoints reliably
 * support OpenAI function calling across the whole catalog. Like Anthropic-compatible
 * providers, provider membership -- not the model-family heuristic -- is the
 * meaningful signal for whether native tool calling works.
 */
export const NATIVE_OPENAI_COMPATIBLE_PROVIDERS = ["xiaomi", "mimo-tp", "zai", "deepseek", "dots-studio"] as const

export function isNativeOpenAiCompatibleProvider(providerInfo: ApiProviderInfo): boolean {
	return NATIVE_OPENAI_COMPATIBLE_PROVIDERS.includes(
		normalize(providerInfo.providerId) as (typeof NATIVE_OPENAI_COMPATIBLE_PROVIDERS)[number],
	)
}

/**
 * The Cline provider is a gateway that fronts a server-defined model catalog.
 * Every model it serves is driven the same way the upstream runtime drives them
 * -- through native function calling -- so provider membership, not the
 * model-family heuristic, is the meaningful capability signal here. Without this
 * the newer catalog entries (e.g. cline-free/mimo-v2.6-flash) fall back to the
 * XML text prompt and models that were only trained on native tool calls produce
 * unparseable output.
 */
export function isClineProvider(providerInfo: ApiProviderInfo): boolean {
	return normalize(providerInfo.providerId) === "cline"
}

export function isNextGenModelProvider(providerInfo: ApiProviderInfo): boolean {
	const providerId = normalize(providerInfo.providerId)
	return [
		"cline",
		"anthropic",
		"bedrock",
		"gemini",
		"vertex",
		"openrouter",
		"openai",
		"minimax",
		"openai-native",
		"openai-compatible",
		"openai-codex",
		"baseten",
		"vercel-ai-gateway",
		"oca",
		...NATIVE_OPENAI_COMPATIBLE_PROVIDERS,
		...ANTHROPIC_COMPATIBLE_PROVIDERS,
	].some((id) => providerId === id)
}

export function modelDoesntSupportWebp(apiHandlerModel: ApiHandlerModel): boolean {
	const modelId = apiHandlerModel.id.toLowerCase()
	// Grok doesn't support WebP via its API.
	// GLM and Devstral models running through llama.cpp fail with WebP because
	// llama.cpp's STB image library doesn't support the WebP format.
	return modelId.includes("grok") || isGLMModelFamily(modelId) || isDevstralModelFamily(modelId)
}

/**
 * Determines if reasoning content should be skipped for a given model
 * Currently skips reasoning for:
 * - Grok-4 models since they only display "thinking" without useful information
 * - Devstral models since they don't support reasoning_details field
 */
export function shouldSkipReasoningForModel(modelId?: string): boolean {
	if (!modelId) {
		return false
	}
	return modelId.includes("grok-4") || modelId.includes("devstral") || modelId.includes("glm")
}

export function isAnthropicModelId(modelId: string): modelId is AnthropicModelId {
	const CLAUDE_MODELS = ["sonnet", "opus", "haiku"]
	return modelId in anthropicModels || CLAUDE_MODELS.some((substring) => modelId.includes(substring))
}

export function isClaude4PlusModelFamily(id: string): boolean {
	const modelId = normalize(id)
	// Claude Code short aliases are always Claude 4+
	// These are used by ClaudeCodeHandler.getModel() when user selects "sonnet" or "opus"
	// Check before isAnthropicModelId to avoid type guard narrowing issues
	if (modelId === "sonnet" || modelId === "opus") {
		return true
	}
	if (!isAnthropicModelId(modelId)) {
		return false
	}
	// Get model version number
	const versionMatch = modelId.match(CLAUDE_VERSION_MATCH_REGEX)
	if (!versionMatch) {
		return false
	}
	const version = Number.parseFloat(versionMatch[1])
	// Check if version is 4.0 or higher
	return version >= 4
}

/**
 * Claude model families whose id carries neither a sonnet/opus/haiku token nor a
 * version number (e.g. `anthropic/claude-fable-5`), so `isAnthropicModelId` and
 * the version regex in `isClaude4PlusModelFamily` both fail to recognise them.
 */
export function isClaudeFableModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("claude-fable") || modelId.includes("fable")
}

export function isGemini2dot5ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gemini-2.5")
}

export function isGrok4ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("grok-4")
}

export function isGPT5ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gpt-5") || modelId.includes("gpt5")
}

/**
 * GPT-6 and later namespaces. `isGPT5ModelFamily` only matches the literal
 * `gpt-5`/`gpt5` substring, so without this newer models fall through to the
 * generic XML prompt.
 */
export function isGPT6ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gpt-6") || modelId.includes("gpt6")
}

export function isGptOssModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gpt-oss") || modelId.includes("gpt_oss")
}

export function isGPT51Model(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gpt-5.1") || modelId.includes("gpt-5-1")
}

export function isGPT52Model(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gpt-5.2") || modelId.includes("gpt-5-2")
}

export function isGPT51PlusModel(id: string): boolean {
	const modelId = normalize(id)
	return (
		isGPT51Model(modelId) ||
		isGPT52Model(modelId) ||
		modelId.includes("gpt-5.3") ||
		modelId.includes("gpt-5-3") ||
		modelId.includes("gpt-5.4") ||
		modelId.includes("gpt-5-4") ||
		modelId.includes("gpt-5.5") ||
		modelId.includes("gpt-5-5")
	)
}

export function isGLMModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return (
		modelId.includes("glm-5") ||
		modelId.includes("glm-4.7") ||
		modelId.includes("glm-4.6") ||
		modelId.includes("glm-4.5") ||
		// Space-separated variants like "GLM 4.6V" used with openai-compatible local servers
		modelId.includes("glm 4.") ||
		modelId.includes("z-ai/glm") ||
		modelId.includes("zai-org/glm")
	)
}

export function isMinimaxModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("minimax")
}

export function isHermesModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return (
		modelId.includes("hermes-4") ||
		modelId.includes("hermes4") ||
		modelId.includes("nous/hermes-4") ||
		modelId.includes("nous/hermes4") ||
		modelId.includes("nous-hermes-4") ||
		modelId.includes("nous/hermes4") ||
		modelId.includes("nousresearch/hermes-4") ||
		modelId.includes("nousresearch/hermes4")
	)
}

export function isNextGenOpenSourceModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return ["kimi-k2", "kimi-k3"].some((substring) => modelId.includes(substring))
}

export function isQwen3ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("qwen3") || modelId.includes("qwen-3")
}

export function isMimoModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("mimo")
}

export function isMuseSparkModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("muse-spark") || modelId.includes("musespark")
}

export function isDevstralModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("devstral")
}

export function isTrinityModelFamily(id: string): boolean {
	const modelId = normalize(id)
	// OpenRouter: arcee-ai/trinity-large-preview:free and other trinity variants
	return modelId.includes("arcee-ai/trinity") || modelId.includes("trinity")
}

export function isGemini3ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("gemini3") || modelId.includes("gemini-3")
}

export function isGeminiFlashModel(id: string): boolean {
	const modelId = normalize(id)
	const isGooglePrefixedGemini = modelId.startsWith("google/gemini")
	const isDirectGemini = modelId.startsWith("gemini-")
	return (isGooglePrefixedGemini || isDirectGemini) && modelId.includes("flash")
}

function isDeepSeek32ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("deepseek") && modelId.includes("3.2") && !modelId.includes("speciale")
}

export function isDeepSeekNativeModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("deepseek-chat") || modelId.includes("deepseek-reasoner")
}

export function isDeepSeekV4ModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("deepseek") && modelId.includes("v4")
}

export function isPoolsideModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("laguna")
}

/**
 * Models capable enough to be driven with the next-gen prompt and native tool
 * calling. This is the fallback signal for providers whose catalog does not
 * declare per-model tool support (see isNativeToolCapableModel); keep it in sync
 * with the model catalog, otherwise a model silently drops to the XML prompt.
 */
export function isNextGenModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return (
		isClaude4PlusModelFamily(modelId) ||
		isClaudeFableModelFamily(modelId) ||
		isGemini2dot5ModelFamily(modelId) ||
		isGrok4ModelFamily(modelId) ||
		isGPT5ModelFamily(modelId) ||
		isGPT6ModelFamily(modelId) ||
		isGptOssModelFamily(modelId) ||
		isMinimaxModelFamily(modelId) ||
		isGemini3ModelFamily(modelId) ||
		isNextGenOpenSourceModelFamily(modelId) ||
		isDeepSeek32ModelFamily(modelId) ||
		isDeepSeekNativeModelFamily(modelId) ||
		isDeepSeekV4ModelFamily(modelId) ||
		isPoolsideModelFamily(modelId) ||
		isQwen3ModelFamily(modelId) ||
		isMimoModelFamily(modelId) ||
		isMuseSparkModelFamily(modelId)
	)
}

export function isLocalModel(providerInfo: ApiProviderInfo): boolean {
	const localProviders = ["lmstudio", "ollama"]
	return localProviders.includes(normalize(providerInfo.providerId))
}

/**
 * Parses a price string and converts it from per-token to per-million-tokens
 * @param priceString The price string to parse (e.g. from API responses)
 * @returns The price multiplied by 1,000,000 for per-million-token pricing, or 0 if invalid
 */
export function parsePrice(priceString: string | undefined): number {
	if (!priceString || priceString === "" || priceString === "0") {
		return 0
	}
	const parsed = Number.parseFloat(priceString)
	if (Number.isNaN(parsed)) {
		return 0
	}
	// Convert from per-token to per-million-tokens (multiply by 1,000,000)
	return parsed * 1_000_000
}

/**
 * Whether the model is expected to support native tool calling.
 *
 * Resolution order:
 * 1. the model catalog explicitly advertises `tools` for it;
 * 2. providers that guarantee function calling for their whole catalog;
 * 3. the model-family fallback, for providers whose catalog carries no
 *    per-model capability metadata.
 *
 * An absent catalog declaration is never read as a denial. Upstream needed three
 * consecutive releases (4.1.12 / 4.1.13 / 4.1.17) to undo regressions where an
 * empty capability list was treated as an authoritative denial and stripped every
 * tool from the request, so this signal can only ever add native tool calling.
 */
export function isNativeToolCapableModel(providerInfo: ApiProviderInfo): boolean {
	if (providerInfo.model.info.supportsTools === true) {
		return true
	}
	// Anthropic-compatible endpoints use a fixed protocol dictated by the SDK/endpoint,
	// so provider capability is the meaningful signal -- we don't need the model-family
	// heuristic that OpenAI-compatible providers require.
	if (isAnthropicCompatibleProvider(providerInfo)) {
		return true
	}
	// OpenAI-compatible providers with fixed model catalogs (xiaomi, mimo-tp, zai,
	// deepseek) reliably support function calling across their entire catalog, so
	// provider membership is a sufficient capability signal here as well.
	if (isNativeOpenAiCompatibleProvider(providerInfo)) {
		return true
	}
	// The Cline provider fronts its catalog through a single native tool-calling
	// gateway, so every model it serves uses native tool calls.
	if (isClineProvider(providerInfo)) {
		return true
	}
	return isNextGenModelFamily(providerInfo.model.id)
}

/**
 * Determines if the given provider and model combination will use native tool calling.
 * Helpful if we need to quickly check this for prompts or other logic.
 * @param providerInfo The provider and model information
 * @param enableNativeToolCalls Whether the native tool calls setting is enabled
 * @returns true if the model will use native tool calling, false otherwise
 */
export function isNativeToolCallingConfig(providerInfo: ApiProviderInfo, enableNativeToolCalls: boolean): boolean {
	if (!enableNativeToolCalls) {
		return false
	}
	if (!isNextGenModelProvider(providerInfo)) {
		return false
	}
	return isNativeToolCapableModel(providerInfo)
}

/**
 * Check if parallel tool calling is enabled.
 * Parallel tool calling is enabled if:
 * 1. User has enabled it in settings, OR
 * 2. The current model/provider supports native tool calling and handles parallel tools well
 */
export function isParallelToolCallingEnabled(enableParallelSetting: boolean, providerInfo: ApiProviderInfo): boolean {
	if (enableParallelSetting) {
		return true
	}
	if (!providerInfo.providerId) {
		return false
	}
	return isNativeToolCallingConfig(providerInfo, true) || isGPT5ModelFamily(providerInfo.model.id)
}

function normalize(text: string): string {
	return text.trim().toLowerCase()
}
