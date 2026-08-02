# Monitoring & Alerting

Prometheus scrape configuration and alerting rules for fastify-gateway, based
on the metrics it exposes at `/metrics` (see
[Observability](../../docs/observability.md)).

## Files

| File | For | Purpose |
| --- | --- | --- |
| `prometheus-rule.yaml` | Prometheus Operator | Alert rules as a `PrometheusRule` CRD |
| `service-monitor.yaml` | Prometheus Operator | Scrapes `/metrics` (bearer token), sets `job="fastify-gateway"` |
| `alerts.yml` | Plain Prometheus | Same rules in `rule_files` format |
| `prometheus-scrape.yaml` | Plain Prometheus | Scrape job for `scrape_configs` |

The operator files (`*.yaml`) and the plain files (`*.yml` / scrape) are two
delivery formats for the same rules — use whichever matches your Prometheus.
Keep `prometheus-rule.yaml` and `alerts.yml` in sync.

## Setup

**Prometheus Operator (kube-prometheus-stack):**

```bash
kubectl create secret generic gateway-metrics --from-literal=token="$METRICS_TOKEN"
kubectl apply -f service-monitor.yaml -f prometheus-rule.yaml
```

Match the `release:` label on both manifests to your Prometheus
`serviceMonitorSelector` / `ruleSelector`.

**Plain Prometheus:** add `prometheus-scrape.yaml`'s job to `scrape_configs`
and point `rule_files` at `alerts.yml`.

## Alerts

All alerts assume `job="fastify-gateway"`. Tune thresholds and `for`
durations to your SLOs.

| Alert | Severity | Fires when | First response |
| --- | --- | --- | --- |
| `GatewayAllInstancesDown` | critical | No instance is scrapable for 1m | Edge is offline — check the deployment, pods, and ingress |
| `GatewayInstanceDown` | critical | An instance is unscrapable for 2m | Check that pod's logs/liveness; it may be crashlooping |
| `GatewayHighErrorRate` | warning | 5xx ratio > 5% for 5m | Check upstream health and gateway error logs |
| `GatewayUpstreamFailures` | warning | 502/503/504 > 1 req/s for 5m | An upstream is down or slow — verify `*_SERVICE_URL` and the upstream |
| `GatewayHighLatencyP99` | warning | p99 > 1s for 10m | Check upstream latency, event-loop lag, and pool saturation |
| `GatewayRateLimitSpike` | info | 429 > 10 req/s for 10m | A client may be misbehaving, or `RATE_LIMIT_MAX` is too low |
| `GatewayEventLoopLagHigh` | warning | Event-loop p99 lag > 100ms for 5m | Instance is CPU-bound — scale out or raise CPU limits |
| `GatewayHeapNearLimit` | warning | Heap usage > 90% for 10m | Investigate a leak or raise the memory limit |

## Metrics referenced

- `http_requests_total{status}` — request counter (error rate, upstream
  failures, rate-limit spikes)
- `http_request_duration_seconds_bucket` — latency histogram (p99)
- `nodejs_eventloop_lag_p99_seconds`, `nodejs_heap_size_used_bytes`,
  `nodejs_heap_size_total_bytes` — process health (prom-client defaults)
- `up` — Prometheus scrape liveness
