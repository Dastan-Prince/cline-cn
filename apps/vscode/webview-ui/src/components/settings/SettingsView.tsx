import type { ExtensionMessage } from "@shared/ExtensionMessage"
import { ResetStateRequest } from "@shared/proto/cline/state"
import { UserOrganization } from "@shared/proto/index.cline"
import {
	CheckCheck,
	FlaskConical,
	HardDriveDownload,
	Info,
	type LucideIcon,
	SlidersHorizontal,
	SquareMousePointer,
	SquareTerminal,
	Wrench,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useEvent } from "react-use"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useClineAuth } from "@/context/ClineAuthContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { cn } from "@/lib/utils"
import { StateServiceClient } from "@/services/grpc-client"
import { isAdminOrOwner } from "../account/helpers"
import { Tab, TabContent, TabList, TabTrigger } from "../common/Tab"
import ViewHeader from "../common/ViewHeader"
import SectionHeader from "./SectionHeader"
import AboutSection from "./sections/AboutSection"
import ApiConfigurationSection from "./sections/ApiConfigurationSection"
import BrowserSettingsSection from "./sections/BrowserSettingsSection"
import DebugSection from "./sections/DebugSection"
import FeatureSettingsSection from "./sections/FeatureSettingsSection"
import GeneralSettingsSection from "./sections/GeneralSettingsSection"
import { RemoteConfigSection } from "./sections/RemoteConfigSection"
import TerminalSettingsSection from "./sections/TerminalSettingsSection"

const IS_DEV = process.env.IS_DEV

// Tab definitions
type SettingsTabID = "api-config" | "features" | "browser" | "terminal" | "general" | "about" | "debug" | "remote-config"
interface SettingsTab {
	id: SettingsTabID
	nameKey: string
	tooltipKey: string
	headerKey: string
	icon: LucideIcon
	hidden?: (params?: { activeOrganization: UserOrganization | null }) => boolean
}

export const SETTINGS_TABS: SettingsTab[] = [
	{
		id: "api-config",
		nameKey: "settings.tabs.apiConfig",
		tooltipKey: "settings.tabs.apiConfig",
		headerKey: "settings.tabs.apiConfig",
		icon: SlidersHorizontal,
	},
	{
		id: "features",
		nameKey: "settings.tabs.features",
		tooltipKey: "settings.tabs.features",
		headerKey: "settings.tabs.features",
		icon: CheckCheck,
	},
	{
		id: "browser",
		nameKey: "settings.tabs.browser",
		tooltipKey: "settings.tabs.browser",
		headerKey: "settings.tabs.browser",
		icon: SquareMousePointer,
	},
	{
		id: "terminal",
		nameKey: "settings.tabs.terminal",
		tooltipKey: "settings.tabs.terminal",
		headerKey: "settings.tabs.terminal",
		icon: SquareTerminal,
	},
	{
		id: "general",
		nameKey: "settings.tabs.general",
		tooltipKey: "settings.tabs.general",
		headerKey: "settings.tabs.general",
		icon: Wrench,
	},
	{
		id: "remote-config",
		nameKey: "settings.tabs.remoteConfig",
		tooltipKey: "settings.tabs.remoteConfig",
		headerKey: "settings.tabs.remoteConfig",
		icon: HardDriveDownload,
		hidden: ({ activeOrganization } = { activeOrganization: null }) =>
			!activeOrganization || !isAdminOrOwner(activeOrganization),
	},
	{
		id: "about",
		nameKey: "settings.tabs.about",
		tooltipKey: "settings.tabs.about",
		headerKey: "settings.tabs.about",
		icon: Info,
	},
	// Only show in dev mode
	{
		id: "debug",
		nameKey: "settings.tabs.debug",
		tooltipKey: "settings.tabs.debug",
		headerKey: "settings.tabs.debug",
		icon: FlaskConical,
		hidden: () => !IS_DEV,
	},
]

type SettingsViewProps = {
	onDone: () => void
	targetSection?: string
}

// Helper to render section header - moved outside component for better performance
const renderSectionHeader = (tabId: string, t: (key: string) => string) => {
	const tab = SETTINGS_TABS.find((tab) => tab.id === tabId)
	if (!tab) {
		return null
	}

	return (
		<SectionHeader>
			<div className="flex items-center gap-2">
				<tab.icon className="w-4" />
				<div>{t(tab.headerKey)}</div>
			</div>
		</SectionHeader>
	)
}

const SettingsView = ({ onDone, targetSection }: SettingsViewProps) => {
	const { t } = useTranslation()
	// Memoize to avoid recreation
	const TAB_CONTENT_MAP: Record<SettingsTabID, React.FC<any>> = useMemo(
		() => ({
			"api-config": ApiConfigurationSection,
			general: GeneralSettingsSection,
			features: FeatureSettingsSection,
			browser: BrowserSettingsSection,
			terminal: TerminalSettingsSection,
			"remote-config": RemoteConfigSection,
			about: AboutSection,
			debug: DebugSection,
		}),
		[],
	) // Empty deps - these imports never change

	const { version, environment, settingsInitialModelTab } = useExtensionState()
	const { activeOrganization } = useClineAuth()

	const [activeTab, setActiveTab] = useState<string>(targetSection || SETTINGS_TABS[0].id)

	// Optimized message handler with early returns
	const handleMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type !== "grpc_response") {
			return
		}

		const grpcMessage = message.grpc_response?.message
		if (grpcMessage?.key !== "scrollToSettings") {
			return
		}

		const tabId = grpcMessage.value
		if (!tabId) {
			return
		}

		// Check if valid tab ID
		if (SETTINGS_TABS.some((tab) => tab.id === tabId)) {
			setActiveTab(tabId)
			return
		}

		// Fallback to element scrolling
		requestAnimationFrame(() => {
			const element = document.getElementById(tabId)
			if (!element) {
				return
			}

			element.scrollIntoView({ behavior: "smooth" })
			element.style.transition = "background-color 0.5s ease"
			element.style.backgroundColor = "var(--vscode-textPreformat-background)"

			setTimeout(() => {
				element.style.backgroundColor = "transparent"
			}, 1200)
		})
	}, [])

	useEvent("message", handleMessage)

	// Memoized reset state handler
	const handleResetState = useCallback(async (resetGlobalState?: boolean) => {
		try {
			await StateServiceClient.resetState(ResetStateRequest.create({ global: resetGlobalState }))
		} catch (error) {
			console.error("Failed to reset state:", error)
		}
	}, [])

	// Update active tab when targetSection changes
	useEffect(() => {
		if (targetSection) {
			setActiveTab(targetSection)
		}
	}, [targetSection])

	// Memoized tab item renderer
	const renderTabItem = useCallback(
		(tab: (typeof SETTINGS_TABS)[0]) => {
			return (
				<TabTrigger className="flex justify-baseline" data-testid={`tab-${tab.id}`} key={tab.id} value={tab.id}>
					<Tooltip key={tab.id}>
						<TooltipTrigger>
							<div
								className={cn(
									"whitespace-nowrap overflow-hidden h-12 sm:py-3 box-border flex items-center border-l-2 border-transparent text-foreground opacity-70 bg-transparent hover:bg-list-hover p-4 cursor-pointer gap-2",
									{
										"opacity-100 border-l-2 border-l-foreground border-t-0 border-r-0 border-b-0 bg-selection":
											activeTab === tab.id,
									},
								)}>
								<tab.icon className="w-4 h-4" />
								<span className="hidden sm:block">{t(tab.nameKey)}</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="right">{t(tab.tooltipKey)}</TooltipContent>
					</Tooltip>
				</TabTrigger>
			)
		},
		[activeTab, t],
	)

	// Memoized active content component
	const ActiveContent = useMemo(() => {
		const Component = TAB_CONTENT_MAP[activeTab as keyof typeof TAB_CONTENT_MAP]
		if (!Component) {
			return null
		}

		// Special props for specific components
		const props: any = { renderSectionHeader: (tabId: string) => renderSectionHeader(tabId, t) }
		if (activeTab === "debug") {
			props.onResetState = handleResetState
		} else if (activeTab === "about") {
			props.version = version
		} else if (activeTab === "api-config") {
			props.initialModelTab = settingsInitialModelTab
		}

		return <Component {...props} />
	}, [activeTab, handleResetState, settingsInitialModelTab, version, t])

	return (
		<Tab>
			<ViewHeader environment={environment} onDone={onDone} title={t("settings.title")} />

			<div className="flex flex-1 overflow-hidden">
				<TabList
					className="shrink-0 flex flex-col overflow-y-auto border-r border-sidebar-background"
					onValueChange={setActiveTab}
					value={activeTab}>
					{SETTINGS_TABS.filter((tab) => !tab.hidden?.({ activeOrganization })).map(renderTabItem)}
				</TabList>

				<TabContent className="flex-1 overflow-auto">{ActiveContent}</TabContent>
			</div>
		</Tab>
	)
}

export default SettingsView
