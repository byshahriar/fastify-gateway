import { Header } from "@/constants";
import type { AuthStrategy } from "@/types";
import { parseBasicAuthHeader, safeEqual, sendMisconfigured, sendUnauthorized } from "@/utils";

// Fallback comparison target so unknown-user lookups take comparable time.
const DUMMY_PASSWORD = "gateway-timing-equalizer";

// `WWW-Authenticate` challenge sent on failed Basic auth.
const BASIC_CHALLENGE = 'Basic realm="gateway"';

/**
 * Builds the HTTP Basic strategy: clients present `username:password`
 * credentials checked against the configured user list in constant time.
 *
 * @param users - Username-to-password map; an empty map makes the strategy
 *   respond 500 so a misconfigured gateway never allows traffic.
 * @returns The request guard.
 */
export function createBasicAuthStrategy(users: Map<string, string>): AuthStrategy {
  return async (req, reply) => {
    if (users.size === 0) {
      return sendMisconfigured(
        req,
        reply,
        "BASIC_AUTH_USERS is not set but a route requires it",
      );
    }

    const credentials = parseBasicAuthHeader(req.headers[Header.Authorization]);
    const expected = credentials ? users.get(credentials.username) : undefined;
    // Operand order is security-critical: always run safeEqual (against a
    // dummy when the user is unknown) and only then check that the user
    // existed, so timing does not reveal whether a username is valid. Do not
    // reorder to short-circuit on `expected !== undefined`.
    const authorized =
      credentials !== null &&
      safeEqual(credentials.password, expected ?? DUMMY_PASSWORD) &&
      expected !== undefined;

    if (!authorized) {
      reply.header(Header.WwwAuthenticate, BASIC_CHALLENGE);
      return sendUnauthorized(req, reply);
    }
  };
}
