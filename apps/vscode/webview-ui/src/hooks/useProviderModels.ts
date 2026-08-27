import { ResolveProviderModelsRequest } from "@shared/proto/cline/models"
import { useCallback, useEffect } from "react"
import { type ProviderId, useExtensionState } from "@/context/ExtensionStateContext"
import { ModelsServiceClient } from "@/services/grpc-client"

let providerModelRequestCounter = 0

function createRequestId(): string {
	providerModelRequestCounter += 1
	return `provider-models-${providerModelRequestCounter}`
}

export interface UseProviderModelsOptions {
	/**
	 * Fetch the provider model list on mount. Defaults to true. Providers
	 * without a dynamic model catalog (e.g. generic compatible endpoints where
	 * users type a custom model id) pass false to skip the pointless request
	 * and the "Loading models…" placeholder it drives.
	 */
	readonly autoFetch?: boolean
}

/**
 * Read-only provider model-list hook backed by the unified provider catalog RPC.
 *
 * This hook never writes model selection state; selection commits are owned by
 * useProviderConfig/commitModelSelection.
 */
export function useProviderModels(providerId: ProviderId, options?: UseProviderModelsOptions) {
	const { providerModelsByProvider, startProviderModelsRequest, applyProviderModelsResponse } = useExtensionState()
	const autoFetch = options?.autoFetch ?? true
	const state = providerModelsByProvider?.[providerId]

	const refresh = useCallback(async () => {
		const requestId = createRequestId()
		startProviderModelsRequest(providerId, requestId)
		try {
			const response = await ModelsServiceClient.resolveProviderModels(
				ResolveProviderModelsRequest.create({ providerId, forceRefresh: true, requestId }),
			)
			applyProviderModelsResponse(response)
		} catch (error) {
			applyProviderModelsResponse({
				providerId,
				requestId,
				configFingerprint: "",
				fetchedAt: Date.now(),
				ok: false,
				models: {},
				error: {
					kind: "unknown",
					message: error instanceof Error ? error.message : String(error),
				},
			})
		}
	}, [applyProviderModelsResponse, providerId, startProviderModelsRequest])

	useEffect(() => {
		if (!autoFetch) {
			return
		}
		void refresh()
	}, [autoFetch, refresh])

	return {
		models: state?.models ?? {},
		defaultModelId: state?.defaultModelId ?? "",
		isLoading: state?.isLoading ?? false,
		isStale: state?.isStale ?? false,
		error: state?.error,
		refresh,
		fingerprint: state?.configFingerprint ?? "",
	}
}
