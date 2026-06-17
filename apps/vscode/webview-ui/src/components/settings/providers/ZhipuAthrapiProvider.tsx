import { CLAUDE_SONNET_1M_SUFFIX, zhipuAthrapiModels } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ApiKeyField } from "../common/ApiKeyField"
import { ContextWindowSwitcher } from "../common/ContextWindowSwitcher"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import ThinkingBudgetSlider from "../ThinkingBudgetSlider"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

/**
 * Props for the ZhipuAthrapiProvider component
 */
interface ZhipuAthrapiProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Zhipu AthrAPI provider configuration component
 */
export const ZhipuAthrapiProvider = ({ showModelOptions, isPopup, currentMode }: ZhipuAthrapiProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.zhipuAthrapiKey || ""}
				onChange={(value) => handleFieldChange("zhipuAthrapiKey", value)}
				providerName="Zhipu AthrAPI"
				signupUrl="https://open.bigmodel.cn/"
			/>

			{showModelOptions && (
				<>
					<ModelSelector
						label="Model"
						models={zhipuAthrapiModels}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						selectedModelId={selectedModelId}
					/>

					<ContextWindowSwitcher
						selectedModelId={selectedModelId}
						base200kModelId="glm-5.2"
						base1mModelId={`glm-5.2${CLAUDE_SONNET_1M_SUFFIX}`}
						onModelChange={(modelId) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								modelId,
								currentMode,
							)
						}
					/>

					{selectedModelInfo?.supportsReasoning && (
						<ThinkingBudgetSlider currentMode={currentMode} showEnableToggle={false} />
					)}

					<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
				</>
			)}
		</div>
	)
}
