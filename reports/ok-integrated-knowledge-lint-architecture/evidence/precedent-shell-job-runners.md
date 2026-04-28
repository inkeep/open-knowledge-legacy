# Evidence: Shell-Job-Runner Precedents in Agent-Native KBs

**Dimension:** What pattern existing implementations actually use for "scheduled work that is not the user's interactive agent" — generic shell jobs vs prescriptive agent CLIs vs no-scheduling-at-all
**Date:** 2026-04-28
**Sources:** This repo's prior `gbrain-vs-openknowledge-parity/` audit (2026-04-27, the canonical 1P GBrain coverage); `open-knowledge-prior-art-eight-sources/` (the gist-era GBrain coverage); GBrain repo + docs; Pratiyush/llm-wiki; aaronoah/llm-wiki-skill; doum1004/llmwiki-cli; eugeniughelbur/obsidian-second-brain; web search

---

## Cross-references to prior 1P GBrain research in this repo

This evidence file builds on (and defers to) two existing reports:

- **[`reports/gbrain-vs-openknowledge-parity/`](../../gbrain-vs-openknowledge-parity/REPORT.md)** (2026-04-27) — the canonical capability comparison. The shell-job runner work is **parity work item #5** in that audit's ranked list ("Postgres-native durable job queue (Minions) + durable subagents + dream cycle"). The prior audit established that GBrain pivoted from the original gist's SQLite-canonical plan to **markdown-canonical + PGLite/Postgres index** — the same architectural bet as Open Knowledge.
- **[`reports/open-knowledge-prior-art-eight-sources/evidence/d6-garrytan-gbrain.md`](../../open-knowledge-prior-art-eight-sources/evidence/d6-garrytan-gbrain.md)** (2026-04-07) — the original gist-era investigation. Several findings there are **superseded** by the shipped GBrain (`gbrain-vs-openknowledge-parity/` is current); they're useful only for the original-vision-vs-shipped framing.

**Reading order for someone joining this:** start with `gbrain-vs-openknowledge-parity/REPORT.md` for the production-shipped GBrain picture; this evidence file then narrows the focus to the **Minions-shape job runner** specifically and what an OK port looks like.

---

## Findings

### Finding: GBrain Minions is the canonical production precedent — agent-CLI-agnostic by design
**Confidence:** CONFIRMED
**Evidence:** [`reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`](../../gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md) (verbatim from GBrain README v0.11.1+):

> "Minions is not incrementally better than sub-agents for background work. It's categorically different.
>
> Deterministic work (pull posts, parse JSON, write page, sync) → Minions ($0 tokens, millisecond runtime, 100% durability, survives crashes).
> Judgment work (triage, assess priority, decide reply) → Sub-agents."

**Production metrics on 45,000-page Supabase brain** (per GBrain README, validated in prior parity audit):

| Metric | Minions | Sub-agents |
|---|---|---|
| Spawn time | 753ms | >10,000ms (gateway timeout) |
| Token cost per job | **$0.00** | ~$0.03 |
| Success rate | **100%** | 0% (timeouts) |
| Memory per job | ~2 MB | ~80 MB |

**Features:**
- Postgres-native, no external infra.
- Parent-child DAGs, fan-out/fan-in collection.
- `child_done` inbox; mid-flight steering.
- Atomic PID locking, exponential backoff, durability across worker restarts.
- `max_children` cap, `timeout_ms` + AbortSignal, idempotency keys.

Submission shape (per [`docs/guides/minions-shell-jobs.md`](https://github.com/garrytan/gbrain/blob/master/docs/guides/minions-shell-jobs.md)):
```bash
gbrain jobs submit shell --params '{
  "cmd": "...",      # any shell command
  "argv": [...],
  "cwd": "...",
  "env": {...}
}'
```

Two deployment patterns:
- **Postgres**: persistent `gbrain jobs work` daemon + `gbrain jobs supervisor --concurrency 4` (auto-restarting, self-healing process manager).
- **PGLite**: inline execution with `--follow` flag per invocation (no persistent worker).

Security gates:
- `GBRAIN_ALLOW_SHELL_JOBS=1` opt-in env flag (default off).
- MCP boundary blocks remote callers (CLI-only).
- Worker-level env opt-in per host.

**Implications:**
- **Minions are agent-CLI-agnostic by design.** A Minion is `cmd + argv + cwd + env` — a generic shell job. The user can submit `claude --print ...`, `lychee wiki/`, a Python script, or `curl http://localhost/api/dead-links` with equal validity.
- The "$0/task, 100% durability" claim is a property of *deterministic* Minions, not all Minions. If a user submits a Minion that's an agent CLI invocation, that one obviously consumes tokens — the framing is "scheduled work doesn't go through the *gateway agentTurn* by default; if you want LLM tokens spent, that's an explicit choice in the `cmd`."
- **The off-by-default security gate is load-bearing**: shell-job execution from cron is a real attack surface. Garry made it opt-in. Any OK equivalent should mirror this default.
- **Two-tier deployment** (`work` for any DB; `supervisor` for Postgres self-healing) is a clean progressive-enhancement model OK should adopt.

### Finding: GBrain `dream` is the operational entry point for scheduled maintenance
**Confidence:** CONFIRMED
**Evidence:** [`gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`](../../gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md):

> `gbrain dream [--dry-run] [--phase N]` — One maintenance cycle then exit (cron-friendly).
>
> Per docs/GBRAIN_SKILLPACK.md: "version 0.11.0+ routes scheduled work through Minion jobs rather than the LLM gateway" and "the framework recommends... a 'dream cycle' for background processing."

**Implications:**
- **`dream` is the cron-facing CLI command**: cron / launchd / systemd invokes `gbrain dream`, which executes one phase-by-phase idempotent maintenance cycle and exits. The Minions queue is the underlying primitive; `dream` is the cron-friendly wrapper that submits the right jobs and waits.
- **`--dry-run` is mandatory for safety** — any auto-fix capability needs a "show me what you'd do without doing it" mode. OK's equivalent must do the same.
- This pattern aligns with the **"Sleep Consolidation" pattern** from prior `reports/knowledge-linting-karpathy-workflow/` research and the **5-phase nightly** from prior `reports/consolidate-and-overnight-patterns/` research — cross-confirms the convergent industry pattern.

### Finding: GBrain `doctor` is the health-check companion to `dream`
**Confidence:** CONFIRMED
**Evidence:** [`gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`](../../gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md):

> `gbrain doctor [--json] [--fast]` — resolver, skills, DB, embeddings
> `gbrain doctor --fix [--dry-run]` — Auto-fix DRY violations
> `gbrain doctor --locks` — List idle-in-tx backends (Postgres only)
>
> `gbrain jobs smoke` — 8 post-restart health checks with auto-fix.

**Implications:**
- **Two-tier maintenance**: `doctor` is general system-health (resolver, skills, DB, embeddings); `smoke` is post-restart correctness. Both have auto-fix modes.
- An OK port would have `ok doctor` checking: MCP server up, Hocuspocus up, content-dir reachable, lint primitives functioning, schema present and valid. Adding it now (alongside the shell-job runner) closes the "is the system healthy enough to run scheduled work?" pre-check that any cron deployment needs.

### Finding: GBrain is opinionated about the *agent stack and skills*, not the *Minions runner*
**Confidence:** CONFIRMED
**Evidence:** GBrain repo description: *"Garry's Opinionated OpenClaw/Hermes Agent Brain"*. Five reference skills (`ingest`, `query`, `maintain`, `enrich`, `briefing`) assume OpenClaw or Hermes as the agent — but per [`gbrain-vs-openknowledge-parity/evidence/gbrain-architecture.md`](../../gbrain-vs-openknowledge-parity/evidence/gbrain-architecture.md), GBrain shipped 29 skills with a `skills/RESOLVER.md` routing manifest by 2026-04-27 (v0.21+).

The Minions runner itself doesn't know what kind of `cmd` it executes — it's a generic shell-job worker.

**Implications:**
- GBrain's *own* AI integration is locked to one stack — its skills wouldn't work as-is in Claude Code or Codex without porting.
- But the Minions runner is **orthogonal** — a GBrain user could schedule a `claude --print` Minion that talks to GBrain via its MCP tools, fully independently of OpenClaw.
- **The pattern that emerges: the runner (Minions) is generic; the skills (markdown SKILL.md files) are stack-specific.** The two concerns are kept separate. **OK should adopt the runner architecture; OK's skills (per the prior parity audit's #4 ranked work) are a separate concern.**

### Finding: Pratiyush/llm-wiki has the same deterministic-vs-LLM split but defers LLM scheduling
**Confidence:** CONFIRMED
**Evidence:** [Pratiyush/llm-wiki README](https://github.com/Pratiyush/llm-wiki) (web fetch summary):

> "The lint system splits into two categories: 8 structural rules (wikilinks, orphans, freshness, duplicates) run mechanically; 3 LLM-powered rules (contradictions, claim verification, summary accuracy) require external invocation."

> "The codebase supports a `--synthesize` flag that 'call[s] out to a local Claude / Ollama backend during build' for LLM-generated content."

> "v1.1.0 roadmap mentions an 'Ollama scaffold' and 'prompt-cache scaffold,' suggesting the project was moving toward pluggable backend support, but the current stable release (v1.2.0) documentation doesn't expose a user-facing configuration for specifying custom agent commands."

> "For scheduled sync/lint that needs LLM checks, users would likely either: (1) Run these manually when LLM synthesis is needed, (2) Rely on mechanical checks in scheduled jobs, (3) Extend the codebase with custom agent backends. The project appears designed primarily for human-in-the-loop synthesis rather than fully autonomous scheduled LLM invocation."

**Implications:**
- Pratiyush has the architectural split (8 mechanical + 3 LLM) but **chooses not to schedule the LLM side**. That's a legitimate design stance: the LLM-required checks fire when the user is around.
- Pluggable backends are on the roadmap but not stable. The implementation isn't there yet, but the design intent is.
- This validates the approach of **"deterministic on cron is mandatory; LLM on cron is optional and BYO."**

### Finding: Most other Karpathy-style implementations don't schedule at all
**Confidence:** CONFIRMED
**Evidence:** Pattern across surveyed implementations:

| Implementation | Scheduling story |
|---|---|
| **NicholasSpisak/second-brain** | Slash commands (`/second-brain-lint`, `/ingest-url`, `/process-inbox`) inside the user's interactive agent. **No cron, no headless.** |
| **aaronoah/llm-wiki-skill** | "CLI based agentic skill that manages your wiki for you, works with LLMs of your choice" — works in any agent CLI. **The user's interactive agent is the runner.** |
| **kytmanov/obsidian-llm-wiki-local** | `olw run` pipeline orchestrator, run on demand. Local Ollama. **No native scheduling.** |
| **Astro-Han/karpathy-llm-wiki** | Agent Skills package — runs inside Claude Code, Cursor, Codex. **User invokes; no scheduling layer.** |
| **eugeniughelbur/obsidian-second-brain** | **Hardcoded Claude Code scheduled-agent feature** for the 10 PM nightly. Tied to Claude Code's Routines / scheduled-agent capability. Not pluggable. |

The dominant pattern is **"no separate scheduling layer — the user's interactive agent is the runner."** The user opens Claude Code (or Codex, etc.), invokes the skill's commands when they want them.

**Implications:**
- The "no scheduling at all" pattern is the cheapest design — let the user drive when work happens.
- It's also the *least automated* — bookkeeping that doesn't run unless invoked accumulates as "agent debt."
- For OK's compatibility matrix (which includes Claude Desktop, Cowork, Claude.ai web — none of which have hooks or agent CLIs), this pattern leaves users in those hosts with **no automation at all**. That's the tradeoff GBrain solved by going Postgres-native + Minions.

### Finding: aaronoah/llm-wiki-skill's "BYO LLM" framing is achieved by *being agent-agnostic*, not by exposing a config
**Confidence:** CONFIRMED
**Evidence:** [aaronoah/llm-wiki-skill README](https://github.com/aaronoah/llm-wiki-skill) (web fetch):

> "This skill is designed natively for CLI environments [...] activate your agent (Codex Cli, Gemini Cli, Claude Code Cli etc) at the wiki root level."

The skill provides commands that work the same regardless of which agent is invoking them. There is no `command:` config or env var that selects an agent — the agent is whatever the user is currently running.

**Implications:**
- "BYO LLM" can mean two different things:
  1. **The skill is agent-agnostic** — it provides a consistent surface; whatever agent loads the skill runs it. (aaronoah pattern)
  2. **The scheduler invokes a user-supplied agent CLI** — config explicitly specifies the command. (GBrain Minions does this; no other surveyed implementation does it fully.)
- Most "BYO LLM" claims in the ecosystem are option 1 — agent-agnostic skill design — not option 2. The distinction matters for OK because option 1 covers interactive use; option 2 is needed for autonomous scheduled use. **OK needs both.**

### Finding: Anthropic Claude Code Routines (Q1 2026) is prescriptive but cloud-managed
**Confidence:** CONFIRMED
**Evidence:** Per prior `consolidate-and-overnight-patterns` research:

> "Anthropic's Q1 2026 release introduced Scheduled Tasks — Claude Code can now run on managed cloud infrastructure on a cron schedule."
>
> "Claude Code Routines let you schedule AI agents to run in Anthropic's cloud on a fixed cadence — no server required. Routines require the Max plan ($20/month)."

This is the cleanest option *if* the user is on the Max plan and uses Claude Code. It's also fundamentally vendor-locked.

**Implications:**
- Routines is a high-quality option for one specific subset of users (Anthropic Max subscribers using Claude Code).
- For the other ~half of OK's target population (Codex users, Cursor users, local-LLM users, no-subscription users), Routines is irrelevant.
- A cross-host-friendly OK design **must not depend on Routines**, but should integrate cleanly *with* it for users who choose to use it. (`cmd: anthropic-routines submit ...` is a valid `automation.jobs[]` entry — same shape as any other agent invocation.)

---

## Synthesis: the convergent architecture in the wild

The surveyed implementations converge on three design choices, with a fourth axis where they diverge:

| Axis | Convergence |
|---|---|
| **Lint splits into deterministic + LLM-required** | All implementations that have lint do this. (GBrain's 13 lint surfaces split deterministic-vs-LLM, Pratiyush's 8+3 split, OK's emerging deterministic-7-vs-LLM-required-5.) |
| **Deterministic side runs autonomously on cron** | GBrain Minions, Pratiyush mechanical rules. |
| **LLM-required side requires explicit invocation** | All implementations defer LLM-driven work to either (a) the user's interactive agent, or (b) a generic runner the user supplies a command to. |
| **Whether the LLM-required side has a built-in scheduler** | **Diverges.** GBrain Minions can run anything (including agent CLIs); eugeniughelbur is locked to Claude Code; Pratiyush punts; aaronoah relies on the user being in their agent. |

**OK's design choice on the divergent axis:** ship a generic shell-job runner (GBrain Minions shape), let users supply any command including agent CLIs. **No prescribed agent. No default. The runner doesn't know whether the job is `lychee` or `claude --print` — it just executes.**

This is the most general design with the strongest production precedent (GBrain's working 45k-page system).

---

## Gaps / follow-ups

- **Job table schema** for the OK port — GBrain uses `src/engines/postgres/jobs.ts` (not fetched in the parity audit). Whether OK should store job state in Hocuspocus's existing SQLite footprint, in a new SQLite file, or push toward Postgres (which the prior parity audit ranks as parallel work item #5) is a design decision the SPEC needs to answer.
- **Smoke-check enumeration** — the 8 post-restart `smoke` checks aren't enumerated in fetched content. Worth replicating the spirit if not the specifics.
- **Supervisor rolling-restart semantics** are unclear from public docs — relevant if OK adopts the supervisor tier.
