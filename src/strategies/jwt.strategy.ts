import { createRemoteJWKSet, jwtVerify } from "jose";
import { Header } from "@/constants";
import type { AuthStrategy } from "@/types";
import { parseBearerToken, sendMisconfigured, sendUnauthorized } from "@/utils";

/**
 * Verification settings for the JWT auth scheme.
 */
export interface JwtOptions {
  /**
   * Shared HMAC secret (HS256). Mutually exclusive with {@link jwksUri}.
   */
  secret?: string;
  /**
   * Remote JWKS endpoint for asymmetric keys (RS256/ES256).
   */
  jwksUri?: string;
  /**
   * Required `iss` claim, if set.
   */
  issuer?: string;
  /**
   * Required `aud` claim, if set.
   */
  audience?: string;
}

/**
 * Builds the JWT strategy: clients present a signed token as
 * `Authorization: Bearer <jwt>`, verified against a shared secret or a remote
 * JWKS. Signature, expiry, and any configured issuer/audience claims are
 * checked; verification failures return 401.
 *
 * @param options - Verification settings; without a secret or JWKS the
 *   strategy responds 500 so a misconfigured gateway never allows traffic.
 * @returns The request guard.
 */
export function createJwtStrategy(options: JwtOptions): AuthStrategy {
  const { secret, jwksUri, issuer, audience } = options;

  const key = jwksUri
    ? createRemoteJWKSet(new URL(jwksUri))
    : secret
      ? new TextEncoder().encode(secret)
      : undefined;

  const verifyOptions = {
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {}),
  };

  return async (req, reply) => {
    if (!key) {
      return sendMisconfigured(req, reply, "JWT auth requires JWT_SECRET or JWT_JWKS_URI");
    }

    const token = parseBearerToken(req.headers[Header.Authorization]);
    if (!token) {
      return sendUnauthorized(req, reply);
    }

    try {
      await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], verifyOptions);
    } catch {
      return sendUnauthorized(req, reply);
    }
  };
}
