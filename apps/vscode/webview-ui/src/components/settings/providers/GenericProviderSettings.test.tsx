import type { ProviderConfigResponse } from "@shared/proto/cline/models"
import { ApiFormat } from "@shared/proto/cline/models"
import { toProtobufModelOverrides } from "@shared/proto-conversions/models/modelOverrides"
import { toProtobufModelInfo } from "@shared/proto-conversions/models/typeConversion"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ChangeEventHandler, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { useProviderConfig } from "@/hooks/useProviderConfig"
import { useProviderModels } from "@/hooks/useProviderModels"
import { GenericProviderSettings } from "./GenericProviderSettings"

const providerConfig = (config: Partial<ProviderConfigResponse>): ProviderConfigResponse => config as ProviderConfigResponse

vi.mock("@/hooks/useProviderModels", () => ({
	useProviderModels: vi.fn(),
}))

vi.mock("@/hooks/useProviderConfig", () => ({
	useProviderConfig: vi.fn(),
}))

// The reasoning effort selector reads the extension state for the current
// mode-specific reasoning effort value.
vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({ apiConfiguration: {}, planActSeparateModelsSetting: false }),
}))

// Render the dropdown web components as native elements so value/change
// behavior is observable in jsdom. Other toolkit components stay real.
vi.mock("@vscode/webview-ui-toolkit/react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vscode/webview-ui-toolkit/react")>()
	return {
		...actual,
		VSCodeDropdown: ({
			children,
			id,
			onChange,
			value,
			"aria-label": ariaLabel,
		}: {
			children?: ReactNode
			id?: string
			onChange?: ChangeEventHandler<HTMLSelectElement>
			value?: string
			"aria-label"?: string
		}) => (
			<select aria-label={ariaLabel} id={id} onChange={onChange} value={value}>
				{children}
			</select>
		),
		VSCodeOption: ({ children, value }: { children?: ReactNode; value?: string }) => (
			<option value={value}>{children}</option>
		),
		VSCodeCheckbox: ({
			checked,
			children,
			disabled,
			onChange,
		}: {
			checked?: boolean
			children?: ReactNode
			disabled?: boolean
			onChange?: (event: { target: { checked: boolean } }) => void
		}) => (
			// Mirror the toolkit web component's *controlled* projection: the
			// rendered checked state follows the prop, not the user's click —
			// this is what made the pre-fix checkbox visually snap back while
			// the commit round trip was in flight. The label text stays
			// rendered (wrapped in a label) so getByText queries keep working.
			<label>
				<input
					aria-label={typeof children === "string" ? children : undefined}
					checked={checked === true}
					disabled={disabled}
					onChange={(event) => onChange?.({ target: { checked: event.currentTarget.checked } })}
					type="checkbox"
				/>
				{children}
			</label>
		),
	}
})

describe("GenericProviderSettings", () => {
	it("renders catalog-backed provider settings and commits full model selections", async () => {
		const commitSelection = vi.fn(async () => undefined)
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {
				"deepseek-chat": { name: "DeepSeek Chat", supportsPromptCache: true, contextWindow: 128_000 },
				"deepseek-reasoner": {
					name: "DeepSeek Reasoner",
					supportsPromptCache: true,
					contextWindow: 128_000,
					supportsReasoning: true,
				},
			},
			defaultModelId: "deepseek-chat",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: undefined,
			write,
			commitSelection,
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={true}
			/>,
		)

		expect(screen.getByLabelText("Model")).toHaveValue("deepseek-chat")
		expect(screen.queryByText("Reasoning Effort")).not.toBeInTheDocument()
		fireEvent.change(screen.getByLabelText("Model"), { target: { value: "deepseek-reasoner" } })

		await waitFor(() => expect(commitSelection).toHaveBeenCalledTimes(1))
		expect(commitSelection).toHaveBeenCalledWith("act", {
			providerId: "deepseek",
			modelId: "deepseek-reasoner",
		})
		expect(useProviderModels).toHaveBeenCalledWith("deepseek", { autoFetch: true })
		expect(useProviderConfig).toHaveBeenCalledWith("deepseek")
	})

	it("renders a reasoning effort selector when the selected model supports reasoning", () => {
		vi.mocked(useProviderModels).mockReturnValue({
			models: {
				"deepseek-reasoner": {
					name: "DeepSeek Reasoner",
					supportsPromptCache: true,
					contextWindow: 128_000,
					supportsReasoning: true,
				},
			},
			defaultModelId: "deepseek-reasoner",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: undefined,
			write: vi.fn(async () => undefined),
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={true}
			/>,
		)

		expect(screen.getByText("Reasoning Effort")).toBeInTheDocument()
	})

	it("shows saved API keys as masked and does not clear them on mount", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 12 }),
			write,
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		const apiKeyInput = screen.getByDisplayValue("••••••••••••")
		await new Promise((resolve) => setTimeout(resolve, 150))
		expect(write).not.toHaveBeenCalled()

		fireEvent.input(apiKeyInput, { target: { value: "new-secret" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ apiKey: "new-secret" }))
	})

	it("does not clear API keys while provider config is loading", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({ config: undefined, write, commitSelection: vi.fn() })

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		await new Promise((resolve) => setTimeout(resolve, 150))
		expect(write).not.toHaveBeenCalled()
	})

	it("does not save when provider config hydrates a saved API key", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({ config: undefined, write, commitSelection: vi.fn() })

		const { rerender } = render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		await new Promise((resolve) => setTimeout(resolve, 150))
		expect(write).not.toHaveBeenCalled()

		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 8 }),
			write,
			commitSelection: vi.fn(),
		})
		rerender(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		expect(screen.getByDisplayValue("••••••••")).toBeInTheDocument()
		await new Promise((resolve) => setTimeout(resolve, 150))
		expect(write).not.toHaveBeenCalled()
	})

	it("does not write a mask if config hydrates after a blurred edit", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({ config: undefined, write, commitSelection: vi.fn() })

		const { rerender } = render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		const apiKeyInput = screen.getByPlaceholderText("Enter API Key...")
		fireEvent.input(apiKeyInput, { target: { value: "partial-key" } })
		fireEvent.blur(apiKeyInput)

		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 8 }),
			write,
			commitSelection: vi.fn(),
		})
		rerender(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		await new Promise((resolve) => setTimeout(resolve, 150))
		expect(write).not.toHaveBeenCalledWith({ apiKey: "••••••••" })
		expect(write).not.toHaveBeenCalled()
	})

	it("still allows users to clear a saved API key", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 8 }),
			write,
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		fireEvent.input(screen.getByDisplayValue("••••••••"), { target: { value: "" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ apiKey: "" }))
	})

	it("does not persist mask characters when editing a saved API key", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 7 }),
			write,
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		fireEvent.input(screen.getByDisplayValue("•••••••"), { target: { value: "•••••••f" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ apiKey: "f" }), { timeout: 1_000 })
		expect(write).not.toHaveBeenCalledWith({ apiKey: "•••••••f" })
	})

	it("does not replace in-progress API key typing when saved key length rerenders", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 0 }),
			write,
			commitSelection: vi.fn(),
		})

		const { rerender } = render(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		const apiKeyInput = screen.getByPlaceholderText("Enter API Key...")
		fireEvent.focus(apiKeyInput)
		fireEvent.input(apiKeyInput, { target: { value: "max" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ apiKey: "max" }))

		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 3 }),
			write,
			commitSelection: vi.fn(),
		})
		rerender(
			<GenericProviderSettings
				allowsCustomIds={false}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={false}
			/>,
		)

		expect(apiKeyInput).toHaveValue("max")

		fireEvent.input(apiKeyInput, { target: { value: "maxpaulus" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ apiKey: "maxpaulus" }))
		expect(write).not.toHaveBeenCalledWith({ apiKey: "lus" })
	})

	it("can render and update an optional base URL field through provider config", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {
				"gemini-3.1-pro-preview": {
					name: "Gemini 3.1 Pro Preview",
					supportsPromptCache: true,
					contextWindow: 1_000_000,
					apiFormat: ApiFormat.GEMINI_CHAT,
				},
			},
			defaultModelId: "gemini-3.1-pro-preview",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ baseUrl: "https://custom.example", apiKeyLength: 0 }),
			write,
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				baseUrlField={{
					label: "Use custom base URL",
					placeholder: "Default: https://generativelanguage.googleapis.com",
				}}
				currentMode="act"
				providerId="gemini"
				providerName="Gemini"
				showModelOptions={false}
			/>,
		)

		const baseUrlInput = screen.getByPlaceholderText("Default: https://generativelanguage.googleapis.com")
		fireEvent.input(baseUrlInput, { target: { value: "https://new.example" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ baseUrl: "https://new.example" }))

		fireEvent.click(screen.getByText("Use custom base URL"))

		expect(write).toHaveBeenCalledWith({ baseUrl: "" })
	})

	it("renders an always-visible base URL field without the opt-in checkbox", async () => {
		const write = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({ apiKeyLength: 0 }),
			write,
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={true}
				baseUrlField={{
					label: "Base URL",
					placeholder: "https://api.example.com/anthropic",
					alwaysVisible: true,
				}}
				currentMode="act"
				providerId="anthropic-comp"
				providerName="Anthropic Compatible"
				showModelOptions={false}
			/>,
		)

		const baseUrlInput = screen.getByPlaceholderText("https://api.example.com/anthropic")
		expect(baseUrlInput).toBeInTheDocument()
		expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()

		fireEvent.input(baseUrlInput, { target: { value: "https://proxy.example.com/anthropic" } })

		await waitFor(() => expect(write).toHaveBeenCalledWith({ baseUrl: "https://proxy.example.com/anthropic" }))
	})

	it("skips the automatic model list fetch when requested", () => {
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: undefined,
			write: vi.fn(),
			commitSelection: vi.fn(),
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={true}
				currentMode="act"
				providerId="anthropic-comp"
				providerName="Anthropic Compatible"
				showModelOptions={false}
				skipModelListFetch={true}
			/>,
		)

		expect(useProviderModels).toHaveBeenCalledWith("anthropic-comp", { autoFetch: false })
	})

	it("commits model configuration overrides for the selected model", async () => {
		const commitSelection = vi.fn(async () => undefined)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {
				"deepseek-chat": { name: "DeepSeek Chat", supportsPromptCache: true, contextWindow: 128_000 },
			},
			defaultModelId: "deepseek-chat",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			config: undefined,
			write: vi.fn(async () => undefined),
			commitSelection,
		})

		render(
			<GenericProviderSettings
				allowsCustomIds={false}
				allowsModelOverrides={true}
				currentMode="act"
				providerId="deepseek"
				providerName="DeepSeek"
				showModelOptions={true}
			/>,
		)

		fireEvent.click(screen.getByText("Model Configuration"))
		fireEvent.click(screen.getByText("Supports Reasoning"))

		await waitFor(() =>
			expect(commitSelection).toHaveBeenCalledWith("act", {
				providerId: "deepseek",
				modelId: "deepseek-chat",
				overrides: { supportsReasoning: true },
			}),
		)
	})

	// Regression: the Model Configuration capability checkboxes must stay
	// flipped after a click even while the commit + read-back round trip is
	// still in flight. Before the optimistic-state fix, the controlled
	// `checked` prop re-rendered from the stale modelInfo (the committed
	// selection only arrives after commitSelection resolves and the provider
	// config re-reads), so the checkbox visibly snapped back.
	it("keeps capability checkboxes flipped while the commit round trip is in flight", async () => {
		let resolveCommit: (() => void) | undefined
		const commitSelection = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveCommit = resolve
				}),
		)
		vi.mocked(useProviderModels).mockReturnValue({
			models: {},
			defaultModelId: "",
			isLoading: false,
			isStale: false,
			error: undefined,
			refresh: vi.fn(),
			fingerprint: "fingerprint",
		})
		vi.mocked(useProviderConfig).mockReturnValue({
			// The committed selection hydrates immediately with the pre-click
			// snapshot (supportsReasoning unset) so a model id exists to commit
			// against; only the commit + read-back round trip is delayed.
			config: providerConfig({
				actSelection: {
					providerId: "anthropic-comp",
					modelId: "glm-5.3",
					modelInfo: toProtobufModelInfo({ name: "glm-5.3", supportsPromptCache: false }),
				} as ProviderConfigResponse["actSelection"],
			}),
			write: vi.fn(async () => undefined),
			commitSelection,
		})

		const { rerender } = render(
			<GenericProviderSettings
				allowsCustomIds={true}
				allowsModelOverrides={true}
				currentMode="act"
				providerId="anthropic-comp"
				providerName="Anthropic Compatible"
				showModelOptions={true}
				skipModelListFetch={true}
			/>,
		)

		fireEvent.click(screen.getByText("Model Configuration"))
		fireEvent.click(screen.getByLabelText("Supports Reasoning"))

		await waitFor(() => expect(commitSelection).toHaveBeenCalledTimes(1))
		// The commit promise is still pending here, so committedSelection still
		// hydrates from the pre-click snapshot: the checkbox must stay checked.
		expect(screen.getByLabelText("Supports Reasoning")).toBeChecked()

		// Simulate the provider config re-read landing with the override
		// applied, then let the commit promise resolve.
		resolveCommit?.()
		vi.mocked(useProviderConfig).mockReturnValue({
			config: providerConfig({
				actSelection: {
					providerId: "anthropic-comp",
					modelId: "glm-5.3",
					modelInfo: toProtobufModelInfo({
						name: "glm-5.3",
						supportsPromptCache: false,
						supportsReasoning: true,
					}),
					overrides: toProtobufModelOverrides({ supportsReasoning: true }),
				} as ProviderConfigResponse["actSelection"],
			}),
			write: vi.fn(async () => undefined),
			commitSelection,
		})
		rerender(
			<GenericProviderSettings
				allowsCustomIds={true}
				allowsModelOverrides={true}
				currentMode="act"
				providerId="anthropic-comp"
				providerName="Anthropic Compatible"
				showModelOptions={true}
				skipModelListFetch={true}
			/>,
		)

		expect(screen.getByLabelText("Supports Reasoning")).toBeChecked()
	})
})
