import { describe, it } from "mocha"
import "should"
import type { ApiHandlerModel, ApiProviderInfo } from "@core/api"
import type { ModelInfo } from "@shared/api"
import {
	GEMINI_FLASH_MAX_OUTPUT_TOKENS,
	isAnthropicCompatibleProvider,
	isClaude4PlusModelFamily,
	isClineProvider,
	isGeminiFlashModel,
	isGLMModelFamily,
	isGPT5ModelFamily,
	isGptOssModelFamily,
	isNativeOpenAiCompatibleProvider,
	isNativeToolCallingConfig,
	isNativeToolCapableModel,
	isNextGenModelFamily,
	isPoolsideModelFamily,
	modelDoesntSupportWebp,
	shouldSkipReasoningForModel,
} from "../model-utils"

// Minimal helper — modelDoesntSupportWebp only reads apiHandlerModel.id
const m = (id: string, info: Partial<ModelInfo> = {}): ApiHandlerModel => ({
	id,
	info: { supportsPromptCache: false, ...info },
})
const providerInfo = (providerId: string, modelId: string, info: Partial<ModelInfo> = {}): ApiProviderInfo => ({
	providerId,
	model: m(modelId, info),
	mode: "act",
})

describe("shouldSkipReasoningForModel", () => {
	it("should return true for grok-4 models", () => {
		shouldSkipReasoningForModel("grok-4").should.equal(true)
		shouldSkipReasoningForModel("x-ai/grok-4").should.equal(true)
		shouldSkipReasoningForModel("openrouter/grok-4-turbo").should.equal(true)
		shouldSkipReasoningForModel("some-provider/grok-4-mini").should.equal(true)
	})

	it("should return false for non-grok-4 models", () => {
		shouldSkipReasoningForModel("grok-3").should.equal(false)
		shouldSkipReasoningForModel("grok-2").should.equal(false)
		shouldSkipReasoningForModel("claude-3-sonnet").should.equal(false)
		shouldSkipReasoningForModel("gpt-4").should.equal(false)
		shouldSkipReasoningForModel("gemini-pro").should.equal(false)
	})

	it("should return false for undefined or empty model IDs", () => {
		shouldSkipReasoningForModel(undefined).should.equal(false)
		shouldSkipReasoningForModel("").should.equal(false)
	})

	it("should be case sensitive", () => {
		shouldSkipReasoningForModel("GROK-4").should.equal(false)
		shouldSkipReasoningForModel("Grok-4").should.equal(false)
	})
})

describe("isClaude4PlusModelFamily", () => {
	it("should return true for Claude 4+ model IDs with version numbers", () => {
		isClaude4PlusModelFamily("claude-sonnet-4-5-20250929").should.equal(true)
		isClaude4PlusModelFamily("claude-opus-4-1-20250805").should.equal(true)
		isClaude4PlusModelFamily("claude-haiku-4-5-20251001").should.equal(true)
		isClaude4PlusModelFamily("claude-4-sonnet").should.equal(true)
	})

	it("should return true for Claude Code short aliases (sonnet, opus)", () => {
		// These are used by ClaudeCodeHandler.getModel() and should be recognized as Claude 4+
		isClaude4PlusModelFamily("sonnet").should.equal(true)
		isClaude4PlusModelFamily("opus").should.equal(true)
	})

	it("should return false for Claude 3.x models", () => {
		isClaude4PlusModelFamily("claude-3-sonnet").should.equal(false)
		isClaude4PlusModelFamily("claude-3.5-sonnet").should.equal(false)
		isClaude4PlusModelFamily("claude-3-opus").should.equal(false)
	})

	it("should return false for non-Claude models", () => {
		isClaude4PlusModelFamily("gpt-4").should.equal(false)
		isClaude4PlusModelFamily("gemini-pro").should.equal(false)
		isClaude4PlusModelFamily("llama-3").should.equal(false)
	})
})

describe("isGPT5ModelFamily", () => {
	it("should return true for GPT-5 model IDs with hyphen", () => {
		isGPT5ModelFamily("gpt-5").should.equal(true)
		isGPT5ModelFamily("gpt-5.1").should.equal(true)
		isGPT5ModelFamily("gpt-5.2-codex").should.equal(true)
		isGPT5ModelFamily("openai/gpt-5").should.equal(true)
	})

	it("should return true for GPT-5 model IDs without hyphen (OCA format)", () => {
		isGPT5ModelFamily("gpt5").should.equal(true)
		isGPT5ModelFamily("oca/gpt5").should.equal(true)
	})

	it("should be case insensitive", () => {
		isGPT5ModelFamily("GPT-5").should.equal(true)
		isGPT5ModelFamily("GPT5").should.equal(true)
		isGPT5ModelFamily("OCA/GPT5").should.equal(true)
	})

	it("should return false for non-GPT-5 models", () => {
		isGPT5ModelFamily("gpt-4").should.equal(false)
		isGPT5ModelFamily("gpt-4o").should.equal(false)
		isGPT5ModelFamily("gpt-oss-120b").should.equal(false)
		isGPT5ModelFamily("claude-3-sonnet").should.equal(false)
		isGPT5ModelFamily("gemini-pro").should.equal(false)
	})
})

describe("isGptOssModelFamily", () => {
	it("should return true for gpt-oss model IDs", () => {
		isGptOssModelFamily("gpt-oss-120b").should.equal(true)
		isGptOssModelFamily("openai/gpt-oss-120b").should.equal(true)
		isGptOssModelFamily("gpt_oss_120b").should.equal(true)
	})

	it("should be case insensitive", () => {
		isGptOssModelFamily("GPT-OSS-120B").should.equal(true)
		isGptOssModelFamily("OPENAI/GPT_OSS_120B").should.equal(true)
	})

	it("should return false for non-gpt-oss models", () => {
		isGptOssModelFamily("gpt-5").should.equal(false)
		isGptOssModelFamily("gpt-4o").should.equal(false)
		isGptOssModelFamily("claude-sonnet-4").should.equal(false)
	})
})

describe("isPoolsideModelFamily", () => {
	it("should return true for Laguna model IDs", () => {
		isPoolsideModelFamily("poolside/laguna-m.1").should.equal(true)
		isPoolsideModelFamily("laguna-enterprise").should.equal(true)
		isPoolsideModelFamily("LAGUNA").should.equal(true)
	})

	it("should return false for non-Poolside model IDs", () => {
		isPoolsideModelFamily("gpt-5").should.equal(false)
		isPoolsideModelFamily("deepseek-chat").should.equal(false)
		isPoolsideModelFamily("claude-sonnet-4").should.equal(false)
	})

	it("should qualify Laguna models for next-gen and native tool calling paths", () => {
		isNextGenModelFamily("poolside/laguna-m.1").should.equal(true)
		isNativeToolCallingConfig(providerInfo("openai-compatible", "poolside/laguna-m.1"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("openai-compatible", "poolside/laguna-m.1"), false).should.equal(false)
	})
})

describe("isAnthropicCompatibleProvider", () => {
	it("should return true for all Anthropic-compatible providers", () => {
		isAnthropicCompatibleProvider(providerInfo("xiaomi-athrapi", "dots3-note-prev")).should.equal(true)
		isAnthropicCompatibleProvider(providerInfo("mimo-tp-athrapi", "mimo-72b")).should.equal(true)
		isAnthropicCompatibleProvider(providerInfo("zhipu-athrapi", "glm-5.2")).should.equal(true)
		isAnthropicCompatibleProvider(providerInfo("dots-studio-athrapi", "dots3-note")).should.equal(true)
		isAnthropicCompatibleProvider(providerInfo("anthropic-comp", "claude-sonnet-4")).should.equal(true)
	})

	it("should be case insensitive", () => {
		isAnthropicCompatibleProvider(providerInfo("XIAOMI-ATHRAPI", "dots3-note-prev")).should.equal(true)
		isAnthropicCompatibleProvider(providerInfo("ZHIPU-ATHRAPI", "glm-5.2")).should.equal(true)
	})

	it("should return false for non-Anthropic-compatible providers", () => {
		isAnthropicCompatibleProvider(providerInfo("anthropic", "claude-sonnet-4")).should.equal(false)
		isAnthropicCompatibleProvider(providerInfo("openai", "gpt-4")).should.equal(false)
		isAnthropicCompatibleProvider(providerInfo("openrouter", "claude-sonnet-4")).should.equal(false)
		isAnthropicCompatibleProvider(providerInfo("zai", "glm-4.6")).should.equal(false)
		isAnthropicCompatibleProvider(providerInfo("test", "fast")).should.equal(false)
	})
})

describe("isNativeOpenAiCompatibleProvider", () => {
	it("should return true for native-capable OpenAI-compatible providers", () => {
		isNativeOpenAiCompatibleProvider(providerInfo("xiaomi", "mimo-v2.5-pro")).should.equal(true)
		isNativeOpenAiCompatibleProvider(providerInfo("mimo-tp", "mimo-v2.5")).should.equal(true)
		isNativeOpenAiCompatibleProvider(providerInfo("zai", "glm-5.2")).should.equal(true)
		isNativeOpenAiCompatibleProvider(providerInfo("deepseek", "deepseek-chat")).should.equal(true)
		isNativeOpenAiCompatibleProvider(providerInfo("dots-studio", "dots3-note-prev")).should.equal(true)
	})

	it("should be case insensitive", () => {
		isNativeOpenAiCompatibleProvider(providerInfo("XIAOMI", "mimo-v2.5-pro")).should.equal(true)
		isNativeOpenAiCompatibleProvider(providerInfo("DeepSeek", "deepseek-chat")).should.equal(true)
		isNativeOpenAiCompatibleProvider(providerInfo("Dots-Studio", "dots3-note-prev")).should.equal(true)
	})

	it("should return false for other providers", () => {
		isNativeOpenAiCompatibleProvider(providerInfo("xiaomi-athrapi", "mimo-v2.5-pro")).should.equal(false)
		isNativeOpenAiCompatibleProvider(providerInfo("openai", "gpt-5")).should.equal(false)
		isNativeOpenAiCompatibleProvider(providerInfo("openrouter", "glm-4.6")).should.equal(false)
	})
})

describe("isClineProvider", () => {
	it("should return true for the cline provider", () => {
		isClineProvider(providerInfo("cline", "cline-free/mimo-v2.6-flash")).should.equal(true)
		isClineProvider(providerInfo("Cline", "kwaipilot/kat-coder-pro")).should.equal(true)
		isClineProvider(providerInfo("CLINE", "cline-pass/glm-5.3")).should.equal(true)
	})

	it("should return false for other providers", () => {
		isClineProvider(providerInfo("openrouter", "anthropic/claude-sonnet-4.6")).should.equal(false)
		isClineProvider(providerInfo("openai", "gpt-5")).should.equal(false)
		isClineProvider(providerInfo("", "fast")).should.equal(false)
	})
})

describe("isNativeToolCallingConfig", () => {
	it("should return false when native tool calls are disabled", () => {
		isNativeToolCallingConfig(providerInfo("anthropic", "claude-sonnet-4"), false).should.equal(false)
		isNativeToolCallingConfig(providerInfo("zhipu-athrapi", "glm-5.2"), false).should.equal(false)
		isNativeToolCallingConfig(providerInfo("cline", "cline-free/mimo-v2.6-flash"), false).should.equal(false)
	})

	it("should return true for Anthropic-compatible providers when native tool calls are enabled", () => {
		// Anthropic-compatible providers bypass the model-family gate
		isNativeToolCallingConfig(providerInfo("xiaomi-athrapi", "dots3-note-prev"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("mimo-tp-athrapi", "mimo-72b"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("zhipu-athrapi", "glm-5.2"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("dots-studio-athrapi", "dots3-note"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("anthropic-comp", "claude-sonnet-4"), true).should.equal(true)
	})

	it("should return true for native-capable OpenAI-compatible providers when native tool calls are enabled", () => {
		// These providers have fixed model catalogs and bypass the model-family gate
		isNativeToolCallingConfig(providerInfo("xiaomi", "mimo-v2.5-pro"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("mimo-tp", "mimo-v2.5"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("zai", "glm-5.2"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("deepseek", "deepseek-v4-flash"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("dots-studio", "dots3-note-prev"), true).should.equal(true)
	})

	it("should return true for every model served by the cline provider", () => {
		// The cline gateway drives its whole catalog with native tool calls, so the
		// model-family heuristic must not gate it (e.g. cline-free/mimo-v2.6-flash).
		isNativeToolCallingConfig(providerInfo("cline", "cline-free/mimo-v2.6-flash"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("cline", "solar-mini4"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("cline", "cline-pass/qwen3.7-plus"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("cline", "unknown-cline-model"), true).should.equal(true)
	})

	it("should return true for next-gen models on non-Anthropic-compatible providers", () => {
		isNativeToolCallingConfig(providerInfo("anthropic", "claude-sonnet-4"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("openai", "gpt-5"), true).should.equal(true)
		isNativeToolCallingConfig(providerInfo("openrouter", "claude-4-5-sonnet"), true).should.equal(true)
	})

	it("should return false for non-next-gen models on non-Anthropic-compatible providers", () => {
		isNativeToolCallingConfig(providerInfo("openai", "gpt-4"), true).should.equal(false)
		isNativeToolCallingConfig(providerInfo("test", "fast"), true).should.equal(false)
	})

	it("should return true for a model whose catalog entry advertises tools", () => {
		isNativeToolCallingConfig(providerInfo("openrouter", "some-new-model", { supportsTools: true }), true).should.equal(true)
	})
})

describe("isNextGenModelFamily", () => {
	it("should cover the newer tool-capable model families", () => {
		// These used to drop to the generic XML prompt because the whitelist only knew
		// about the previous generation of names.
		isNextGenModelFamily("openai/gpt-6.1-sol").should.equal(true)
		isNextGenModelFamily("openai/gpt-6-astra").should.equal(true)
		isNextGenModelFamily("qwen/qwen3-coder").should.equal(true)
		isNextGenModelFamily("qwen3.7-plus").should.equal(true)
		isNextGenModelFamily("cline-pass/mimo-v2.6-pro").should.equal(true)
		isNextGenModelFamily("cline-free/muse-spark-1.3-contributor").should.equal(true)
		isNextGenModelFamily("moonshotai/kimi-k3").should.equal(true)
		isNextGenModelFamily("deepseek/deepseek-v4.1-flash").should.equal(true)
		isNextGenModelFamily("anthropic/claude-fable-5").should.equal(true)
		// Covered before this change; kept as regression guards
		isNextGenModelFamily("spacexai/grok-4.7").should.equal(true)
		isNextGenModelFamily("moonshotai/kimi-k2").should.equal(true)
	})

	it("should leave out the families whose XML variants are deliberately kept", () => {
		isNextGenModelFamily("z-ai/glm-4.6").should.equal(false)
		isNextGenModelFamily("nous/hermes-4").should.equal(false)
		isNextGenModelFamily("mistral/devstral").should.equal(false)
		isNextGenModelFamily("arcee-ai/trinity-large-preview").should.equal(false)
	})
})

describe("isNativeToolCapableModel", () => {
	it("should trust a catalog entry that advertises tools", () => {
		// Provider without a native guarantee and a model outside the whitelist:
		// the catalog capability is the deciding signal.
		isNativeToolCapableModel(providerInfo("openrouter", "some-new-model", { supportsTools: true })).should.equal(true)
		isNativeToolCapableModel(providerInfo("openai", "some-new-model", { supportsTools: true })).should.equal(true)
	})

	it("should fall back to provider guarantees when the catalog is silent", () => {
		isNativeToolCapableModel(providerInfo("cline", "some-new-model")).should.equal(true)
		isNativeToolCapableModel(providerInfo("zai", "glm-5.2")).should.equal(true)
		isNativeToolCapableModel(providerInfo("xiaomi", "mimo-v2.6-flash")).should.equal(true)
		isNativeToolCapableModel(providerInfo("zhipu-athrapi", "glm-5.2")).should.equal(true)
	})

	it("should fall back to the model-family whitelist when the catalog is silent", () => {
		isNativeToolCapableModel(providerInfo("openrouter", "qwen/qwen3-coder")).should.equal(true)
		isNativeToolCapableModel(providerInfo("openrouter", "some-legacy-model")).should.equal(false)
	})

	it("should not read an absent or negative catalog entry as a reason to withdraw native tools", () => {
		// Additive-only by design: `undefined` means "not advertised", never "denied",
		// and a provider-level guarantee outranks a catalog that says nothing useful.
		isNativeToolCapableModel(providerInfo("cline", "some-new-model", { supportsTools: undefined })).should.equal(true)
		isNativeToolCapableModel(providerInfo("cline", "some-new-model", { supportsTools: false })).should.equal(true)
	})
})

describe("isGeminiFlashModel", () => {
	it("should return true for Gemini Flash model IDs", () => {
		isGeminiFlashModel("google/gemini-2.5-flash").should.equal(true)
		isGeminiFlashModel("google/gemini-3.5-flash").should.equal(true)
		isGeminiFlashModel("google/gemini-3-flash-preview").should.equal(true)
		isGeminiFlashModel("google/gemini-2.5-flash-lite").should.equal(true)
	})

	it("should return false for non-Flash Gemini model IDs", () => {
		isGeminiFlashModel("google/gemini-2.5-pro").should.equal(false)
		isGeminiFlashModel("google/gemini-3-pro-preview").should.equal(false)
	})

	it("should return true for direct Gemini provider IDs", () => {
		isGeminiFlashModel("gemini-2.5-flash").should.equal(true)
		isGeminiFlashModel("gemini-3.5-flash").should.equal(true)
		isGeminiFlashModel("gemini-3-flash-preview").should.equal(true)
	})

	it("should return false for non-matching IDs", () => {
		isGeminiFlashModel("openrouter/google/gemini-2.5-flash").should.equal(false)
		isGeminiFlashModel("google/gemini-2.5-pro").should.equal(false)
	})

	it("should be case insensitive", () => {
		isGeminiFlashModel("GOOGLE/GEMINI-2.5-FLASH").should.equal(true)
	})
})

describe("GEMINI_FLASH_MAX_OUTPUT_TOKENS", () => {
	it("should be set to 8192", () => {
		GEMINI_FLASH_MAX_OUTPUT_TOKENS.should.equal(8_192)
	})
})

describe("isGLMModelFamily", () => {
	it("should match hyphen-separated GLM model IDs", () => {
		isGLMModelFamily("glm-4.6").should.equal(true)
		isGLMModelFamily("glm-4.5").should.equal(true)
		isGLMModelFamily("glm-4.7").should.equal(true)
		isGLMModelFamily("glm-5.1").should.equal(true)
		isGLMModelFamily("glm-5").should.equal(true)
		isGLMModelFamily("z-ai/glm-5.1").should.equal(true)
		isGLMModelFamily("z-ai/glm-4.6").should.equal(true)
		isGLMModelFamily("zai-org/glm-4.5").should.equal(true)
	})

	it("should match space-separated GLM model IDs used with openai-compatible local servers", () => {
		// "GLM 4.6V" is the model ID reported in issue #8203
		isGLMModelFamily("GLM 4.6V").should.equal(true)
		isGLMModelFamily("glm 4.6v").should.equal(true)
		isGLMModelFamily("GLM 4.5").should.equal(true)
	})

	it("should return false for non-GLM models", () => {
		isGLMModelFamily("gpt-4").should.equal(false)
		isGLMModelFamily("claude-sonnet-4").should.equal(false)
		isGLMModelFamily("gemini-2.5-flash").should.equal(false)
	})
})

describe("modelDoesntSupportWebp", () => {
	it("should return true for Grok models", () => {
		modelDoesntSupportWebp(m("grok-3")).should.equal(true)
		modelDoesntSupportWebp(m("x-ai/grok-3-mini")).should.equal(true)
	})

	it("should return true for GLM models (hyphen-separated)", () => {
		modelDoesntSupportWebp(m("glm-4.6")).should.equal(true)
		modelDoesntSupportWebp(m("glm-4.5")).should.equal(true)
		modelDoesntSupportWebp(m("glm-5.1")).should.equal(true)
		modelDoesntSupportWebp(m("z-ai/glm-4.6")).should.equal(true)
	})

	it("should return true for GLM models with space-separated IDs (issue #8203)", () => {
		modelDoesntSupportWebp(m("GLM 4.6V")).should.equal(true)
		modelDoesntSupportWebp(m("glm 4.5")).should.equal(true)
	})

	it("should return true for Devstral models running through llama.cpp", () => {
		modelDoesntSupportWebp(m("devstral-small")).should.equal(true)
		modelDoesntSupportWebp(m("unsloth/devstral-small-2512")).should.equal(true)
		modelDoesntSupportWebp(m("Devstral-Small-2-24B-Instruct")).should.equal(true)
	})

	it("should return false for models that support WebP", () => {
		modelDoesntSupportWebp(m("claude-sonnet-4")).should.equal(false)
		modelDoesntSupportWebp(m("gpt-5")).should.equal(false)
		modelDoesntSupportWebp(m("gemini-2.5-flash")).should.equal(false)
		modelDoesntSupportWebp(m("qwen2.5-vl-72b")).should.equal(false)
		modelDoesntSupportWebp(m("llama-3.1-8b")).should.equal(false)
	})
})
