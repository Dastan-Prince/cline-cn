import { AskResponseRequest } from "@shared/proto/cline/task"
import styled from "styled-components"
import { CODE_BLOCK_BG_COLOR } from "@/components/common/CodeBlock"
import { TaskServiceClient } from "@/services/grpc-client"

const OptionButton = styled.button<{ isSelected?: boolean; isNotSelectable?: boolean }>`
	padding: 8px 12px;
	background: ${(props) => (props.isSelected ? "var(--vscode-focusBorder)" : CODE_BLOCK_BG_COLOR)};
	color: ${(props) => (props.isSelected ? "white" : "var(--vscode-input-foreground)")};
	border: 1px solid var(--vscode-editorGroup-border);
	border-radius: 2px;
	cursor: ${(props) => (props.isNotSelectable ? "default" : "pointer")};
	text-align: left;
	font-size: 12px;

	${(props) =>
		!props.isNotSelectable &&
		`
		&:hover {
			background: var(--vscode-focusBorder);
			color: white;
		}
	`}
`

export const OptionsButtons = ({
	options,
	selected,
	isActive,
	inputValue,
}: {
	options?: string[]
	selected?: string
	isActive?: boolean
	inputValue?: string
}) => {
	if (!options?.length) {
		return null
	}

	// Defensive: some models emit option objects ({label}/{value}) instead of strings.
	// Rendering a raw object as a React child crashes the entire webview.
	const toLabel = (option: unknown): string => {
		if (typeof option === "string") {
			return option
		}
		if (option != null && typeof option === "object") {
			const obj = option as Record<string, unknown>
			const preferred = obj.label ?? obj.value ?? obj.text
			if (typeof preferred === "string" && preferred.trim()) {
				return preferred
			}
			return JSON.stringify(option)
		}
		return String(option)
	}

	const hasSelected = selected !== undefined && options.includes(selected)

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "8px",
			}}>
			{/* <div style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px", textTransform: "uppercase" }}>
				SELECT ONE:
			</div> */}
			{options.map((option, index) => {
				const optionLabel = toLabel(option)
				return (
					<OptionButton
						className="options-button"
						id={`options-button-${index}`}
						isNotSelectable={hasSelected || !isActive}
						isSelected={option === selected}
						key={index}
						onClick={async () => {
							if (hasSelected || !isActive) {
								return
							}
							try {
								await TaskServiceClient.askResponse(
									AskResponseRequest.create({
										responseType: "messageResponse",
										text: optionLabel + (inputValue ? `: ${inputValue?.trim()}` : ""),
										images: [],
									}),
								)
							} catch (error) {
								console.error("Error sending option response:", error)
							}
						}}>
						<span className="ph-no-capture">{optionLabel}</span>
					</OptionButton>
				)
			})}
		</div>
	)
}
