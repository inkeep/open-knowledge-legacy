# OK Shell-Job Runner ("OK Minions") — Spec

**Status:** Approved (audit reopens H1 and M11 resolved 2026-04-28: D3 substrate = JSON-file-per-run; D25 lint = on-disk read; SQLite migration path noted as Future Work)
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-28
**Baseline commit:** 54443690
**Links:**
- Source architecture: [`reports/ok-integrated-knowledge-lint-architecture/`](../../reports/ok-integrated-knowledge-lint-architecture/REPORT.md) (Phase 4 + Distribution Layer 3)
- Canonical industry precedent: [`reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`](../../reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md)
- Synthesized precedent landscape: [`reports/ok-integrated-knowledge-lint-architecture/evidence/precedent-shell-job-runners.md`](../../reports/ok-integrated-knowledge-lint-architecture/evidence/precedent-shell-job-runners.md)
- Sibling concept research: [`reports/knowledge-linting-karpathy-workflow/`](../../reports/knowledge-linting-karpathy-workflow/), [`reports/consolidate-and-overnight-patterns/`](../../reports/consolidate-and-overnight-patterns/), [`reports/agent-host-hooks-cross-host/`](../../reports/agent-host-hooks-cross-host/)

---

## 1) Problem statement

**Situation:** Open Knowledge ships HTTP API endpoints (`/api/dead-links`, `/api/orphans`, `/api/hubs`, etc.) plus MCP tools that let agents lint and maintain a knowledge base interactively. But maintenance is purely on-demand: the user has to be in their agent and ask. Across the OK target host matrix (Claude Code, Cursor, Codex, Windsurf, Copilot CLI, Continue, Aider, Claude Desktop, Cowork, Claude.ai web — ten hosts), there is **zero automated bookkeeping** today — every check fires only when a human invokes it. Whether the project is a wiki, an LLM brain, a spec collection, a research log, or any other markdown-shaped knowledge base, this gap is identical.

**Complication:** Karpathy framed wikis as abandoned because *"the maintenance burden grows faster than the value"* (KB-shape-neutral framing applies equally to any markdown-shaped knowledge base) — that pattern only breaks when maintenance fires without human attention. The 17-check lint taxonomy (`knowledge-linting-karpathy-workflow/`) needs cron-style execution to deliver its value. GBrain's production-validated answer (Minions: 20+ recurring cron jobs at production deployments measured at 17,888 pages and 45,000 pages, $0/job for deterministic work, 100% durability) is to ship a **generic shell-job runner** that's agent-CLI-agnostic. OK has no equivalent — and even if it did, the deterministic lint primitives the runner would call are atomic-only (6 graph-health endpoints; no aggregator, no `ok lint` command, no bundled example script). Without both pieces, the deterministic-7 lint checks remain interactive-only, and the LLM-required-5 checks have no path to scheduled invocation regardless of agent CLI preference.

**Resolution:** Ship two coupled primitives in v1:

1. **"OK Minions" — a generic shell-job runner** modeled directly on GBrain's pattern. The user declares jobs in `.open-knowledge/config.yml`; each job is `{name, schedule, cmd, argv, cwd, env, ...}`. Agent-CLI-agnostic by design — `cmd` can be any executable. Off-by-default security gate (`OK_ALLOW_SHELL_JOBS=1`).
2. **`ok lint` CLI command + `lint` MCP tool aggregator** that wraps **4 of the 6 existing graph-health HTTP endpoints** (`/api/dead-links`, `/api/orphans`, `/api/hubs`, `/api/forward-links`) plus content-scan-derived redlinks into a single invocation, normalized output, exit-code-on-findings semantics. `/api/backlinks` and `/api/link-graph` are deliberately excluded (per-doc / aggregate queries, not corpus-lint sources). Plus a bundled example script (`examples/scheduling/scripts/lint-deterministic.sh`) so the runner has a turnkey thing to schedule from day one. **Net-new check primitives (source traceability, index drift, tag consistency, the 5 LLM-required checks) remain out of scope — separate specs.**

OK ships **no default agent CLI**. The combination — runner + lint aggregator + bundled bash example — gives every persona a working end-to-end loop on day one regardless of agent stack (or none).

---

## 2) Goals

- **G1: Cross-host automated bookkeeping output.** The runner executes on the user's OS (cron / launchd / systemd / GH Actions) — setup requires terminal access. The produced reports are consumable from **any** OK target host, including hosts with no terminal access (Claude Desktop, Cowork, Claude.ai web), where the user reads reports inside their interactive session. Distinguish setup-requires-terminal from output-consumable-anywhere.
- **G2: Agent-CLI-agnostic by default.** No prescribed `cmd`. The user supplies whatever they want — bash, agent CLI, custom orchestrator. OK ships zero defaults for the LLM-required side.
- **G3: Deterministic-side works without any LLM, out of the box.** `ok lint` ships in v1 and aggregates the 5 existing graph-health endpoints into a single invocation. A user with no Anthropic / OpenAI / local-model setup can `automation.jobs[]` with `cmd: ok lint` and have a working nightly loop on install day. **Free, no credentials, no per-run cost.**
- **G4: Production-grade safety posture from v1.** Off-by-default security gate. Idempotent operations. Crash-safe state. Failure containment (one failed job doesn't crash the worker).
- **G5: Mirror GBrain's industry-validated shape.** Generic shell-job submission, idempotency keys, exponential backoff with jitter — adopt the validated parts of GBrain's Minions contract directly. Two-tier deployment (basic worker / supervisor) is future work (NG3).
- **G6: KB-shape neutrality.** OK supports any markdown-shaped knowledge base — wiki, LLM brain, spec collection, research log, agent memory, project docs. The runner and `ok lint` work the same regardless of project layout. No assumed `wiki/` directory; report output is configurable; default paths sit in `.open-knowledge/` (OK metadata) rather than the user's content tree.

## 3) Non-goals

- **[NEVER] NG1:** OK does not ship a default agent CLI or a "blessed" agent invocation. Even if 90% of users would pick `claude --print`, OK does not encode that assumption. Picking violates the agent-agnostic principle and creates a vendor-lock-in moral hazard.
- **[NEVER] NG2:** OK does not store or proxy LLM API credentials. Credentials live where the user's chosen `cmd` expects to find them (env vars, secret files, vendor-specific stores). OK reads `env:` from job config and forwards; it does not introspect.
- **[NEVER] NG3:** OK does not assume a `wiki/`, `articles/`, `docs/`, or any other project-layout convention. The runner and `ok lint` are KB-shape neutral. Default paths live in `.open-knowledge/` (OK metadata); content paths are user-configured. A wiki-shaped project, a spec-collection-shaped project, and an LLM-brain-shaped project all use the same surface.
- **[NOT NOW] NG4:** Postgres-native job queue with parent-child DAGs and durable subagents (the full GBrain Minions/Subagents stack). v1 ships single-process SQLite-backed worker; multi-worker + DAG fan-out is future work. Revisit when: OK adopts a Postgres index (parity work item #1 — hybrid retrieval).
- **[NOT NOW] NG5:** Net-new check primitives in `ok lint` — source traceability, index drift, tag consistency, hub freshness, supersedes-chain validity, embedding freshness, external-URL rot, and all 5 LLM-required checks (contradictions, data gaps, lost-nuance regression, hallucination amplification, over-confident summaries). v1 `ok lint` wraps only the 5 existing graph-health endpoints. Each net-new check is a separate spec.
- **[NOT NOW] NG6:** Recompile MCP tool implementation. Spec'd separately. The shell-job runner provides the scheduling substrate; recompile is a job-command consumer.
- **[NOT NOW] NG7:** MCP sampling capability registration. Spec'd separately. The shell-job runner enables LLM-required checks via agent-CLI jobs; sampling is the alternative in-session path.
- **[NOT NOW] NG8:** Editor UI for job status. v1 has CLI status (`ok schedule status`); UI integration is future work. Revisit when: file-tree lint badges (Phase 5 in the architecture report) ship.
- **[NOT UNLESS] NG9:** Cloud-hosted scheduler (Anthropic-Routines-equivalent). Only if: a clear customer demand emerges for managed cron beyond what users can do with launchd/systemd/cron/GH Actions locally.

## 4) Personas / consumers

### P1: Solo KB maintainer (deterministic-only, no LLM)
- **JTBD:** When I'm running a personal knowledge base on my laptop, but I don't have an Anthropic / OpenAI / local-model subscription and don't want one, help me catch broken links and orphaned pages overnight, so I can fix them in the morning.
- **Current workflow + workarounds:** Manually invokes lint commands when they remember; orphans accumulate between checks.
- **Pain points:** No automation means bookkeeping rots; no signal that decay is happening.
- **Trust/security sensitivities:** Doesn't want a daemon running random shell. Wants explicit opt-in to any "OK runs commands automatically" capability.
- **Success in their terms:** Cron entry exists; a markdown file lands every morning with detected issues; **zero LLM cost**. They write **two lines** of config (`cmd: ok lint`, `schedule:`) and one `ok schedule install` command.

### P2: Single-agent power user (their agent of choice + LLM-required checks)
- **JTBD:** When I use Claude Code (or Codex, or Cursor, or local Ollama) every day for my KB, help me wire my agent of choice into a nightly schedule so the deep semantic checks (contradictions, data gaps, lost-nuance) run while I sleep, so I see findings as a PR Monday morning.
- **Current workflow + workarounds:** Runs slash commands when they remember; LLM checks are expensive enough that they batch them — but batching means stale state.
- **Pain points:** No way to schedule LLM checks without baking in *some* specific agent CLI; every existing tool either prescribes Claude Code or doesn't schedule LLM work at all.
- **Trust/security sensitivities:** Wants their credentials handled the way *their* agent CLI handles them — doesn't want OK to be the credential broker.
- **Success in their terms:** Two lines in `.open-knowledge/config.yml` (`cmd: <my-agent>` + `schedule:`) and a cron entry; nightly runs with their agent, surfaces findings.

### P3: Team with mixed agent preferences and per-area workflows
- **JTBD:** When my team has different members preferring Claude / Codex / local-model, and we have multiple KB areas (e.g., one folder per topic), help me schedule per-area nightlies that each use a different agent CLI without forcing the team onto one stack.
- **Pain points:** Existing tools force one agent stack; team-wide adoption fails because different members want different tools.
- **Trust/security sensitivities:** Per-area attribution must be auditable in the shadow repo (precedent #25 writer-ID taxonomy).
- **Success in their terms:** Per-area `automation.jobs[]` entries with different `cmd` values; per-area `agent_label`; shadow-repo attribution distinguishes areas.

## 5) User journeys

### P1: Solo deterministic user

1. **Discovery:** sees `ok schedule --help` mentioned in OK init output; reads docs for "deterministic lint nightly."
2. **Setup:** edits `.open-knowledge/config.yml`, adds one job entry: `cmd: ok`, `argv: [lint, --output, .open-knowledge/lint-reports/{date}.md]`. Sets `OK_ALLOW_SHELL_JOBS=1` in shell profile. Runs `ok schedule install --job=lint-nightly` which writes a launchd plist (or systemd unit, or crontab entry). User explicitly enables it (`launchctl load …`) — OK doesn't auto-enable.
3. **First use:** `ok schedule run --job=lint-nightly --once` runs immediately. Report file lands at `.open-knowledge/lint-reports/<date>.md`. User opens the file, sees the findings (dead links, orphans, redlinks, hub candidates) grouped by type.
4. **Ongoing use:** Cron fires at 10 PM daily. Each morning, user reads report, fixes issues. The path is in `.open-knowledge/` by default; user can re-route output to anywhere via `--output` (e.g., into their content tree if they want it linked from the KB index).
5. **Failure / debug:** Job fails (e.g., Hocuspocus not running, exit code 2). Failure logged at `.open-knowledge/jobs/<job-name>-<run-id>.log`. `ok schedule status` shows last-N runs with status. User can re-run manually.
6. **Growth:** Adds a `--scope` flag to focus the job on a sub-area (e.g., `argv: [lint, --scope, "articles/auth/**", --output, ...]`). Adds a second job that runs `ok lint --check dead-links` on every commit via a git hook (different cadence than the nightly).

### P2: Single-agent power user

(Same first 4 steps with `cmd: claude` instead of bash script + a `prompt_file:` entry.)

5. **Failure / debug:** Agent CLI fails (e.g., API rate limit, credential expired). Job exit code captured; failure escalates to `.open-knowledge/jobs/failures.md` (per FR12). User reviews, fixes credentials, re-runs.

### P3: Team with mixed agents

(Same shape; each `automation.jobs[]` entry has its own `cmd`.)

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `ok schedule list` | "loading…" / cancellable | "no jobs configured" message | config-parse error displayed; lists job-names that *did* parse | table of jobs with last-run status | |
| `ok schedule run --once` | progress logged to stderr | n/a | non-zero exit, structured error JSON | exit 0, structured success JSON | partial findings if subcommand exits mid-run |
| `ok schedule status` | "loading…" | "no runs yet" | shows failed runs prominently | last-N run table | per-job in-flight indicator |
| `ok schedule install` | n/a | n/a | scheduler-detection failure → instructs user | writes config; prints next step ("run `launchctl load`") | n/a |
| Worker mid-run | logs streamed to log file | n/a | per-job error captured; worker continues | job status persisted | n/a |

## 6) Requirements

### Functional requirements

| Requirement | Acceptance criteria | Notes |
|---|---|---|
| **FR1:** Shell-job declaration in `.open-knowledge/config.yml` | A `automation.jobs[]` array with `{name, schedule, cmd, argv, cwd, env, scope, agent_label, prompt_file}` is accepted by config schema validation. Invalid jobs fail validation with field-level error messages. | Zod schema in `packages/cli/src/config/schema.ts`. |
| **FR2:** Off-by-default security gate | If `OK_ALLOW_SHELL_JOBS=1` is not set in the worker process env, `ok schedule run` exits non-zero with `Error: shell jobs require OK_ALLOW_SHELL_JOBS=1`. Default off. | Mirrors GBrain `GBRAIN_ALLOW_SHELL_JOBS=1`. Worker-process-level, not config-level — OK is opinionated that this is operational, not configurational. |
| **FR3:** Placeholder substitution | The runner substitutes `{prompt}`, `{prompt_file}`, `{cwd}`, `{report_path}`, `{agent_label}` in `argv[]`, `env[*]`, and `cwd`. `{prompt}` reads `prompt_file` contents and inlines as a single argument. `{prompt_file}` resolves to absolute path. Unknown placeholders fail with field-name error. | Strict substitution. Failure mode: missing `prompt_file` when `{prompt}` or `{prompt_file}` is referenced → fail before exec. |
| **FR4:** Job execution | The runner spawns the `cmd argv...` process with merged env (parent + job `env:`), in `cwd`, captures stdout/stderr to `.open-knowledge/jobs/<job-name>-<run-id>.log`, enforces `timeout_ms` via `AbortSignal`, returns exit code. | `node:child_process.spawn`. No shell expansion (security: cmd + argv stay separate). |
| **FR5:** Job state persistence | Every run is recorded as a JSON file at `.open-knowledge/jobs/runs/<run-id>.json` containing the JobRun schema (`{run_id, job_name, started_at, finished_at, exit_code, status, retry_count, log_path, error_message, idempotency_key}`). `status ∈ {pending, running, succeeded, failed, cancelled}`. `run_id` is a ULID for sortability. State survives worker crash + restart. | New directory `.open-knowledge/jobs/runs/`. No DB engine — pure `node:fs/promises`. Atomic-rename for status updates (D23). |
| **FR6:** Idempotency keys | Optional `idempotency_key` on a job; if a job with the same key is already `running` or completed within `idempotency_window_seconds`, the new submission is rejected. | Mirrors GBrain Minions. Default: no key, every run is independent. |
| **FR7:** Retry with exponential backoff | Default `max_retries: 3`, `retry_initial_seconds: 30`, `retry_jitter: true`. Per-job override. Failed runs are re-enqueued with backoff. After max retries, status = `failed`. | Configurable per job. |
| **FR8:** `ok schedule list` | CLI command lists configured jobs from `automation.jobs[]` with last-run status from `jobs.db`. Output: human (default) or JSON (`--json`). | |
| **FR9:** `ok schedule run --once` | CLI command runs a single named job synchronously; exits with the job's exit code. Used for manual invocation and for cron entries that delegate to OK. | The user's cron entry can be `ok schedule run --once --job=lint-nightly` instead of executing the `cmd` directly — gives OK visibility into runs. |
| **FR10:** `ok schedule status` | CLI command shows last-N runs across all jobs (default N=20) with status, duration, exit code. Output: human or JSON. | Reads `jobs.db`. |
| **FR11:** `ok schedule install --job=<name>` | CLI command detects the user's scheduler (launchd / systemd / cron / Task Scheduler), generates the appropriate scheduler config that invokes `ok schedule run --once --job=<name>`, writes it to the expected location, and prints the **explicit enable command** the user must run themselves (e.g., `launchctl load ~/Library/LaunchAgents/com.openknowledge.<name>.plist`). | OK never auto-enables; the user must take an explicit step to activate. |
| **FR12:** Failure escalation | Failed runs (after retries exhausted) append a row to `.open-knowledge/jobs/failures.md` (markdown table: timestamp, job-name, exit-code, log-link). The KB may also surface this via a future lint check; v1 just writes the file. | Append-only. |
| **FR13:** OTel instrumentation | Each async run wraps the spawn-and-wait in `withSpan` (async variant; ends after child exits, can set `job.exit_code` / `job.retry_count` post-exit). Synchronous parts (placeholder substitution, state-row insertion) wrap in `withSpanSync`. Span attributes: `job.name`, `job.schedule`, `job.exit_code`, `job.retry_count`. Conforms to OK's bounded-cardinality discipline (CLAUDE.md STOP rule on unbounded-cardinality span attributes; reuse `normalizeFsPath` / `classifyFsPath` from `fs-traced.ts` if any path attributes are emitted). | Existing `packages/server/src/telemetry.ts:181-202` for `withSpanSync`; `withSpan` is the async sibling. |
| **FR14:** Prompt template directory | OK looks for prompt files at `<contentDir>/.open-knowledge/prompts/*.md` by default. The job config's `prompt_file:` field is a path relative to project root. OK ships `examples/prompts/{nightly-5-phase,weekly-deep-audit,recompile-eligible}.md` under the package; users copy into their project. | Examples-by-copy, not auto-installed. |
| **FR15:** Per-stream `agent_label` | When a job sets `agent_label: <label>`, the runner sets `AGENT_LABEL=<label>` in the spawned process env. Downstream agent CLIs (when they connect to OK MCP) thread this through OK's existing writer-ID taxonomy (precedent #25). | Pre-existing OK convention. |
| **FR16:** Examples for major agent CLIs | OK ships `examples/scheduling/{deterministic-only,claude,codex,aider-ollama,anthropic-routines}.yml` showing complete `automation.jobs[]` entries. Each example is a copy-paste starting point; **OK does not pick a default**. | Documentation, not code. |
| **FR17:** `ok lint` CLI command | New CLI command `ok lint [--output <path>] [--json] [--scope <glob>] [--check <names>] [--quiet] [--strict\|--no-strict] [--content-dir <path>]` reads on-disk markdown from `<contentDir>` (per `.open-knowledge/config.yml`), parses with the existing OK markdown pipeline, builds an in-memory link graph, and emits a unified `Finding[]` as human-readable text (default), JSON (`--json`), or markdown report (`--output`). **Does NOT require Hocuspocus** (D25). | Reads filesystem directly — no HTTP, no server dependency. Computes the same checks the corresponding HTTP endpoints would (`/api/dead-links`, `/api/orphans`, `/api/hubs`, `/api/forward-links`) plus content-scan-derived redlinks. **`/api/backlinks`, `/api/backlink-counts`, `/api/link-graph` are existing endpoints deliberately excluded — per-doc / aggregate-graph queries, not corpus lint checks; agents who need them call the existing `get_backlinks` / `get_forward_links` MCP tools.** Net-new check primitives are NG5 (NOT NOW). |
| **FR18:** `lint` MCP tool | New MCP tool `mcp__open-knowledge__lint({scope?, checks?, format?})` returns the same `{findings, summary, report?}` shape as the CLI. Agent-callable. **Two read paths (per D25):** invoked inside a running OK session → reads from the live `backlinkIndex` (no re-parse cost); invoked standalone (no Hocuspocus) → falls back to the on-disk path the CLI uses. Both produce identical `Finding[]`. | Same `Finding[]` schema as FR17. The dual-path is implementation detail; the agent sees one tool with one output shape. |
| **FR19:** `Finding` shared type | Unified Zod schema for findings: `{type, severity, message, source?, target?, doc?, ...}`. Lives in `packages/cli/src/lint/types.ts`. Used by both CLI and MCP tool; output (JSON / markdown) is derived from this single source. | Five `type` values in v1: `dead-link`, `orphan`, `hub-candidate`, `redlink`. Severity: `info`/`warn`/`error`. |
| **FR20:** Exit-code-on-findings | `ok lint` exits 0 when no findings (or `--no-strict`), exits 1 when findings exist with default `--strict`, exits 2 on error (server unreachable, config invalid). This makes `ok lint` usable as a CI gate or a Tier-A hook (PostToolUse blocker). | Mirrors lychee/markdownlint conventions. The `--no-strict` flag covers users who want findings logged but don't want the cron job to register as failed. |
| **FR21:** Default output path | Without `--output`, lint findings print to stdout (human-readable). With `--output <path>`, write a markdown report to that path. With `--output` and no path, default to `.open-knowledge/lint-reports/<date>.md`. The default path is in `.open-knowledge/` (OK metadata) — KB-shape-neutral; the user can re-route to their content tree if they want findings indexed alongside content. | Date format: ISO-8601 date (`YYYY-MM-DD`). Report dir created on demand. |
| **FR22:** Bundled deterministic-only example | OK ships `examples/scheduling/scripts/lint-deterministic.sh` — a one-liner wrapper around `ok lint --output ...`. Same job in YAML form ships at `examples/scheduling/deterministic-only.yml`. Users copy-paste; OK does not auto-install. **Bundled cron-style examples use `--no-strict`** (avoids cron-email-on-non-zero-exit spam); hook-style examples (PostToolUse) use the default `--strict`. | ~10 LOC bash. The example exists primarily to make the install-day experience two lines of YAML. The `--no-strict` choice in cron examples reflects D14's rationale — exit-on-findings is right for hooks/CI but hostile for cron. |
| **FR23:** Lint-scope disclosure in output | `ok lint` output (human-readable, JSON, markdown) MUST include "Checks run" and "Not yet checked" sections. Human/markdown formats list each check name with status: ✓ ran / ✗ not yet implemented (with reference to which planned spec). JSON format includes `summary.checks_run: string[]` and `summary.checks_not_yet_implemented: string[]`. Prevents the "looks clean, isn't" failure mode where users assume `ok lint` covers all knowledge-quality checks when v1 only covers graph-integrity. | Net-new requirement. The 4 deterministic checks v1 ships (dead-link, orphan, hub-candidate, redlink) plus the future-work check inventory (source-traceability, index-drift, tag-consistency, hub-freshness, supersedes-chain, embedding-freshness, external-URL-rot, the 5 LLM-required checks) come from `reports/knowledge-linting-karpathy-workflow/` 17-check taxonomy. |

### Non-functional requirements

- **Performance:** Worker startup ≤ 300ms cold. GBrain Minions measure ~753ms in production at 45k pages — OK targets <½ that because the runner has no Postgres engine, no resolver, no skills layer to initialize. If OK's measured cold-start exceeds 500ms, treat it as a regression. Job submission overhead ≤ 50ms. Single-job state-write ≤ 10ms (target depends on chosen substrate per H1 resolution; reconfirm post-pick).
- **Reliability:** State survives worker crash (SQLite WAL durable). Stranded `running` jobs at boot are reconciled to `failed` (with reason `worker-crashed`). No silent data loss.
- **Security/privacy:**
  - Off-by-default `OK_ALLOW_SHELL_JOBS=1` env gate.
  - `cmd + argv` not subject to shell expansion (no `system()` / shell-string concatenation).
  - Job logs may contain credentials forwarded via `env:` — log directory is `chmod 700`.
  - No remote submission: jobs are CLI-submitted only (mirrors GBrain MCP-boundary block).
- **Operability:**
  - Structured logs to stderr (existing OK pino patterns).
  - `ok schedule status --json` for monitoring integration.
  - Per-job log file at predictable path.
- **Cost:** Zero infrastructure cost beyond what OK already requires (SQLite, Node/Bun runtime). LLM cost is per-job and is the user's `cmd` choice.

## 7) Success metrics & instrumentation

- **M1:** Number of OK installations with at least one configured `automation.jobs[]` entry (telemetry: deterministic check at OK startup; opt-in)
  - Baseline: 0
  - Target: 30%+ of active OK projects within 6 months of v1 release
  - Instrumentation: `ok.scheduler.config.jobs_count` gauge at boot
- **M2:** Job success rate
  - Baseline: n/a
  - Target: ≥ 95% non-retry success rate for deterministic jobs; ≥ 80% for LLM-using jobs (lower because LLM CLIs fail more)
  - Instrumentation: `ok.scheduler.job.runs_total` counter with `status` label
- **M3:** Mean time-to-fix for findings surfaced by scheduled lint
  - Baseline: n/a (no scheduled lint exists)
  - Target: median ≤ 7 days between finding-surfaced and fix-committed
  - Instrumentation: cross-reference job-run timestamps with git-log on the content tree
- **What we will log/trace:** job start/end spans, exit codes, retry counts, log-file paths, schedule configurations (sanitized of credentials)
- **How we'll know adoption/value:** users with multiple `automation.jobs[]` entries (signal that they've graduated past the first job); presence of `examples/scheduling/*.yml` content copied into user configs

## 8) Current state (how it works today)

- OK has HTTP API endpoints for the deterministic graph-health checks (`/api/dead-links`, `/api/orphans`, `/api/hubs`, `/api/backlinks`, `/api/forward-links`, `/api/link-graph`).
- OK has corresponding MCP tools (`get_dead_links`, `get_orphans`, etc.).
- OK has the `hints[]` channel surfaced on `/api/agent-write-md` responses (see `linting-coverage-and-gaps/` for inventory).
- OK has the workflow tools (`ingest`, `research`, `consolidate`) registered in `packages/cli/src/mcp/tools/index.ts`.
- OK uses Zod for config validation (`packages/cli/src/config/schema.ts`) and elsewhere.
- OK has SQLite via Hocuspocus (existing dependency, already used for CRDT state at `<projectRoot>/.git/open-knowledge/`).
- OK has OTel instrumentation primitives (`packages/server/src/telemetry.ts` — `withSpanSync`, `getMeter`).
- OK has CLI commands at `packages/cli/src/commands/{init,start,seed,clone,pull,push,preview,mcp,clean,editors,install-skill,...}`.
- OK has the writer-ID taxonomy (precedent #25, five classes including `agent-<connId>`) ready for `AGENT_LABEL` threading.

**No scheduled-work primitives exist.** No background daemon, no cron integration, no job state.

**Known gaps from research:** No way for users on Claude Desktop / Cowork / Claude.ai web (hosts without hooks) to get any automated bookkeeping (per `agent-host-hooks-cross-host/` research).

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **CLI:** New `ok schedule` command group: `list`, `run`, `status`, `install`, `worker` (latter only if Phase 2 supervisor is in scope; v1 = run-once-per-cron-fire pattern).
- **Config:** New `automation.jobs[]` block in `.open-knowledge/config.yml`, schema-validated.
- **Files:** `.open-knowledge/jobs.db` (SQLite state), `.open-knowledge/jobs/<job-name>-<run-id>.log` (per-run logs), `.open-knowledge/jobs/failures.md` (failure summary).
- **Templates:** `.open-knowledge/prompts/*.md` (user-supplied prompt templates referenced by `prompt_file:`).
- **Examples** (shipped under `examples/scheduling/`): `deterministic-only.yml`, `claude.yml`, `codex.yml`, `aider-ollama.yml`, `anthropic-routines.yml`.
- **Docs:** New section in OK docs: "Scheduled Maintenance" with the GBrain-Minions precedent cited and the agent-agnostic principle stated explicitly.
- **Error messages:** Structured. Field-level config errors. Exit codes documented.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `ok schedule list` | CLI | Lists configured jobs, parses config, surfaces validation errors |
| `ok schedule run --once --job=<n>` | CLI | Runs job synchronously, returns exit code |
| `ok schedule status` | CLI | Shows recent runs from `jobs.db` |
| `ok schedule install --job=<n>` | CLI | Detects scheduler, writes config, prints enable instruction |
| `automation.jobs[]` in `config.yml` | Config | Schema-validates new block; existing OK config still works without it |

### System design

**Architecture overview:**

```
.open-knowledge/config.yml  ──► Zod schema (schema.ts)  ──► JobConfig[]
                                                              │
                                                              ▼
                                  ┌───────────────────────────────────────┐
                                  │  ok schedule run --once --job=<name>  │
                                  │                                       │
                                  │  1. Load + validate job               │
                                  │  2. Check OK_ALLOW_SHELL_JOBS=1       │
                                  │  3. Substitute placeholders           │
                                  │  4. Begin SQLite tx (status=running)  │
                                  │  5. Spawn cmd argv... + capture I/O   │
                                  │  6. On exit: update status, log path  │
                                  │  7. Retry-on-failure logic            │
                                  └───────────────────────────────────────┘
                                                              │
                                                              ▼
                                                .open-knowledge/jobs.db
                                                .open-knowledge/jobs/*.log

User's cron / launchd / systemd  ──► invokes `ok schedule run --once …`
                                                              │
                                                              ▼
                                                Same flow as above
```

**Key principle:** OK is the runner; the user's scheduler is the trigger. **OK does not run a long-lived daemon in v1.** Each cron firing invokes `ok schedule run --once`, which starts → runs the job → persists state → exits. This is the GBrain Minions PGLite-mode pattern (no persistent worker; `--follow` style).

**Data model:**

```typescript
// packages/cli/src/scheduler/types.ts (Zod-validated)
const JobConfigSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'lowercase, hyphens, max 64 chars'),
  schedule: z.string().optional(), // cron string; informational (the user's scheduler enforces)
  cmd: z.string().min(1),
  argv: z.array(z.string()).default([]),
  cwd: z.string().optional(), // defaults to project root
  env: z.record(z.string(), z.string()).default({}),
  prompt_file: z.string().optional(), // path relative to project root
  scope: z.string().optional(), // glob, e.g. "articles/auth/**"
  agent_label: z.string().optional(), // for AGENT_LABEL env injection
  timeout_seconds: z.number().int().positive().default(900), // 15 min default
  max_retries: z.number().int().nonnegative().default(3),
  retry_initial_seconds: z.number().int().positive().default(30),
  retry_jitter: z.boolean().default(true),
  idempotency_key: z.string().optional(),
  idempotency_window_seconds: z.number().int().positive().default(3600), // 1 hour
});

type JobConfig = z.infer<typeof JobConfigSchema>;

const JobRunSchema = z.object({
  run_id: z.string().uuid(),
  job_name: z.string(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
  exit_code: z.number().int().nullable(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  retry_count: z.number().int().nonnegative(),
  log_path: z.string(),
  error_message: z.string().nullable(),
});

type JobRun = z.infer<typeof JobRunSchema>;
```

**JSON-file-per-run layout (`.open-knowledge/jobs/runs/`):**

```
.open-knowledge/jobs/
├── runs/
│   ├── 01HMS7N4XVQE3GB3QAGEKC0F2K.json   # ULID-keyed run record (JobRun schema)
│   ├── 01HMS80F0ZBQK21VG4DQXKN2YH.json
│   └── ...
├── logs/
│   ├── lint-nightly-01HMS7N4XVQE3GB3QAGEKC0F2K.log
│   └── ...
├── failures.md                             # FR12 escalation log
└── (chmod 700 on jobs/ and all subdirs at creation, per D12)
```

Each `<run-id>.json` is a complete `JobRun` record (see Zod schema in §9). ULID provides naturally sortable IDs (millisecond timestamp prefix + entropy suffix). Listing recent runs = `readdir(runs/) → sort desc → take N`. Idempotency check = `readdir → filter by idempotency_key + status='running' AND started_at within window`.

**Operations:**
- **Insert** (new run): write `<run-id>.json.tmp` → fsync → rename to `<run-id>.json`.
- **Update** (status transition): re-write the same `<run-id>.json` via tmp+rename.
- **List** (status command): `readdir`, parse N most recent (sort by ULID desc).
- **Reconcile stranded** (boot pass): `readdir`, find `status='running' AND started_at < NOW() - (timeout_s+60s)`, rewrite each as `failed`.

No DB engine. No migration logic at boot. The directory IS the database. Pure `node:fs/promises`.

**API/transport:** N/A in v1 — CLI-only submission, no remote API. Future remote-submission would need explicit MCP-boundary discussion (mirroring GBrain's CLI-only stance).

**Auth/permissions:** None within OK. The user's `cmd` carries its own credentials via `env:` forwarding. OK's responsibility is bounded to safe forwarding.

**Enforcement point(s):**
- `OK_ALLOW_SHELL_JOBS=1` env check at `ok schedule run` entry.
- Zod schema validation at config-load.
- Path-traversal check on `cwd`, `prompt_file` (must be within project root).
- File-mode check on `.open-knowledge/jobs/` directory (chmod 700 on creation).

**Observability:**
- OTel span per run via `withSpanSync('ok.scheduler.run', { attributes: { 'job.name', 'job.retry_count', 'job.exit_code' } }, ...)`.
- Counter: `ok.scheduler.job.runs_total{job_name, status}`.
- Histogram: `ok.scheduler.job.duration_seconds{job_name}`.
- Per-run log file at predictable path.
- `meta/_changelog.md`-style appended trace optional (low priority).

#### Data flow diagram

- **Primary flow:** user's scheduler fires `ok schedule run --once --job=<name>` → load config + validate → check env gate → substitute placeholders → begin SQLite tx (status=running) → spawn `cmd` → on exit → update status + log path → emit OTel span → exit with the job's exit code.
- **Shadow paths to test:**
  - **nil / missing:** `prompt_file` referenced but file doesn't exist → fail with field-level error before spawn; status=failed, error_message="prompt_file not found".
  - **empty:** Job declared but `cmd` is empty string → Zod validation rejects at config-load.
  - **wrong type:** `argv: "string instead of array"` in config → Zod rejects.
  - **timeout:** spawned process exceeds `timeout_seconds` → `AbortSignal` fires; SIGTERM → SIGKILL after grace; status=failed, exit_code=null, error_message="timeout".
  - **conflict:** Two `ok schedule run` for same `job_name` simultaneously → second sees existing `running` row, refuses (idempotency-window logic).
  - **partial failure:** spawned process exits non-zero after partial output → log captured, exit code recorded, retry logic engages.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Config parser | Invalid YAML / Zod fail | At `ok schedule run` entry | Print field-level error, exit 1 | User edits config |
| Env gate | `OK_ALLOW_SHELL_JOBS` unset | At entry | Exit non-zero with message | User exports env var; opt-in is intentional |
| Spawn | `cmd` not on PATH | `child_process.spawn` ENOENT | Status=failed, error_message="cmd not found" | User fixes PATH or `cmd` |
| Spawn | Permission denied | `child_process.spawn` EACCES | Status=failed | User fixes file mode |
| Worker crash | OK process dies mid-run | Boot reconciliation: stranded `running` rows → `failed` | Log marks reconciliation cause | Job appears failed; user may re-run |
| SQLite | Disk full | Write fails | Worker exits non-zero; cron sees error | User frees disk |
| Timeout | `cmd` exceeds budget | `AbortSignal` | SIGTERM → SIGKILL after 5s grace | User adjusts `timeout_seconds` |
| Retry exhaustion | Job fails `max_retries` times | After last retry | Append to `failures.md`; status=failed | User sees failure-list doc |

### `ok lint` command + `lint` MCP tool design

**The aggregator wraps existing endpoints; it does NOT introduce new check primitives.**

```typescript
// packages/cli/src/lint/types.ts (Zod-validated)
const FindingSchema = z.object({
  type: z.enum(['dead-link', 'orphan', 'hub-candidate', 'redlink']),
  severity: z.enum(['info', 'warn', 'error']),
  message: z.string(),                  // human-readable one-liner
  // type-specific fields:
  source: z.string().optional(),        // doc containing the finding (dead-link)
  target: z.string().optional(),        // missing target (dead-link, redlink)
  doc: z.string().optional(),           // affected doc (orphan, hub-candidate)
  inboundCount: z.number().optional(),  // hub-candidate
  outboundCount: z.number().optional(), // hub-candidate
  citedIn: z.number().optional(),       // redlink: how many docs mention it
});

type Finding = z.infer<typeof FindingSchema>;

const LintResultSchema = z.object({
  generated_at: z.string().datetime(),
  content_dir: z.string(),
  scope: z.string().nullable(),
  findings: z.array(FindingSchema),
  summary: z.object({
    total: z.number(),
    by_type: z.record(z.string(), z.number()),
    by_severity: z.record(z.string(), z.number()),
  }),
  report: z.string().optional(), // populated when format='markdown'
});

type LintResult = z.infer<typeof LintResultSchema>;
```

**Internal flow (per D25 — on-disk read, no Hocuspocus required):**
1. Resolve `<contentDir>` from `.open-knowledge/config.yml` (existing config-load path).
2. Walk `<contentDir>` filtering by `content.include` / `content.exclude` (existing `ContentFilter` semantics).
3. Apply `scope:` glob if present (further filter the file list).
4. Parse each `.md`/`.mdx` file with the existing OK markdown pipeline (`@inkeep/open-knowledge-core` `mdManager.parse`).
5. Build in-memory indexes inline:
   - `forwardLinkIndex: Map<docName, Set<targetDocName>>` (from parsed `[[wiki-link]]` and `[text](./path.md)` references)
   - `backlinkIndex: Map<docName, Set<sourceDocName>>` (inverted from forwardLinkIndex)
   - `fileIndex: Set<docName>` (the corpus)
6. Compute checks against indexes:
   - **dead-link**: forward-link target ∉ fileIndex → `{type: 'dead-link', source, target, message}`
   - **orphan**: doc ∉ backlinkIndex.keys → `{type: 'orphan', doc, message}`
   - **hub-candidate**: doc with backlinkCount + forwardLinkCount above heuristic threshold → `{type: 'hub-candidate', doc, inboundCount, outboundCount, message}`
   - **redlink**: same as dead-link but for `[[Wiki Style]]` references where target slug doesn't resolve
7. Normalize into `Finding[]` per the Zod schema (D15).
8. Render output per `--format`/`--output` flags (or `format` MCP-tool param).
9. Exit per FR20 (0 = clean, 1 = findings + strict, 2 = error).

**`lint` MCP tool dual-path (per D25):** when invoked inside a running OK session, the tool reads from the existing in-memory `backlinkIndex` (no re-parse) instead of step 4-5 above. When invoked standalone (no Hocuspocus), uses the same path as the CLI. Branch on `Hocuspocus available?` at tool entry.

**Output formats:**
- **Human (default)**: grouped by type with counts, paths printed plain.
- **JSON (`--json`)**: full `LintResult` JSON to stdout.
- **Markdown (`--output <path>` or default `.open-knowledge/lint-reports/<date>.md`)**: a markdown report with `## Summary`, then sections per type; relative links from the report path back to flagged docs.

**`scope` semantics:**
- A glob string (e.g., `articles/auth/**`).
- Findings are filtered to those involving docs matching the glob — for `dead-link`, the `source` doc must match; for `orphan`/`hub-candidate`, the doc itself must match; for `redlink`, at least one of the citing docs must match.
- Default: no scope filter (full corpus).

**`checks` semantics:**
- Comma-list of check names (`dead-links`, `orphans`, `hubs`, `redlinks`).
- Default: all 4. Useful for narrow per-write hook integration: `ok lint --check dead-links --scope=<doc>`.

**Why this scope (and not more):**
- The 5 existing endpoints are already wired and indexed; no new HTTP routes needed.
- Net-new checks (source traceability, index drift, tag consistency, hub freshness, the LLM-required 5) are **independent specs** that can extend this aggregator's `type` enum and add new internal fan-out targets without breaking the v1 contract. Adding them here doubles the spec scope and delays both pieces.

### Alternatives considered

- **Option A: Embed Hocuspocus extension as the runner** — Have a long-lived Hocuspocus extension fire jobs on its own schedule. **Rejected:** Hocuspocus is OK's CRDT server, not a job runner. Coupling them creates an upgrade burden. GBrain's Minions are explicitly outside the gateway agentTurn for the same architectural reason — the queue is its own subsystem.
- **Option B: Use a third-party job-queue library (BullMQ, Agenda, etc.)** — **Rejected:** all major Node job queues require Redis or similar. OK's "no external infra" posture (matches GBrain PGLite) precludes this. SQLite is enough at v1 scale.
- **Option C: Shell out to native cron only, no OK CLI involvement** — i.e., document "write your own cron entries that hit `/api/*`." **Rejected:** loses observability (no `ok schedule status`), loses retry, loses OTel, loses idempotency. The GBrain precedent shows the value of the CLI-mediated layer.
- **Option D: Postgres-native job queue from v1** (full GBrain Minions parity) — **Rejected for v1:** requires a Postgres dependency OK doesn't currently have. The parity audit ranks Postgres adoption as separate work item #5. Doing it as part of this spec doubles the scope. NG3 (NOT NOW) defers.

**Why we chose the proposed solution:** It mirrors GBrain Minions' PGLite-equivalent mode (single-process, file-backed) — the validated cheap path. SQLite is OK's existing dependency story. CLI-only submission matches GBrain's MCP-boundary block. Scope is contained: ~600-800 LOC across a new `packages/cli/src/scheduler/` module + CLI command + config schema extension + 5 example YAMLs + 3 prompt templates.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | OK ships **no default agent CLI**. The `cmd` field is user-supplied; no inference, no fallback, no "if claude is on PATH use it." | P | LOCKED | Yes | Per user explicit instruction during the architecture conversation. Validated by GBrain Minions' agent-agnostic shape (the runner doesn't know if `cmd` is `lychee`, `claude`, or a Python script). | [`reports/ok-integrated-knowledge-lint-architecture/`](../../reports/ok-integrated-knowledge-lint-architecture/REPORT.md), [evidence/precedent-shell-job-runners.md](../../reports/ok-integrated-knowledge-lint-architecture/evidence/precedent-shell-job-runners.md) | Examples-only documentation; no built-in detection. |
| D2 | **`OK_ALLOW_SHELL_JOBS=1` off-by-default env gate** (worker process level). | T | LOCKED | No (operational) | Mirrors GBrain `GBRAIN_ALLOW_SHELL_JOBS=1`. Shell-job execution is a real attack surface; opt-in is the right default for a security-sensitive feature. | [evidence/precedent-shell-job-runners.md](../../reports/ok-integrated-knowledge-lint-architecture/evidence/precedent-shell-job-runners.md) §"Security gates" | Users must explicitly export the env var; documented prominently. |
| D3 | **State substrate: JSON-file-per-run.** Each run gets its own file at `.open-knowledge/jobs/runs/<run-id>.json` with the JobRun schema (FR5). No SQLite, no JSONL, no database. Run listing = `readdir(runs/)`. Run lookup = `readFile(<run-id>.json)`. Status updates = atomic write-tmp + rename. Idempotency-key check = scan dir, filter by `idempotency_key` + active window. **Migration to `bun:sqlite` (the rejected H1 Option 1) remains an easy v2 path** if scale demands it — readdir-based listing degrades past ~10k retained runs; until then JSON-files are simpler to reason about and inspect. The migration is non-breaking: a v2 reader can ingest existing `<run-id>.json` files into a SQLite schema in one pass. | T | LOCKED | No (v1 substrate; future migration to `bun:sqlite` is non-breaking — adopters can re-derive state from existing JSON files) | Resolves H1. Aligns with user direction "no new infra" and "no new dependency" (uses only `node:fs`). At v1 scale (~10s of jobs/day, ~3.6k/year) directory-as-database is performant: atomic-rename writes are <5ms on local SSD; readdir of <10k entries is <50ms. Conceptually closest to GBrain `dream` cycle's "stateless per fire" model. Trade-off vs SQLite: no transactions, no compound indexes — but the runner needs neither at v1 scale. | Audit H1; user direction 2026-04-28 ("option 2"); user direction 2026-04-28 ("but mention that option 1 is an easy option if we want sqlite") | New directory `.open-knowledge/jobs/runs/`; gitignored by default. ULID run-IDs for sort-friendliness. |
| D4 | **Single-process worker model in v1** (no long-lived daemon, no supervisor). Each cron firing invokes `ok schedule run --once`. | T | DIRECTED | No | Mirrors GBrain Minions PGLite mode. Avoids daemon-management complexity (process supervision, log rotation, graceful restart) at v1 scale. Future work (NG3) can layer the supervisor pattern. | GBrain `--follow` mode in [`gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`](../../reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md) | Crash recovery is "stranded `running` rows reconciled to `failed` at next run." |
| D5 | **`ok schedule install` writes scheduler config but does not auto-enable.** User must run `launchctl load` / `systemctl --user enable` / equivalent themselves. | P | LOCKED | No | Auto-enabling shell-jobs from a CLI install is a security smell. Explicit user action ensures the user understands what just got scheduled. | New (this spec) | Documented in install command output. |
| D6 | **Five job lifecycle states**: `pending`, `running`, `succeeded`, `failed`, `cancelled`. | T | LOCKED | Yes (schema) | Standard job-state taxonomy. Enough to capture every observable outcome including user-cancellation. | New (this spec) | Stored in `jobs.db.status` column. |
| D7 | **Strict placeholder substitution** (fail on missing `prompt_file` when `{prompt}` or `{prompt_file}` is referenced; fail on unknown placeholder). | T | LOCKED | No | Permissive substitution silently produces wrong commands; strict catches config errors at run-time before spawn. | New (this spec) | Documented; users understand failure mode. |
| D8 | **Retry default: max 3, exponential backoff 30s base with jitter.** Per-job override. | T | DIRECTED | No | Standard backoff defaults; jitter prevents thundering-herd on retry spikes. Per-job override allows non-default cases (e.g., expensive LLM jobs may want fewer retries to bound cost). | GBrain Minions "exponential backoff" reference | Documented; tunable. |
| D9 | **Zod for schema validation.** | T | LOCKED | Yes (consistency) | OK already uses Zod everywhere (`packages/cli/src/config/schema.ts`, MCP tool schemas, etc.). Adding a different validator would create drift. | OK codebase convention | New schema additions live alongside existing ones. |
| D10 | **No remote submission in v1.** Jobs are CLI-submitted only; the MCP server does NOT expose a `submit_job` tool. | T | LOCKED | No | Mirrors GBrain "MCP boundary blocks remote callers (CLI-only)." Remote submission would need careful auth + capability-class design. NOT NOW. | GBrain MCP-boundary policy | The runner can be wrapped in a CLI invocation called *from* an MCP tool by a local agent — but no direct network surface. |
| D11 | **Path-traversal guard on `cwd` and `prompt_file`** — both must resolve within the project root. | T | LOCKED | No | Path traversal in scheduled-job context is a high-stakes attack surface. Reject `..` / absolute paths outside project. | Standard secure-coding practice | Field-level error if violated. |
| D12 | **Per-run log files at `.open-knowledge/jobs/<job-name>-<run-id>.log`**, directory `chmod 700` on creation. | T | DIRECTED | No | Predictable, human-readable, easily git-ignored. `chmod 700` because logs may contain forwarded credentials. | New (this spec) | The `.open-knowledge/jobs/` directory is added to the default `.gitignore` template. |
| D13 | **`ok lint` v1 scope = aggregator only, no net-new check primitives.** Wraps the 5 existing graph-health endpoints (dead-links, orphans, hubs, forward-links) plus content-scan-derived redlinks into a unified `Finding[]`. | P | LOCKED | No | Bundling the runner with a usable lint command makes v1 turnkey. Adding net-new check primitives (source traceability, index drift, tag consistency, hub freshness, LLM-required 5) doubles the spec scope and delays both pieces. They can extend the `Finding.type` enum in future specs without breaking the v1 contract. | New (this spec); architecture report Phase 1 sequencing | Each net-new check ships in its own spec; users get value progressively without rework. |
| D14 | **Exit-code-on-findings is the default** (`--strict` on by default). Exit 0 = no findings; 1 = findings present; 2 = error. `--no-strict` flag opts out for users who want logging without failure semantics. | T | LOCKED | Yes (UX contract) | Mirrors lychee/markdownlint conventions. Makes `ok lint` immediately usable as a CI gate or PostToolUse hook without extra wrapping. The `--no-strict` opt-out covers cron jobs that should log findings but not register as failed runs (which would consume retry budget pointlessly when the issue is "wiki has 5 orphans" rather than "lint command broke"). | Industry convention; new (this spec) | Documented prominently. Users on hook integrations rely on the exit-1-on-findings behavior. |
| D15 | **`Finding` shared Zod schema** lives in `packages/cli/src/lint/types.ts`; both the CLI and MCP tool consume it; output formats (JSON, markdown, human) are derived from this single source. | T | LOCKED | Yes (schema) | Single-source-of-truth for findings prevents CLI-vs-MCP drift. Adding new `type` values in future specs (source-traceability etc.) is an extension, not a fork. | OK convention (Zod everywhere); new (this spec) | Future check primitives extend `Finding.type` enum + add per-type optional fields. |
| D16 | **KB-shape-neutral default output path: `.open-knowledge/lint-reports/<date>.md`**, NOT `wiki/lint-reports/` or any other content-tree assumption. | P | LOCKED | No | OK supports any markdown-shaped knowledge base — wiki, LLM brain, spec collection, research log, agent memory. Defaulting to `wiki/` would assume one specific layout; defaulting to `.open-knowledge/` (OK metadata) is layout-neutral. Users who want findings indexed alongside content explicitly route via `--output <their-path>`. | Per-user direction; OK skill's KB-neutral framing (SKILL.md: "wiki, LLM brain, spec collection, research log, or anything else markdown-shaped") | The `.open-knowledge/lint-reports/` directory is added to the default `.gitignore` template (users opt in to checking it in). |
| D17 | **Cron-entry indirection: scheduler invokes `ok schedule run --once --job=<name>`, which then exec's the user's `cmd`.** Not "cron exec's cmd directly." | T | LOCKED | No | One extra process layer (~10ms negligible) buys: per-run state in `jobs.db`, retry-with-backoff, idempotency check, OTel span, log capture at predictable path, `ok schedule status` visibility. Direct-exec loses all of these — the runner is invisible to OK and provides only "the user wrote a cron entry that happens to call OK." | New (this spec); resolves Q1 | `ok schedule install` always writes the indirection form into the generated scheduler config. |
| D18 | **Worker-crash detection: JSON-file stranded-run reconciliation.** At each `ok schedule run` boot, `readdir(.open-knowledge/jobs/runs/)`, parse each `<run-id>.json`, find any with `status='running' AND started_at < NOW() - (timeout_seconds + 60s grace)`; rewrite them with `status='failed'` and `error_message='worker-crashed-or-timed-out'` via the atomic-rename pattern (D23). No PID file, no separate heartbeat. | T | LOCKED | No | Keeps state in the JSON-file substrate alone (D3) — single source of truth, no two-system reconciliation. Trade-off: a job that legitimately ran longer than its `timeout_seconds + grace` but exited cleanly between boot scans is incorrectly marked succeeded — accepted because the timeout budget already represents the user's "this should have failed" threshold. | New (this spec); resolves Q4; cascades from D3 | A boot-time reconciliation pass runs synchronously before a new job's run-record is written. |
| D19 | **`--dry-run` mode** for `ok schedule run --once --job=<n> --dry-run` prints the substituted `cmd argv...` (with placeholders resolved) and the env block (with credentials redacted to `<sensitive>`) without spawning. Exits 0. **Redaction heuristic:** env vars matching regex `/^(.*_)?(KEY\|TOKEN\|SECRET\|PASSWORD\|PASSPHRASE\|CREDENTIAL\|AUTH)$/i` are redacted by default. User-defined credential vars not matching the pattern can be added via optional `automation.dry_run.redact_extra_patterns: string[]` config (regex array). | T | LOCKED | No | Cheap to add (~30 LOC including redaction); high value for debugging substitution. Mirrors `gbrain dream --dry-run`. Credentials redaction prevents `--dry-run` from being a credential-leak surface. The regex covers the canonical cred-var naming patterns; the override lets users extend without modifying the runner. | New (this spec); resolves Q5; mirrors GBrain pattern | Documented prominently. Useful for CI smoke tests. |
| D20 | **`schedule:` field in `automation.jobs[]` is informational-only.** OK validates it as a valid cron string if present, but the user's launchd / systemd / cron / GH Actions is the source of truth — OK never reads it to "fire" jobs. | T | LOCKED | No | OK is not the scheduler. Trying to enforce `schedule:` means OK becomes a daemon — that's NG4 (NOT NOW). Validation gives users a syntax check; "informational only" gives `ok schedule list` something to display. | New (this spec); resolves Q6 | `ok schedule install` reads `schedule:` to populate the launchd/systemd config; if absent, OK errors and asks the user to provide one. |
| D21 | **Stream isolation v1: `cwd` + `scope` + `agent_label` only.** No `cwd_pattern` glob, no per-stream lock files, no per-stream queues. | T | DIRECTED | No | The minimum viable shape covers Persona P3's case (per-area teams). `cwd` sets working directory; `scope` is forwarded as `OK_LINT_SCOPE` env (and as `--scope` arg if the cmd is `ok lint`); `agent_label` forwards to `AGENT_LABEL` env (precedent #25 writer-ID taxonomy threading). Anything more elaborate (`cwd_pattern` glob expansion, multi-cwd jobs) is overengineering for v1 and can be added without breaking the contract. | New (this spec); resolves Q7 | Future spec can extend `JobConfig` with new optional fields; existing fields are 1-way doors. |
| D22 | **`ok schedule install` writes `OK_ALLOW_SHELL_JOBS=1` into the generated scheduler config's env block.** Honest framing: post-install, the env-var gate (FR2) is no-op for scheduler-invoked runs (the env var is in the scheduler config); the env-gate's residual purpose is protecting users who run `ok schedule run --once` directly outside the scheduler context. **The single explicit-action gate post-install is `launchctl load` / `systemctl --user enable`** — the user's deliberate activation step. Install command output prints a prominent warning ("This config will run shell jobs without further opt-in. Review the file before activating ..."). | P | LOCKED | No | Without baking the env into the generated config, the user has to set `OK_ALLOW_SHELL_JOBS=1` in the launchd plist or systemd unit themselves — brittle manual step that defeats the purpose of `install`. The honest single-gate-post-install framing was surfaced by audit Finding M6 — the original "dual-gate preserved" claim was verbal sleight-of-hand; this rewrite is accurate. | New (this spec); resolves Q10; corrected post-audit M6 | Documented in `ok schedule install` output. The generated config file is written `chmod 600` and the user is told to inspect it. |
| D23 | **JSON-file durability: atomic write-tmp + rename, fsync on rename.** Every status update writes the new JSON content to `<run-id>.json.tmp`, fsyncs, then renames to `<run-id>.json` (atomic on POSIX). Reads are direct `readFile(<run-id>.json)` (atomic on POSIX — readers see either the old or the new content, never partial). Concurrent `ok schedule run` invocations don't conflict on the same `<run-id>.json` because each invocation generates a unique ULID. | T | LOCKED | No | POSIX `rename()` is atomic; concurrent readers and writers on the same file always see consistent data. `fsync` between write and rename ensures the new content reaches disk before it becomes visible. `node:fs/promises` exposes both. | POSIX semantics; same pattern as OK's existing `tracedRename` in `fs-traced.ts` (precedent: atomic-write discipline already adopted server-side). | Implemented in `packages/cli/src/scheduler/job-store.ts`. Cascades from D3 substrate choice. |
| D24 | **`ok schedule install-examples [--target-dir <path>]` sub-command** copies bundled examples into the user's project. Default target: `<project-root>/.open-knowledge/examples/`. Resolves Q2. | P | LOCKED | No | Without this, users must navigate to `node_modules/@inkeep/open-knowledge/examples/` to find the bundled YAMLs and bash scripts. With it, install-day path is two commands (`ok schedule install-examples` → edit `.open-knowledge/config.yml`). ~30 LOC. | New (this spec); resolves Q2 | Examples are tracked in git by default (users can `.gitignore` them per repo). |
| D25 | **`ok lint` reads on-disk markdown directly; does NOT require Hocuspocus running.** The CLI walks `<contentDir>` from filesystem, parses each `.md`/`.mdx` with the existing OK markdown pipeline (`@inkeep/open-knowledge-core` exports), builds its own in-memory link graph, and computes findings inline. The `lint` MCP tool (FR18) has two read paths: when invoked inside a running OK session it reads from the live `backlinkIndex` (no re-parse cost); when called standalone it falls back to the same on-disk path the CLI uses. Both paths produce the same `Finding[]` schema (D15). | T | LOCKED | Yes (substrate-of-lint contract) | Resolves M11. Removes the Hocuspocus-must-be-running dependency from Persona P1's nightly lint — the laptop user installs cron, walks away, and the cron-fire works whether or not OK is running. Aligns with G6 (KB-shape neutrality) — lint becomes a static-analysis tool, fundamentally separable from the CRDT server. Trade-off: doesn't see in-flight CRDT state (e.g., a doc someone's editing right now); for lint, on-disk is correct because lint is about persisted state. | Audit M11; user direction 2026-04-28 ("c") | The CLI ships ~150 LOC of standalone link-graph builder. The `lint` MCP tool branches on `Hocuspocus available?` — if yes, use existing `backlinkIndex`; if no, fall back to on-disk path. |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | ~~Should `ok schedule run --once --job=<name>` be the documented cron entry, OR should the cron entry directly invoke the user's `cmd` and OK only see jobs via the `--once` path?~~ | T | P0 | Yes | **RESOLVED** by D17 LOCKED: scheduler invokes `ok schedule run --once --job=<name>` (indirection). | Resolved 2026-04-28 |
| Q2 | ~~Where does OK ship the example prompt templates and example YAMLs?~~ | T | P0 | No | **RESOLVED** by D24 LOCKED: examples ship in `examples/scheduling/` of the cli package and are copyable via `ok schedule install-examples`. | Resolved 2026-04-28 |
| Q3 | ~~Should the v1 ship include a "deterministic-only" bundled bash script that hits OK's HTTP API for the deterministic-7 lint checks?~~ | P | P0 | No | **RESOLVED**: superseded by D13/D16/FR17-FR22 (Option A — bundle `ok lint` aggregator + bundled `examples/scheduling/scripts/lint-deterministic.sh` + agent-agnostic example YAMLs). v1 users get a working end-to-end loop on install day with two lines of YAML. | Resolved 2026-04-28 |
| Q4 | ~~What's the worker-crash detection mechanism? PID file? heartbeat row in SQLite? `processStartedAt` column?~~ | T | P0 | No | **RESOLVED** by D18 LOCKED: SQLite stranded-row reconciliation only (no PID file). | Resolved 2026-04-28 |
| Q5 | ~~Does the runner need a `--dry-run` mode that prints what it would exec without spawning?~~ | T | P0 | No | **RESOLVED** by D19 LOCKED: yes, with credential redaction. | Resolved 2026-04-28 |
| Q6 | ~~Is the `schedule:` field in `automation.jobs[]` informational-only (the user's actual scheduler enforces) or does OK also check it for sanity?~~ | T | P0 | No | **RESOLVED** by D20 LOCKED: informational-only; OK validates cron-string format but never enforces firing. | Resolved 2026-04-28 |
| Q7 | ~~Should the runner support per-job `working_directory` (alias for `cwd`) plus `cwd_pattern` for glob-based stream isolation?~~ | T | P0 | No | **RESOLVED** by D21 DIRECTED: v1 ships `cwd` + `scope` + `agent_label` only; no `cwd_pattern`. | Resolved 2026-04-28 |
| Q8 | Failure escalation — should `failures.md` be a markdown table, a JSONL log, or both? Should it be auto-pruned? | T | P2 | No | Recommend: markdown table for human readability, capped at last 100 failures (FIFO). JSONL is over-engineering for v1; can be added later if needed. | Deferred — minor |
| Q9 | What's the fallback when `OK_ALLOW_SHELL_JOBS=1` is unset and a user tries `ok schedule run --once`? Is the message helpful enough? | P | P2 | No | Recommend: error mentions both the env var AND links to docs. Plus `ok schedule status` works without the gate (read-only). Plus `ok schedule list` works without the gate. The gate is execution-only. | Open — UX detail |
| Q10 | ~~Whether `ok schedule install` should also bootstrap a default `OK_ALLOW_SHELL_JOBS=1` setting (e.g., in the launchd plist's env block) or require the user to do it manually.~~ | P | P0 | Yes | **RESOLVED** by D22 LOCKED: the env-var is written into the generated config + warning is printed; auto-load remains the user's explicit second gate. | Resolved 2026-04-28 |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | JSON-file-per-run substrate (D3) handles v1 job-state load (~10s of jobs/day, ~3.6k retained runs/year) within NFR targets. Atomic-rename writes <5ms on local SSD; readdir of <10k entries <50ms. | MEDIUM | Smoke test: synthesize 1000 run files, list, parse, query by status, atomic-rename-update; assert each operation <50ms. Ship as `packages/cli/src/scheduler/job-store.test.ts`. | Before finalization | Active |
| A2 | Users on Persona P1 (deterministic-only) will accept the bundled example script + `ok lint`. | CONFIRMED | Q3 resolved by D13 / FR22 — example ships. | n/a | Confirmed 2026-04-28 |
| A3 | The Bun + Node 24 process spawn (`node:child_process.spawn`) handles all shell-quoting concerns when the `argv[]` array is used (no shell mode). | HIGH | Standard Node behavior; well-tested. | Before finalization | Active |
| A4 | OK's existing async OTel pattern (`withSpan` for the spawn-and-wait + `withSpanSync` for sync state-writes) is adequate for the runner's instrumentation needs without new abstractions. | HIGH | Used elsewhere in OK; same shape works here. Updated post-audit H4 to reflect async semantics. | At implementation time | Active |
| A5 | Users do NOT need parent-child DAGs / fan-out in v1. | MEDIUM | If they do, that's a v2 trigger (NG4). | Until adoption signals demand | Active |

## 13) In Scope (implement now)

- **Goal:** Ship two coupled v1 primitives: (1) the OK shell-job runner, (2) `ok lint` CLI + `lint` MCP tool aggregator. The combination gives every persona a working end-to-end loop on install day.
- **Non-goals:** §3 (especially NG3 — KB-shape neutrality, NG4 — Postgres / DAGs / supervisors, NG5 — net-new lint check primitives).
- **Requirements with acceptance criteria:** §6 FR1-FR23 + NFRs.
- **Proposed solution:** §9.
- **Owner(s)/DRI:** Tim Cardona.
- **Audit reopens resolved 2026-04-28:**
  - **H1 (resolved):** State substrate = JSON-file-per-run (D3 LOCKED). Cascading decisions D18, D23 updated. SQLite migration (`bun:sqlite`) noted as easy v2 path in Future Work.
  - **M11 (resolved):** `ok lint` reads on-disk markdown directly; no Hocuspocus dependency (D25 LOCKED). The `lint` MCP tool has a dual read-path — in-session uses live `backlinkIndex`, standalone uses on-disk.
- **Next actions:**
  - All P0 open questions resolved: Q1 (D17), Q2 (D24), Q3 (D13/FR22), Q4 (D18), Q5 (D19), Q6 (D20), Q7 (D21), Q10 (D22). Only Q8/Q9 (P2) remain — both deferrable to implementation.
  - Implement: scheduler runner + CLI command (`ok schedule {list,run,status,install,install-examples}`) + `ok lint` CLI + `lint` MCP tool + config schema extension (`automation.jobs[]`) + state-store migration (substrate per H1) + `Finding` shared Zod types + `withSpan` (async) wrappers per FR13.
  - Write: 5 agent-agnostic example YAMLs + 1 deterministic-only YAML + bundled `lint-deterministic.sh` + 3 prompt templates.
  - Add tests: shadow paths in §9 + `ok lint` golden-output tests (human / JSON / markdown) + lint-scope-disclosure surface (FR23) + boot-time stranded-row reconciliation (D18).
  - Document in OK docs site under "Scheduled Maintenance" + "Lint Command" + threat model section.
- **Risks + mitigations:** see §14.
- **What gets instrumented/measured:** see §7.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing OK installations without `automation.jobs[]` | Config schema extension is backward-compatible (new optional block) | Run existing test suite; confirm no regression |
| Users running OK in CI | Examples for GitHub Actions documented; same shell-job runner works in CI as locally | Smoke test: `ok schedule run --once --job=test-deterministic` in CI |
| Cross-platform (macOS / Linux / Windows) | `ok schedule install` detects scheduler per-OS; runner itself is OS-agnostic | Test launchd / systemd / Task Scheduler on each |
| Idle deployments (`OK_ALLOW_SHELL_JOBS` never set) | Feature is dormant; no impact on core OK | Confirm no startup overhead when feature unused |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| User mis-configures `cmd` and runs an unintended command | MEDIUM | HIGH | Off-by-default env gate; explicit `launchctl load` step; `--dry-run` mode (Q5); strict path-traversal check | This spec |
| Credentials leak into job log files | MEDIUM | HIGH | `chmod 700` on `.open-knowledge/jobs/`; documented warning in install command | This spec |
| User schedules a job that consumes unbounded LLM tokens | MEDIUM | MEDIUM | `timeout_seconds` default (15min); user owns LLM cost (NG2 — OK doesn't store credentials, doesn't track cost) | User responsibility |
| SQLite corruption mid-run | LOW | MEDIUM | SQLite WAL durability; reconcile-on-boot stranded `running` rows | This spec |
| Concurrent `ok schedule run` invocations race | MEDIUM | LOW | Idempotency key + `running` status check before spawn | This spec |
| Worker process killed mid-run by OS (OOM, signal) | MEDIUM | LOW | Stranded-row reconciliation at next boot (Q4) | This spec |
| User disables `OK_ALLOW_SHELL_JOBS` and forgets jobs are running | LOW | LOW | `ok schedule status` shows scheduled jobs even when env unset | This spec |
| Scheduler config drift (user edits launchd plist directly) | LOW | LOW | OK doesn't claim ownership; install command notes explicit user-control | User responsibility |
| Runner crashes between recording `status=running` and exec-ing `cmd` → user job silently skipped until next scheduled fire | LOW | MEDIUM | Stranded-row reconciliation (D18) catches at next-run boot — but the gap window is one scheduling interval (e.g., 24h for a daily job). Document monitoring recommendation in user-facing docs (watch the produced report file's mtime). Not a v1 spec change; user-side mitigation. | User-facing docs |
| Malicious modification of `automation.jobs[]` (e.g., compromised agent or PR landing in user's KB) → unintended `cmd` executes at next cron fire | LOW | HIGH | **Documented threat model**: `automation.jobs[]` entries are treated as trusted code; users on shared / multi-writer repos should review job changes in PRs the way CI configs are reviewed. Future-work consideration: config-hash audit + diff surfacing in `ok schedule status` (NOT in v1 scope). | User-facing docs + threat-model section in `ok schedule install` output |

## 15) Future Work

### Explored
- **Postgres-native multi-worker queue + parent-child DAGs (NG4).** What we learned: GBrain's full Minions stack (parent-child, fan-out, durable subagents, supervisor) is well-documented and production-validated at 45k pages. Recommended approach: when OK adopts a Postgres index (parity work item #1, hybrid retrieval), promote `jobs.db` to a Postgres table in the same backend; add `gbrain jobs supervisor`-equivalent. Why not in scope now: doubles scope, requires new infrastructure dependency. Triggers to revisit: OK adopts Postgres for any other reason; multi-worker demand emerges.
- **Editor UI for job status (NG8).** What we learned: `live-knowledge-lint.ts` Hocuspocus extension (Phase 5 in the architecture report) feeds the same substrate. Recommended approach: hook into the same CC1 channel for job-status updates. Why not now: Phase 5 itself is sequenced after this work. Triggers: Phase 5 ships. **The Phase 5 lint extension SHOULD reuse the `Finding` Zod schema (D15)** to keep CLI / MCP tool / live-extension findings in a single shape.

### Identified
- **Migrate state substrate to `bun:sqlite` if scale demands.** Per D3, the JSON-file-per-run substrate is fine through ~10k retained runs (~3 years at 10 jobs/day). Past that, `readdir` cost begins to dominate listing operations. The migration is non-breaking: a v2 reader can ingest existing `<run-id>.json` files into a SQLite schema in one pass, then atomic-rename a flag file marking the new substrate active. `bun:sqlite` ships with the Bun runtime (no compile, no extra dep) and the original H1 Option 1 analysis applies. What investigation is needed: re-run perf smoke test at the candidate substrate; pick a run-archival policy (truncate? compress? export to git?); migration script + tests.
- **Recompile MCP tool consuming the runner.** The `recompile` tool from the architecture report is a Minion-style command; it can be invoked by the runner via `cmd: ok mcp-recompile --doc=...`. What we know: covered in the architecture report Phase 6 (~200 LOC). What investigation is needed: separate spec.
- **MCP sampling capability registration.** Architecture-report Phase 3 (~150 LOC). The runner enables LLM-required checks via agent-CLI Minions; sampling enables the in-session alternative. Separate spec.
- **Cloud-managed scheduler integration.** If users want Anthropic-Routines-equivalent without running their own cron, the runner could expose a "submit to Routines" job-kind. Out of scope for v1; revisit when there's demand (NG7).

### Noted
- **Per-job cost budgeting** — track LLM cost per job, alert on spend ceilings. Useful but not v1.
- **Job dependency ordering** — `depends_on: [<other-job>]`. Premature for single-process v1.
- **Per-job retry policies beyond exponential backoff** (e.g., circuit-breaker) — not needed at v1 scale.

## 16) Agent constraints

- **SCOPE:**
  - `packages/cli/src/scheduler/` (new directory: runner, job-store, types, placeholder-substitution, scheduler-detection)
  - `packages/cli/src/lint/` (new directory: aggregator logic, finding types, output formatters)
  - `packages/cli/src/commands/schedule.ts` (new file)
  - `packages/cli/src/commands/lint.ts` (new file)
  - `packages/cli/src/mcp/tools/lint.ts` (new MCP tool)
  - `packages/cli/src/mcp/tools/index.ts` (register `lint` tool)
  - `packages/cli/src/config/schema.ts` (extend with `automation.jobs[]`)
  - `packages/cli/src/cli.ts` (register `schedule` and `lint` commands)
  - `examples/scheduling/*.yml` (new examples — 5 agent-CLI examples + 1 deterministic-only)
  - `examples/scheduling/scripts/lint-deterministic.sh` (bundled bash example, ~10 LOC)
  - `examples/prompts/*.md` (placeholder prompt templates for users to copy)
  - Tests under `packages/cli/src/scheduler/*.test.ts` and `packages/cli/src/lint/*.test.ts`

- **EXCLUDE:**
  - `packages/server/src/agent-sessions.ts` (write surface — not touched)
  - `packages/server/src/api-extension.ts` (HTTP API — not touched; `ok lint` consumes existing endpoints)
  - `packages/server/src/server-observers.ts` (CRDT bridge — not touched)
  - Other `packages/cli/src/mcp/tools/*` (only `lint.ts` is added; existing tools untouched)
  - Anything Hocuspocus-extension-related (Phase 5)
  - Anything related to the `recompile` MCP tool (separate spec)
  - Anything related to MCP sampling (separate spec)
  - Net-new lint check primitives — source traceability, index drift, tag consistency, hub freshness, supersedes-chain validity, embedding freshness, external-URL rot, all 5 LLM-required checks (each is its own spec; they extend `Finding.type` per D15)

- **STOP_IF:**
  - Implementer wants to add a long-lived daemon mode → STOP, that's NG4 future work.
  - Implementer wants to add Postgres backend → STOP, that's NG4.
  - Implementer wants to add remote submission via MCP → STOP, that's D10 LOCKED.
  - Implementer wants to remove the off-by-default env gate → STOP, that's D2 LOCKED.
  - Implementer wants to ship a default `cmd: claude --print` → STOP, that's D1 LOCKED (NEVER NG1).
  - Implementer wants to auto-enable scheduler at install time → STOP, that's D5 LOCKED.
  - Implementer wants to add net-new check primitives to `ok lint` (source traceability, contradictions, etc.) → STOP, that's D13 LOCKED + NG5.
  - Implementer wants to default `ok lint --output` to `wiki/...` or any content-tree path → STOP, that's D16 LOCKED + NG3.
  - Implementer wants to reach into `packages/server/src/api-extension.ts` to add new HTTP endpoints for `ok lint` to call → STOP, v1 wraps existing endpoints only.

- **ASK_FIRST:**
  - Schema additions to `automation.jobs[]` beyond what's in §9 data model → ask.
  - Adding a new job lifecycle state beyond the 5 in D6 → ask.
  - Adding a new `Finding.type` value (other than the 4 in D15: dead-link, orphan, hub-candidate, redlink) → ask (likely belongs in a separate spec).
  - Changing the `chmod 700` on `.open-knowledge/jobs/` → ask (security implication).
  - Renaming any field after merge (`cmd` / `argv` / `cwd` / `env` / `agent_label` and the `Finding` schema fields are 1-way doors) → ask.
  - Default `--output` path semantics (D16) — ask before changing.
