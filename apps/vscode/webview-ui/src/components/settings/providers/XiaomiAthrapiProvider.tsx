import { xiaomiAthrapiModels } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ApiKeyField } from "../common/ApiKeyField"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import ThinkingBudgetSlider from "../ThinkingBudgetSlider"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

/**
 * Props for the XiaomiAthrapiProvider component
 */
interface XiaomiAthrapiProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Xiaomi Mimo AthrAPI provider configuration component
 */
export const XiaomiAthrapiProvider = ({ showModelOptions, isPopup, currentMode }: XiaomiAthrapiProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.xiaomiAthrapiKey || ""}
				onChange={(value) => handleFieldChange("xiaomiAthrapiKey", value)}
				providerName="Xiaomi Mimo AthrAPI"
				signupUrl="https://platform.xiaomimimo.com/"
			/>

			{showModelOptions && (
				<>
					<ModelSelector
						label="Model"
						models={xiaomiAthrapiModels}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						selectedModelId={selectedModelId}
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
