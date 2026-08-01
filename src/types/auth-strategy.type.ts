import type { preHandlerAsyncHookHandler } from "fastify";

/**
 * Request guard enforcing one edge authentication scheme.
 */
export type AuthStrategy = preHandlerAsyncHookHandler;
