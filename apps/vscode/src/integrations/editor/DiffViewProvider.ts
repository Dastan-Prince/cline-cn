import { formatResponse } from "@core/prompts/responses"
import { workspaceResolver } from "@core/workspace"
import { createDirectoriesForFile, fileExistsAtPath } from "@utils/fs"
import { getCwd } from "@utils/path"
import * as diff from "diff"
import * as fs from "fs/promises"
import * as iconv from "iconv-lite"
import { HostProvider } from "@/hosts/host-provider"
import { diagnosticsToProblemsString, getNewDiagnostics } from "@/integrations/diagnostics"
import { DiagnosticSeverity, FileDiagnostics } from "@/shared/proto/index.cline"
import { Logger } from "@/shared/services/Logger"
import { detectEncoding } from "../misc/extract-text"
import { sanitizeNotebookForLLM } from "../misc/notebook-utils"
import { openFile } from "../misc/open-file"
import {
	OperationTimeout,
	OperationTimeoutError,
	TIMEOUTS,
	scaleTimeoutBySize,
	withTimeout,
	withTimeoutOrDefault,
} from "@utils/async-timeout"

/**
 * Result of a best-effort save. "timeout" is deliberately distinguishable from
 * "skipped": the former means the write may still land later, so destructive follow-up
 * work must be avoided.
 */
type SaveOutcome = "saved" | "skipped" | "timeout"

/**
 * Budget for flushing an unrelated dirty document before we take ownership of the file.
 * Shorter than {@link TIMEOUTS.write} because losing this save is recoverable — it only
 * guards against reading stale content into `originalContent`.
 */
const FLUSH_OPEN_DOCUMENT_TIMEOUT: OperationTimeout = { slowAfterMs: 10_000, hardMs: 30_000 }

export abstract class DiffViewProvider {
	editType?: "create" | "modify" | "delete"
	isEditing = false
	originalContent: string | undefined
	private createdDirs: string[] = []
	protected documentWasOpen = false
	private preDiagnostics: FileDiagnostics[] = []
	protected relPath?: string
	protected absolutePath?: string
	protected fileEncoding: string = "utf8"
	private streamedLines: string[] = []
	private newContent?: string

	constructor() {}

	public async open(relPath: string, options?: { displayPath?: string }): Promise<void> {
		const cwd = await getCwd()
		const absolutePathResolved = workspaceResolver.resolveWorkspacePath(cwd, relPath, "DiffViewProvider.open.absolutePath")
		this.absolutePath = typeof absolutePathResolved === "string" ? absolutePathResolved : absolutePathResolved.absolutePath
		this.relPath = options?.displayPath ?? relPath
		// Prefer the actual disk state over the caller-provided editType hint. A stale or
		// mis-detected editType (e.g. "create" for an existing file) previously caused
		// originalContent to be reset to "" — and the real file to be truncated by the
		// fs.writeFile below — which made every SEARCH block fail to match against an
		// empty string even though the model's diff was correct.
		const fileExists = await fileExistsAtPath(this.absolutePath)

		// Don't mark ourselves as editing until the file has been read (or created)
		// successfully: if readFile below throws (e.g. EISDIR when the path is a
		// directory), a lingering isEditing=true with no open editor used to poison
		// every subsequent update/revert with "User closed text editor".
		try {
			// if the file is already open, ensure it's not dirty before getting its contents
			if (fileExists) {
				// Best-effort flush: if this never resolves we still carry on, because the
				// only downside is possibly stale `originalContent`. We must not start a
				// competing write here — see the notes in @utils/async-timeout.
				await withTimeoutOrDefault(
					HostProvider.workspace.saveOpenDocumentIfDirty({
						filePath: this.absolutePath!,
					}),
					{},
					{
						label: "刷新已打开的脏文档",
						detail: this.absolutePath,
						timeout: FLUSH_OPEN_DOCUMENT_TIMEOUT,
					},
				)

				const fileBuffer = await fs.readFile(this.absolutePath)
				this.fileEncoding = await detectEncoding(fileBuffer)
				this.originalContent = iconv.decode(fileBuffer, this.fileEncoding)
			} else {
				this.originalContent = ""
				this.fileEncoding = "utf8"
			}
			// for new files, create any necessary directories and keep track of new directories to delete if the user denies the operation
			this.createdDirs = await createDirectoriesForFile(this.absolutePath)
			// make sure the file exists before we open it
			if (!fileExists) {
				await fs.writeFile(this.absolutePath, "")
			}
			// get diagnostics before editing the file, we'll compare to diagnostics after editing to see if cline needs to fix anything
			// Read-only: abandoning this just means we report fewer "new problems" later.
			const preDiagnosticsResponse = await withTimeoutOrDefault(HostProvider.workspace.getDiagnostics({}), undefined, {
				label: "读取编辑前诊断信息",
				timeout: TIMEOUTS.ui,
			})
			this.preDiagnostics = preDiagnosticsResponse?.fileDiagnostics ?? []

			this.isEditing = true
			this.editType = fileExists ? "modify" : "create"
			await this.openDiffEditor()
			await this.scrollEditorToLine(0)
			this.streamedLines = []
		} catch (error) {
			// Roll back any partial state so the provider is clean for the next tool call
			await this.reset().catch((resetError) => {
				Logger.warn("DiffViewProvider.open: reset after failure also failed", resetError)
			})
			throw error
		}
	}

	/**
	 * Opens a diff editor or viewer for the current file.
	 *
	 * Called automatically by the `open` method after ensuring the file exists and
	 * creating any necessary directories.
	 *
	 * @returns A promise that resolves when the diff editor is open and ready
	 */
	protected abstract openDiffEditor(): Promise<void>

	/**
	 * Scrolls the diff editor to reveal a specific line.
	 *
	 * It's used during streaming updates to keep the user's view focused on the changing content.
	 *
	 * @param line The 0-based line number to scroll to
	 */
	protected abstract scrollEditorToLine(line: number): Promise<void>

	/**
	 * Creates a smooth scrolling animation between two lines in the diff editor.
	 *
	 * It's typically used when updates contain many lines, to help the user visually track the flow
	 * of significant changes in the document.
	 *
	 * @param startLine The 0-based line number to begin the animation from
	 * @param endLine The 0-based line number to animate to
	 */
	protected abstract scrollAnimation(startLine: number, endLine: number): Promise<void>

	/**
	 * Removes content from the specified line to the end of the document.
	 * Called after the final update is received.
	 */
	protected abstract truncateDocument(lineNumber: number): Promise<void>

	/**
	 * Returns the current line count of the document being edited.
	 * Used for boundary validation before calling truncateDocument.
	 */
	protected abstract getDocumentLineCount(): Promise<number>

	/**
	 * Safely truncates the document, ensuring the line number is within bounds.
	 * This prevents errors on hosts that strictly validate line numbers (e.g., JetBrains via gRPC).
	 */
	private async safelyTruncateDocument(lineNumber: number): Promise<void> {
		const lineCount = await this.getDocumentLineCount()
		// Only truncate if there's content beyond the specified line
		if (lineNumber < lineCount) {
			await this.truncateDocument(lineNumber)
		}
	}

	/**
	 * Get the contents of the diff editor document.
	 *
	 * Returns undefined if the diff editor was closed.
	 */
	protected abstract getDocumentText(): Promise<string | undefined>

	/**
	 * Get any new diagnostic problems that appeared after applying the diff.
	 *
	 * Getting diagnostics before and after the file edit is a better approach than
	 * automatically tracking problems in real-time. This method ensures we only
	 * report new problems that are a direct result of this specific edit.
	 * Since these are new problems resulting from Cline's edit, we know they're
	 * directly related to the work he's doing. This eliminates the risk of Cline
	 * going off-task or getting distracted by unrelated issues, which was a problem
	 * with the previous auto-debug approach. Some users' machines may be slow to
	 * update diagnostics, so this approach provides a good balance between automation
	 * and avoiding potential issues where Cline might get stuck in loops due to
	 * outdated problem information. If no new problems show up by the time the user
	 * accepts the changes, they can always debug later using the '@problems' mention.
	 * This way, Cline only becomes aware of new problems resulting from his edits
	 * and can address them accordingly. If problems don't change immediately after
	 * applying a fix, Cline won't be notified, which is generally fine since the
	 * initial fix is usually correct and it may just take time for linters to catch up.
	 */
	private async getNewDiagnosticProblems(): Promise<string> {
		// Get the diagnostics after changing the document.
		// Read-only: abandoning this only costs us extra problem reporting, never content.
		const diagnosticsResponse = await withTimeoutOrDefault(HostProvider.workspace.getDiagnostics({}), undefined, {
			label: "读取编辑后诊断信息",
			timeout: TIMEOUTS.ui,
		})
		const postDiagnostics = diagnosticsResponse?.fileDiagnostics ?? []

		const newProblems = getNewDiagnostics(this.preDiagnostics, postDiagnostics)
		// Only including errors since warnings can be distracting (if user wants to fix warnings they can use the @problems mention)
		// will be empty string if no errors
		const problems = await diagnosticsToProblemsString(newProblems, [DiagnosticSeverity.DIAGNOSTIC_ERROR])
		return problems
	}

	/**
	 * Save the contents of the diff editor UI to the file.
	 *
	 * @returns true if the file was saved.
	 */
	protected abstract saveDocument(): Promise<Boolean>

	/**
	 * Closes all open diff views.
	 */
	protected abstract closeAllDiffViews(): Promise<void>

	/**
	 * Cleans up the diff view resources and resets internal state.
	 */
	protected abstract resetDiffView(): Promise<void>

	/**
	 * Switches to a specialized editor for specific file types after final content is available.
	 * Called automatically by the `update` method when `isFinal` is true.
	 *
	 * For example, switches to Jupyter notebook editor for .ipynb files to provide
	 * enhanced editing experience with proper notebook cell rendering.
	 *
	 * Default is no-op. Subclasses can override to provide specialized behavior.
	 */
	protected async switchToSpecializedEditor(): Promise<void> {
		// Default no-op - subclasses can override if needed
	}

	private lastUpdateContentLength = -1
	private lastUpdateTime = 0
	private static readonly UPDATE_THROTTLE_MS = 100 // Throttle updates to max 10/second during streaming

	async update(
		accumulatedContent: string,
		isFinal: boolean,
		changeLocation?: { startLine: number; endLine: number; startChar: number; endChar: number },
	) {
		if (!this.isEditing) {
			throw new Error("Not editing any file")
		}

		// Throttle updates during streaming to prevent performance issues with large files
		// This is especially important for notebooks where streaming can trigger thousands of calls
		if (!isFinal) {
			const now = Date.now()
			const contentLength = accumulatedContent.length
			const timeSinceLastUpdate = now - this.lastUpdateTime

			// Skip if: no content, content unchanged, or throttle period not elapsed
			if (contentLength === 0 || contentLength === this.lastUpdateContentLength) {
				return
			}
			if (timeSinceLastUpdate < DiffViewProvider.UPDATE_THROTTLE_MS) {
				return // Throttle: too soon since last update
			}

			this.lastUpdateContentLength = contentLength
			this.lastUpdateTime = now
		}

		// --- Fix to prevent duplicate BOM ---
		// Strip potential BOM from incoming content. VS Code's `applyEdit` might implicitly handle the BOM
		// when replacing from the start (0,0), and we want to avoid duplication.
		// Final BOM is handled in `saveChanges`.
		if (accumulatedContent.startsWith("\ufeff")) {
			accumulatedContent = accumulatedContent.slice(1) // Remove the BOM character
		}

		this.newContent = accumulatedContent
		const accumulatedLines = accumulatedContent.split("\n")
		if (!isFinal) {
			accumulatedLines.pop() // remove the last partial line only if it's not the final update
		}
		const diffLines = accumulatedLines.slice(this.streamedLines.length)

		// Instead of animating each line, we'll update in larger chunks
		const currentLine = this.streamedLines.length + diffLines.length - 1
		if (currentLine >= 0) {
			// Only proceed if we have new lines

			// Replace all content up to the current line with accumulated lines
			// This is necessary (as compared to inserting one line at a time) to handle cases where html tags
			// on previous lines are auto closed for example
			let contentToReplace = accumulatedLines.slice(0, currentLine + 1).join("\n")
			if (!isFinal) {
				// During streaming, add trailing newline for cursor positioning
				contentToReplace += "\n"
			}

			// For the final update, replace the entire document to prevent concatenation
			// when content doesn't end with a newline. Without this, replacing lines 0-N
			// with content lacking a trailing newline causes line N+1's content to be
			// directly appended to our content (e.g., "Hello World" + "# Old Header" becomes
			// "Hello World# Old Header").
			const endLine = isFinal ? await this.getDocumentLineCount() : currentLine + 1

			const rangeToReplace = { startLine: 0, endLine }
			await this.replaceText(contentToReplace, rangeToReplace, currentLine)

			// Scroll to the actual change location if provided.
			if (changeLocation) {
				// We have the actual location of the change, scroll to it
				const targetLine = changeLocation.startLine
				await this.scrollEditorToLine(targetLine)
			} else {
				// Fallback to the old logic for non-replacement updates
				if (diffLines.length <= 5) {
					// For small changes, just jump directly to the line
					await this.scrollEditorToLine(currentLine)
				} else {
					// For larger changes, create a quick scrolling animation
					const startLine = this.streamedLines.length
					const endLine = currentLine
					await this.scrollAnimation(startLine, endLine)
					// Ensure we end at the final line
					await this.scrollEditorToLine(currentLine)
				}
			}
		}

		// Update the streamedLines with the new accumulated content
		this.streamedLines = accumulatedLines
		if (isFinal) {
			// Handle any remaining lines if the new content is shorter than the original
			await this.safelyTruncateDocument(this.streamedLines.length)
			// Allow subclasses to perform cleanup (e.g., clearing decorations)
			await this.onFinalUpdate()
			// Switch to specialized editor for specific file types (e.g., Jupyter notebooks)
			await this.switchToSpecializedEditor()
		}
	}

	/**
	 * Called after the final update is complete. Subclasses can override to perform cleanup.
	 */
	protected async onFinalUpdate(): Promise<void> {
		// Default no-op
	}

	async showFile(absolutePath: string): Promise<void> {
		await openFile(absolutePath, true)
	}

	/**
	 * Replaces text in the diff editor with the specified content.
	 *
	 * This abstract method must be implemented by subclasses to handle the actual
	 * text replacement in their specific diff editor implementation. It's called
	 * during the streaming update process to progressively show changes.
	 *
	 * @param content The new content to insert into the document
	 * @param rangeToReplace An object specifying the line range to replace
	 * @param currentLine The current line number being edited, used for scroll positioning
	 * @returns A promise that resolves when the text replacement is complete
	 */
	abstract replaceText(
		content: string,
		rangeToReplace: { startLine: number; endLine: number },
		currentLine: number | undefined,
	): Promise<void>

	/**
	 * Checks if the current file is a Jupyter notebook file.
	 *
	 * @returns true if the file has .ipynb extension
	 */
	protected isNotebookFile(): boolean {
		return this.relPath?.toLowerCase().endsWith(".ipynb") ?? false
	}

	/**
	 * Returns the original content sanitized for LLM context.
	 * For notebooks, strips all outputs since they aren't needed for editing.
	 */
	getOriginalContentForLLM(): string | undefined {
		if (this.originalContent === undefined) return undefined
		return this.isNotebookFile() ? sanitizeNotebookForLLM(this.originalContent, true) : this.originalContent
	}

	/**
	 * Default write budget for this edit, widened for large payloads so slow machines
	 * are not punished for big files.
	 */
	private get writeBudget(): OperationTimeout {
		return scaleTimeoutBySize(TIMEOUTS.write, this.newContent?.length)
	}

	/**
	 * Awaits {@link saveDocument} under a write budget and rethrows on timeout.
	 *
	 * Timeouts are fatal on this path: the whole point of the call is to get the user's
	 * content onto disk, so we cannot silently continue claiming success.
	 */
	private async saveDocumentOrThrow(timeout: OperationTimeout): Promise<boolean> {
		const saved = await withTimeout(Promise.resolve(this.saveDocument()), {
			label: "保存文件",
			detail: this.relPath,
			timeout,
		})
		return saved === true
	}

	/**
	 * Same as {@link saveDocumentOrThrow} but reports failure instead of throwing, so
	 * rollback paths can decide for themselves whether it is safe to continue.
	 *
	 * "skipped" means there was nothing dirty to save (a legitimate no-op), while
	 * "timeout" means the save is still running in the background and its outcome is
	 * unknown — callers must treat that very differently from "skipped".
	 */
	private async trySaveDocument(timeout: OperationTimeout): Promise<SaveOutcome> {
		try {
			const saved = await withTimeout(Promise.resolve(this.saveDocument()), {
				label: "保存文件",
				detail: this.relPath,
				timeout,
			})
			return saved === true ? "saved" : "skipped"
		} catch (error) {
			if (error instanceof OperationTimeoutError) {
				return "timeout"
			}
			throw error
		}
	}

	async saveChanges(): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		autoFormattingEdits: string | undefined
		finalContent: string | undefined
	}> {
		// get the contents before save operation which may do auto-formatting
		const preSaveContent = await this.getDocumentText()

		if (!this.relPath || !this.absolutePath || !this.newContent || preSaveContent === undefined) {
			return {
				newProblemsMessage: undefined,
				userEdits: undefined,
				autoFormattingEdits: undefined,
				finalContent: undefined,
			}
		}

		// A-class write: generous budget that grows with the payload. If this fails we
		// throw so the tool reports it and the diff view keeps the content visible for the
		// user to save manually. We never fall back to fs.writeFile — see @utils/async-timeout.
		await this.saveDocumentOrThrow(this.writeBudget)
		// get text after save in case there is any auto-formatting done by the editor
		const postSaveContent = (await this.getDocumentText()) || ""

		// Purely visual follow-ups — abandon them rather than stall the tool result.
		await withTimeoutOrDefault(Promise.resolve(this.showFile(this.absolutePath)), undefined, {
			label: "展示已保存的文件",
			detail: this.absolutePath,
			timeout: TIMEOUTS.ui,
		})
		await withTimeoutOrDefault(Promise.resolve(this.closeAllDiffViews()), undefined, {
			label: "关闭 diff 视图",
			detail: this.absolutePath,
			timeout: TIMEOUTS.ui,
		})

		const newProblems = await this.getNewDiagnosticProblems()
		const newProblemsMessage =
			newProblems.length > 0 ? `\n\nNew problems detected after saving the file:\n${newProblems}` : ""

		// If the edited content has different EOL characters, we don't want to show a diff with all the EOL differences.
		const newContentEOL = this.newContent.includes("\r\n") ? "\r\n" : "\n"
		const normalizedPreSaveContent = preSaveContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL // trimEnd to fix issue where editor adds in extra new line automatically
		const normalizedPostSaveContent = postSaveContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL // this is the final content we return to the model to use as the new baseline for future edits
		// just in case the new content has a mix of varying EOL characters
		const normalizedNewContent = this.newContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL

		let userEdits: string | undefined
		if (normalizedPreSaveContent !== normalizedNewContent) {
			// user made changes before approving edit. let the model know about user made changes (not including post-save auto-formatting changes)
			userEdits = formatResponse.createPrettyPatch(this.relPath.toPosix(), normalizedNewContent, normalizedPreSaveContent)
			// return { newProblemsMessage, userEdits, finalContent: normalizedPostSaveContent }
		} else {
			// no changes to cline's edits
			// return { newProblemsMessage, userEdits: undefined, finalContent: normalizedPostSaveContent }
		}

		let autoFormattingEdits: string | undefined
		if (normalizedPreSaveContent !== normalizedPostSaveContent) {
			// auto-formatting was done by the editor
			autoFormattingEdits = formatResponse.createPrettyPatch(
				this.relPath.toPosix(),
				normalizedPreSaveContent,
				normalizedPostSaveContent,
			)
		}

		// Strip notebook outputs to reduce context size (outputs aren't needed for editing)
		const finalContent = this.isNotebookFile()
			? sanitizeNotebookForLLM(normalizedPostSaveContent, true)
			: normalizedPostSaveContent

		return {
			newProblemsMessage,
			userEdits,
			autoFormattingEdits,
			finalContent,
		}
	}

	/**
	 * Undoes the pending edit: restores the original content of an existing file, or
	 * deletes a file we created.
	 *
	 * @param saveTimeout Optional write budget. Callers tearing down an aborted task pass
	 *                    a shorter budget so that cancelling does not block behind a hung
	 *                    save (which is exactly what made cancel unresponsive before).
	 *
	 * IMPORTANT: this method contains destructive steps (deleting the file, writing the
	 * original content back). If the preceding save cannot be confirmed we bail out
	 * *before* those steps — leaving an unexpected file behind is far safer than
	 * discarding content whose fate we could not determine.
	 */
	async revertChanges(saveTimeout?: OperationTimeout): Promise<void> {
		if (!this.absolutePath || !this.isEditing) {
			return
		}
		const fileExists = this.editType === "modify"
		const budget = saveTimeout ?? this.writeBudget

		try {
			if (!fileExists) {
				// This is a load-bearing save statement- even though the file is saved and then immediately deleted.
				// In vscode, it will not close the diff editor correctly if the file is not saved.
				const outcome = await this.trySaveDocument(budget)
				if (outcome === "timeout") {
					Logger.warn(
						`DiffViewProvider.revertChanges: 保存超时，结果未知，跳过删除以保留现场：${this.absolutePath}`,
					)
					return
				}
				await this.closeAllDiffViews()
				await fs.rm(this.absolutePath, { force: true })
				Logger.log(`File ${this.absolutePath} has been deleted.`)

				// Remove only the directories we created, in reverse order
				for (let i = this.createdDirs.length - 1; i >= 0; i--) {
					try {
						await fs.rmdir(this.createdDirs[i])
						Logger.log(`Directory ${this.createdDirs[i]} has been deleted.`)
					} catch (error) {
						Logger.log(`Could not delete directory ${this.createdDirs[i]}`, error)
					}
				}
			} else {
				// revert document
				// Apply the edit and save, since contents shouldn't have changed this won't show in local history unless of
				// course the user made changes and saved during the edit.
				const contents = (await this.getDocumentText()) || ""
				const lineCount = (contents.match(/\n/g) || []).length + 1
				await this.replaceText(this.originalContent ?? "", { startLine: 0, endLine: lineCount }, undefined)

				const outcome = await this.trySaveDocument(budget)
				if (outcome === "timeout") {
					Logger.warn(
						`DiffViewProvider.revertChanges: 保存超时，结果未知，跳过回滚收尾动作：${this.absolutePath}`,
					)
					return
				}
				Logger.log(`File ${this.absolutePath} has been reverted to its original content.`)
				if (this.documentWasOpen) {
					openFile(this.absolutePath, true)
				}
				await this.closeAllDiffViews()
			}
		} catch (error) {
			// The editor may already be gone (e.g. "User closed text editor"). Don't let
			// that block the state reset below — a poisoned isEditing=true used to break
			// every subsequent file-edit tool call in the task.
			Logger.warn(`DiffViewProvider.revertChanges: ignoring error while reverting ${this.absolutePath}`, error)
		} finally {
			// edit is done — always reset, even when reverting failed
			await this.reset()
		}
	}

	async scrollToFirstDiff() {
		if (!this.isEditing) {
			return
		}
		const currentContent = (await this.getDocumentText()) || ""
		const diffs = diff.diffLines(this.originalContent || "", currentContent)
		let lineCount = 0
		for (const part of diffs) {
			if (part.added || part.removed) {
				// Found the first diff, scroll to it
				this.scrollEditorToLine(lineCount)
				return
			}
			if (!part.removed) {
				lineCount += part.count || 0
			}
		}
	}

	async deleteFile(fileName: string) {
		const fileLocation = this.absolutePath
		if (!fileLocation?.endsWith(fileName) || !this.isEditing) {
			return
		}

		// Close diff views before deleting the file
		await this.closeAllDiffViews()

		// Delete the file
		try {
			await fs.rm(fileLocation, { force: true })
			Logger.log(`File ${fileLocation} has been deleted.`)
		} catch (error) {
			Logger.error(`Failed to delete file ${fileLocation}:`, error)
		}

		this.isEditing = false
		this.newContent = undefined
	}

	// close editor if open?
	async reset() {
		this.isEditing = false
		this.editType = undefined
		this.absolutePath = undefined
		this.relPath = undefined
		this.preDiagnostics = []

		this.originalContent = undefined
		this.fileEncoding = "utf8"
		this.documentWasOpen = false

		this.streamedLines = []
		this.createdDirs = []
		this.newContent = undefined
		this.lastUpdateContentLength = -1
		this.lastUpdateTime = 0

		await this.resetDiffView()
	}
}
