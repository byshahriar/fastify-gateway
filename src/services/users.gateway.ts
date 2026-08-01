import type { GatewayConfig } from "@/types";
import { ServiceGateway } from "@/core/service-gateway";
import { AuthScheme } from "@/enums";

/**
 * Users service proxy. Requires API key authentication at the edge.
 */
export class UsersGateway extends ServiceGateway {
  readonly name = "users";
  readonly prefix = "/api/users";
  protected readonly auth = AuthScheme.ApiKey;

  protected upstream(config: GatewayConfig) {
    return config.USERS_SERVICE_URL;
  }

  protected upstreamCredentials(config: GatewayConfig) {
    return config.USERS_SERVICE_BASIC_AUTH || undefined;
  }
}

// The default export is the plugin registered in app.ts; the class stays
// exported for tests and subclassing.
export default new UsersGateway().toPlugin();
