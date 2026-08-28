/**
 * Relates the provider identifiers used at each stage of catalog generation and
 * runtime provider selection:
 *
 * - `modelsDevKey` is the provider's key in the models.dev API payload.
 * - `generatedProviderId` is Cline's canonical ID for the provider spec and
 *   model catalog generated from that payload. Generation maps
 *   `modelsDevKey -> generatedProviderId` so upstream names do not leak into
 *   Cline's public provider IDs.
 * - `runtimeProviderId` is the ID of a configured provider implementation that
 *   should read models from that generated catalog.
 *
 * Generated and runtime IDs are separate because multiple runtime transports or
 * authentication methods can share one catalog. For example, `openai-native`,
 * `openai-codex`, and `openai-codex-cli` are distinct runtime providers, but all
 * resolve to the `openai-native` catalog generated from models.dev's `openai`
 * entry. `resolveProviderModelCatalogKeys` performs that runtime-to-catalog
 * lookup. An omitted generated or runtime ID means that row participates only
 * in the other applicable lookup.
 */
const PROVIDER_IDS_MAP: ReadonlyArray<{
	modelsDevKey: string;
	generatedProviderId?: string;
	runtimeProviderId?: string;
}> = [
	{
		modelsDevKey: "openai",
		generatedProviderId: "openai-native",
		runtimeProviderId: "openai-native",
	},
	{
		modelsDevKey: "openai",
		generatedProviderId: "openai-native",
		runtimeProviderId: "openai-codex-cli",
	},
	{
		modelsDevKey: "openai",
		generatedProviderId: "openai-native",
		runtimeProviderId: "openai-codex",
	},
	{ modelsDevKey: "anthropic", generatedProviderId: "anthropic" },
	{
		modelsDevKey: "anthropic",
		generatedProviderId: "anthropic",
		runtimeProviderId: "claude-code",
	},
	{ modelsDevKey: "google", generatedProviderId: "gemini" },
	{
		modelsDevKey: "deepseek",
		generatedProviderId: "deepseek",
		runtimeProviderId: "deepseek",
	},
	{ modelsDevKey: "xai", generatedProviderId: "xai" },
	{
		modelsDevKey: "togetherai",
		generatedProviderId: "together",
		runtimeProviderId: "together",
	},
	{
		modelsDevKey: "sap-ai-core",
		generatedProviderId: "sapaicore",
		runtimeProviderId: "sapaicore",
	},
	{ modelsDevKey: "ollama", runtimeProviderId: "ollama-cloud" },
	{ modelsDevKey: "ollama-cloud", generatedProviderId: "ollama" },
	{
		modelsDevKey: "fireworks-ai",
		generatedProviderId: "fireworks",
		runtimeProviderId: "fireworks",
	},
	{
		modelsDevKey: "groq",
		generatedProviderId: "groq",
		runtimeProviderId: "groq",
	},
	{
		modelsDevKey: "poolside",
		generatedProviderId: "poolside",
		runtimeProviderId: "poolside",
	},
	{
		modelsDevKey: "cerebras",
		generatedProviderId: "cerebras",
		runtimeProviderId: "cerebras",
	},
	{
		modelsDevKey: "sambanova",
		generatedProviderId: "sambanova",
		runtimeProviderId: "sambanova",
	},
	{
		modelsDevKey: "nebius",
		generatedProviderId: "nebius",
		runtimeProviderId: "nebius",
	},
	{
		modelsDevKey: "huggingface",
		generatedProviderId: "huggingface",
		runtimeProviderId: "huggingface",
	},
	{
		modelsDevKey: "openrouter",
		generatedProviderId: "openrouter",
	},
	{
		modelsDevKey: "vercel",
		generatedProviderId: "vercel-ai-gateway",
		runtimeProviderId: "dify",
	},
	{
		modelsDevKey: "vercel",
		generatedProviderId: "vercel-ai-gateway",
	},
	{
		modelsDevKey: "openrouter",
		generatedProviderId: "openrouter",
		runtimeProviderId: "cline",
	},
	{
		modelsDevKey: "aihubmix",
		generatedProviderId: "aihubmix",
		runtimeProviderId: "aihubmix",
	},
	{ modelsDevKey: "hicap", runtimeProviderId: "hicap" },
	{ modelsDevKey: "nous-research", runtimeProviderId: "nousResearch" },
	{ modelsDevKey: "huawei-cloud-maas", runtimeProviderId: "huawei-cloud-maas" },
	{
		modelsDevKey: "baseten",
		generatedProviderId: "baseten",
		runtimeProviderId: "baseten",
	},
	{ modelsDevKey: "zai-coding-plan", generatedProviderId: "zai-coding-plan" },
	{
		// The Cline CN fork's Anthropic-compatible GLM Coding Plan endpoint is a
		// second transport over the same catalog. Registering it as a runtime
		// consumer (mirroring how openai-native/openai-codex share the `openai`
		// catalog) lets it resolve both the bundled and the live models.dev
		// `zai-coding-plan` models; without this row it only ever sees the
		// static snapshot carried by its builtin spec.
		modelsDevKey: "zai-coding-plan",
		generatedProviderId: "zai-coding-plan",
		runtimeProviderId: "zhipu-athrapi",
	},
	{ modelsDevKey: "google-vertex", generatedProviderId: "vertex" },
	{ modelsDevKey: "lmstudio", generatedProviderId: "lmstudio" },
	{ modelsDevKey: "zai", generatedProviderId: "zai" },
	{ modelsDevKey: "requesty", generatedProviderId: "requesty" },
	{ modelsDevKey: "amazon-bedrock", generatedProviderId: "bedrock" },
	{ modelsDevKey: "mistral", generatedProviderId: "mistral" },
	{ modelsDevKey: "moonshotai", generatedProviderId: "moonshot" },
	{ modelsDevKey: "minimax", generatedProviderId: "minimax" },
	{ modelsDevKey: "opencode", generatedProviderId: "opencode" },
	{ modelsDevKey: "wandb", generatedProviderId: "wandb" },
	{ modelsDevKey: "kilo", generatedProviderId: "kilo" },
	{ modelsDevKey: "xiaomi", generatedProviderId: "xiaomi" },
	{
		// Same runtime-catalog sharing as zhipu-athrapi above: both Xiaomi
		// Anthropic-compatible endpoints (standard and Token Plan) are distinct
		// transports over the single `xiaomi` catalog, so they must be
		// registered as runtime consumers to pick up the live models.dev list
		// instead of only the static snapshot in their builtin specs.
		modelsDevKey: "xiaomi",
		generatedProviderId: "xiaomi",
		runtimeProviderId: "xiaomi-athrapi",
	},
	{
		modelsDevKey: "xiaomi",
		generatedProviderId: "xiaomi",
		runtimeProviderId: "xiaomi-tp-athrapi",
	},
	{
		modelsDevKey: "tencent-tokenhub",
		generatedProviderId: "tencent-tokenhub",
	},
	{ modelsDevKey: "v0", generatedProviderId: "v0" },
];

function dedupe(values: readonly string[]): string[] {
	return [...new Set(values)];
}

export const MODELS_DEV_PROVIDER_KEY_MAP = Object.fromEntries(
	PROVIDER_IDS_MAP.flatMap((entry) =>
		entry.generatedProviderId
			? [[entry.modelsDevKey, entry.generatedProviderId]]
			: [],
	),
);

/**
 * Providers that must remain excluded even when their models.dev entry uses a
 * supported AI SDK package. IDs use Cline's generated provider identifiers
 * after applying MODELS_DEV_PROVIDER_KEY_MAP.
 */
export const MODELS_DEV_BLOCKED_PROVIDER_IDS: ReadonlySet<string> = new Set();

export const MODELS_DEV_CURRENT_BUILTIN_PROVIDER_KEYS = new Set(
	PROVIDER_IDS_MAP.map((entry) => entry.modelsDevKey),
);

export function resolveGeneratedProviderIdForModelsDevKey(
	modelsDevKey: string,
): string | undefined {
	return MODELS_DEV_PROVIDER_KEY_MAP[modelsDevKey];
}

export function resolveProviderModelCatalogKeys(providerId: string): string[] {
	const mapped = PROVIDER_IDS_MAP.flatMap((entry) => {
		if (!entry.generatedProviderId) {
			return [];
		}
		if (
			entry.generatedProviderId === providerId ||
			entry.runtimeProviderId === providerId
		) {
			return [entry.generatedProviderId];
		}
		return [];
	});

	if (providerId === "nousResearch") {
		return dedupe([...mapped, "nousresearch", providerId]);
	}

	return dedupe([...mapped, providerId]);
}
