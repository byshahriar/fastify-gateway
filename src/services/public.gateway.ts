import type { GatewayConfig } from "@/types";
import { ServiceGateway } from "@/core/service-gateway";

/**
 * Public service proxy. No edge authentication.
 */
export class PublicGateway extends ServiceGateway {
  readonly name = "public";
  readonly prefix = "/api/public";

  protected upstream(config: GatewayConfig) {
    return config.PUBLIC_SERVICE_URL;
  }
}

export default new PublicGateway().toPlugin();
