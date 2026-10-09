import * as disk from "@core/storage/disk";
import { openRouterClaudeFable51mModelId } from "@shared/api";
import axios from "axios";
import { expect } from "chai";
import fs from "fs/promises";
import { afterEach, beforeEach, describe, it } from "mocha";
import sinon from "sinon";
import { ClineEnv, Environment } from "@/config";
import type { Controller } from "@/core/controller";
import { StateManager } from "@/core/storage/StateManager";
import { getFeatureFlagsService } from "@/services/feature-flags";
import { FeatureFlag } from "@/shared/services/feature-flags/feature-flags";
import { Logger } from "@/shared/services/Logger";
import { refreshClineModels } from "../refreshClineModels";

describe("refreshClineModels", () => {
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		sandbox.stub(Logger, "log");
		sandbox.stub(Logger, "error");
	});

	afterEach(() => {
		sandbox.restore();
	});

	it("marks Qwen 3.7 Max as prompt-cache capable when Cline model pricing includes cache reads", async () => {
		sandbox
			.stub(getFeatureFlagsService(), "getBooleanFlagEnabled")
			.callsFake((flag) => {
				return flag === FeatureFlag.EXTENSION_CLINE_MODELS_ENDPOINT;
			});
		sandbox.stub(ClineEnv, "config").returns({
			environment: Environment.production,
			appBaseUrl: "https://app.cline-mock.bot",
			apiBaseUrl: "https://api.cline-mock.bot",
			mcpBaseUrl: "https://api.cline-mock.bot/v1/mcp",
		});
		sandbox.stub(StateManager, "get").returns({
			getModelsCache: () => null,
			setModelsCache: () => {},
		} as unknown as StateManager);
		sandbox.stub(disk, "ensureCacheDirectoryExists").resolves("/tmp");
		sandbox.stub(fs, "writeFile").resolves();
		sandbox.stub(axios, "get").resolves({
			data: {
				data: [
					{
						id: "qwen/qwen3.7-max",
						name: "Qwen: Qwen3.7 Max",
						description: null,
						context_length: 1_000_000,
						top_provider: {
							max_completion_tokens: 65_536,
							context_length: 1_000_000,
							is_moderated: false,
						},
						architecture: {
							modality: "text->text",
						},
						pricing: {
							prompt: "0.00000125",
							completion: "0.00000375",
							input_cache_read: "0.00000025",
						},
						supported_parameters: ["include_reasoning", "reasoning"],
					},
				],
			},
		});

		const models = await refreshClineModels({} as Controller);
		const qwen37 = models["qwen/qwen3.7-max"];

		expect(qwen37.supportsPromptCache).to.equal(true);
		expect(qwen37.cacheReadsPrice).to.equal(0.25);
		expect(qwen37.cacheWritesPrice).to.equal(undefined);
	});

	it("adds Claude Fable 5 context variants to the Cline model list", async () => {
		sandbox
			.stub(getFeatureFlagsService(), "getBooleanFlagEnabled")
			.callsFake((flag) => {
				return flag === FeatureFlag.EXTENSION_CLINE_MODELS_ENDPOINT;
			});
		sandbox.stub(ClineEnv, "config").returns({
			environment: Environment.production,
			appBaseUrl: "https://app.cline-mock.bot",
			apiBaseUrl: "https://api.cline-mock.bot",
			mcpBaseUrl: "https://api.cline-mock.bot/v1/mcp",
		});
		sandbox.stub(StateManager, "get").returns({
			getModelsCache: () => null,
			setModelsCache: () => {},
		} as unknown as StateManager);
		sandbox.stub(disk, "ensureCacheDirectoryExists").resolves("/tmp");
		sandbox.stub(fs, "writeFile").resolves();
		sandbox.stub(axios, "get").resolves({
			data: {
				data: [
					{
						id: "anthropic/claude-fable-5",
						name: "Claude Fable 5",
						description: "Fetched description",
						context_length: 1_000_000,
						top_provider: {
							max_completion_tokens: 128_000,
							context_length: 1_000_000,
							is_moderated: false,
						},
						architecture: {
							modality: ["text", "image"],
						},
						pricing: {
							prompt: "0.00001",
							completion: "0.00005",
							input_cache_read: "0.000001",
							input_cache_write: "0.0000125",
						},
						supported_parameters: ["include_reasoning", "reasoning"],
					},
				],
			},
		});

		const models = await refreshClineModels({} as Controller);
		const fable = models["anthropic/claude-fable-5"];
		const fable1m = models[openRouterClaudeFable51mModelId];

		expect(fable.contextWindow).to.equal(200_000);
		expect(fable.maxTokens).to.equal(128_000);
		expect(fable.supportsPromptCache).to.equal(true);
		expect(fable.inputPrice).to.equal(10);
		expect(fable.outputPrice).to.equal(50);
		expect(fable.cacheWritesPrice).to.equal(12.5);
		expect(fable.cacheReadsPrice).to.equal(1);
		expect(fable1m.contextWindow).to.equal(1_000_000);
		expect(fable1m.tiers).to.not.equal(undefined);
	});

	it("marks a model tool-capable only when the catalog advertises the tools parameter", async () => {
		sandbox
			.stub(getFeatureFlagsService(), "getBooleanFlagEnabled")
			.callsFake((flag) => {
				return flag === FeatureFlag.EXTENSION_CLINE_MODELS_ENDPOINT;
			});
		sandbox.stub(ClineEnv, "config").returns({
			environment: Environment.production,
			appBaseUrl: "https://app.cline-mock.bot",
			apiBaseUrl: "https://api.cline-mock.bot",
			mcpBaseUrl: "https://api.cline-mock.bot/v1/mcp",
		});
		sandbox.stub(StateManager, "get").returns({
			getModelsCache: () => null,
			setModelsCache: () => {},
		} as unknown as StateManager);
		sandbox.stub(disk, "ensureCacheDirectoryExists").resolves("/tmp");
		sandbox.stub(fs, "writeFile").resolves();
		sandbox.stub(axios, "get").resolves({
			data: {
				data: [
					{
						id: "cline-free/mimo-v2.6-flash",
						name: "Mimo V2.6 Flash",
						description: null,
						context_length: 1_048_576,
						top_provider: {
							max_completion_tokens: 131_072,
							context_length: 1_048_576,
							is_moderated: false,
						},
						architecture: { modality: ["text", "image"] },
						pricing: { prompt: "0.00000014", completion: "0.00000028" },
						supported_parameters: ["tools", "include_reasoning", "reasoning"],
					},
					{
						id: "text-only-model",
						name: "Text Only",
						description: null,
						context_length: 128_000,
						top_provider: {
							max_completion_tokens: 8_192,
							context_length: 128_000,
							is_moderated: false,
						},
						architecture: { modality: "text->text" },
						pricing: { prompt: "0.0000001", completion: "0.0000002" },
						supported_parameters: ["include_reasoning"],
					},
					{
						id: "no-capabilities-model",
						name: "No Capabilities",
						description: null,
						context_length: 128_000,
						top_provider: {
							max_completion_tokens: 8_192,
							context_length: 128_000,
							is_moderated: false,
						},
						architecture: { modality: "text->text" },
						pricing: { prompt: "0.0000001", completion: "0.0000002" },
						supported_parameters: null,
					},
				],
			},
		});

		const models = await refreshClineModels({} as Controller);

		expect(models["cline-free/mimo-v2.6-flash"].supportsTools).to.equal(true);
		// A capability list without "tools", and an absent list, both stay undefined:
		// an absent capability list must never be read as an authoritative denial.
		expect(models["text-only-model"].supportsTools).to.equal(undefined);
		expect(models["no-capabilities-model"].supportsTools).to.equal(undefined);
	});
});
