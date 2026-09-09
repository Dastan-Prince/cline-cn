import pTimeout from "p-timeout"
import { Logger } from "@/shared/services/Logger"

/**
 * Timeouts around editor / filesystem operations.
 *
 * ─── IMPORTANT DESIGN CONSTRAINT ────────────────────────────────────────────────
 * A timeout here only detaches the *caller* from the promise. It does NOT cancel the
 * underlying operation: `TextDocument.save()`, `workspace.applyEdit()` and
 * `window.showTextDocument()` expose no cancellation API, so they keep running in the
 * background after we stop waiting for them.
 *
 * Two consequences are baked into every value below:
 *
 *   1. Timeouts must be generous. A slow machine, a large file, or `formatOnSave`
 *      invoking a formatter can legitimately take tens of seconds. Timing out early is
 *      strictly worse than waiting, because we cannot safely recover from a
 *      half-finished write.
 *
 *   2. After timing out we must NOT start a competing write (for example falling back
 *      to `fs.writeFile`, or replaying the same edit). The abandoned operation can
 *      still flush later and interleave with ours. Callers recover by *reporting*,
 *      never by writing again.
 *
 * The values follow the same three-stage pattern already used by the checkpoint
 * subsystem (soft warning -> hard timeout -> give up / disable), scaled up because
 * these operations touch the user's files.
 */

/**
 * Operations are grouped by how destructive it is to "move on early".
 *
 * - `write`: mutates file content through the editor. Abandoning early leaves content
 *   unwritten, which is recoverable, but racing it with another write is not — hence
 *   the long budgets and the "report, don't retry" rule.
 * - `ui`:    read-only or purely visual (diagnostics, revealing a document, closing a
 *   tab). Skipping these is harmless, so they use short budgets.
 * - `cleanup`: teardown while the task is being aborted. The user explicitly asked to
 *   stop, so failing fast is correct — these use the shortest budgets.
 */
export type TimeoutClass = "write" | "ui" | "cleanup"

export interface OperationTimeout {
	/** Log a "still waiting" warning once this has elapsed. */
	slowAfterMs: number
	/** Give up and throw (or fall back) after this has elapsed. */
	hardMs: number
}

/**
 * Default budgets per class.
 *
 * Base devices can be slow enough that even these are tight, so {@link scaleTimeoutBySize}
 * widens `write` budgets for large payloads, and every value can be scaled by callers.
 */
export const TIMEOUTS: Record<TimeoutClass, OperationTimeout> = {
	// Writing through VS Code's editor API.
	write: {
		slowAfterMs: 20_000,
		hardMs: 120_000,
	},
	// Read-only / visual operations — cheap to abandon.
	ui: {
		slowAfterMs: 2_000,
		hardMs: 5_000,
	},
	// Teardown during abort — the user wants out now.
	cleanup: {
		slowAfterMs: 1_000,
		hardMs: 5_000,
	},
}

/**
 * Widens a write budget for large payloads so that slow machines are not punished for
 * working on big files.
 *
 * Allows roughly 1s per additional 50KB (~20ms/KB) on top of the base budget, capped so
 * that a pathological payload cannot pin the caller forever.
 *
 * @param base Starting budget (usually `TIMEOUTS.write`).
 * @param contentLength Characters/bytes being written, if known.
 * @param maxMs Upper bound for the widened budget.
 */
export function scaleTimeoutBySize(base: OperationTimeout, contentLength?: number, maxMs = 300_000): OperationTimeout {
	if (!contentLength || contentLength <= 0) {
		return base
	}
	const extraMs = Math.floor((contentLength / 1024) * 20)
	return {
		slowAfterMs: Math.min(base.slowAfterMs + extraMs, maxMs),
		hardMs: Math.min(base.hardMs + extraMs, maxMs),
	}
}

/**
 * Budget used when abandoning an edit (rejection, failed save, cancellation).
 *
 * Long enough to flush pending content in the common case, short enough that the user is
 * not left waiting behind a save that will never return. If this budget is exceeded the
 * rollback skips its destructive steps rather than racing the still-running save.
 */
export const REVERT_TIMEOUT: OperationTimeout = { slowAfterMs: 10_000, hardMs: 30_000 }

/** Error thrown by {@link withTimeout} once the hard budget elapses. */
export class OperationTimeoutError extends Error {
	constructor(
		public readonly label: string,
		public readonly milliseconds: number,
		detail?: string,
	) {
		super(detail ? `${label} 超时（超过 ${milliseconds}ms）：${detail}` : `${label} 超时（超过 ${milliseconds}ms）`)
		this.name = "OperationTimeoutError"
	}
}

export interface WithTimeoutOptions {
	/** Short description used in logs and errors, e.g. "保存文件". */
	label: string
	/** Extra context appended to logs and errors, e.g. the file path. */
	detail?: string
	/** Hard budget plus soft-warning threshold. Defaults to {@link TIMEOUTS.write}. */
	timeout?: OperationTimeout
	/**
	 * Skip the soft warning. Useful for operations that are *expected* to be slow
	 * (large writes) where the warning would only add noise.
	 */
	disableSlowWarning?: boolean
}

function isTimeoutError(error: unknown): boolean {
	// p-timeout's TimeoutError carries name === "TimeoutError". Matching on name avoids
	// depending on which export shape the installed version uses.
	return error instanceof Error && error.name === "TimeoutError"
}

/**
 * Awaits `promise`, giving up after `timeout.hardMs`.
 *
 * @throws {@link OperationTimeoutError} when the hard budget elapses, or whatever the
 *         underlying promise rejected with.
 */
export async function withTimeout<T>(promise: Promise<T>, options: WithTimeoutOptions): Promise<T> {
	const { label, detail, timeout = TIMEOUTS.write, disableSlowWarning } = options
	const suffix = detail ? ` — ${detail}` : ""
	let warned = false
	let warnTimer: ReturnType<typeof setTimeout> | undefined

	if (!disableSlowWarning && timeout.slowAfterMs > 0 && timeout.slowAfterMs < timeout.hardMs) {
		warnTimer = setTimeout(() => {
			if (warned) {
				return
			}
			warned = true
			Logger.warn(
				`[withTimeout] ${label} 已等待 ${timeout.slowAfterMs}ms，仍在进行中（硬超时 ${timeout.hardMs}ms）${suffix}`,
			)
		}, timeout.slowAfterMs)
	}

	try {
		return await pTimeout(promise, {
			milliseconds: timeout.hardMs,
			message: `${label} timed out after ${timeout.hardMs}ms${suffix}`,
		})
	} catch (error) {
		if (isTimeoutError(error)) {
			const timeoutError = new OperationTimeoutError(label, timeout.hardMs, detail)
			Logger.error(`[withTimeout] ${timeoutError.message}`)
			throw timeoutError
		}
		throw error
	} finally {
		if (warnTimer) {
			clearTimeout(warnTimer)
		}
	}
}

/**
 * Same as {@link withTimeout} but returns `fallback` instead of throwing — used for
 * teardown steps where we deliberately want to keep going.
 *
 * The abandoned promise keeps running in the background; attaching a catch keeps an
 * eventual rejection from surfacing as an unhandled rejection.
 */
export async function withTimeoutOrDefault<T>(
	promise: Promise<T>,
	fallback: T,
	options: WithTimeoutOptions,
): Promise<T> {
	try {
		return await withTimeout(promise, options)
	} catch (error) {
		if (!(error instanceof OperationTimeoutError)) {
			Logger.error(`[withTimeoutOrDefault] ${options.label} 失败：`, error)
		}
		promise.catch(() => {
			// Swallowed: the caller already moved on and the operation is abandoned.
		})
		return fallback
	}
}
