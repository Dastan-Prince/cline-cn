import type { ModelInfo } from "@shared/api"
import type { ProviderModelOverrides } from "@shared/proto-conversions/models/modelOverrides"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { getAsVar, VSC_DESCRIPTION_FOREGROUND } from "@/utils/vscStyles"
import { DebouncedTextField } from "../common/DebouncedTextField"

export type NumericModelOverrideKey = "contextWindow" | "maxTokens" | "inputPrice" | "outputPrice" | "temperature"

type ParsedOptionalNumber = { valid: true; value: number | undefined } | { valid: false }

// -1 is the legacy UI sentinel for "not set"; it renders (and compares) as unset.
function displayedModelNumber(value: number | undefined): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value !== -1 ? value : undefined
}

function formatOptionalModelNumber(value: number | undefined): string {
	return displayedModelNumber(value)?.toString() ?? ""
}

function parseOptionalFiniteNumber(value: string): ParsedOptionalNumber {
	const trimmed = value.trim()
	if (!trimmed) {
		return { valid: true, value: undefined }
	}
	const parsed = Number(trimmed)
	return Number.isFinite(parsed) ? { valid: true, value: parsed } : { valid: false }
}

interface ModelConfigurationEditorProps {
	/**
	 * Resolved model metadata for display. Stored overrides are already
	 * merged into this snapshot by the host, so committed edits round-trip
	 * through here.
	 */
	modelInfo: ModelInfo
	disabled?: boolean
	onOverrideChange: <K extends keyof ProviderModelOverrides>(key: K, value: ProviderModelOverrides[K] | undefined) => void
}

/**
 * Collapsible section that lets users override model metadata (capabilities,
 * context window, pricing, temperature) for the currently selected model.
 * Pure presentation: parsing, validation, and the commit pipeline live in the
 * parent via `onOverrideChange`.
 */
export function ModelConfigurationEditor({ modelInfo, disabled, onOverrideChange }: ModelConfigurationEditorProps) {
	const { t } = useTranslation()
	const [isExpanded, setIsExpanded] = useState(false)
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<NumericModelOverrideKey, string>>>({})
	// Last value emitted per field, so a debounced echo of a value the user
	// has since moved away from is not mistaken for a no-op (see below).
	const lastEmittedRef = useRef<Partial<Record<NumericModelOverrideKey, number | undefined>>>({})

	// Optimistic checkbox state. The committed override only arrives after a
	// commit + read-back round trip, and VSCodeCheckbox's internal (uncontrolled)
	// checked state resets to the prop value the moment React re-renders with
	// the still-stale modelInfo — the checkbox visibly snaps back before the
	// round trip lands, even though the commit itself is durable. Track the
	// user's click locally and drop the optimistic value once the authoritative
	// props agree with it (or when the model/mode changes via the parent's key
	// remount, which recreates this state entirely).
	const [optimisticCapabilities, setOptimisticCapabilities] = useState<{
		supportsVision?: boolean
		supportsReasoning?: boolean
	}>({})

	const isChecked = (key: "supportsVision" | "supportsReasoning", propValue: boolean | undefined): boolean => {
		const optimistic = optimisticCapabilities[key]
		return optimistic !== undefined ? optimistic : propValue === true
	}

	const handleCapabilityToggle = (key: "supportsVision" | "supportsReasoning", checked: boolean) => {
		setOptimisticCapabilities((current) => ({ ...current, [key]: checked }))
		onOverrideChange(key, checked)
	}

	// Resolve optimistic values that the authoritative props have caught up
	// with; keep only those still in flight (props still disagree).
	const pendingOptimistic = {
		supportsVision:
			optimisticCapabilities.supportsVision !== undefined &&
			optimisticCapabilities.supportsVision !== (modelInfo.supportsImages === true)
				? optimisticCapabilities.supportsVision
				: undefined,
		supportsReasoning:
			optimisticCapabilities.supportsReasoning !== undefined &&
			optimisticCapabilities.supportsReasoning !== (modelInfo.supportsReasoning === true)
				? optimisticCapabilities.supportsReasoning
				: undefined,
	}
	if (
		pendingOptimistic.supportsVision !== optimisticCapabilities.supportsVision ||
		pendingOptimistic.supportsReasoning !== optimisticCapabilities.supportsReasoning
	) {
		// Prune caught-up values during render (safe: derived state pruning,
		// guarded by the comparison above so it settles immediately).
		setOptimisticCapabilities({
			...(pendingOptimistic.supportsVision !== undefined ? { supportsVision: pendingOptimistic.supportsVision } : {}),
			...(pendingOptimistic.supportsReasoning !== undefined
				? { supportsReasoning: pendingOptimistic.supportsReasoning }
				: {}),
		})
	}

	const handleNumericChange = (key: NumericModelOverrideKey, labelKey: string, value: string) => {
		const parsed = parseOptionalFiniteNumber(value)
		if (!parsed.valid) {
			setFieldErrors((current) => ({
				...current,
				[key]: t("settings.apiConfig.modelConfig.invalidNumber", { field: t(labelKey) }),
			}))
			return
		}
		setFieldErrors((current) => {
			if (!(key in current)) {
				return current
			}
			const next = { ...current }
			delete next[key]
			return next
		})
		// Debounced fields can echo their seed value when the resolved model
		// info resyncs (model/mode switch, commit read-back). Committing that
		// echo would persist resolved provider metadata as a user override.
		// An exception: when the user reverts to the still-displayed value
		// while our own earlier commit is round-tripping, the revert must be
		// committed rather than skipped.
		if (parsed.value === displayedModelNumber(modelInfo[key]) && parsed.value !== lastEmittedRef.current[key]) {
			return
		}
		lastEmittedRef.current[key] = parsed.value
		onOverrideChange(key, parsed.value)
	}

	return (
		<div>
			<div
				onClick={() => setIsExpanded((val) => !val)}
				style={{
					color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
					display: "flex",
					margin: "10px 0",
					cursor: "pointer",
					alignItems: "center",
				}}>
				<span
					className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
					style={{ marginRight: "4px" }}
				/>
				<span style={{ fontWeight: 700, textTransform: "uppercase" }}>{t("settings.apiConfig.modelConfig.title")}</span>
			</div>

			{isExpanded && (
				<>
					<div style={{ display: "flex", gap: 10 }}>
						<VSCodeCheckbox
							checked={isChecked("supportsVision", modelInfo.supportsImages)}
							disabled={disabled}
							onChange={(e: any) => handleCapabilityToggle("supportsVision", e.target.checked === true)}>
							{t("settings.apiConfig.modelConfig.supportsImages")}
						</VSCodeCheckbox>

						<VSCodeCheckbox
							checked={isChecked("supportsReasoning", modelInfo.supportsReasoning)}
							disabled={disabled}
							onChange={(e: any) => handleCapabilityToggle("supportsReasoning", e.target.checked === true)}>
							{t("settings.apiConfig.modelConfig.supportsReasoning")}
						</VSCodeCheckbox>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.contextWindow)}
								onChange={(value) =>
									handleNumericChange(
										"contextWindow",
										"settings.apiConfig.modelConfig.contextWindowSize",
										value,
									)
								}>
								<span style={{ fontWeight: 500 }}>{t("settings.apiConfig.modelConfig.contextWindowSize")}</span>
							</DebouncedTextField>
							{fieldErrors.contextWindow && <div role="alert">{fieldErrors.contextWindow}</div>}
						</div>

						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.maxTokens)}
								onChange={(value) =>
									handleNumericChange("maxTokens", "settings.apiConfig.modelConfig.maxOutputTokens", value)
								}
								placeholder={t("settings.apiConfig.modelConfig.notSet")}>
								<span style={{ fontWeight: 500 }}>{t("settings.apiConfig.modelConfig.maxOutputTokens")}</span>
							</DebouncedTextField>
							{fieldErrors.maxTokens && <div role="alert">{fieldErrors.maxTokens}</div>}
						</div>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.inputPrice)}
								onChange={(value) =>
									handleNumericChange("inputPrice", "settings.apiConfig.modelConfig.inputPrice", value)
								}>
								<span style={{ fontWeight: 500 }}>{t("settings.apiConfig.modelConfig.inputPrice")}</span>
							</DebouncedTextField>
							{fieldErrors.inputPrice && <div role="alert">{fieldErrors.inputPrice}</div>}
						</div>

						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.outputPrice)}
								onChange={(value) =>
									handleNumericChange("outputPrice", "settings.apiConfig.modelConfig.outputPrice", value)
								}>
								<span style={{ fontWeight: 500 }}>{t("settings.apiConfig.modelConfig.outputPrice")}</span>
							</DebouncedTextField>
							{fieldErrors.outputPrice && <div role="alert">{fieldErrors.outputPrice}</div>}
						</div>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<div>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.temperature)}
								onChange={(value) =>
									handleNumericChange("temperature", "settings.apiConfig.modelConfig.temperature", value)
								}
								placeholder={t("settings.apiConfig.modelConfig.notSet")}>
								<span style={{ fontWeight: 500 }}>{t("settings.apiConfig.modelConfig.temperature")}</span>
							</DebouncedTextField>
							{fieldErrors.temperature && <div role="alert">{fieldErrors.temperature}</div>}
						</div>
					</div>

					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: getAsVar(VSC_DESCRIPTION_FOREGROUND),
						}}>
						{t("settings.apiConfig.modelConfig.description")}
					</p>
				</>
			)}
		</div>
	)
}
