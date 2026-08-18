import type { ModelInfo } from "@shared/api"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"

/**
 * Props for the EditableModelSelector component
 */
interface EditableModelSelectorProps {
	models: Record<string, ModelInfo>
	selectedModelId: string
	onChange: (modelId: string) => void
	zIndex?: number
	label?: string
}

const DropdownWrapper = styled.div`
	position: relative;
	width: 100%;
`

const DropdownList = styled.div`
	position: absolute;
	top: calc(100% - 3px);
	left: 0;
	width: calc(100% - 2px);
	max-height: 200px;
	overflow-y: auto;
	background-color: var(--vscode-dropdown-background);
	border: 1px solid var(--vscode-list-activeSelectionBackground);
	z-index: 1000;
	border-bottom-left-radius: 3px;
	border-bottom-right-radius: 3px;
`

const DropdownItem = styled.div<{ isSelected: boolean }>`
	padding: 5px 10px;
	cursor: pointer;
	word-break: break-all;
	white-space: normal;

	background-color: ${({ isSelected }) => (isSelected ? "var(--vscode-list-activeSelectionBackground)" : "inherit")};

	&:hover {
		background-color: var(--vscode-list-activeSelectionBackground);
	}
`

/**
 * A model selector that combines a text field with a dropdown of the known
 * models. Because the control is built on a text input, the user can type any
 * model ID (including custom/unknown ones) — it is not limited to the
 * pre-defined list, unlike the native `VSCodeDropdown` used by `ModelSelector`.
 *
 * On Enter or blur the currently-typed value is committed; on Escape the
 * dropdown is closed and the previous selection is restored.
 */
export const EditableModelSelector = ({
	models,
	selectedModelId,
	onChange,
	zIndex,
	label = "Model",
}: EditableModelSelectorProps) => {
	const [searchTerm, setSearchTerm] = useState(selectedModelId || "")
	const [isDropdownVisible, setIsDropdownVisible] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(-1)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const itemRefs = useRef<(HTMLDivElement | null)[]>([])
	const dropdownListRef = useRef<HTMLDivElement>(null)

	// Sync the input value when the selection changes externally
	useEffect(() => {
		setSearchTerm(selectedModelId || "")
		setSelectedIndex(-1)
	}, [selectedModelId])

	// Close the dropdown when the user clicks outside of it
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsDropdownVisible(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [])

	const modelIds = useMemo(() => {
		return Object.keys(models).sort((a, b) => a.localeCompare(b))
	}, [models])

	const filteredIds = useMemo(() => {
		const term = searchTerm.trim().toLowerCase()
		if (!term) {
			return modelIds
		}
		return modelIds.filter((id) => id.toLowerCase().includes(term))
	}, [modelIds, searchTerm])

	const commit = (modelId: string) => {
		setSearchTerm(modelId)
		onChange(modelId)
		setIsDropdownVisible(false)
		setSelectedIndex(-1)
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!isDropdownVisible) {
			return
		}

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault()
				setSelectedIndex((prev) => (prev < filteredIds.length - 1 ? prev + 1 : prev))
				break
			case "ArrowUp":
				event.preventDefault()
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
				break
			case "Enter":
				event.preventDefault()
				if (selectedIndex >= 0 && selectedIndex < filteredIds.length) {
					commit(filteredIds[selectedIndex])
				} else {
					// User typed a custom model ID
					commit(searchTerm)
				}
				break
			case "Escape":
				setIsDropdownVisible(false)
				setSelectedIndex(-1)
				setSearchTerm(selectedModelId || "")
				break
		}
	}

	const handleBlur = () => {
		// Commit whatever the user typed, even if it isn't in the known list
		if (searchTerm !== selectedModelId) {
			onChange(searchTerm)
		}
		setIsDropdownVisible(false)
	}

	// Keep the highlighted item in view
	useEffect(() => {
		if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			})
		}
	}, [selectedIndex])

	return (
		<DropdownWrapper ref={dropdownRef} style={{ zIndex }}>
			<label htmlFor="model-id">
				<span className="font-medium">{label}</span>
			</label>
			<VSCodeTextField
				id="model-id"
				onBlur={handleBlur}
				onFocus={() => setIsDropdownVisible(true)}
				onInput={(e) => {
					setSearchTerm((e.target as HTMLInputElement)?.value || "")
					setSelectedIndex(-1)
					setIsDropdownVisible(true)
				}}
				onKeyDown={handleKeyDown}
				placeholder="Search and select a model..."
				role="combobox"
				style={{ width: "100%", position: "relative" }}
				value={searchTerm}
			/>
			{isDropdownVisible && (
				<DropdownList ref={dropdownListRef} role="listbox">
					{filteredIds.map((modelId, index) => (
						<DropdownItem
							isSelected={index === selectedIndex}
							key={modelId}
							onClick={() => commit(modelId)}
							onMouseEnter={() => setSelectedIndex(index)}
							ref={(el) => {
								itemRefs.current[index] = el
							}}
							role="option">
							{modelId}
						</DropdownItem>
					))}
				</DropdownList>
			)}
		</DropdownWrapper>
	)
}