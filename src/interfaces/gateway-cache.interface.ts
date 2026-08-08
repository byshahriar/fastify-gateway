import type { onRequestAsyncHookHandler, onSendAsyncHookHandler } from "fastify";

/**
 * Hook factories exposed by the cache plugin as `fastify.gatewayCache`.
 * A service that opts into caching adds both hooks inside its encapsulated
 * scope, so caching applies only to that service's routes.
 */
export interface GatewayCache {
  /**
   * Builds the `onRequest` hook that serves cache hits for a service,
   * short-circuiting the proxy.
   *
   * @param service - Service name; isolates the service's cache entries.
   * @returns The hook to add in the service's scope.
   */
  serveHook(service: string): onRequestAsyncHookHandler;

  /**
   * Builds the `onSend` hook that stores eligible responses for a service.
   *
   * @param service - Service name (symmetry with {@link serveHook}).
   * @returns The hook to add in the service's scope.
   */
  storeHook(service: string): onSendAsyncHookHandler;
}
