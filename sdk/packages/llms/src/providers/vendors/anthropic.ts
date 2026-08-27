import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type {
	GatewayProviderContext,
	GatewayResolvedProviderConfig,
} from "@cline/shared";
import { wrapLanguageModel } from "ai";
import { resolveApiKey } from "../http";
import {
	createMiniMaxThinkingFetch,
	miniMaxThinkingDisabledMiddleware,
} from "./minimax-thinking";
import type { ProviderFactoryResult } from "./types";

const ANTHROPIC_API_ROOT = "https://api.anthropic.com";
const API_VERSION_SEGMENT = /^v\d+(?:alpha|beta)?\d*$/i;

/**
 * The legacy Anthropic-compatible base-URL setting (and the 3.x
 * `@anthropic-ai/sdk` client) treat the base URL as a host root and append
 * `/v1/messages` themselves, while `@ai-sdk/anthropic` appends only
 * `/messages` — it versions the URL itself only when `baseURL` is exactly
 * the official API root. Preserve the legacy semantics for every
 * Anthropic-compatible gateway: append `/v1` unless the URL already ends
 * with a version segment (or is the official root, which `@ai-sdk/anthropic`
 * versions on its own).
 */
export function normalizeAnthropicBaseUrl(baseUrl: string | undefined): string | undefined {
	const trimmed = baseUrl?.trim().replace(/\/+$/, "");
	if (!trimmed) {
		return undefined;
	}
	if (trimmed === ANTHROPIC_API_ROOT) {
		// @ai-sdk/anthropic appends `/v1` itself for the official root; pass
		// the URL through unchanged rather than dropping it and letting the
		// ANTHROPIC_BASE_URL environment variable take over.
		return trimmed;
	}
	const lastSegment = trimmed.slice(trimmed.lastIndexOf("/") + 1);
	return API_VERSION_SEGMENT.test(lastSegment) ? trimmed : `${trimmed}/v1`;
}

export async function createAnthropicProviderModule(
	config: GatewayResolvedProviderConfig,
	context: GatewayProviderContext,
): Promise<ProviderFactoryResult> {
	const apiKey = await resolveApiKey(config);
	const isMiniMax = context.provider.id === "minimax";
	const provider = createAnthropic({
		apiKey,
		baseURL: normalizeAnthropicBaseUrl(config.baseUrl),
		headers: config.headers,
		fetch: isMiniMax ? createMiniMaxThinkingFetch(config.fetch) : config.fetch,
		name: context.provider.id,
	});
	return {
		buildModelTools: (tools) => {
			const result: ReturnType<
				NonNullable<ProviderFactoryResult["buildModelTools"]>
			> = {};
			for (const tool of tools) {
				if (tool.name === "web_search") {
					result.web_search = {
						tool: provider.tools.webSearch_20250305({
							maxUses: tool.maxUses,
							allowedDomains: tool.allowedDomains,
							blockedDomains: tool.blockedDomains,
							userLocation: tool.userLocation
								? { type: "approximate", ...tool.userLocation }
								: undefined,
						}),
					};
				}
			}
			return result;
		},
		operations: {
			language: (modelId) => {
				const model = provider(modelId);
				return isMiniMax
					? wrapLanguageModel({
							model: model as LanguageModelV4,
							middleware: miniMaxThinkingDisabledMiddleware,
						})
					: model;
			},
		},
	};
}
