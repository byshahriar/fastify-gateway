import fp from "fastify-plugin";
import { AuthScheme } from "@/enums";
import {
  createApiKeyStrategy,
  createBasicAuthStrategy,
  createBearerAuthStrategy,
  createJwtStrategy,
} from "@/strategies";
import type { AuthStrategy } from "@/types";
import { parseUserList } from "@/utils";

/**
 * Edge authentication plugin.
 *
 * - Maintains the registry mapping each {@link AuthScheme} to its request
 *   guard, and registers the built-in strategies.
 * - Services resolve their guard with `fastify.authStrategy`.
 * - Additional schemes plug in through `fastify.registerAuthStrategy`
 *   without modifying this plugin or the proxy core.
 */
export default fp(
  async (fastify) => {
    const strategies = new Map<AuthScheme, AuthStrategy>();

    fastify.decorate("registerAuthStrategy", (scheme: AuthScheme, strategy: AuthStrategy) => {
      if (strategies.has(scheme)) {
        throw new Error(`Auth strategy already registered for scheme "${scheme}"`);
      }
      strategies.set(scheme, strategy);
    });

    fastify.decorate("authStrategy", (scheme: AuthScheme) => strategies.get(scheme));

    fastify.registerAuthStrategy(
      AuthScheme.ApiKey,
      createApiKeyStrategy(fastify.config.GATEWAY_API_KEY),
    );
    fastify.registerAuthStrategy(
      AuthScheme.Basic,
      // Parsed at boot so malformed configuration prevents startup.
      createBasicAuthStrategy(parseUserList(fastify.config.BASIC_AUTH_USERS)),
    );
    fastify.registerAuthStrategy(
      AuthScheme.Jwt,
      createJwtStrategy({
        secret: fastify.config.JWT_SECRET || undefined,
        jwksUri: fastify.config.JWT_JWKS_URI || undefined,
        issuer: fastify.config.JWT_ISSUER || undefined,
        audience: fastify.config.JWT_AUDIENCE || undefined,
      }),
    );
    fastify.registerAuthStrategy(
      AuthScheme.Bearer,
      createBearerAuthStrategy({
        introspectionUrl: fastify.config.BEARER_INTROSPECTION_URL,
        introspectionToken: fastify.config.BEARER_INTROSPECTION_TOKEN || undefined,
        cacheTtlMs: fastify.config.BEARER_CACHE_TTL_MS,
      }),
    );
  },
  { name: "auth" },
);
