import type { GatewayConfig } from "@/types";
import { ServiceGateway } from "@/core/service-gateway";
import { AuthScheme } from "@/enums";

/**
 * Orders service proxy. Requires HTTP Basic authentication at the edge.
 */
export class OrdersGateway extends ServiceGateway {
  readonly name = "orders";
  readonly prefix = "/api/orders";
  protected readonly auth = AuthScheme.Basic;

  protected upstream(config: GatewayConfig) {
    return config.ORDERS_SERVICE_URL;
  }

  protected upstreamCredentials(config: GatewayConfig) {
    return config.ORDERS_SERVICE_BASIC_AUTH || undefined;
  }
}

export default new OrdersGateway().toPlugin();
