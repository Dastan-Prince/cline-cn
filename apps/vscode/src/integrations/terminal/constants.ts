/**
 * Terminal Constants
 *
 * Central location for all terminal-related constants.
 * This makes it easy to understand and tune terminal behavior.
 */

// =============================================================================
// Process "Hot" State Timeouts
// =============================================================================
// How long to wait after output before considering the process "cool"
// This stalls API requests to let terminal output settle

/** Normal timeout after last output (2 seconds) */
export const PROCESS_HOT_TIMEOUT_NORMAL = 2_000

/** Extended timeout for compilation/build commands (15 seconds) */
export const PROCESS_HOT_TIMEOUT_COMPILING = 15_000

// =============================================================================
// Output Buffering (CommandOrchestrator)
// =============================================================================
// Controls how output is chunked and sent to the UI

/** Lines to buffer before flushing to UI */
export const CHUNK_LINE_COUNT = 20

/** Bytes to buffer before flushing to UI */
export const CHUNK_BYTE_SIZE = 2048 // 2KB

/** Debounce time for buffer flush */
export const CHUNK_DEBOUNCE_MS = 100

/** Timeout to detect stuck buffer */
export const BUFFER_STUCK_TIMEOUT_MS = 6000 // 6 seconds

/** Timeout to detect stuck completion */
export const COMPLETION_TIMEOUT_MS = 6000 // 6 seconds

// =============================================================================
// Large Output Protection
// =============================================================================
// Prevents memory exhaustion and context window overflow

/** Switch to file-based logging after this many lines */
export const MAX_LINES_BEFORE_FILE = 1000

/** Switch to file-based logging after this many bytes */
export const MAX_BYTES_BEFORE_FILE = 512 * 1024 // 512KB

/** Lines to keep at start/end for summary when truncating */
export const SUMMARY_LINES_TO_KEEP = 100

/** Maximum size for fullOutput storage (memory protection) */
export const MAX_FULL_OUTPUT_SIZE = 1024 * 1024 // 1MB

/** Maximum lines to return from getUnretrievedOutput */
export const MAX_UNRETRIEVED_LINES = 500

/** Lines to keep at start/end when truncating unretrieved output */
export const TRUNCATE_KEEP_LINES = 100

// =============================================================================
// Output Line Limits (processOutput)
// =============================================================================
// Controls truncation when returning output to AI

/** Default max lines for command output */
export const DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT = 500

// =============================================================================
// Background Command Tracking
// =============================================================================
// Controls background command behavior for "Proceed While Running"

/** Hard timeout for background commands to prevent zombie processes (10 minutes) */
export const BACKGROUND_COMMAND_TIMEOUT_MS = 10 * 60 * 1000

// =============================================================================
// Markerless Shell Integration Fallback
// =============================================================================
// When shell integration is attached but not emitting OSC 633 markers (e.g.
// the user ssh'd from the terminal so commands run in a remote shell), the
// execution's read() stream never ends. These bound how long we wait before
// falling back to prompt-heuristic completion. Once the CommandExecuted (C)
// marker is seen, shell integration is trusted and these do not apply.

/** How long to wait for the first data before checking for markerless completion (10 seconds) */
export const MARKERLESS_FIRST_DATA_TIMEOUT = 10_000

/** Idle gap between data chunks that triggers a prompt-heuristic check (3 seconds) */
export const MARKERLESS_IDLE_TIMEOUT = 3_000

/** Quiet time after which a markerless command is considered done even without a prompt (30 seconds) */
export const MARKERLESS_MAX_QUIET_TIME = 30_000

// =============================================================================
// Marker-Seen Idle Detection (post ]633;C)
// =============================================================================
// Once the C marker is seen, shell integration is working for this shell and
// is trusted to delimit the command end via the D marker or stream end. There
// is deliberately NO time-based force-completion after C: a command that stays
// silent for a long time (installs, builds, downloads) is still running until
// a real completion signal arrives — the D marker, the end event, or the next
// shell prompt (either its text, e.g. "PS C:\path>", or the ]633;A marker).
// The idle timeout below only controls how often we re-check for a prompt.

/** Idle gap between data chunks after the C marker was seen that triggers a prompt check (10 seconds) */
export const MARKER_EXECUTION_IDLE_TIMEOUT = 10_000

// =============================================================================
// Fresh Terminal Grace Delay
// =============================================================================
// vscode.window.createTerminal() returns immediately while the pty/shell may
// still be starting, and the shellIntegration API property can be exposed
// before the shell profile has fully loaded (notably on Windows/PowerShell,
// where the integration script runs early but conda/nvm/starship init output
// follows). Executing a command in that window can interleave OSC 633 markers
// with profile output and lose the D (completion) marker, hanging the read
// stream. A short grace delay after the API appears lets the profile finish
// and the prompt stabilize. Only applies to the first command on a freshly
// created terminal; reused warm terminals are unaffected.

/** Grace delay before the first command runs on a fresh terminal (500ms) */
export const FRESH_TERMINAL_GRACE_DELAY_MS = 500

// =============================================================================
// Exit Code Event Race
// =============================================================================
// onDidEndTerminalShellExecution fires asynchronously after the read() stream
// completes. We await it with a bounded race so a command whose shell
// integration never reports completion doesn't hang indefinitely.

/** How long to wait for onDidEndTerminalShellExecution after the stream ends (3 seconds) */
export const EXIT_CODE_EVENT_TIMEOUT_MS = 3_000

// =============================================================================
// Compilation Detection Markers
// =============================================================================
// Used to detect if a command is compiling/building

/** Markers that indicate compilation is starting */
export const COMPILING_MARKERS = ["compiling", "building", "bundling", "transpiling", "generating", "starting"]

/** Markers that indicate compilation is done (nullify extended timeout) */
export const COMPILING_NULLIFIERS = [
	"compiled",
	"success",
	"finish",
	"complete",
	"succeed",
	"done",
	"end",
	"stop",
	"exit",
	"terminate",
	"error",
	"fail",
]

/**
 * Check if terminal output indicates compilation/building.
 * Matches markers anywhere in the output.
 */
export function isCompilingOutput(data: string): boolean {
	const lowerData = data.toLowerCase()
	const hasMarker = COMPILING_MARKERS.some((marker) => lowerData.includes(marker.toLowerCase()))
	const hasNullifier = COMPILING_NULLIFIERS.some((nullifier) => lowerData.includes(nullifier.toLowerCase()))
	return hasMarker && !hasNullifier
}
