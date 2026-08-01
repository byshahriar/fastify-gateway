/**
 * Uniform body carried by every error response.
 */
export interface ErrorBody {
  error: string;
  requestId: string;
}
