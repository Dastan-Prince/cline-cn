/**
 * Guard tests for the model-info proto round trip.
 *
 * `supportsTools` drives whether a model is served the native tool-calling prompt
 * variant. It is written by the model catalog fetchers, so it has to survive the
 * trip through the webview and back into extension state -- otherwise the signal
 * is silently dropped the moment the user picks a model in the settings UI.
 */

import type { ApiConfiguration, ModelInfo } from "@shared/api"
import { expect } from "chai"
import { describe, it } from "mocha"
import { convertApiConfigurationToProto, convertProtoToApiConfiguration } from "../api-configuration-conversion"
import { fromProtobufModelInfo, toProtobufModelInfo } from "../typeConversion"

const baseModelInfo: ModelInfo = {
	supportsPromptCache: false,
	maxTokens: 8_192,
	contextWindow: 200_000,
}

describe("model info proto conversion", () => {
	describe("typeConversion (webview write-back path)", () => {
		it("should preserve supportsTools", () => {
			const roundTripped = fromProtobufModelInfo(toProtobufModelInfo({ ...baseModelInfo, supportsTools: true }))
			expect(roundTripped.supportsTools).to.equal(true)
		})

		it("should keep an undeclared capability undefined", () => {
			const roundTripped = fromProtobufModelInfo(toProtobufModelInfo({ ...baseModelInfo }))
			expect(roundTripped.supportsTools).to.equal(undefined)
		})
	})

	describe("api configuration round trip", () => {
		it("should preserve supportsTools on the cline and openrouter model info", () => {
			const config = {
				actModeApiProvider: "cline",
				actModeClineModelId: "cline-free/mimo-v2.6-flash",
				actModeClineModelInfo: { ...baseModelInfo, supportsTools: true },
				actModeOpenRouterModelInfo: { ...baseModelInfo, supportsTools: true },
			} as unknown as ApiConfiguration

			const restored = convertProtoToApiConfiguration(convertApiConfigurationToProto(config))

			expect(restored.actModeClineModelInfo?.supportsTools).to.equal(true)
			expect(restored.actModeOpenRouterModelInfo?.supportsTools).to.equal(true)
		})
	})
})
