import type { ProviderListing } from "@shared/proto/cline/models"
import { fromProtobufModelOverrides, toProtobufModelOverrides } from "@shared/proto-conversions/models/modelOverrides"
import { describe, expect, it } from "vitest"
import {
	getFallbackGenericProviderSettings,
	getGenericProviderSettings,
	hasCustomProviderSettings,
	isGenericProviderListing,
} from "./providerSettingsRegistry"

// Mirrors what GenericProviderSettings sends: overrides cross the gRPC
// boundary as protobuf before the host converts them back.
function protoRoundTripOverrides(overrides: Parameters<typeof toProtobufModelOverrides>[0]) {
	return fromProtobufModelOverrides(toProtobufModelOverrides(overrides))
}

function listing(overrides: Partial<ProviderListing>): ProviderListing {
	return {
		allowsCustomModelIds: false,
		id: "deepseek",
		name: "DeepSeek",
		protocol: "openai-chat",
		...overrides,
	}
}

describe("providerSettingsRegistry", () => {
	it("builds DeepSeek generic settings from SDK provider-listing metadata", () => {
		expect(getGenericProviderSettings("deepseek", listing({ id: "deepseek", name: "DeepSeek" }))).toEqual({
			allowsCustomIds: false,
			providerId: "deepseek",
			providerName: "DeepSeek",
			signupUrl: "https://platform.deepseek.com/api_keys",
		})
	})

	it("builds Gemini generic settings from provider-listing metadata plus presentation overrides", () => {
		expect(
			getGenericProviderSettings(
				"gemini",
				listing({ id: "gemini", name: "Google Gemini", protocol: "gemini", allowsCustomModelIds: false }),
			),
		).toEqual({
			allowsCustomIds: false,
			baseUrlField: {
				label: "Use custom base URL",
				placeholder: "Default: https://generativelanguage.googleapis.com",
			},
			providerId: "gemini",
			providerName: "Google Gemini",
			signupUrl: "https://aistudio.google.com/apikey",
		})
	})

	it("keeps provider-specific UIs as explicit custom overrides", () => {
		expect(hasCustomProviderSettings("openai")).toBe(true)
		expect(hasCustomProviderSettings("deepseek")).toBe(false)
		expect(hasCustomProviderSettings("groq")).toBe(false)
		expect(hasCustomProviderSettings("cerebras")).toBe(false)
		expect(hasCustomProviderSettings("minimax")).toBe(false)
		expect(hasCustomProviderSettings("together")).toBe(false)
		expect(getGenericProviderSettings("openai", listing({ id: "openai", name: "OpenAI" }))).toBeUndefined()
	})

	it("allows migrated simple SDK providers to use the generic fallback", () => {
		const migratedProviders = [
			["baseten", "Baseten", "https://app.baseten.co/settings/api_keys"],
			["cerebras", "Cerebras", "https://cloud.cerebras.ai/"],
			["chutes", "Chutes", "https://chutes.ai/app/api"],
			["doubao", "Doubao", "https://console.volcengine.com/home"],
			["fireworks", "Fireworks", "https://app.fireworks.ai/settings/users/api-keys"],
			["groq", "Groq", "https://console.groq.com/keys"],
			[
				"huawei-cloud-maas",
				"Huawei Cloud MaaS",
				"https://support.huaweicloud.com/intl/zh-cn/usermanual-maas/maas_01_0001.html",
			],
			["huggingface", "Hugging Face", "https://huggingface.co/settings/tokens"],
			["mistral", "Mistral", "https://console.mistral.ai/api-keys"],
			["nebius", "Nebius", "https://auth.tokenfactory.nebius.com/ui/login"],
			["nousResearch", "NousResearch", undefined],
			["poolside", "Poolside", undefined],
			["sambanova", "SambaNova", "https://docs.sambanova.ai/cloud/docs/get-started/overview"],
			["tencent-tokenhub", "Tencent TokenHub", "https://cloud.tencent.com/document/product/1823/130050"],
			["vercel-ai-gateway", "Vercel AI Gateway", "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai"],
			["v0", "Vercel v0", undefined],
			["wandb", "W&B", "https://wandb.ai"],
			["xiaomi", "Xiaomi", undefined],
			["zai-coding-plan", "Z.AI Coding Plan", undefined],
		] as const

		for (const [providerId, providerName, signupUrl] of migratedProviders) {
			expect(hasCustomProviderSettings(providerId)).toBe(false)
			expect(getGenericProviderSettings(providerId, listing({ id: providerId, name: providerName }))).toEqual({
				allowsCustomIds: false,
				providerId,
				providerName,
				...(signupUrl ? { signupUrl } : {}),
			})
		}
	})

	it("builds MiniMax and Together settings through the generic registry", () => {
		expect(
			getGenericProviderSettings(
				"minimax",
				listing({ id: "minimax", name: "MiniMax", protocol: "anthropic", allowsCustomModelIds: false }),
			),
		).toEqual({
			allowsCustomIds: false,
			baseUrlField: {
				label: "Base URL",
				placeholder: "https://api.minimax.io/anthropic",
			},
			providerId: "minimax",
			providerName: "MiniMax",
			signupUrl: "https://www.minimax.io/platform/user-center/basic-information/interface-key",
		})
		expect(
			getGenericProviderSettings(
				"together",
				listing({ id: "together", name: "Together AI", protocol: "openai-chat", allowsCustomModelIds: false }),
			),
		).toEqual({
			allowsCustomIds: true,
			baseUrlField: {
				label: "Base URL",
				placeholder: "https://api.together.xyz/v1",
			},
			providerId: "together",
			providerName: "Together AI",
			signupUrl: "https://api.together.ai/settings/api-keys",
		})
	})

	it("allows future simple SDK providers to use the generic fallback", () => {
		const futureProvider = listing({
			allowsCustomModelIds: true,
			id: "future-simple-provider",
			name: "Future Simple Provider",
			protocol: "openai-chat",
		})

		expect(isGenericProviderListing(futureProvider)).toBe(true)
		expect(getGenericProviderSettings("future-simple-provider", futureProvider)).toEqual({
			allowsCustomIds: true,
			providerId: "future-simple-provider",
			providerName: "Future Simple Provider",
		})
	})

	// Regression guard for the checkbox snap-back bug: what the settings UI
	// sends through the proto bridge must preserve explicit boolean overrides.
	// (Host-side round trip is covered in the vscode store test; this pins the
	// webview half of the bridge.)
	it("preserves boolean capability overrides across the proto round trip", () => {
		expect(protoRoundTripOverrides({ supportsVision: false, supportsReasoning: true })).toEqual({
			supportsVision: false,
			supportsReasoning: true,
		})
		expect(protoRoundTripOverrides({ supportsReasoning: false })).toEqual({ supportsReasoning: false })
		expect(protoRoundTripOverrides({})).toEqual({})
	})

	it("requires listing metadata that proves the provider has a supported simple protocol", () => {
		expect(
			getGenericProviderSettings("unknown", listing({ id: "unknown", name: "Unknown", protocol: undefined })),
		).toBeUndefined()
		expect(
			getGenericProviderSettings("unknown", listing({ id: "unknown", name: "Unknown", protocol: "custom" })),
		).toBeUndefined()
		expect(
			getGenericProviderSettings("other", listing({ id: "unknown", name: "Unknown", protocol: "openai-chat" })),
		).toBeUndefined()
	})

	it("keeps static fallback metadata for generic providers that can render before listings load", () => {
		expect(getFallbackGenericProviderSettings("deepseek")).toEqual({
			allowsCustomIds: false,
			providerId: "deepseek",
			providerName: "DeepSeek",
			signupUrl: "https://platform.deepseek.com/api_keys",
		})
		expect(getFallbackGenericProviderSettings("gemini")).toEqual({
			allowsCustomIds: false,
			baseUrlField: {
				label: "Use custom base URL",
				placeholder: "Default: https://generativelanguage.googleapis.com",
			},
			providerId: "gemini",
			providerName: "Gemini",
			signupUrl: "https://aistudio.google.com/apikey",
		})
		expect(getFallbackGenericProviderSettings("minimax")).toEqual({
			allowsCustomIds: false,
			baseUrlField: {
				label: "Base URL",
				placeholder: "https://api.minimax.io/anthropic",
			},
			providerId: "minimax",
			providerName: "MiniMax",
			signupUrl: "https://www.minimax.io/platform/user-center/basic-information/interface-key",
		})
		expect(getFallbackGenericProviderSettings("together")).toEqual({
			allowsCustomIds: true,
			baseUrlField: {
				label: "Base URL",
				placeholder: "https://api.together.xyz/v1",
			},
			providerId: "together",
			providerName: "Together",
			signupUrl: "https://api.together.ai/settings/api-keys",
		})
		expect(getFallbackGenericProviderSettings("gemini")).toEqual({
			allowsCustomIds: false,
			baseUrlField: {
				label: "Use custom base URL",
				placeholder: "Default: https://generativelanguage.googleapis.com",
			},
			providerId: "gemini",
			providerName: "Gemini",
			signupUrl: "https://aistudio.google.com/apikey",
		})
		expect(getFallbackGenericProviderSettings("zai-coding-plan")).toEqual({
			allowsCustomIds: false,
			providerId: "zai-coding-plan",
			providerName: "Z.AI Coding Plan",
		})
		expect(getFallbackGenericProviderSettings("anthropic-comp")).toEqual({
			allowsCustomIds: true,
			allowsModelOverrides: true,
			skipModelListFetch: true,
			baseUrlField: {
				label: "Base URL",
				placeholder: "https://api.example.com/anthropic",
				alwaysVisible: true,
			},
			defaultModelInfo: {
				contextWindow: 512_000,
				maxTokens: 128_000,
				supportsImages: true,
				supportsPromptCache: false,
				inputPrice: 0.7,
				outputPrice: 1.5,
				temperature: 0.5,
			},
			providerId: "anthropic-comp",
			providerName: "Anthropic Compatible",
		})
		expect(getFallbackGenericProviderSettings("openai")).toBeUndefined()
	})

	it("exposes presets plus custom id and model overrides for the athrapi series", () => {
		expect(getFallbackGenericProviderSettings("xiaomi-athrapi")).toEqual({
			allowsCustomIds: true,
			allowsModelOverrides: true,
			defaultModelInfo: {
				contextWindow: 256_000,
				maxTokens: 8_192,
				supportsImages: false,
				supportsPromptCache: true,
				supportsReasoning: true,
				inputPrice: 0,
				outputPrice: 0,
				temperature: 0,
			},
			providerId: "xiaomi-athrapi",
			providerName: "Xiaomi MiMo (Anthropic)",
		})
		expect(getFallbackGenericProviderSettings("xiaomi-tp-athrapi")).toEqual({
			allowsCustomIds: true,
			allowsModelOverrides: true,
			defaultModelInfo: {
				contextWindow: 256_000,
				maxTokens: 8_192,
				supportsImages: false,
				supportsPromptCache: true,
				supportsReasoning: true,
				inputPrice: 0,
				outputPrice: 0,
				temperature: 0,
			},
			providerId: "xiaomi-tp-athrapi",
			providerName: "Xiaomi Token Plan (Anthropic)",
		})
		expect(getFallbackGenericProviderSettings("zhipu-athrapi")).toEqual({
			allowsCustomIds: true,
			allowsModelOverrides: true,
			signupUrl: "https://open.bigmodel.cn/",
			defaultModelInfo: {
				contextWindow: 131_072,
				maxTokens: 8_192,
				supportsImages: false,
				supportsPromptCache: true,
				supportsReasoning: true,
				inputPrice: 0,
				outputPrice: 0,
				temperature: 0,
			},
			providerId: "zhipu-athrapi",
			providerName: "Zhipu GLM (Anthropic)",
		})
		expect(getFallbackGenericProviderSettings("dots-studio-athrapi")).toEqual({
			allowsCustomIds: true,
			allowsModelOverrides: true,
			defaultModelInfo: {
				contextWindow: 393_216,
				maxTokens: 131_072,
				supportsImages: true,
				supportsPromptCache: false,
				supportsReasoning: true,
				inputPrice: 0.435,
				outputPrice: 0.87,
				temperature: 0,
			},
			providerId: "dots-studio-athrapi",
			providerName: "Dots Studio (Anthropic)",
		})
	})
})
