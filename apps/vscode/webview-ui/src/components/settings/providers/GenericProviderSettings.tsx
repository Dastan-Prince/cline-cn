import type { ModelInfo } from "@shared/api"
import { fromProtobufModelOverrides, type ProviderModelOverrides } from "@shared/proto-conversions/models/modelOverrides"
import { Mode } from "@shared/storage/types"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { type ProviderId } from "@/context/ExtensionStateContext"
import { useProviderConfig } from "@/hooks/useProviderConfig"
import { useProviderModelSelection } from "@/hooks/useProviderModelSelection"
import { useProviderModels } from "@/hooks/useProviderModels"
import { ApiKeyField } from "../common/ApiKeyField"
import { BaseUrlField } from "../common/BaseUrlField"
import { ModelInfoView } from "../common/ModelInfoView"
import ReasoningEffortSelector from "../ReasoningEffortSelector"
import { useProviderApiKeyField } from "../utils/useProviderApiKeyField"
import { ModelConfigurationEditor } from "./ModelConfigurationEditor"
import { type ModelPickerSelection, ModelPickerWithManualEntry } from "./ModelPickerWithManualEntry"

interface GenericProviderBaseUrlFieldConfig {
	label?: string
	placeholder?: string
	/**
	 * Always render the input without the opt-in checkbox. Use for providers
	 * where a custom base URL is always required (e.g. generic compatible
	 * endpoints).
	 */
	alwaysVisible?: boolean
}

export interface GenericProviderSettingsProps {
	providerId: ProviderId
	providerName: string
	signupUrl?: string
	baseUrlField?: GenericProviderBaseUrlFieldConfig
	allowsCustomIds: boolean
	/**
	 * Render the editable Model Configuration section so users can override
	 * context window, pricing, and capability metadata for the selected model
	 * (e.g. custom compatible endpoints without a model catalog).
	 */
	allowsModelOverrides?: boolean
	/**
	 * Skip the automatic model-list fetch. Use for providers that serve only
	 * user-entered model ids (no discoverable models endpoint).
	 */
	skipModelListFetch?: boolean
	/**
	 * Default ModelInfo used when the user enters a custom model ID.
	 * Falls back to openAiModelInfoSafeDefaults when not provided.
	 */
	defaultModelInfo?: ModelInfo
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

type PendingModelSelection = { modelId: string | undefined; overrides: ProviderModelOverrides }

/**
 * Shared settings shell for providers whose configuration is the common
 * catalog-backed shape: API key, optional base URL, model picker, and model
 * info. Provider-specific wrappers should pass metadata while custom providers
 * keep their own components.
 */
export const GenericProviderSettings = ({
	providerId,
	providerName,
	signupUrl,
	baseUrlField,
	allowsCustomIds,
	allowsModelOverrides,
	skipModelListFetch,
	defaultModelInfo,
	showModelOptions,
	isPopup,
	currentMode,
}: GenericProviderSettingsProps) => {
	const { t } = useTranslation()
	const { models, defaultModelId, isLoading, isStale, error } = useProviderModels(providerId, {
		autoFetch: !skipModelListFetch,
	})
	const { config, write, commitSelection } = useProviderConfig(providerId)
	const { committedSelection, selectedModel, commitModelSelection } = useProviderModelSelection(providerId, currentMode, {
		models,
		defaultModelId,
		config,
		commitSelection,
	})

	const committedOverrides = useMemo(
		() => fromProtobufModelOverrides(committedSelection?.overrides) ?? {},
		[committedSelection?.overrides],
	)
	// Plan and Act have independent selections, so each mode gets its own
	// pending accumulator: a pending commit in one mode must never become the
	// base (or the model id) for an edit in the other mode, and a round trip
	// to the other mode must not disturb this mode's pending state. Slots
	// start empty; the reseed effect below fills a mode's slot before it can
	// be edited.
	const pendingOverridesRef = useRef<Record<Mode, PendingModelSelection>>({
		plan: { modelId: undefined, overrides: {} },
		act: { modelId: undefined, overrides: {} },
	})
	// Counts commits whose commit+read-back round-trip has not finished yet,
	// per mode.
	const pendingCommitsRef = useRef<Record<Mode, number>>({ plan: 0, act: 0 })

	useEffect(() => {
		// Do not reseed the pending-override accumulator from server state
		// while this mode's commits are in flight: an earlier commit's
		// read-back can land after a later local edit, and reseeding from
		// that stale snapshot would silently drop the already-committed
		// newer field.
		if (pendingCommitsRef.current[currentMode] > 0) {
			return
		}
		pendingOverridesRef.current[currentMode] = { modelId: selectedModel.modelId, overrides: committedOverrides }
	}, [committedOverrides, currentMode, selectedModel.modelId])

	const commitGenericSelection = useCallback(
		(modelId: string, overrides?: ProviderModelOverrides) => {
			if (!modelId.trim()) {
				return
			}

			const mode = currentMode
			pendingCommitsRef.current[mode] += 1
			void commitSelection(mode, {
				providerId,
				modelId,
				...(overrides !== undefined ? { overrides } : {}),
			})
				.catch((err) => console.error(`Failed to commit ${providerName} model selection:`, err))
				.finally(() => {
					pendingCommitsRef.current[mode] -= 1
				})
		},
		[commitSelection, currentMode, providerId, providerName],
	)

	const updateModelOverride = useCallback(
		<K extends keyof ProviderModelOverrides>(key: K, value: ProviderModelOverrides[K] | undefined) => {
			// Prefer this mode's pending model id: while a model-id commit is
			// still round-tripping, `selectedModel.modelId` reads back the old
			// id and an edit would be committed against the model just
			// switched away from.
			const pending = pendingOverridesRef.current[currentMode]
			const modelId = (pending.modelId ?? selectedModel.modelId)?.trim()
			if (!modelId) {
				return
			}

			const currentOverrides = pending.modelId === modelId ? pending.overrides : {}
			const nextOverrides = { ...currentOverrides }
			if (value === undefined) {
				delete nextOverrides[key]
			} else {
				Object.assign(nextOverrides, { [key]: value })
			}
			pendingOverridesRef.current[currentMode] = { modelId, overrides: nextOverrides }
			commitGenericSelection(modelId, nextOverrides)
		},
		[commitGenericSelection, currentMode, selectedModel.modelId],
	)

	const handleModelSelect = (selection: ModelPickerSelection) => {
		void commitModelSelection(selection).catch((err) =>
			console.error(`Failed to commit ${providerName} model selection:`, err),
		)
	}

	const { savedApiKeyMask, handleApiKeyChange } = useProviderApiKeyField({
		apiKeyLength: config?.apiKeyLength,
		providerName,
		write,
	})
	const handleBaseUrlChange = (value: string) => {
		void write({ baseUrl: value }).catch((err) => console.error(`Failed to update ${providerName} base URL:`, err))
	}
	const handleBaseUrlClear = async () => {
		try {
			await write({ baseUrl: "" })
		} catch (error) {
			console.error(`Failed to clear ${providerName} base URL:`, error)
			throw error
		}
	}

	return (
		<div>
			<ApiKeyField
				initialValue={savedApiKeyMask}
				onChange={handleApiKeyChange}
				placeholder={t("settings.apiConfig.apiKeyPlaceholder")}
				providerName={providerName}
				signupUrl={signupUrl}
			/>

			{baseUrlField && (
				<BaseUrlField
					alwaysVisible={baseUrlField.alwaysVisible}
					initialValue={config?.baseUrl}
					label={baseUrlField.label}
					onChange={handleBaseUrlChange}
					onClear={handleBaseUrlClear}
					placeholder={baseUrlField.placeholder}
				/>
			)}

			{showModelOptions && (
				<>
					<ModelPickerWithManualEntry
						allowsCustomIds={allowsCustomIds}
						defaultModelInfo={defaultModelInfo}
						error={error}
						isLoading={isLoading}
						isStale={isStale}
						models={models}
						onSelect={handleModelSelect}
						selectedModel={selectedModel}
					/>

					{allowsModelOverrides && (
						<ModelConfigurationEditor
							disabled={!selectedModel.modelId}
							key={`${currentMode}:${selectedModel.modelId}`}
							modelInfo={selectedModel.modelInfo}
							onOverrideChange={updateModelOverride}
						/>
					)}

					{selectedModel.modelInfo.supportsReasoning === true && (
						<ReasoningEffortSelector
							currentMode={currentMode}
							onEffortChange={(effort) => {
								void write({
									reasoning: {
										enabled: effort !== "none",
										effort: effort !== "none" ? effort : undefined,
									},
								}).catch((err) => console.error(`Failed to update ${providerName} reasoning effort:`, err))
							}}
						/>
					)}

					<ModelInfoView
						isPopup={isPopup}
						modelInfo={selectedModel.modelInfo}
						selectedModelId={selectedModel.modelId}
					/>
				</>
			)}
		</div>
	)
}
