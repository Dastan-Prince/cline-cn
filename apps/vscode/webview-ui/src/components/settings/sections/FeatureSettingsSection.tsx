import { UpdateSettingsRequest } from "@shared/proto/cline/state"
import { memo, type ReactNode, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useExtensionState } from "@/context/ExtensionStateContext"
import Section from "../Section"
import SettingsSlider from "../SettingsSlider"
import { updateSetting } from "../utils/settingsHandlers"

// Reusable checkbox component for feature settings
interface FeatureCheckboxProps {
	checked: boolean | undefined
	onChange: (checked: boolean) => void
	label: string
	description: ReactNode
	disabled?: boolean
	isRemoteLocked?: boolean
	remoteTooltip?: string
	isVisible?: boolean
}

// Interface for feature toggle configuration
interface FeatureToggle {
	id: string
	labelKey: string
	descriptionKey: string
	settingKey: keyof UpdateSettingsRequest
	stateKey: string
	/** If set, the setting value is nested with this key (e.g., "enabled" -> { enabled: checked }) */
	nestedKey?: string
}

const agentFeatures: FeatureToggle[] = [
	{
		id: "subagents",
		labelKey: "settings.features.enableSubagents",
		descriptionKey: "settings.features.subagentsDescription",
		stateKey: "subagentsEnabled",
		settingKey: "subagentsEnabled",
	},
	{
		id: "native-tool-call",
		labelKey: "settings.features.nativeToolCall",
		descriptionKey: "settings.features.nativeToolCallDescription",
		stateKey: "nativeToolCallSetting",
		settingKey: "nativeToolCallEnabled",
	},
	{
		id: "parallel-tool-calling",
		labelKey: "settings.features.parallelToolCalling",
		descriptionKey: "settings.features.parallelToolCallingDescription",
		stateKey: "enableParallelToolCalling",
		settingKey: "enableParallelToolCalling",
	},
	{
		id: "strict-plan-mode",
		labelKey: "settings.features.strictPlanMode",
		descriptionKey: "settings.features.strictPlanModeDescription",
		stateKey: "strictPlanModeEnabled",
		settingKey: "strictPlanModeEnabled",
	},
	{
		id: "auto-compact",
		labelKey: "settings.features.enableAutoCompact",
		descriptionKey: "settings.features.autoCompactDescription",
		stateKey: "useAutoCondense",
		settingKey: "useAutoCondense",
	},
	{
		id: "focus-chain",
		labelKey: "settings.features.enableFocusChain",
		descriptionKey: "settings.features.focusChainDescription",
		stateKey: "focusChainEnabled",
		settingKey: "focusChainSettings",
		nestedKey: "enabled",
	},
]

const editorFeatures: FeatureToggle[] = [
	{
		id: "background-edit",
		labelKey: "settings.features.backgroundEdit",
		descriptionKey: "settings.features.backgroundEditDescription",
		stateKey: "backgroundEditEnabled",
		settingKey: "backgroundEditEnabled",
	},
	{
		id: "checkpoints",
		labelKey: "settings.features.enableCheckpoints",
		descriptionKey: "settings.features.checkpointsDescription",
		stateKey: "enableCheckpointsSetting",
		settingKey: "enableCheckpointsSetting",
	},
	{
		id: "cline-web-tools",
		labelKey: "settings.features.enableWebTools",
		descriptionKey: "settings.features.webToolsDescription",
		stateKey: "clineWebToolsEnabled",
		settingKey: "clineWebToolsEnabled",
	},
]

const experimentalFeatures: FeatureToggle[] = [
	{
		id: "yolo",
		labelKey: "settings.features.enableYolo",
		descriptionKey: "settings.features.yoloDescription",
		stateKey: "yoloModeToggled",
		settingKey: "yoloModeToggled",
	},
]

const advancedFeatures: FeatureToggle[] = [
	{
		id: "hooks",
		labelKey: "settings.features.enableHooks",
		descriptionKey: "settings.features.hooksDescription",
		stateKey: "hooksEnabled",
		settingKey: "hooksEnabled",
	},
]

const FeatureRow = memo(
	({
		checked = false,
		onChange,
		label,
		description,
		disabled,
		isRemoteLocked,
		isVisible = true,
		remoteTooltip,
	}: FeatureCheckboxProps) => {
		if (!isVisible) {
			return null
		}

		const checkbox = (
			<div className="flex items-center justify-between w-full">
				<div>{label}</div>
				<div>
					<Switch
						checked={checked}
						className="shrink-0"
						disabled={disabled || isRemoteLocked}
						id={label}
						onCheckedChange={onChange}
						size="lg"
					/>
					{isRemoteLocked && <i className="codicon codicon-lock text-description text-sm" />}
				</div>
			</div>
		)

		return (
			<div className="flex flex-col items-start justify-between gap-4 py-3 w-full">
				<div className="space-y-0.5 flex-1 w-full">
					{isRemoteLocked ? (
						<Tooltip>
							<TooltipTrigger asChild>{checkbox}</TooltipTrigger>
							<TooltipContent className="max-w-xs" side="top">
								{remoteTooltip}
							</TooltipContent>
						</Tooltip>
					) : (
						checkbox
					)}
				</div>
				<div className="text-xs text-description">{description}</div>
			</div>
		)
	},
)

interface FeatureSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const FeatureSettingsSection = ({ renderSectionHeader }: FeatureSettingsSectionProps) => {
	const { t } = useTranslation()
	const {
		enableCheckpointsSetting,
		hooksEnabled,
		mcpDisplayMode,
		strictPlanModeEnabled,
		yoloModeToggled,
		useAutoCondense,
		subagentsEnabled,
		clineWebToolsEnabled,
		worktreesEnabled,
		focusChainSettings,
		remoteConfigSettings,
		nativeToolCallSetting,
		enableParallelToolCalling,
		backgroundEditEnabled,
	} = useExtensionState()

	const handleFocusChainIntervalChange = useCallback(
		(value: number) => {
			updateSetting("focusChainSettings", { ...focusChainSettings, remindClineInterval: value })
		},
		[focusChainSettings],
	)

	const isYoloRemoteLocked = remoteConfigSettings?.yoloModeToggled !== undefined

	// State lookup for mapped features
	const featureState: Record<string, boolean | undefined> = {
		enableCheckpointsSetting,
		strictPlanModeEnabled,
		hooksEnabled,
		nativeToolCallSetting,
		focusChainEnabled: focusChainSettings?.enabled,
		useAutoCondense,
		subagentsEnabled,
		clineWebToolsEnabled: clineWebToolsEnabled?.user,
		worktreesEnabled: worktreesEnabled?.user,
		enableParallelToolCalling,
		backgroundEditEnabled,
		yoloModeToggled: isYoloRemoteLocked ? remoteConfigSettings?.yoloModeToggled : yoloModeToggled,
	}

	// Visibility lookup for features with feature flags
	const featureVisibility: Record<string, boolean | undefined> = {
		clineWebToolsEnabled: clineWebToolsEnabled?.featureFlag,
		worktreesEnabled: worktreesEnabled?.featureFlag,
	}

	// Handler for feature toggle changes, supports nested settings like focusChainSettings
	const handleFeatureChange = useCallback(
		(feature: FeatureToggle, checked: boolean) => {
			if (feature.nestedKey) {
				// For nested settings, spread the existing value and set the nested key
				let currentValue = {}
				if (feature.settingKey === "focusChainSettings") {
					currentValue = focusChainSettings ?? {}
				}
				updateSetting(feature.settingKey, { ...currentValue, [feature.nestedKey]: checked })
			} else {
				updateSetting(feature.settingKey, checked)
			}
		},
		[focusChainSettings],
	)

	return (
		<div className="mb-2">
			{renderSectionHeader("features")}
			<Section>
				<div className="mb-5 flex flex-col gap-3">
					{/* Core features */}
					<div>
						<div className="text-xs font-medium text-foreground/80 uppercase tracking-wider mb-3">
							{t("settings.features.agent")}
						</div>
						<div
							className="relative p-3 pt-0 my-3 rounded-md border border-editor-widget-border/50"
							id="agent-features">
							{agentFeatures.map((feature) => (
								<div key={feature.id}>
									<FeatureRow
										checked={featureState[feature.stateKey]}
										description={t(feature.descriptionKey)}
										isVisible={featureVisibility[feature.stateKey] ?? true}
										key={feature.id}
										label={t(feature.labelKey)}
										onChange={(checked) =>
											feature.nestedKey === "enabled"
												? handleFeatureChange(feature, checked)
												: updateSetting(feature.settingKey, checked)
										}
									/>
									{feature.id === "focus-chain" && featureState[feature.stateKey] && (
										<SettingsSlider
											label={t("settings.features.focusChainReminderInterval")}
											max={10}
											min={1}
											onChange={handleFocusChainIntervalChange}
											step={1}
											value={focusChainSettings?.remindClineInterval || 6}
											valueWidth="w-6"
										/>
									)}
								</div>
							))}
						</div>
					</div>

					{/* Editor features */}
					<div>
						<div className="text-xs font-medium text-foreground/80 uppercase tracking-wider mb-3">
							{t("settings.features.editor")}
						</div>
						<div
							className="relative p-3 pt-0 my-3 rounded-md border border-editor-widget-border/50"
							id="optional-features">
							{editorFeatures.map((feature) => (
								<FeatureRow
									checked={featureState[feature.stateKey]}
									description={t(feature.descriptionKey)}
									isVisible={featureVisibility[feature.stateKey] ?? true}
									key={feature.id}
									label={t(feature.labelKey)}
									onChange={(checked) => handleFeatureChange(feature, checked)}
								/>
							))}
						</div>
					</div>

					{/* Experimental features */}
					<div>
						<div className="text-xs font-medium uppercase tracking-wider mb-3 text-warning/80">
							{t("settings.features.experimental")}
						</div>
						<div
							className="relative p-3 pt-0 my-3 rounded-md border border-editor-widget-border/50 w-full"
							id="experimental-features">
							{experimentalFeatures.map((feature) => (
								<FeatureRow
									checked={featureState[feature.stateKey]}
									description={t(feature.descriptionKey)}
									disabled={feature.id === "yolo" && isYoloRemoteLocked}
									isRemoteLocked={feature.id === "yolo" && isYoloRemoteLocked}
									isVisible={featureVisibility[feature.stateKey] ?? true}
									key={feature.id}
									label={t(feature.labelKey)}
									onChange={(checked) => handleFeatureChange(feature, checked)}
									remoteTooltip={t("settings.general.remoteConfigManaged")}
								/>
							))}
						</div>
					</div>
				</div>

				{/* Advanced */}
				<div>
					<div className="text-xs font-medium text-foreground/80 uppercase tracking-wider mb-3">
						{t("settings.features.advanced")}
					</div>
					<div className="relative p-3 my-3 rounded-md border border-editor-widget-border/50" id="advanced-features">
						<div className="space-y-3">
							{advancedFeatures.map((feature) => (
								<FeatureRow
									checked={featureState[feature.stateKey]}
									description={t(feature.descriptionKey)}
									isVisible={featureVisibility[feature.stateKey] ?? true}
									key={feature.id}
									label={t(feature.labelKey)}
									onChange={(checked) => handleFeatureChange(feature, checked)}
								/>
							))}

							{/* MCP Display Mode */}
							<div className="space-y-2">
								<Label className="text-sm font-medium text-foreground">{t("settings.features.mcpDisplayMode")}</Label>
								<p className="text-xs text-muted-foreground">{t("settings.features.mcpDisplayModeDescription")}</p>
								<Select onValueChange={(v) => updateSetting("mcpDisplayMode", v)} value={mcpDisplayMode}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="plain">{t("settings.features.mcpDisplayModeOptions.plain")}</SelectItem>
										<SelectItem value="rich">{t("settings.features.mcpDisplayModeOptions.rich")}</SelectItem>
										<SelectItem value="markdown">{t("settings.features.mcpDisplayModeOptions.markdown")}</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
export default memo(FeatureSettingsSection)
