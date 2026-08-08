import type { GatewayConfig } from "@/types";
import { ServiceGateway } from "@/core/service-gateway";

/**
 * Public service proxy. No edge authentication. Opts into response caching;
 * entries are cached only when `CACHE_ENABLED` is set and the upstream sends
 * a cacheable `Cache-Control`.
 */
export class PublicGateway extends ServiceGateway {
  readonly name = "public";
  readonly prefix = "/api/public";
  protected readonly cacheable = true;

  protected upstream(config: GatewayConfig) {
    return config.PUBLIC_SERVICE_URL;
  }
}

export default new PublicGateway().toPlugin();
