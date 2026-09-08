import { Component, type ErrorInfo, type ReactNode } from "react"

interface ChatRowErrorBoundaryProps {
	children: ReactNode
}

interface ChatRowErrorBoundaryState {
	error: Error | null
}

/**
 * Catches render-time exceptions from a single chat row (or tool group / browser session group)
 * so one malformed persisted message can never blank the entire webview ("white screen of death").
 * Renders a compact, non-interactive error placeholder instead, and auto-recovers when the
 * underlying message content is repaired/updated upstream.
 */
export class ChatRowErrorBoundary extends Component<ChatRowErrorBoundaryProps, ChatRowErrorBoundaryState> {
	override state: ChatRowErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): ChatRowErrorBoundaryState {
		return { error }
	}

	override componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[Cline] Chat row render error:", error, info.componentStack)
	}

	override componentDidUpdate(prevProps: ChatRowErrorBoundaryProps) {
		// Auto-recover when the underlying children are updated (e.g. partial message completed
		// or a previously poisoned message was repaired). If the content is still broken the
		// error is simply caught again on the next render.
		if (this.state.error && prevProps.children !== this.props.children) {
			this.setState({ error: null })
		}
	}

	override render() {
		if (this.state.error) {
			return (
				<div
					className="flex items-center gap-2 py-2 px-3 my-1 bg-quote rounded-sm text-[12px] text-description"
					role="alert">
					<i className="codicon codicon-error text-error shrink-0" />
					<span className="flex-1 min-w-0 break-words">{`此消息渲染出错：${this.state.error.message}`}</span>
				</div>
			)
		}
		return this.props.children
	}
}
