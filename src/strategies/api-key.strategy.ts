import { Header } from "@/constants";
import type { AuthStrategy } from "@/types";
import { safeEqual, sendMisconfigured, sendUnauthorized } from "@/utils";

/**
 * Builds the API key strategy: clients present the shared secret in the
 * `x-api-key` header, compared in constant time.
 *
 * @param apiKey - The configured shared secret; an empty value makes the
 *   strategy respond 500 so a misconfigured gateway never allows traffic.
 * @returns The request guard.
 */
export function createApiKeyStrategy(apiKey: string): AuthStrategy {
  return async (req, reply) => {
    if (!apiKey) {
      return sendMisconfigured(
        req,
        reply,
        "GATEWAY_API_KEY is not set but a route requires it",
      );
    }

    const provided = req.headers[Header.ApiKey];
    if (typeof provided !== "string" || !safeEqual(provided, apiKey)) {
      return sendUnauthorized(req, reply);
    }
  };
}
