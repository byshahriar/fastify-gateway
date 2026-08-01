/**
 * Live end-to-end test. Runs the compiled gateway (dist/server.js) as a real
 * process against three real HTTP upstream echo services, then exercises
 * every feature over real HTTP. Stdlib only — no test framework.
 *
 * Usage: npm run test:e2e (builds first, then runs this script).
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const GW_DIR = fileURLToPath(new URL("..", import.meta.url));
const GW = "http://127.0.0.1:18300";
const PORTS = { users: 18301, orders: 18302, public: 18303 };

// ---------------------------------------------------------------- upstreams
function startEcho(name, port) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const respond = () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ service: name, method: req.method, url: req.url, headers: req.headers, body }));
      };
      if (req.url === "/slow") setTimeout(respond, 3000);
      else respond();
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

// ---------------------------------------------------------------- harness
const results = [];
let clientNum = 0;
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "✗ FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`);
}
// unique x-forwarded-for per check: trustProxy is on, so each check gets its
// own rate-limit bucket and doesn't interfere with the rate-limit test
function req(path, opts = {}) {
  const headers = { "x-forwarded-for": opts.sameClient ?? `10.0.${++clientNum >> 8}.${clientNum & 255}`, ...(opts.headers ?? {}) };
  return fetch(`${GW}${path}`, { ...opts, headers });
}
const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

// ---------------------------------------------------------------- main
const upstreams = {
  users: await startEcho("users", PORTS.users),
  orders: await startEcho("orders", PORTS.orders),
  public: await startEcho("public", PORTS.public),
};

let gwLog = "";
const gw = spawn("node", ["dist/server.js"], {
  cwd: GW_DIR,
  env: {
    ...process.env,
    PORT: "18300", HOST: "127.0.0.1", LOG_LEVEL: "info",
    GATEWAY_API_KEY: "e2e-key",
    BASIC_AUTH_USERS: "admin:s3cret,svc:svcpass",
    RATE_LIMIT_MAX: "10", RATE_LIMIT_WINDOW_MS: "60000",
    UPSTREAM_TIMEOUT_MS: "800",
    USERS_SERVICE_URL: `http://127.0.0.1:${PORTS.users}`,   USERS_SERVICE_BASIC_AUTH: "gw-users:users-secret",
    ORDERS_SERVICE_URL: `http://127.0.0.1:${PORTS.orders}`, ORDERS_SERVICE_BASIC_AUTH: "gw-orders:orders-secret",
    PUBLIC_SERVICE_URL: `http://127.0.0.1:${PORTS.public}`,
    CORS_ORIGINS: "https://app.example.com", CORS_ALLOW_CREDENTIALS: "true",
  },
});
gw.stdout.on("data", (c) => (gwLog += c));
gw.stderr.on("data", (c) => (gwLog += c));

// wait for the gateway to listen
let up = false;
for (let i = 0; i < 50 && !up; i++) {
  try { up = (await fetch(`${GW}/healthz`)).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
}
if (!up) { console.error("gateway did not start\n" + gwLog); process.exit(1); }
console.log("gateway up — running checks\n");

try {
  // --- gateway's own endpoints -------------------------------------------
  {
    const r = await req("/healthz");
    record("health probe", r.status === 200 && (await r.json()).status === "ok");
    const r2 = await req("/readyz");
    record("readiness probe", r2.status === 200);
    record("helmet security headers", r.headers.get("x-content-type-options") === "nosniff");
    record("response carries x-request-id + x-correlation-id", !!r.headers.get("x-request-id") && !!r.headers.get("x-correlation-id"));
  }
  {
    const r = await req("/healthz", { headers: { "x-request-id": "e2e-req-1", "x-correlation-id": "e2e-corr-1" } });
    record("honors client x-request-id", r.headers.get("x-request-id") === "e2e-req-1");
    record("honors client x-correlation-id", r.headers.get("x-correlation-id") === "e2e-corr-1");
  }
  {
    const r = await req("/does/not/exist");
    const b = await r.json();
    record("uniform 404 with requestId", r.status === 404 && b.error === "Not found" && !!b.requestId);
  }

  // --- api-key service (users) -------------------------------------------
  record("users: 401 without api key", (await req("/api/users/me")).status === 401);
  record("users: 401 with wrong api key", (await req("/api/users/me", { headers: { "x-api-key": "nope" } })).status === 401);
  {
    const r = await req("/api/users/me", { headers: { "x-api-key": "e2e-key", traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" } });
    const b = await r.json();
    const h = b.headers ?? {};
    record("users: 200 with valid api key, proxied", r.status === 200 && b.service === "users");
    record("users: prefix stripped upstream", b.url === "/me");
    record("users: x-api-key never forwarded", !("x-api-key" in h));
    record("users: s2s Basic credentials injected", h.authorization === basic("gw-users", "users-secret"));
    record("users: x-request-id propagated upstream", !!h["x-request-id"]);
    record("users: trace continued (same trace-id, new span-id)",
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-(?!00f067aa0ba902b7)[0-9a-f]{16}-01$/.test(h.traceparent ?? ""), `got ${h.traceparent}`);
    record("users: x-forwarded-* headers set", !!h["x-forwarded-for"] && !!h["x-forwarded-host"] && h["x-forwarded-proto"] === "http");
  }

  // --- basic-auth service (orders) ---------------------------------------
  {
    const r = await req("/api/orders/list");
    record("orders: 401 without credentials + challenge", r.status === 401 && (r.headers.get("www-authenticate") ?? "").includes("Basic"));
  }
  record("orders: 401 with wrong password", (await req("/api/orders/list", { headers: { authorization: basic("admin", "wrong") } })).status === 401);
  record("orders: 401 with unknown user", (await req("/api/orders/list", { headers: { authorization: basic("ghost", "s3cret") } })).status === 401);
  {
    const r = await req("/api/orders/list", { headers: { authorization: basic("admin", "s3cret") } });
    const b = await r.json();
    record("orders: 200 with valid Basic credentials", r.status === 200 && b.service === "orders");
    record("orders: client creds replaced by s2s creds upstream", b.headers?.authorization === basic("gw-orders", "orders-secret"));
  }
  record("orders: second configured user accepted", (await req("/api/orders/list", { headers: { authorization: basic("svc", "svcpass") } })).status === 200);

  // --- public service ----------------------------------------------------
  {
    const r = await req("/api/public/status?page=2&sort=asc");
    const b = await r.json();
    record("public: 200 without auth", r.status === 200 && b.service === "public");
    record("public: path + query preserved", b.url === "/status?page=2&sort=asc");
  }
  {
    const r = await req("/api/public/token-check", { headers: { authorization: "Bearer client-token" } });
    record("public: client bearer token passes through", (await r.json()).headers?.authorization === "Bearer client-token");
  }
  {
    const r = await req("/api/public/echo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hello: "gateway" }) });
    const b = await r.json();
    record("public: POST body proxied intact", r.status === 200 && b.method === "POST" && JSON.parse(b.body).hello === "gateway");
  }

  // --- CORS --------------------------------------------------------------
  {
    const ok = await req("/healthz", { headers: { origin: "https://app.example.com" } });
    record("CORS: allowed origin reflected + credentials",
      ok.headers.get("access-control-allow-origin") === "https://app.example.com" && ok.headers.get("access-control-allow-credentials") === "true");
    const denied = await req("/healthz", { headers: { origin: "https://evil.example.com" } });
    record("CORS: unknown origin gets no allow header", !denied.headers.get("access-control-allow-origin"));
    const preflight = await req("/api/public/status", { method: "OPTIONS", headers: { origin: "https://app.example.com", "access-control-request-method": "POST" } });
    record("CORS: preflight answered", preflight.status === 204 || preflight.status === 200);
  }

  // --- resilience --------------------------------------------------------
  {
    const t0 = Date.now();
    const r = await req("/api/public/slow");
    const b = await r.json();
    record("slow upstream: 504 Upstream timeout (fail-fast)", r.status === 504 && b.error === "Upstream timeout", `${Date.now() - t0}ms, got ${r.status}`);
  }
  {
    let last;
    for (let i = 0; i < 11; i++) last = await req("/api/public/status", { sameClient: "9.9.9.9" });
    record("rate limit: 11th request from same client → 429", last.status === 429);
    const other = await req("/api/public/status");
    record("rate limit: other clients unaffected", other.status === 200);
    const health = await req("/healthz", { sameClient: "9.9.9.9" });
    record("rate limit: health checks exempt", health.status === 200);
  }
  {
    upstreams.orders.closeAllConnections();
    await new Promise((r) => upstreams.orders.close(r));
    const r = await req("/api/orders/list", { headers: { authorization: basic("admin", "s3cret") } });
    const b = await r.json();
    record("dead upstream: 502 Upstream unavailable", r.status === 502 && b.error === "Upstream unavailable", `got ${r.status} ${JSON.stringify(b)}`);
    record("dead upstream: no internal details leaked", !JSON.stringify(b).match(/ECONNREFUSED|127\.0\.0\.1/));
  }

  // --- observability -----------------------------------------------------
  {
    await req("/api/public/status", { headers: { "x-correlation-id": "log-check-corr" } });
    await new Promise((r) => setTimeout(r, 300));
    record("logs: correlation id bound into request logs", gwLog.includes("log-check-corr"));
    record("logs: trace ids present", /"traceId":"[0-9a-f]{32}"/.test(gwLog));
  }
} finally {
  gw.kill("SIGTERM");
  for (const s of Object.values(upstreams)) { try { s.closeAllConnections(); s.close(); } catch {} }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log("\nGateway log tail:\n" + gwLog.split("\n").slice(-15).join("\n")); process.exit(1); }
