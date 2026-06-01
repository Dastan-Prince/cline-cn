import { mimoTokenPlanModels } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ApiKeyField } from "../common/ApiKeyField"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

/**
 * Props for MimoTokenPlanProvider component
 */
interface MimoTokenPlanProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The MiMo Token Plan provider configuration component
 */
export const MimoTokenPlanProvider = ({ showModelOptions, isPopup, currentMode }: MimoTokenPlanProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.mimoTokenPlanApiKey || ""}
				onChange={(value) => handleFieldChange("mimoTokenPlanApiKey", value)}
				providerName="MiMo Token Plan"
				signupUrl="https://token-plan-cn.xiaomimimo.com/"
			/>

			{showModelOptions && (
				<>
					<ModelSelector
						label="Model"
						models={mimoTokenPlanModels}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						selectedModelId={selectedModelId}
					/>

					<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
				</>
			)}
		</div>
	)
}
