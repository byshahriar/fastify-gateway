import type { ErrorBody } from "@/interfaces";

/**
 * Builds the uniform error body every non-2xx response carries.
 *
 * @param requestId - Request id to correlate the failure with.
 * @param message - Client-safe error message.
 * @returns The response payload.
 */
export function errorBody(requestId: string, message: string): ErrorBody {
  return { error: message, requestId };
}
