/**
 * Uniform body carried by every error response.
 */
export interface ErrorBody {
  /**
   * Client-safe message; never exposes internal details for 5xx responses.
   */
  error: string;
  /**
   * Request id for correlation with server-side logs.
   */
  requestId: string;
}
