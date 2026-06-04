Xiaomi Mimo AthrAPI — API 端点地址 + 模型 ID 列表（及默认模型）
https://api.xiaomimimo.com/anthropic/v1/messages

xiaomiDefaultModelId: XiaomiModelId = "mimo-v2-flash"

	"mimo-v2-flash": {
		maxTokens: 64_000,
		contextWindow: 262144,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.1,
		outputPrice: 0.3,
		cacheWritesPrice: 0.01,
		cacheReadsPrice: 0.3,
		description: "Xiaomi Mimo V2 Flash - Fast and efficient model with vision support, optimized for quick responses.",
	},
	"mimo-v2.5": {
		maxTokens: 128_000,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.12,
		outputPrice: 0.12,
		cacheWritesPrice: 0.12,
		cacheReadsPrice: 0.12,
		description: "MiMo Token Plan V2.5  - Multimodal model with advanced vision and reasoning capabilities.",
	},
	"mimo-v2.5-pro": {
		maxTokens: 128_000,
		contextWindow: 1048576,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.24,
		outputPrice: 0.24,
		cacheWritesPrice: 0.24,
		cacheReadsPrice: 0.24,
		description: "MiMo Token Plan V2.5 Pro - High-performance model for complex tasks.",
	},

---

Mimo TP AthrAPI — API 端点地址 + 模型 ID 列表（及默认模型）
https://token-plan-cn.xiaomimimo.com/anthropic

mimoTokenPlanDefaultModelId: MimoTokenPlanModelId = "mimo-v2.5-pro"

	"mimo-v2.5": {
		maxTokens: 128_000,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.12,
		outputPrice: 0.12,
		cacheWritesPrice: 0.12,
		cacheReadsPrice: 0.12,
		description: "MiMo Token Plan V2.5  - Multimodal model with advanced vision and reasoning capabilities.",
	},
	"mimo-v2.5-pro": {
		maxTokens: 128_000,
		contextWindow: 1048576,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.24,
		outputPrice: 0.24,
		cacheWritesPrice: 0.24,
		cacheReadsPrice: 0.24,
		description: "MiMo Token Plan V2.5 Pro - High-performance model for complex tasks.",
	},
    
---

Zhipu AthrAPI — API 端点地址 + 模型 ID 列表（及默认模型）
https://open.bigmodel.cn/api/anthropic
ZAiDefaultModelId: mainlandZAiModelId = "glm-5.1"

	"glm-5.1": {
		maxTokens: 128_000,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		cacheReadsPrice: 0.26,
		inputPrice: 1.4,
		outputPrice: 4.4,
	},
	"glm-5": {
		maxTokens: 128_000,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		cacheReadsPrice: 0.2,
		inputPrice: 1.0,
		outputPrice: 3.2,
	},
	"glm-4.7": {
		maxTokens: 131_000,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		cacheReadsPrice: 0.11,
		inputPrice: 0.6,
		outputPrice: 2.2,
	},
	"glm-4.6": {
		maxTokens: 128_000,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		cacheReadsPrice: 0.11,
		inputPrice: 0.6,
		outputPrice: 2.2,
	},
	"glm-4.5": {
		maxTokens: 98_304,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.29,
		outputPrice: 1.14,
		cacheWritesPrice: 0,
		cacheReadsPrice: 0.057,
		description:
			"GLM-4.5 is Zhipu's latest featured model. Its comprehensive capabilities in reasoning, coding, and agent reach the state-of-the-art (SOTA) level among open-source models, with a context length of up to 128k.",
		tiers: [
			{
				contextWindow: 32_000,
				inputPrice: 0.21,
				outputPrice: 1.0,
				cacheReadsPrice: 0.043,
			},
			{
				contextWindow: 128_000,
				inputPrice: 0.29,
				outputPrice: 1.14,
				cacheReadsPrice: 0.057,
			},
			{
				contextWindow: Number.POSITIVE_INFINITY,
				inputPrice: 0.29,
				outputPrice: 1.14,
				cacheReadsPrice: 0.057,
			},
		],
	},
	"glm-4.5-air": {
		maxTokens: 98304, // Quantization: fp8
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.086,
		outputPrice: 0.57,
		cacheWritesPrice: 0,
		cacheReadsPrice: 0.017,
		description:
			"GLM-4.5-Air is the lightweight version of GLM-4.5. It balances performance and cost-effectiveness, and can flexibly switch to hybrid thinking models.",
		tiers: [
			{
				contextWindow: 32_000,
				inputPrice: 0.057,
				outputPrice: 0.43,
				cacheReadsPrice: 0.011,
			},
			{
				contextWindow: 128_000,
				inputPrice: 0.086,
				outputPrice: 0.57,
				cacheReadsPrice: 0.017,
			},
			{
				contextWindow: Number.POSITIVE_INFINITY,
				inputPrice: 0.086,
				outputPrice: 0.57,
				cacheReadsPrice: 0.017,
			},
		],
	},
