# Evidence: Workflow Automation Retry + Scheduling Mechanics

**Dimension:** Non-editor sync dynamics — retry policies, scheduling, state persistence
**Date:** 2026-04-15
**Sources:** n8n, Temporal, Airbyte, Prefect, Apache Airflow, GitHub Actions

---

## Key files / pages referenced

- [n8n Error Handling](https://docs.n8n.io/flow-logic/error-handling/) — retry, error workflow, continueOnFail
- [n8n Concurrency Control](https://docs.n8n.io/hosting/scaling/concurrency-control/) — overlap handling
- [n8n Queue Mode](https://docs.n8n.io/hosting/scaling/queue-mode/) — BullMQ + Redis
- [n8n Rate Limits](https://docs.n8n.io/integrations/builtin/rate-limits/) — API rate-limit handling
- [Temporal Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies) — exponential + jitter + non-retryable
- [Temporal Failures Reference](https://docs.temporal.io/references/failures) — typed error hierarchy
- [Temporal Schedules](https://docs.temporal.io/schedule) — overlap policies (6 named)
- [Temporal Activity Timeouts](https://temporal.io/blog/activity-timeouts) — heartbeat design
- [Airbyte Jobs](https://docs.airbyte.com/understanding-airbyte/jobs) — attempt thresholds
- [Airbyte Checkpointing](https://airbyte.com/blog/checkpointing) — STATE message persistence
- [Prefect Retry How-To](https://docs.prefect.io/v3/how-to-guides/workflows/retries) — exponential_backoff + jitter
- [Airflow Tasks](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html) — retry, backoff, pools
- [GitHub Actions Workflow Syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) — concurrency

---

## Findings

### Finding: n8n caps built-in retry at 5 attempts / 5000ms — no exponential backoff primitive
**Confidence:** CONFIRMED
**Evidence:** [n8n Error Handling docs](https://docs.n8n.io/flow-logic/error-handling/)

Per-node "Retry on Fail": `Max Tries` hard-capped at 5; `Wait Between Tries` hard-capped at 5000ms. Fixed delay only. Exponential backoff requires wiring a loop subworkflow with manual delay calculation. Error workflows are separate recovery side-paths, not retry loops.

### Finding: Temporal's retry policy is the most formally specified — exponential with non-retryable type system
**Confidence:** CONFIRMED
**Evidence:** [Temporal Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies), [Failures Reference](https://docs.temporal.io/references/failures)

Default: `initialInterval=1s`, `backoffCoefficient=2.0`, `maxInterval=100s`, `maxAttempts=unlimited`. `ApplicationFailure.non_retryable` flag + `nonRetryableErrors` type list in RetryPolicy. Activities retry by default; Workflows do not. Heartbeat timeout enables mid-activity progress checkpointing.

### Finding: Temporal defines 6 named schedule overlap policies
**Confidence:** CONFIRMED
**Evidence:** [Temporal Schedules](https://docs.temporal.io/schedule)

`SKIP` (default — drop if running), `BUFFER_ONE`, `BUFFER_ALL`, `CANCEL_OTHER`, `TERMINATE_OTHER`, `ALLOW_ALL`. The most formal overlap model across all surveyed tools.

### Finding: Airbyte uses fixed-step escalation (not exponential coefficient) with threshold-based circuit-breaking
**Confidence:** CONFIRMED
**Evidence:** [Airbyte Jobs docs](https://docs.airbyte.com/understanding-airbyte/jobs)

Backoff: 10s → 30s → 90s → 270s. Thresholds: 5 consecutive zero-data → halt; 10 total zero-data → halt; 20 total partial-data → halt. Partial success resets backoff counter. STATE message checkpointing enables resume from last acknowledged state.

### Finding: Prefect is the only tool with built-in jitter as a first-class parameter
**Confidence:** CONFIRMED
**Evidence:** [Prefect Retry How-To](https://docs.prefect.io/v3/how-to-guides/workflows/retries)

`@task(retries=N, retry_delay_seconds=exponential_backoff(backoff_factor=X), retry_jitter_factor=0.5)`. Jitter adds up to 50% of base delay randomly. `retry_condition_fn` enables custom halt logic by inspecting exception type.

### Finding: Airflow has native exponential backoff with multiplier and max cap
**Confidence:** CONFIRMED
**Evidence:** [Airflow Tasks docs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html)

Per-task: `retry_exponential_backoff=2.0`, `max_retry_delay=timedelta(...)`. Pools mechanism limits concurrent task slots globally. `depends_on_past=True` blocks new run if previous failed.

### Finding: GitHub Actions has no native step-level retry — community action fills the gap
**Confidence:** CONFIRMED
**Evidence:** [GitHub Actions docs](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions)

`concurrency:` key with `cancel-in-progress` provides overlap handling. No retry, no backoff. `nick-fields/retry` action provides `max_attempts` + `retry_wait_seconds`. Cron scheduling has documented delays under load; minimum interval 5 minutes.

### Finding: No workflow tool ships a rate-limiter as a first-class scheduler primitive
**Confidence:** CONFIRMED
**Evidence:** All docs surveyed

Universal pattern: set retry delay >= rate-limit window, or use concurrency pools/slots. No built-in token-bucket or leaky-bucket rate limiter. Rate limiting is consistently left to the user.

---

## Comparative Retry Policy Table

| Tool | Type | Initial | Multiplier | Max Delay | Jitter | Max Attempts | Non-Retryable |
|------|------|---------|-----------|-----------|--------|-------------|---------------|
| n8n (built-in) | Fixed | 1-5000ms | none | 5000ms | none | 5 | none |
| Temporal | Exponential | 1s | 2.0 | 100s | none built-in | unlimited | typed (ApplicationFailure) |
| Airbyte | Fixed-step | 10s | n/a | 270s | none | 20 total | threshold-based |
| Prefect | Exponential+jitter | configurable | configurable | configurable | `retry_jitter_factor` | configurable | `retry_condition_fn` |
| Airflow | Exponential | configurable | configurable | configurable | none | `retries` int | none (callback) |
| GitHub Actions | Fixed (via action) | configurable | none | none | none | action-level | action-level filter |

---

## Cross-Tool Patterns

1. **Per-unit retry, not per-workflow** — Temporal: Activities; Airflow: Tasks; Airbyte: attempts; Prefect: Tasks
2. **Exponential backoff is the expected default** — Temporal, Prefect, Airflow all ship it. n8n's 5000ms cap is the outlier
3. **Typed non-retryable errors are a differentiator** — only Temporal has first-class typed system; Prefect approximates via condition function
4. **Overlap policies vary from formal (Temporal: 6 named) to ad-hoc (n8n: user-set timeout)**
5. **State persistence separates durable from ephemeral** — Temporal (event sourcing + heartbeats) and Airbyte (STATE checkpoints) vs n8n/Airflow (restart from scratch)

---

## Gaps / follow-ups

- n8n built-in exponential backoff may have been added in recent versions (community reports conflict with docs)
- Temporal jitter: not in the RetryPolicy schema; confirmed absent, but can be added in Activity code
- Airflow `retry_exponential_backoff` exact behavior for multiplier values other than 2.0 not verified
