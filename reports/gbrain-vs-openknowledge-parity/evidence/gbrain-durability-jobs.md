# Evidence: GBrain Durability & Background Work (D6)

**Dimension:** D6 — Background-work / agent-durability parity
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README — Minions, Durable Subagents sections

---

## Findings

### Finding: Minions — Postgres-native job queue, "categorically different from sub-agents for background work"
**Confidence:** CONFIRMED
**Evidence:** README "Minions: Durable Job Queue (v0.11.1+)":

> "Minions is not incrementally better than sub-agents for background work. It's categorically different."
>
> Deterministic work (pull posts, parse JSON, write page, sync) → Minions ($0 tokens, millisecond runtime, 100% durability, survives crashes).
> Judgment work (triage, assess priority, decide reply) → Sub-agents.
>
> Metrics on production deployment (45,000-page Supabase brain):
> - Spawn: **753ms vs >10,000ms** (gateway timeout)
> - Token cost: **$0.00 vs ~$0.03**
> - Success rate: **100% vs 0%**
> - Memory per job: **~2 MB vs ~80 MB**
>
> Features:
> - Postgres-native, no external infra
> - Parent-child DAGs, fan-out/fan-in collection
> - `child_done` inbox, steering mid-flight
> - Atomic PID locking, exponential backoff, durability across worker restarts
> - `max_children` cap, `timeout_ms` + AbortSignal, idempotency keys

**Implications:**
- The **fundamental insight**: not every background task should be an LLM call. Many recurring brain operations (pull posts, parse JSON, write a page, sync git) are deterministic — they need durability, scheduling, retry, and back-pressure, but no judgment.
- **OK has no equivalent.** OK's MCP `ingest` tool runs synchronously per call. There is no scheduled, durable, multi-job queue.
- **Postgres-native** matters: the queue is in the same DB as the index. Single dependency, transactional consistency between job state and data writes. Adopting this in OK would push toward a Postgres backend (or a separate SQLite job table).
- **0 tokens vs $0.03** doesn't sound like much, but at 1000 jobs/day it's ~$30/mo of pure waste. At Garry's deployment scale (20+ recurring jobs, autonomous cron) the saving is structurally important.

### Finding: Durable subagents — two-phase ledger, fan-out across 50 shards, crash-tolerant aggregation
**Confidence:** CONFIRMED
**Evidence:** README "Durable Subagents (v0.15)":

> "Subagent runs survive crashes via two-phase message ledger (`pending` → `complete | failed`). Fan-out across 50 shards, one crashes — aggregator still claims after every child reaches terminal state."

CLI surface:
- `gbrain agent run "prompt"` — Single-subagent run
- `gbrain agent run "prompt" --fanout-manifest manifests/pages.json --subagent-def analyzer` — Fan-out N prompts × N subagent children + 1 aggregator
- `gbrain agent logs <id> --follow --since 5m` — Tail running job (heartbeat per turn + full transcript on completion)

**Implications:**
- This generalizes the "nested-claude" pattern (Claude Code spawning child Claude Code instances) into a **first-class, durable, queue-backed primitive**. The job ledger persists across crashes; an aggregator can wait for any number of children without holding open a process.
- For OK, this is parallel to Claude Code's `Task` tool dispatching subagents — but OK doesn't yet have a "fan-out + crash-recover + aggregate" pattern beyond what the agent host provides.
- The `--fanout-manifest` JSON schema is a useful interface to formalize: a list of input parameters, each spawning a sub-task, with results aggregated downstream.

### Finding: Worker daemon — `jobs work` (any DB) and `jobs supervisor` (Postgres-only auto-restart)
**Confidence:** CONFIRMED
**Evidence:** README:
- `gbrain jobs work [--queue Q] [--concurrency N]` — Start worker daemon
- `gbrain jobs supervisor --concurrency 4` — Auto-restarting worker (Postgres only)

**Implications:**
- **`jobs work`** is the user-runnable worker; **`jobs supervisor`** is a self-healing process manager. Splitting them by capability tier (PGLite gets `work`; Postgres unlocks `supervisor`) is a clear progressive-enhancement model.
- OK has `self-spawn.ts` in commands — likely the editor/server auto-relaunch pattern. Different concern (long-running editor process vs. job queue worker), but OK's process-management primitives could be extended toward queue workers if a job system is added.

### Finding: Dream cycle — `gbrain dream` runs one maintenance pass per cron tick
**Confidence:** CONFIRMED
**Evidence:** README:
- `gbrain dream [--dry-run] [--phase N]` — One maintenance cycle then exit (cron-friendly)

Per docs/GBRAIN_SKILLPACK.md summary: "version 0.11.0+ routes scheduled work through Minion jobs rather than the LLM gateway" and "the framework recommends... a 'dream cycle' for background processing."

**Implications:**
- "Dream cycle" is the operational pattern for **continuous knowledge maintenance**. Every N hours: re-extract links, refresh stale embeddings, run lint, update orphans report, rebuild graph indices.
- OK has nothing scheduled. The `maintain` skill (planned) would be triggered manually. Adopting `dream` requires: (1) a cron-friendly entry point, (2) phase-by-phase idempotent operations, (3) `--dry-run` for safety.
- Aligns with the "Sleep Consolidation" pattern that emerged in `reports/knowledge-linting-karpathy-workflow/` — overnight LLM passes for deep semantic checks.

### Finding: Doctor — `gbrain doctor` health check with auto-fix and DB lock visibility
**Confidence:** CONFIRMED
**Evidence:** README:
- `gbrain doctor [--json] [--fast]` — resolver, skills, DB, embeddings
- `gbrain doctor --fix [--dry-run]` — Auto-fix DRY violations
- `gbrain doctor --locks` — List idle-in-tx backends (Postgres only)

`gbrain jobs smoke` — 8 post-restart health checks with auto-fix.

**Implications:**
- **Health surface** spans: resolver coverage, skill conformance, DB connectivity, embedding freshness, idle Postgres transactions.
- Two-tier maintenance: `doctor` is general health; `smoke` is post-restart correctness. Both have auto-fix modes.
- OK has `status.ts` (server lifecycle status) but no equivalent system-health command. Adding `ok doctor` would be a natural extension once OK has a richer index/skills/embeddings layer that can drift.

---

## Negative searches

- Searched for queue persistence guarantees beyond Postgres → confirmed Postgres-only. No SQLite job queue mode in PGLite (would require separate engineering).
- Searched for retry policies / dead-letter queues → README mentions "exponential backoff" and `gbrain jobs retry` but no DLQ explicitly.

---

## Gaps / follow-ups

- Job schema (Postgres table layout) not in README. Source: `src/engines/postgres/jobs.ts` (not fetched).
- The 8 specific post-restart `smoke` checks not enumerated (mentioned as "8 health checks with auto-fix").
- Whether the supervisor process supports rolling restarts / config reloads is unclear.
