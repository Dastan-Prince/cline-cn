import type { ModelInfo } from "@shared/api"
import type { ProviderModelOverrides } from "@shared/proto-conversions/models/modelOverrides"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useRef, useState } from "react"
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
	const [isExpanded, setIsExpanded] = useState(false)
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<NumericModelOverrideKey, string>>>({})
	// Last value emitted per field, so a debounced echo of a value the user
	// has since moved away from is not mistaken for a no-op (see below).
	const lastEmittedRef = useRef<Partial<Record<NumericModelOverrideKey, number | undefined>>>({})

	const handleNumericChange = (key: NumericModelOverrideKey, label: string, value: string) => {
		const parsed = parseOptionalFiniteNumber(value)
		if (!parsed.valid) {
			setFieldErrors((current) => ({ ...current, [key]: `${label} must be a valid number.` }))
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
				<span style={{ fontWeight: 700, textTransform: "uppercase" }}>Model Configuration</span>
			</div>

			{isExpanded && (
				<>
					<div style={{ display: "flex", gap: 10 }}>
						<VSCodeCheckbox
							checked={modelInfo.supportsImages === true}
							disabled={disabled}
							onChange={(e: any) => onOverrideChange("supportsVision", e.target.checked === true)}>
							Supports Images
						</VSCodeCheckbox>

						<VSCodeCheckbox
							checked={modelInfo.supportsReasoning === true}
							disabled={disabled}
							onChange={(e: any) => onOverrideChange("supportsReasoning", e.target.checked === true)}>
							Supports Reasoning
						</VSCodeCheckbox>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.contextWindow)}
								onChange={(value) => handleNumericChange("contextWindow", "Context Window Size", value)}>
								<span style={{ fontWeight: 500 }}>Context Window Size</span>
							</DebouncedTextField>
							{fieldErrors.contextWindow && <div role="alert">{fieldErrors.contextWindow}</div>}
						</div>

						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.maxTokens)}
								onChange={(value) => handleNumericChange("maxTokens", "Max Output Tokens", value)}
								placeholder="not set">
								<span style={{ fontWeight: 500 }}>Max Output Tokens</span>
							</DebouncedTextField>
							{fieldErrors.maxTokens && <div role="alert">{fieldErrors.maxTokens}</div>}
						</div>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.inputPrice)}
								onChange={(value) => handleNumericChange("inputPrice", "Input Price", value)}>
								<span style={{ fontWeight: 500 }}>Input Price / 1M tokens</span>
							</DebouncedTextField>
							{fieldErrors.inputPrice && <div role="alert">{fieldErrors.inputPrice}</div>}
						</div>

						<div style={{ flex: 1 }}>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.outputPrice)}
								onChange={(value) => handleNumericChange("outputPrice", "Output Price", value)}>
								<span style={{ fontWeight: 500 }}>Output Price / 1M tokens</span>
							</DebouncedTextField>
							{fieldErrors.outputPrice && <div role="alert">{fieldErrors.outputPrice}</div>}
						</div>
					</div>

					<div style={{ display: "flex", gap: 10, marginTop: "5px" }}>
						<div>
							<DebouncedTextField
								disabled={disabled}
								initialValue={formatOptionalModelNumber(modelInfo.temperature)}
								onChange={(value) => handleNumericChange("temperature", "Temperature", value)}
								placeholder="not set">
								<span style={{ fontWeight: 500 }}>Temperature</span>
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
						Values set here are stored as overrides for the selected model and take precedence over the
						provider&apos;s built-in metadata. Clear a field to fall back to the provider value.
					</p>
				</>
			)}
		</div>
	)
}
