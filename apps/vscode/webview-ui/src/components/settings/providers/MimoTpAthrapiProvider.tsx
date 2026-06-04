import { mimoTpAthrapiModels } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ApiKeyField } from "../common/ApiKeyField"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import ThinkingBudgetSlider from "../ThinkingBudgetSlider"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

/**
 * Props for the MimoTpAthrapiProvider component
 */
interface MimoTpAthrapiProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Mimo TP AthrAPI provider configuration component
 */
export const MimoTpAthrapiProvider = ({ showModelOptions, isPopup, currentMode }: MimoTpAthrapiProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.mimoTpAthrapiKey || ""}
				onChange={(value) => handleFieldChange("mimoTpAthrapiKey", value)}
				providerName="Mimo TP AthrAPI"
				signupUrl="https://platform.xiaomimimo.com/token-plan"
			/>

			{showModelOptions && (
				<>
					<ModelSelector
						label="Model"
						models={mimoTpAthrapiModels}
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
