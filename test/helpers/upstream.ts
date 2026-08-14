import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A request captured by a test upstream.
 */
export interface CapturedRequest {
  /**
   * HTTP method the upstream received.
   */
  method: string;
  /**
   * Request path and query string, as received.
   */
  url: string;
  /**
   * Request headers, as received.
   */
  headers: IncomingHttpHeaders;
  /**
   * Raw request body.
   */
  body: string;
}

/**
 * Canned response configuration for a test upstream.
 */
export interface UpstreamOptions {
  /**
   * Response status code.
   */
  status?: number;
  /**
   * Response body; strings are sent as-is, everything else is JSON-encoded.
   */
  body?: unknown;
  /**
   * Extra response headers, merged over the default `content-type`.
   */
  headers?: Record<string, string>;
  /**
   * Delay before responding, to exercise gateway timeouts.
   */
  delayMs?: number;
}

/**
 * Handle to a running test upstream.
 */
export interface TestUpstream {
  /**
   * Base URL of the running upstream.
   */
  url: string;
  /**
   * Every request received so far, in arrival order.
   */
  requests: CapturedRequest[];
  /**
   * Stops the upstream and releases its port.
   */
  close(): Promise<void>;
}

/**
 * Starts a minimal HTTP upstream that captures every request it receives and
 * responds with a canned payload. Listens on an ephemeral localhost port.
 *
 * @param options - Canned response configuration.
 * @returns A handle with the base URL, captured requests, and a `close`
 *   function.
 */
export async function startUpstream(options: UpstreamOptions = {}): Promise<TestUpstream> {
  const { status = 200, body = { ok: true }, headers = {}, delayMs = 0 } = options;
  const requests: CapturedRequest[] = [];

  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: data,
      });

      const respond = () => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(typeof body === "string" ? body : JSON.stringify(body));
      };

      if (delayMs > 0) setTimeout(respond, delayMs);
      else respond();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/**
 * Produces a localhost URL with no listener behind it, for connection-failure
 * tests.
 *
 * @returns A base URL that refuses connections.
 */
export async function deadUpstreamUrl(): Promise<string> {
  const upstream = await startUpstream();
  const url = upstream.url;
  await upstream.close();
  return url;
}

/**
 * Running upstreams for the three demo services.
 */
export interface ServiceUpstreams {
  /**
   * The users-service upstream.
   */
  users: TestUpstream;
  /**
   * The orders-service upstream.
   */
  orders: TestUpstream;
  /**
   * The public-service upstream.
   */
  publicSvc: TestUpstream;
  /**
   * Env overrides pointing the gateway at these upstreams.
   */
  env: Record<string, string>;
  /**
   * Stops all three upstreams.
   */
  closeAll(): Promise<void>;
}

/**
 * Starts one echo upstream per demo service, each identifying itself in its
 * response body.
 *
 * @returns The upstream handles, ready-made env overrides for
 *   `buildTestApp`, and a combined `closeAll`.
 */
export async function startServiceUpstreams(): Promise<ServiceUpstreams> {
  const [users, orders, publicSvc] = await Promise.all([
    startUpstream({ body: { service: "users" } }),
    startUpstream({ body: { service: "orders" } }),
    startUpstream({ body: { service: "public" } }),
  ]);

  return {
    users,
    orders,
    publicSvc,
    env: {
      USERS_SERVICE_URL: users.url,
      ORDERS_SERVICE_URL: orders.url,
      PUBLIC_SERVICE_URL: publicSvc.url,
    },
    closeAll: async () => {
      await Promise.all([users.close(), orders.close(), publicSvc.close()]);
    },
  };
}
