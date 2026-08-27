import { type ModelInfo, openAiModelInfoSafeDefaults } from "@shared/api"
import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ProviderId } from "@/context/ExtensionStateContext"
import { DropdownContainer } from "../common/ModelSelector"

export interface ModelPickerSelection {
	providerId: ProviderId
	modelId: string
	modelInfo: ModelInfo
}

export interface ModelPickerWithManualEntryProps {
	models: Record<string, ModelInfo>
	isLoading: boolean
	isStale: boolean
	error?: string
	allowsCustomIds: boolean
	selectedModel: ModelPickerSelection
	onSelect: (selection: ModelPickerSelection) => void
	/**
	 * Provider-specific default ModelInfo for custom model IDs.
	 * Falls back to openAiModelInfoSafeDefaults when not provided.
	 */
	defaultModelInfo?: ModelInfo
}

function customModelInfo(modelId: string): ModelInfo {
	return {
		...openAiModelInfoSafeDefaults,
		name: modelId,
	}
}

export function ModelPickerWithManualEntry({
	models,
	isLoading,
	isStale,
	error,
	allowsCustomIds,
	selectedModel,
	onSelect,
	defaultModelInfo,
}: ModelPickerWithManualEntryProps) {
	const { t } = useTranslation()
	const fallbackModelInfo: ModelInfo = defaultModelInfo ?? { ...openAiModelInfoSafeDefaults }
	const [isManualEntryVisible, setIsManualEntryVisible] = useState(false)
	const [customModelId, setCustomModelId] = useState(() => (selectedModel.modelId in models ? "" : selectedModel.modelId))
	const modelIds = Object.keys(models).sort((a, b) => a.localeCompare(b))
	const hasModels = modelIds.length > 0
	const selectedModelInList = selectedModel.modelId in models

	// The committed selection and the model catalog both hydrate asynchronously
	// after mount, so the lazy useState init above can capture a placeholder
	// value. Re-sync when the committed model changes or its in-list status
	// flips. Depend on the derived values rather than `models` itself, whose
	// identity can change every render while the catalog is loading.
	useEffect(() => {
		setCustomModelId(selectedModelInList ? "" : selectedModel.modelId)
	}, [selectedModel.modelId, selectedModelInList])
	const showManualEntry =
		allowsCustomIds && (isManualEntryVisible || !hasModels || isLoading || Boolean(error) || !selectedModelInList)

	// Force VSCodeDropdown to re-initialize after async catalog/selection
	// hydration, otherwise it ignores the value prop for dynamically rendered
	// options. https://github.com/microsoft/vscode-webview-ui-toolkit/issues/433
	const dropdownKey = `${selectedModel.modelId}:${modelIds.join("\u0000")}`

	const commitCustomModel = (modelId: string) => {
		const trimmed = modelId.trim()
		if (!trimmed) {
			return
		}
		onSelect({
			providerId: selectedModel.providerId,
			modelId: trimmed,
			modelInfo: models[trimmed] ?? { ...fallbackModelInfo, name: trimmed },
		})
		setIsManualEntryVisible(false)
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			<label htmlFor="provider-model-picker">
				<span className="font-medium">{t("settings.apiConfig.modelPicker.model")}</span>
			</label>

			{isStale && <div role="status">{t("settings.apiConfig.modelPicker.staleList")}</div>}
			{isLoading && <div role="status">{t("settings.apiConfig.modelPicker.loading")}</div>}
			{error && <div role="alert">{error}</div>}

			{hasModels && (
				<DropdownContainer className="dropdown-container">
					<VSCodeDropdown
						aria-label="Model"
						className="w-full"
						id="provider-model-picker"
						key={dropdownKey}
						onChange={(event) => {
							const modelId = (event.target as HTMLSelectElement).value
							if (modelId === "__custom__") {
								setIsManualEntryVisible(true)
								return
							}
							const modelInfo = models[modelId]
							if (modelInfo) {
								setIsManualEntryVisible(false)
								onSelect({ providerId: selectedModel.providerId, modelId, modelInfo })
							}
						}}
						value={selectedModelInList ? selectedModel.modelId : ""}>
						{!selectedModelInList && allowsCustomIds && selectedModel.modelId && (
							<VSCodeOption value="">
								{selectedModel.modelId} ({t("settings.apiConfig.modelPicker.notInList")})
							</VSCodeOption>
						)}
						{modelIds.map((modelId) => (
							<VSCodeOption className="break-words whitespace-normal max-w-full" key={modelId} value={modelId}>
								{modelId}
							</VSCodeOption>
						))}
						{allowsCustomIds && (
							<VSCodeOption value="__custom__">{t("settings.apiConfig.modelPicker.useCustomId")}</VSCodeOption>
						)}
					</VSCodeDropdown>
				</DropdownContainer>
			)}

			{!selectedModelInList && selectedModel.modelId && hasModels && (
				<div role="status">{t("settings.apiConfig.modelPicker.notInListStatus", { modelId: selectedModel.modelId })}</div>
			)}

			{showManualEntry && (
				<div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
					<VSCodeTextField
						id="custom-model-id"
						onInput={(event) => {
							setCustomModelId((event.target as HTMLInputElement).value)
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								commitCustomModel(customModelId)
							}
						}}
						placeholder={t("settings.apiConfig.modelPicker.customIdPlaceholder")}
						style={{ flexGrow: 1 }}
						value={customModelId}>
						<span className="font-medium">{t("settings.apiConfig.modelPicker.customIdLabel")}</span>
					</VSCodeTextField>
					<VSCodeButton
						appearance="secondary"
						disabled={!customModelId.trim()}
						onClick={() => commitCustomModel(customModelId)}>
						{t("settings.apiConfig.modelPicker.useCustomButton")}
					</VSCodeButton>
				</div>
			)}
		</div>
	)
}
