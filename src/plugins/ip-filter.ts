import fp from "fastify-plugin";
import { isIP } from "node:net";
import { ErrorMessage, HttpStatus } from "@/constants";
import { buildIpList, errorBody, normalizeIp } from "@/utils";

/**
 * IP allow/deny filtering, evaluated against `req.ip` (the real client when
 * the gateway runs behind a trusted proxy — see `TRUST_PROXY`).
 *
 * - `IP_DENY_LIST` blocks matching clients outright (deny wins).
 * - `IP_ALLOW_LIST`, when non-empty, blocks every client it does not match.
 * - Both accept plain IPs and CIDR ranges, IPv4 and IPv6; invalid entries
 *   fail the boot rather than silently changing what is blocked.
 * - Blocked clients receive the uniform `403` body. With both lists empty,
 *   the plugin adds no hook and costs nothing per request.
 * - Health probes opt out via `config: { ipFilter: false }` so a
 *   misconfigured list can never fail liveness and restart-loop the
 *   instance; `/metrics` stays filtered because a failed scrape is visible
 *   and recoverable.
 */
export default fp(
  async (fastify) => {
    const allow = buildIpList(fastify.config.IP_ALLOW_LIST);
    const deny = buildIpList(fastify.config.IP_DENY_LIST);
    if (!allow && !deny) return;

    fastify.addHook("onRequest", async (req, reply) => {
      if (req.routeOptions.config?.ipFilter === false) return;

      const ip = normalizeIp(req.ip);
      const family = isIP(ip) === 6 ? "ipv6" : "ipv4";

      const blocked =
        deny?.check(ip, family) === true || (allow !== undefined && !allow.check(ip, family));
      if (blocked) {
        req.log.warn({ ip }, "request blocked by ip filter");
        return reply.code(HttpStatus.Forbidden).send(errorBody(req.id, ErrorMessage.Forbidden));
      }
    });

    fastify.log.info(
      { allowList: allow !== undefined, denyList: deny !== undefined },
      "ip filtering enabled",
    );
  },
  { name: "ip-filter" },
);
