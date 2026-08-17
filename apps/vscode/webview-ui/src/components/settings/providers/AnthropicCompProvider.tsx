import { ModelInfo } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ApiKeyField } from "../common/ApiKeyField"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { ModelInfoView } from "../common/ModelInfoView"
import ThinkingBudgetSlider from "../ThinkingBudgetSlider"
import { parsePrice } from "../utils/pricingUtils"
import { getModeSpecificFields, normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

interface AnthropicCompProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

const anthropicCompModelInfoDefaults: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 200000,
	supportsImages: true,
	supportsPromptCache: true,
	inputPrice: 0,
	outputPrice: 0,
}

export const AnthropicCompProvider = ({ showModelOptions, isPopup, currentMode }: AnthropicCompProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)
	const { anthropicCompModelInfo } = getModeSpecificFields(apiConfiguration, currentMode)

	return (
		<div>
			<DebouncedTextField
				initialValue={apiConfiguration?.anthropicCompBaseUrl || "https://api.anthropic.com"}
				onChange={(value) => handleFieldChange("anthropicCompBaseUrl", value)}
				placeholder={"Enter base URL..."}
				style={{ width: "100%", marginBottom: 10 }}>
				<span style={{ fontWeight: 500 }}>Base URL</span>
			</DebouncedTextField>

			<ApiKeyField
				initialValue={apiConfiguration?.anthropicCompApiKey || ""}
				onChange={(value) => handleFieldChange("anthropicCompApiKey", value)}
				providerName="Anthropic Compatible"
			/>

			<DebouncedTextField
				initialValue={selectedModelId || ""}
				onChange={(value) =>
					handleModeFieldChange(
						{ plan: "planModeAnthropicCompModelId", act: "actModeAnthropicCompModelId" },
						value,
						currentMode,
					)
				}
				placeholder={"Enter Model ID..."}
				style={{ width: "100%", marginBottom: 10 }}>
				<span style={{ fontWeight: 500 }}>Model ID</span>
			</DebouncedTextField>

			{showModelOptions && (
				<>
					<ThinkingBudgetSlider currentMode={currentMode} showEnableToggle={false} />

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<DebouncedTextField
							initialValue={
								anthropicCompModelInfo?.contextWindow?.toString() ??
								anthropicCompModelInfoDefaults.contextWindow?.toString() ??
								""
							}
							onChange={(value) => {
								const modelInfo = anthropicCompModelInfo
									? { ...anthropicCompModelInfo }
									: { ...anthropicCompModelInfoDefaults }
								modelInfo.contextWindow = Number(value)
								handleModeFieldChange(
									{ plan: "planModeAnthropicCompModelInfo", act: "actModeAnthropicCompModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							style={{ flex: 1 }}>
							<span style={{ fontWeight: 500 }}>Context Window Size</span>
						</DebouncedTextField>

						<DebouncedTextField
							initialValue={
								anthropicCompModelInfo?.maxTokens?.toString() ??
								anthropicCompModelInfoDefaults.maxTokens?.toString() ??
								""
							}
							onChange={(value) => {
								const modelInfo = anthropicCompModelInfo
									? { ...anthropicCompModelInfo }
									: { ...anthropicCompModelInfoDefaults }
								modelInfo.maxTokens = Number(value)
								handleModeFieldChange(
									{ plan: "planModeAnthropicCompModelInfo", act: "actModeAnthropicCompModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							style={{ flex: 1 }}>
							<span style={{ fontWeight: 500 }}>Max Output Tokens</span>
						</DebouncedTextField>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<DebouncedTextField
							initialValue={
								anthropicCompModelInfo?.inputPrice?.toString() ??
								anthropicCompModelInfoDefaults.inputPrice?.toString() ??
								""
							}
							onChange={(value) => {
								const modelInfo = anthropicCompModelInfo
									? { ...anthropicCompModelInfo }
									: { ...anthropicCompModelInfoDefaults }
								modelInfo.inputPrice = parsePrice(value, anthropicCompModelInfoDefaults.inputPrice ?? 0)
								handleModeFieldChange(
									{ plan: "planModeAnthropicCompModelInfo", act: "actModeAnthropicCompModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							style={{ flex: 1 }}>
							<span style={{ fontWeight: 500 }}>Input Price / 1M tokens</span>
						</DebouncedTextField>

						<DebouncedTextField
							initialValue={
								anthropicCompModelInfo?.outputPrice?.toString() ??
								anthropicCompModelInfoDefaults.outputPrice?.toString() ??
								""
							}
							onChange={(value) => {
								const modelInfo = anthropicCompModelInfo
									? { ...anthropicCompModelInfo }
									: { ...anthropicCompModelInfoDefaults }
								modelInfo.outputPrice = parsePrice(value, anthropicCompModelInfoDefaults.outputPrice ?? 0)
								handleModeFieldChange(
									{ plan: "planModeAnthropicCompModelInfo", act: "actModeAnthropicCompModelInfo" },
									modelInfo,
									currentMode,
								)
							}}
							style={{ flex: 1 }}>
							<span style={{ fontWeight: 500 }}>Output Price / 1M tokens</span>
						</DebouncedTextField>
					</div>

					<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
				</>
			)}
		</div>
	)
}
