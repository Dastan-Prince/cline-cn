import type {
	GatewayProviderContext,
	GatewayResolvedProviderConfig,
} from "@cline/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProviderModule, normalizeAnthropicBaseUrl } from "./anthropic";

const createAnthropicMock = vi.hoisted(() => vi.fn());
const anthropicModelMock = vi.hoisted(() =>
	vi.fn((modelId: string) => ({ provider: "anthropic", modelId })),
);

vi.mock("@ai-sdk/anthropic", () => ({
	createAnthropic: createAnthropicMock,
}));

describe("normalizeAnthropicBaseUrl", () => {
	it("returns undefined when no base URL is configured", () => {
		expect(normalizeAnthropicBaseUrl(undefined)).toBeUndefined();
		expect(normalizeAnthropicBaseUrl("")).toBeUndefined();
		expect(normalizeAnthropicBaseUrl("   ")).toBeUndefined();
	});

	it("appends /v1 to custom base URLs (legacy /v1/messages semantics)", () => {
		expect(normalizeAnthropicBaseUrl("https://gateway.example.com/anthropic")).toBe(
			"https://gateway.example.com/anthropic/v1",
		);
		expect(normalizeAnthropicBaseUrl("https://api.deepseek.com/anthropic")).toBe(
			"https://api.deepseek.com/anthropic/v1",
		);
	});

	it("strips trailing slashes before appending the version segment", () => {
		expect(normalizeAnthropicBaseUrl("https://gateway.example.com/anthropic///")).toBe(
			"https://gateway.example.com/anthropic/v1",
		);
	});

	it("keeps base URLs that already end with an API version segment", () => {
		expect(normalizeAnthropicBaseUrl("https://gateway.example.com/anthropic/v1")).toBe(
			"https://gateway.example.com/anthropic/v1",
		);
		expect(normalizeAnthropicBaseUrl("https://gateway.example.com/v1beta/")).toBe(
			"https://gateway.example.com/v1beta",
		);
	});

	it("leaves the official Anthropic API root untouched for @ai-sdk/anthropic to version", () => {
		expect(normalizeAnthropicBaseUrl("https://api.anthropic.com")).toBe("https://api.anthropic.com");
		expect(normalizeAnthropicBaseUrl("https://api.anthropic.com/")).toBe("https://api.anthropic.com");
	});
});

describe("createAnthropicProviderModule", () => {
	beforeEach(() => {
		createAnthropicMock.mockReset();
		createAnthropicMock.mockReturnValue(anthropicModelMock);
		anthropicModelMock.mockClear();
	});

	it("appends /v1 to custom base URLs passed to Anthropic-compatible providers", async () => {
		const provider = await createAnthropicProviderModule(
			config({
				apiKey: "minimax-api-key",
				baseUrl: "https://api.minimax.io/anthropic",
			}),
			context("minimax"),
		);

		provider.operations.language("MiniMax-M2.5");

		// `@ai-sdk/anthropic` only appends `/messages` to custom base URLs,
		// so the `/v1` version segment must come from us (3.x semantics).
		expect(createAnthropicMock).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: "minimax-api-key",
				baseURL: "https://api.minimax.io/anthropic/v1",
				name: "minimax",
			}),
		);
		expect(anthropicModelMock).toHaveBeenCalledWith("MiniMax-M2.5");
	});

	it("does not wrap fetch for non-MiniMax Anthropic-compatible providers", async () => {
		const customFetch = vi.fn<typeof fetch>();

		await createAnthropicProviderModule(
			config({
				providerId: "anthropic",
				apiKey: "anthropic-api-key",
				fetch: customFetch,
			}),
			context("anthropic"),
		);

		expect(createAnthropicMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "anthropic",
				fetch: customFetch,
			}),
		);
	});
});

function config(
	overrides: Partial<GatewayResolvedProviderConfig>,
): GatewayResolvedProviderConfig {
	return {
		providerId: "minimax",
		...overrides,
	};
}

function context(providerId: string): GatewayProviderContext {
	return {
		provider: {
			id: providerId,
			name: "MiniMax",
			defaultModelId: "MiniMax-M2.5",
			models: [],
		},
		model: {
			providerId,
			id: "MiniMax-M2.5",
			name: "MiniMax-M2.5",
		},
		config: config({ providerId }),
	};
}
