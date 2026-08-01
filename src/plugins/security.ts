import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";

/**
 * Security headers and CORS, applied app-wide (proxied routes included).
 * CSP is disabled because the gateway serves JSON APIs, not HTML.
 *
 * Wildcard origins combined with credentials would reflect any origin on
 * credentialed requests — a configuration that exposes authenticated APIs to
 * every site on the internet — so it is rejected at boot.
 */
export default fp(
  async (fastify) => {
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
    });

    const origins = fastify.config.CORS_ORIGINS.split(",").map((s) => s.trim());
    const allowAnyOrigin = origins.includes("*");

    if (allowAnyOrigin && fastify.config.CORS_ALLOW_CREDENTIALS) {
      throw new Error(
        "CORS_ALLOW_CREDENTIALS=true cannot be combined with wildcard CORS_ORIGINS; " +
          "set an explicit origin allow-list",
      );
    }

    await fastify.register(cors, {
      origin: allowAnyOrigin ? true : origins,
      credentials: fastify.config.CORS_ALLOW_CREDENTIALS,
    });
  },
  { name: "security" },
);
