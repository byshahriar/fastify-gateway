import { HttpStatus } from "@/constants";
import { AlertLevel } from "@/enums";

/**
 * Lowest status code that triggers an alert at the given level.
 *
 * @param level - The configured alert level.
 * @returns `400` for `warn` (4xx + 5xx), otherwise `500` (5xx only).
 */
export function alertThreshold(level: string): number {
  return level === AlertLevel.Warn ? HttpStatus.BadRequest : HttpStatus.InternalServerError;
}

/**
 * Severity label for an alerting status code.
 *
 * @param statusCode - The response status.
 * @returns `"error"` for 5xx, `"warning"` for a lower alerting status.
 */
export function severityForStatus(statusCode: number): "error" | "warning" {
  return statusCode >= HttpStatus.InternalServerError ? "error" : "warning";
}
