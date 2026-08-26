import * as vscode from "vscode"
import path from "node:path"
import { Logger } from "@/shared/services/Logger"

/**
 * One-time migration of the extension's globalStorage directory from the old
 * fork extension id (`Dastan-Prince.cline-cn`) to the current one
 * (`dastan-prince.cline-cn-ai`). Preserves settings/state/tasks/checkpoints
 * for users upgrading from the previous fork release. Failures are logged and
 * will retry on the next startup.
 */
export async function migrateGlobalStorageIfNeeded(context: vscode.ExtensionContext): Promise<void> {
	const MIGRATION_SENTINEL = "__globalStorageRenameMigrated"
	Logger.info(`[Migration] migrateGlobalStorageIfNeeded called`)

	const sentinelValue = context.globalState.get<boolean>(MIGRATION_SENTINEL)
	Logger.info(`[Migration] Sentinel value: ${sentinelValue}`)
	if (sentinelValue) {
		Logger.info(`[Migration] Already migrated, skipping`)
		return
	}

	const fsSync = await import("node:fs")
	const fsPromises = await import("node:fs/promises")
	const newPath = context.globalStorageUri.fsPath
	Logger.info(`[Migration] New globalStorage path: ${newPath}`)

	// Only proceed if this is the cline-cn-ai extension (case-insensitive check)
	if (!newPath.toLowerCase().includes("dastan-prince.cline-cn-ai")) {
		Logger.info(`[Migration] Path does not include 'cline-cn-ai', skipping migration. Actual path: ${newPath}`)
		await context.globalState.update(MIGRATION_SENTINEL, true)
		return
	}

	// Compute old extension's storage path (case-insensitive replace)
	const oldPath = newPath.replace(/dastan-prince\.cline-cn-ai/i, "Dastan-Prince.cline-cn")
	Logger.info(`[Migration] Computed old path: ${oldPath}`)
	if (oldPath.toLowerCase() === newPath.toLowerCase()) {
		Logger.info(`[Migration] Old path equals new path, skipping migration`)
		await context.globalState.update(MIGRATION_SENTINEL, true)
		return
	}

	// Check if new path already has data
	const newPathExists = fsSync.existsSync(newPath)
	Logger.info(`[Migration] New path exists: ${newPathExists}`)

	// No old data to migrate
	const oldPathExists = fsSync.existsSync(oldPath)
	Logger.info(`[Migration] Old path exists: ${oldPathExists}`)
	if (!oldPathExists) {
		Logger.info(`[Migration] No old data found at ${oldPath}, skipping migration`)
		await context.globalState.update(MIGRATION_SENTINEL, true)
		return
	}

	// Log contents of old directory
	try {
		const oldEntries = fsSync.readdirSync(oldPath)
		Logger.info(`[Migration] Old path contents: [${oldEntries.join(", ")}]`)
	} catch (e) {
		Logger.warn(`[Migration] Could not read old path contents: ${e}`)
	}

	// If new path doesn't exist yet, try renaming the entire old directory to new
	if (!newPathExists) {
		try {
			Logger.info(`[Migration] New path does not exist, renaming entire directory: ${oldPath} → ${newPath}`)
			await fsPromises.rename(oldPath, newPath)
			Logger.info(`[Migration] Successfully renamed: ${oldPath} → ${newPath}`)
			await context.globalState.update(MIGRATION_SENTINEL, true)
			Logger.info("[Migration] Global storage migration completed successfully (directory renamed)")
			return
		} catch (error) {
			// Rename may fail on Windows if files are locked by VS Code (e.g. state.vscdb)
			// Fall through to per-directory copy/move strategy below
			const errMsg = error instanceof Error ? error.message : String(error)
			Logger.warn(`[Migration] Rename failed (${errMsg}), falling back to per-directory migration`)
		}
	} else {
		Logger.info(`[Migration] New path already exists, using per-directory migration`)
	}

	// Log contents of new directory
	try {
		const newEntries = fsSync.readdirSync(newPath)
		Logger.info(`[Migration] New path contents: [${newEntries.join(", ")}]`)
	} catch (e) {
		Logger.warn(`[Migration] Could not read new path contents: ${e}`)
	}

	// Directories to copy (preserve old data for safety)
	const COPY_DIRS = ["settings", "state", "tasks"]
	// Directories to move (cut to save disk space — checkpoints can be large)
	const MOVE_DIRS = ["checkpoints"]

	let hasErrors = false

	for (const dir of COPY_DIRS) {
		const srcDir = path.join(oldPath, dir)
		const destDir = path.join(newPath, dir)
		const srcExists = fsSync.existsSync(srcDir)
		const destExists = fsSync.existsSync(destDir)
		Logger.info(`[Migration] Copy dir '${dir}': srcExists=${srcExists}, destExists=${destExists}`)
		if (srcExists && !destExists) {
			try {
				await fsPromises.mkdir(path.dirname(destDir), { recursive: true })
				await fsPromises.cp(srcDir, destDir, { recursive: true })
				Logger.info(`[Migration] Copied: ${srcDir} → ${destDir}`)
			} catch (error) {
				Logger.error(`[Migration] Failed to copy ${dir}:`, error)
				hasErrors = true
			}
		} else if (srcExists && destExists) {
			Logger.info(`[Migration] Skipping copy '${dir}': destination already exists`)
		} else {
			Logger.info(`[Migration] Skipping copy '${dir}': source does not exist`)
		}
	}

	for (const dir of MOVE_DIRS) {
		const srcDir = path.join(oldPath, dir)
		const destDir = path.join(newPath, dir)
		const srcExists = fsSync.existsSync(srcDir)
		const destExists = fsSync.existsSync(destDir)
		Logger.info(`[Migration] Move dir '${dir}': srcExists=${srcExists}, destExists=${destExists}`)
		if (srcExists && !destExists) {
			try {
				await fsPromises.mkdir(path.dirname(destDir), { recursive: true })
				await fsPromises.rename(srcDir, destDir)
				Logger.info(`[Migration] Moved: ${srcDir} → ${destDir}`)
			} catch (error) {
				Logger.error(`[Migration] Failed to move ${dir}:`, error)
				hasErrors = true
			}
		} else if (srcExists && destExists) {
			Logger.info(`[Migration] Skipping move '${dir}': destination already exists`)
		} else {
			Logger.info(`[Migration] Skipping move '${dir}': source does not exist`)
		}
	}

	if (!hasErrors) {
		await context.globalState.update(MIGRATION_SENTINEL, true)
		Logger.info("[Migration] Global storage migration completed successfully")
	} else {
		Logger.warn("[Migration] Global storage migration completed with errors — will retry next startup")
	}
}
