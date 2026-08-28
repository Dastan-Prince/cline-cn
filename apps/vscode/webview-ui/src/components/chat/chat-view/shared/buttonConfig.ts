import type { ClineMessage, ClineSayTool, TurnState } from "@shared/ExtensionMessage"
import type { Mode } from "@shared/storage/types"
import { ClineError, ClineErrorType } from "../../../../../../src/services/error/ClineError"

/**
 * Button action types that determine the behavior
 */
export type ButtonActionType =
	| "approve" // Send yesButtonClicked
	| "reject" // Send noButtonClicked
	| "proceed" // Send messageResponse or yesButtonClicked
	| "proceed_while_running" // Detach the running foreground terminal command
	| "new_task" // Start a new task
	| "cancel" // Cancel streaming
	| "utility" // Execute utility function (condense, report_bug)
	| "retry" // Retry the last action

/**
 * Button configuration for different message states
 */
export interface ButtonConfig {
	sendingDisabled: boolean
	enableButtons: boolean
	primaryTextKey?: string
	secondaryTextKey?: string
	primaryAction?: ButtonActionType
	secondaryAction?: ButtonActionType
}

/**
 * Centralized button state configurations based on task lifecycle
 * This is the single source of truth for both button display and actions
 */
export const BUTTON_CONFIGS: Record<string, ButtonConfig> = {
	// Error recovery states - user must take action
	api_req_failed: {
		sendingDisabled: true,
		enableButtons: true,
		primaryTextKey: "chatRow.retry",
		secondaryTextKey: "chatRow.startNewTask",
		primaryAction: "retry",
		secondaryAction: "new_task",
	},
	mistake_limit_reached: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.proceedAnyways",
		secondaryTextKey: "chatRow.startNewTask",
		primaryAction: "proceed",
		secondaryAction: "new_task",
	},
	// Resumable failure (v3 parity): the conversation is intact and the run can be continued in
	// place — a dropped stream, provider 5xx, a misconfigured/retired model, a rate limit… Offer
	// Resume Task with Start New Task as the escape hatch.
	resume_after_error: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.resumeTask",
		secondaryTextKey: "chatRow.startNewTask",
		primaryAction: "proceed",
		secondaryAction: "new_task",
	},

	// Tool approval states - most common during task execution
	tool_approve: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.approve",
		secondaryTextKey: "chatRow.reject",
		primaryAction: "approve",
		secondaryAction: "reject",
	},
	tool_save: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.save",
		secondaryTextKey: "chatRow.reject",
		primaryAction: "approve",
		secondaryAction: "reject",
	},

	// Command execution states
	command: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.runCommand",
		secondaryTextKey: "chatRow.reject",
		primaryAction: "approve",
		secondaryAction: "reject",
	},
	command_output: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.proceedWhileRunning",
		secondaryTextKey: undefined,
		primaryAction: "proceed",
		secondaryAction: undefined,
	},

	// Browser and external tool states
	browser_action_launch: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.approve",
		secondaryTextKey: "chatRow.reject",
		primaryAction: "approve",
		secondaryAction: "reject",
	},
	use_mcp_server: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.approve",
		secondaryTextKey: "chatRow.reject",
		primaryAction: "approve",
		secondaryAction: "reject",
	},
	use_subagents: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.approve",
		secondaryTextKey: "chatRow.reject",
		primaryAction: "approve",
		secondaryAction: "reject",
	},
	followup: {
		sendingDisabled: false,
		enableButtons: false,
		primaryTextKey: undefined,
		secondaryTextKey: undefined,
		primaryAction: undefined,
		secondaryAction: undefined,
	},
	plan_mode_respond: {
		sendingDisabled: false,
		enableButtons: false,
		primaryTextKey: undefined,
		secondaryTextKey: undefined,
		primaryAction: undefined,
		secondaryAction: undefined,
	},

	// Task lifecycle states
	completion_result: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.startNewTask",
		secondaryTextKey: undefined,
		primaryAction: "new_task",
		secondaryAction: undefined,
	},
	resume_task: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.resumeTask",
		secondaryTextKey: undefined,
		primaryAction: "proceed",
		secondaryAction: undefined,
	},
	resume_completed_task: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.startNewTask",
		secondaryTextKey: undefined,
		primaryAction: "new_task",
		secondaryAction: undefined,
	},
	new_task: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.startNewTaskWithContext",
		secondaryTextKey: undefined,
		primaryAction: "new_task",
		secondaryAction: undefined,
	},

	// Utility states
	condense: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.condense",
		secondaryTextKey: undefined,
		primaryAction: "utility",
		secondaryAction: undefined,
	},
	report_bug: {
		sendingDisabled: false,
		enableButtons: true,
		primaryTextKey: "chatRow.reportBug",
		secondaryTextKey: undefined,
		primaryAction: "utility",
		secondaryAction: undefined,
	},

	// Streaming/partial states - disable interaction during streaming
	partial: {
		sendingDisabled: true,
		enableButtons: true,
		primaryTextKey: undefined,
		secondaryTextKey: "chatRow.cancel",
		primaryAction: undefined,
		secondaryAction: "cancel",
	},

	// A foreground terminal command is running (SDK path): the user can detach
	// it and let the agent proceed with the partial output, or cancel the task.
	foreground_command_running: {
		sendingDisabled: true,
		enableButtons: true,
		primaryTextKey: "chatRow.proceedWhileRunning",
		secondaryTextKey: "chatRow.cancel",
		primaryAction: "proceed_while_running",
		secondaryAction: "cancel",
	},

	// Default states
	default: {
		sendingDisabled: false,
		enableButtons: false,
		primaryTextKey: undefined,
		secondaryTextKey: undefined,
		primaryAction: undefined,
		secondaryAction: undefined,
	},
	api_req_active: {
		sendingDisabled: true,
		enableButtons: true,
		primaryTextKey: undefined,
		secondaryTextKey: "chatRow.cancel",
		primaryAction: undefined,
		secondaryAction: "cancel",
	},
}

const errorTypes = ["api_req_failed", "mistake_limit_reached"]

/**
 * Error types that resuming cannot fix — the account itself has to change first (top up credits,
 * sign in, raise a spend/quota limit). For these the footer keeps Retry + Start New Task so
 * ErrorRow's Sign In / Add Credits / quota affordances stay reachable; swapping in "Resume Task"
 * there would bury the very UI the user needs.
 *
 * RateLimit is deliberately absent: it is transient, and ErrorRow renders it as plain text with
 * no account UI, so resuming loses nothing.
 */
const ACCOUNT_BLOCKED_ERROR_TYPES: ClineErrorType[] = [
	ClineErrorType.Auth,
	ClineErrorType.Balance,
	ClineErrorType.SpendLimit,
	ClineErrorType.QuotaExceeded,
	ClineErrorType.Entitlement,
	ClineErrorType.OrgClinePassRestriction,
	ClineErrorType.ClinePassLimit,
	ClineErrorType.ClineFreeModelLimit,
	ClineErrorType.ClineFreePromotionEnded,
]

/**
 * True when the anchored error must be resolved in ErrorRow before the run can continue.
 *
 * Error text that is absent or not serialized ClineError JSON yields no known type and is
 * therefore resumable — the safe default that keeps the transcript reachable instead of
 * stranding the user behind a Retry button that cannot help.
 */
function isAccountBlockedError(anchoredMessage: ClineMessage | undefined): boolean {
	if (anchoredMessage?.type !== "ask" || anchoredMessage.ask !== "api_req_failed") {
		return false
	}
	const clineError = ClineError.parse(anchoredMessage.text)
	if (!clineError) {
		return false
	}
	return ACCOUNT_BLOCKED_ERROR_TYPES.some((type) => clineError.isErrorType(type))
}

/**
 * Determines button configuration based on message type and state
 * This is the single source of truth used by both ActionButtons and useMessageHandlers
 */
export function getButtonConfig(message: ClineMessage | undefined, _mode: Mode = "act"): ButtonConfig {
	if (!message) {
		return BUTTON_CONFIGS.default
	}

	const isStreaming = message.partial === true
	const isError = message?.ask ? errorTypes.includes(message.ask) : false

	// Special case: command_output should show "Proceed While Running" button even while streaming
	// This allows terminal output to stream while still showing the action button
	if (message.type === "ask" && message.ask === "command_output") {
		return BUTTON_CONFIGS.command_output
	}

	// Handle partial/streaming messages first (most common during task execution)
	// This must be checked before any other conditions to ensure streaming state takes precedence
	if (isStreaming && !isError) {
		return BUTTON_CONFIGS.partial
	}

	// Handle ask messages (user interaction required)
	if (message.type === "ask") {
		switch (message.ask) {
			// Error recovery states
			case "api_req_failed":
				return BUTTON_CONFIGS.api_req_failed
			case "mistake_limit_reached":
				return BUTTON_CONFIGS.mistake_limit_reached

			// Tool approval (most common)
			case "tool": {
				// Only parse JSON if we need to determine save vs approve
				try {
					const tool = JSON.parse(message.text || "{}") as ClineSayTool
					if (tool.tool === "editedExistingFile" || tool.tool === "newFileCreated" || tool.tool === "fileDeleted") {
						return BUTTON_CONFIGS.tool_save
					}
				} catch {
					// Fall through to default tool approval
				}
				return BUTTON_CONFIGS.tool_approve
			}

			// Command execution
			case "command":
				return BUTTON_CONFIGS.command
			case "command_output":
				return BUTTON_CONFIGS.command_output

			// Standard approvals
			case "followup":
				return BUTTON_CONFIGS.followup
			case "browser_action_launch":
				return BUTTON_CONFIGS.browser_action_launch
			case "use_mcp_server":
				return BUTTON_CONFIGS.use_mcp_server
			case "use_subagents":
				return BUTTON_CONFIGS.use_subagents
			case "plan_mode_respond":
				return BUTTON_CONFIGS.plan_mode_respond

			// Task lifecycle
			case "completion_result":
				return BUTTON_CONFIGS.completion_result
			case "resume_task":
				return BUTTON_CONFIGS.resume_task
			case "resume_completed_task":
				return BUTTON_CONFIGS.resume_completed_task
			case "new_task":
				return BUTTON_CONFIGS.new_task

			// Utility
			case "condense":
				return BUTTON_CONFIGS.condense
			case "report_bug":
				return BUTTON_CONFIGS.report_bug

			default:
				return BUTTON_CONFIGS.tool_approve
		}
	}

	// Handle say messages (typically don't require buttons except in special cases)
	if (message.type === "say" && message.say === "api_req_started") {
		return BUTTON_CONFIGS.api_req_active
	}

	// Special case: command_output say messages should show "Proceed While Running" button
	// This allows terminal output to stream while still showing the action button
	if (message.type === "say" && message.say === "command_output") {
		return BUTTON_CONFIGS.command_output
	}

	return BUTTON_CONFIGS.partial
}

function isInertStatusMessage(message: ClineMessage): boolean {
	if (message.type !== "say") {
		return false
	}

	if (message.say === "api_req_started") {
		try {
			const info = JSON.parse(message.text || "{}")
			return info.cost != null || info.cancelReason != null || info.streamingFailedMessage != null
		} catch {
			return false
		}
	}

	return ["api_req_finished", "deleted_api_reqs", "mcp_server_request_started", "subagent_usage", "task_progress"].includes(
		message.say || "",
	)
}

/**
 * Finds the message that should control footer buttons.
 *
 * The raw stream can append bookkeeping/status messages after an approval ask
 * (for example API usage updates or MCP request-start markers). Those rows are
 * filtered out of the visible chat, but using the raw last message would hide
 * Approve/Reject and leave the user stuck. Prefer the last non-inert message.
 */
export function getButtonConfigForMessages(messages: ClineMessage[], mode: Mode = "act"): ButtonConfig {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index]
		if (!isInertStatusMessage(message)) {
			return getButtonConfig(message, mode)
		}
	}

	return BUTTON_CONFIGS.default
}

/**
 * Authoritative button configuration derived from the backend-owned TurnState. This is the
 * preferred path: the UI mode is read from `turnState.phase`, never inferred from the tail of
 * the message array.
 *
 * The button SET is chosen by phase; the LABEL/variant for approvals (Save vs Approve, command
 * vs tool vs MCP vs subagents) comes from the anchored message (turnState.anchorTs).
 */
export function buttonsForPhase(
	turnState: TurnState,
	anchoredMessage: ClineMessage | undefined,
	foregroundCommandRunning = false,
): ButtonConfig {
	switch (turnState.phase) {
		case "idle":
			return BUTTON_CONFIGS.default
		case "streaming":
			// A running foreground terminal command offers "Proceed While Running":
			// detach the command (output continues to a log file) and let the
			// agent continue with the partial output.
			return foregroundCommandRunning ? BUTTON_CONFIGS.foreground_command_running : BUTTON_CONFIGS.partial
		case "completed":
			return BUTTON_CONFIGS.completion_result
		case "resumable":
			return BUTTON_CONFIGS.resume_task
		case "error": {
			// Split the error phase by what the user can actually do next.
			// - mistake_limit_reached: Proceed / Start New Task (unchanged).
			// - Account-blocked failure (auth, balance, spend/quota limit, entitlement, Cline
			//   Pass restrictions): the account must be fixed in ErrorRow's Sign In / Add
			//   Credits UI first, so keep Retry + Start New Task.
			// - Everything else (dropped stream, provider 5xx, bad model, rate limit, or no
			//   anchored ask at all): the transcript is intact and resumable, so offer Resume
			//   Task — the v3 behaviour — with Start New Task as the escape hatch. Turns that
			//   error without emitting an ask row (send error, auto-continue failure, resume
			//   failure) carry no anchor and land here.
			if (anchoredMessage?.type === "ask" && anchoredMessage.ask === "mistake_limit_reached") {
				return BUTTON_CONFIGS.mistake_limit_reached
			}
			if (isAccountBlockedError(anchoredMessage)) {
				return BUTTON_CONFIGS.api_req_failed
			}
			return BUTTON_CONFIGS.resume_after_error
		}
		case "awaiting_followup":
			// followup / plan_mode_respond — input enabled, no approve/reject buttons. (If the
			// anchored message is a recognized ask, defer to its config for correct labels.)
			return anchoredMessage ? getButtonConfig(anchoredMessage, "act") : BUTTON_CONFIGS.followup
		case "awaiting_approval":
			// Approve/Reject (or Run Command / Save / etc.) — driven by the anchored ask so the
			// labels match the tool kind. Falls back to generic tool approval.
			return anchoredMessage ? getButtonConfig(anchoredMessage, "act") : BUTTON_CONFIGS.tool_approve
		default:
			return BUTTON_CONFIGS.default
	}
}

/**
 * Single entry point for button config. Uses the authoritative TurnState when present (SDK
 * path); otherwise falls back to the legacy tail-walking heuristic (classic/older state).
 */
export function getButtonConfigFromState(
	messages: ClineMessage[],
	turnState: TurnState | undefined,
	mode: Mode = "act",
	foregroundCommandRunning = false,
): ButtonConfig {
	if (turnState) {
		const anchored = turnState.anchorTs !== undefined ? messages.find((m) => m.ts === turnState.anchorTs) : undefined
		return buttonsForPhase(turnState, anchored, foregroundCommandRunning)
	}
	return getButtonConfigForMessages(messages, mode)
}
