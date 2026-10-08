export interface ClineRecommendedModel {
	id: string
	name: string
	description: string
	tags: string[]
}

export interface ClineRecommendedModelsData {
	recommended: ClineRecommendedModel[]
	free: ClineRecommendedModel[]
}

/**
 * Hardcoded fallback shown when upstream recommended models are not enabled or unavailable.
 *
 * Mirrors the catalog shipped by upstream Cline 4.1.23. Free ids must keep the
 * `cline-free/` prefix because `ClineHandler` matches them verbatim (via
 * normalizeModelId) against the selected model id to decide whether to zero out
 * the reported cost.
 */
export const CLINE_RECOMMENDED_MODELS_FALLBACK: ClineRecommendedModelsData = {
	recommended: [
		{
			id: "anthropic/claude-sonnet-5.5",
			name: "claude-sonnet-5.5",
			description: "",
			tags: ["NEW"],
		},
		{
			id: "anthropic/claude-opus-5.5",
			name: "claude-opus-5.5",
			description: "",
			tags: ["NEW"],
		},
		{
			id: "spacexai/grok-4.7",
			name: "grok-4.7",
			description: "",
			tags: ["NEW"],
		},
		{
			id: "openai/gpt-6-astra",
			name: "gpt-6-astra",
			description: "",
			tags: ["NEW"],
		},
		{
			id: "openai/gpt-6.1-sol",
			name: "gpt-6.1-sol",
			description: "",
			tags: ["NEW"],
		},
		{
			id: "moonshotai/kimi-k3",
			name: "kimi-k3",
			description: "Kimi K3 is Moonshot AI's new flagship MoE model for agentic coding",
			tags: ["NEW"],
		},
	],
	free: [
		{
			id: "cline-free/solar-mini4",
			name: "Solar Mini 4",
			description: "Compact 35-billion parameter mixture-of-experts",
			tags: [],
		},
		{
			id: "cline-free/mimo-v2.6-flash",
			name: "Mimo V2.6 Flash",
			description: "Mixture-of-Experts architecture with 309B total parameters",
			tags: [],
		},
		{
			id: "cline-free/muse-spark-1.3-contributor",
			name: "Muse Spark 1.3 Contributor",
			description:
				"Meta's multimodal reasoning model for experimentation, learning, and early-stage agentic, multi-agent, and coding workflows.",
			tags: [],
		},
	],
}
