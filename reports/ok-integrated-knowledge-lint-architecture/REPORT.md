---
title: "Integrated Knowledge-Lint Architecture for Open Knowledge"
description: "Unified design doc synthesizing 6 prior reports into one concrete integration architecture for Open Knowledge. The system: 3 operations on an autonomy axis (lint / recompile / consolidate) × 5 trigger classes (per-event / session-end / daily / weekly / continuous-decay) × cross-host distribution (hooks for 5 hosts + MCP sentinels for the rest + generic shell-job runner for overnight) × per-topic stream isolation (folder slices + AGENT_LABEL conventions). The shell-job runner is modeled on GBrain's Minions — agent-CLI-agnostic by design, off-by-default security gate, user supplies any command including bash scripts or agent invocations. Component-by-component plumbing in OK's existing code, revised sequencing that incorporates the recompile gap and the 5-phase nightly pattern, ~1,200 LOC total across 7 phases. Supersedes ok-knowledge-lint-integration."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Open Knowledge
  - Hocuspocus
  - Model Context Protocol
  - Claude Code Routines
  - GitHub Actions
topics:
  - integrated knowledge-lint architecture
  - autonomy axis
  - 5-trigger taxonomy
  - cross-host distribution
  - stream isolation
  - 5-phase nightly pattern
  - recompile primitive
  - GitHub Actions auto-research
supersedes:
  - reports/ok-knowledge-lint-integration/REPORT.md
---

# Integrated Knowledge-Lint Architecture for Open Knowledge

**Purpose:** Pull the five prior reports into one concrete integration architecture. The "what" (knowledge-lint taxonomy), "where" (cross-host hook landscape), "how it composes" (lint vs recompile vs consolidate), and "when it fires" (5-trigger taxonomy) all need to land as a coherent system grounded in OK's actual code.

**Stance:** 1P design doc. Not greenfield — every component grounded in existing OK primitives or convergent community patterns.

**Supersedes:** `reports/ok-knowledge-lint-integration/REPORT.md` (the earlier integration report's framing was too rigid; this report incorporates the recompile gap and stream isolation).

---

## The Unified System At A Glance

```
                     OK Knowledge-Lint System
                     ─────────────────────────

  Three operations on an autonomy-vs-evidence axis:

   ┌─────────┐         ┌────────────┐         ┌────────────┐
   │  LINT   │  ──►    │ RECOMPILE  │  ──►    │CONSOLIDATE │
   │         │         │            │         │            │
   │ surfaces│         │ re-derives │         │ decides    │
   │findings │         │  bounded   │         │ user-driven│
   │read-only│         │by evidence │         │ STOP gate  │
   └─────────┘         └────────────┘         └────────────┘
        │                    │                       │
        ▼                    ▼                       ▼
   `hints[]`             `recompile`             `consolidate`
   on every write        MCP tool +              MCP tool
   /api/agent-write-md   live extension          (current, unchanged)

  Five trigger classes fire each operation at appropriate cadence:

  per-event   ─►  every write      ─►  Lint (deterministic 7)
  session-end ─►  context compact  ─►  Lint (queue findings)
  daily       ─►  10 PM nightly    ─►  Lint (LLM 5) + Recompile (bounded sections)
  weekly      ─►  Sunday 9 PM      ─►  Lint (deep audit) + Recompile (full pass)
  continuous  ─►  in-memory decay  ─►  Lint score updates per change

  Cross-host distribution via three layers:

  Layer 1: hints[] sentinel    ─►  Universal (all 9 OK target hosts)
  Layer 2: per-host hook       ─►  5 Tier-A hosts (Claude Code, Cursor, Codex, Windsurf, Copilot CLI)
  Layer 3: generic shell-job   ─►  Overnight workflows (modeled on GBrain Minions)
           runner               ─►  user supplies any cmd: bash script, agent CLI,
                                    custom orchestrator. OK does NOT prescribe.

  Stream isolation:

  config.yml folders[].consolidationStream ─►  per-topic stream membership
  AGENT_LABEL=lint-nightly-<stream>         ─►  per-stream attribution
  CRDT per-doc isolation + version-CAS      ─►  same-doc concurrency safety
```

---

## Executive Summary

**The integrated architecture is three operations × five triggers × three distribution layers × per-topic streams.** Each axis is small but together they cover the design space the prior research surfaced.

**Two key reframes from the user that this report bakes in:**
1. **Lint isn't separate from consolidate-class operations** — they're points on one autonomy-vs-evidence axis. Lint surfaces, recompile re-derives within evidence bounds, consolidate decides. OK has the first and third today; **the recompile primitive is the gap**.
2. **The overnight runner is agent-CLI-agnostic, modeled on GBrain's Minions.** The user supplies *any* shell command — `lychee wiki/`, `claude --print "{prompt}"`, `codex --print "{prompt}"`, `aider --message "{prompt}" --model ollama/llama3.1`, or a custom in-house script. OK doesn't prescribe a default agent. Off-by-default security gate (`OK_ALLOW_SHELL_JOBS=1`) mirrors GBrain's posture.

**Three new primitives + one revised tool + one new CLI command:**
1. **`recompile` MCP tool** — bounded-autonomous re-derivation of canonical articles when evidence shifts. The "compiled truth + timeline" pattern from prior six-domain research, finally instantiated.
2. **`lint` MCP tool (aggregator)** — fans out across the 6+ existing graph-health endpoints + new source-traceability/index-drift/tag-consistency checks; returns unified `Finding[]`.
3. **`live-knowledge-lint` Hocuspocus extension** — mirrors `live-derived-index.ts` to maintain a per-doc lint findings index in-memory, surfaces on every `/api/agent-write-md` response via the existing `hints[]` channel.
4. **`consolidate` (existing)** — STOP gate preserved exactly. No changes to the human-decides operation.
5. **Generic shell-job runner + `ok schedule` CLI command** — modeled on GBrain Minions. User declares jobs (`name`, `schedule`, `cmd`, `argv`, `env`, `cwd`); OK runs them. Includes `ok install-hooks` for per-host hook distribution as a separate concern.

**Plus example workflows**: prompt templates at `.open-knowledge/prompts/*.md` (the integration spec, agent-agnostic) + example GitHub Actions YAMLs in `examples/scheduling/` for several agent CLIs (Claude Code, Codex, Anthropic Routines, Aider+Ollama). User picks; **OK ships no default**.

**Plus stream isolation**: ~50 LOC of `config.yml` schema extension (`consolidationStream:` key on folder rules) + `AGENT_LABEL` conventions for nightly workers + version-CAS on canonical-article frontmatter for same-doc concurrency safety.

**Total: ~1,200 LOC across 7 phases.** Phase 1 alone (~200 LOC of `hints[]`-channel deterministic checks) lights up cross-host knowledge-lint immediately for every OK target host without protocol changes — the highest value-per-cost phase, unchanged from the earlier integration report.

**The new phases this report adds (vs the prior integration report):**
- **Phase 4 reframed**: from "GitHub Actions YAML with `claude --print` baked in" → "generic shell-job runner + agent-agnostic prompt templates + per-CLI examples." More general, more portable, no defaults.
- **Phase 6: Recompile primitive + live-knowledge-lint extension** (~250 LOC).
- **Phase 7: 5-phase nightly + stream isolation** (~150 LOC of YAML + config schema).

**Industry-validation:** GBrain runs production deployments at 17,888 → 45,000 pages via this exact shape (deterministic Minions + agent-CLI-as-just-another-Minion). The shell-job runner is **parity work item #5** in this repo's prior [`gbrain-vs-openknowledge-parity/`](../gbrain-vs-openknowledge-parity/) audit (2026-04-27). See [evidence/precedent-shell-job-runners.md](evidence/precedent-shell-job-runners.md) for the consolidated synthesis.

---

## The Three Operations

### Operation 1: `lint` — surfaces findings, no claims

**What it is:** Read-only inspection of KB state. Returns `Finding[]` per the unified schema. Never writes.

**The 17-check taxonomy** (from prior `knowledge-linting-karpathy-workflow` research):

| Check | Tier | Detection | Status in OK |
|---|---|---|---|
| Orphan pages | Deterministic | Graph traversal | ✅ `/api/orphans` |
| Redlinks (concepts without pages) | Deterministic | Backlink-index miss | ✅ derivable |
| Dead links (internal) | Deterministic | Strict-exact link resolve | ✅ `/api/dead-links` |
| Dead links (external) | Deterministic | HTTP HEAD | ❌ net-new (~30 LOC) |
| Source traceability | Deterministic | Pattern-match wiki↔raw | ❌ net-new (~50 LOC) |
| Index ↔ content drift | Deterministic | Diff `index.md` vs `find` | ❌ net-new (~30 LOC) |
| Tag consistency | Deterministic | Frontmatter aggregation | ❌ net-new (~50 LOC) |
| Hub freshness | Deterministic | Mtime diff hub vs children | ❌ net-new (~30 LOC) |
| `supersedes:` chain validity | Deterministic | Frontmatter chain walk | ❌ net-new (~30 LOC) |
| Embedding freshness | Deterministic | Skipped (no vector index in OK) | n/a |
| Stale claims | Hybrid | mtime prefilter + LLM | ❌ Phase 3 |
| Missing cross-references | Hybrid | grep + LLM final | ❌ Phase 3 |
| Citation-required | Hybrid | grep + LLM | ❌ Phase 3 |
| Compiled-truth ↔ timeline coupling | Hybrid | mtime + LLM | ❌ Phase 3 |
| Contradictions between pages | LLM-only | Sampling | ❌ Phase 3 |
| Data gaps | LLM-only | Sampling | ❌ Phase 3 |
| Lost-nuance regression | LLM-only | Sampling | ❌ Phase 3 |
| Hallucination amplification | LLM-only | Sampling | ❌ Phase 3 |
| Over-confident summaries | LLM-only | Sampling | ❌ Phase 3 |

**Surface:**
- HTTP: per-check endpoints (`/api/dead-links`, `/api/orphans`, etc.) — already exist for 6 of the deterministic checks.
- MCP: aggregator tool `lint` (`{topic?, mode?, scope?}`) that fans out across endpoints, returns unified `Finding[]`.
- Sentinel: `hints[]` array on every `/api/agent-write-md` response — existing channel, extended with new `Finding.type` discriminators.

**Autonomy:** Fully autonomous. Read-only. Findings carry confidence labels (CONFIRMED / INFERRED / UNCERTAIN). The agent (or human reviewer) decides what to do with them.

---

### Operation 2: `recompile` — bounded-autonomous re-derivation

**What it is:** When evidence has shifted on an existing canonical article (newer sources, supersedes-chain extensions, related-article rewrites), re-derive the *evidence-bounded sections* of the article without altering the user-decided rationale.

**The bounded contract** (the conservative default from prior `consolidate-and-overnight-patterns` research):

| Section | Recompile-eligible? | Why |
|---|---|---|
| `Summary` | ⚠ Conditional | Only if `Decision` and `Rationale` haven't changed semantically — small edits OK |
| `Context` | ✅ Yes | Constraints from observable evidence |
| `Decision` | ❌ Never | User-decided; recompiling fabricates the team's stance |
| `Rationale` | ❌ Never | User's reasoning; not LLM-derivable |
| `Trade-offs` | ✅ Yes | Acknowledged costs of the chosen path; can be enriched as evidence accumulates |
| `Alternatives considered` | ✅ Yes | Bounded by sources; new alternatives surfaced by research can be added |
| `Implementation notes` | ✅ Yes | Code-grounded; can update as code evolves |
| `Further reading` | ✅ Yes | Links to research articles + sources; mechanical |

**Surface:**
- MCP: `recompile` tool with `{docName, sections?: 'auto'|string[]}`. Default `sections: 'auto'` recompiles only the eligible sections. Caller can constrain.
- Audit trail: every recompile run appends a `recompiled:` entry to the article's frontmatter with `{date, agent_label, sections, evidence_delta}`. Append-only.
- Trigger: typically scheduled (daily / weekly nightly), occasionally on-demand when a user notices "this canonical article looks stale."

**Autonomy:** Bounded autonomous. Can run without user intervention but constrained by:
1. Section allowlist (above).
2. Evidence-bounded — must cite which `sources:` / linked research changed since last compile.
3. Append-only audit trail — nothing is silently lost.

**Cross-references the prior research:** This is GBrain's `maintain` skill semantics, ByteRover's AKL maturity-decay-driven rewriting, and the "compiled truth + timeline" pattern from this repo's prior six-domain research. **The pattern is convergent; OK currently lacks it.**

---

### Operation 3: `consolidate` — user-decides (current behavior preserved)

**What it is:** OK's existing tool, unchanged. STOP gate enforced. Human confirms what was decided and why; LLM writes the article body around that decided rationale.

**No changes** in this architecture. The current STOP gate is correct for the operation's role: net-new promotion of a fresh decision. Adding `recompile` separately gives evidence-driven re-derivation a home without compromising consolidate's semantics.

---

## The Five Triggers

```
per-event ──┐
            ├── lint (deterministic 7)
session-end ┤
            │
daily ──────┼── lint (LLM 5) + recompile (bounded sections)
            │
weekly ─────┴── lint (deep audit) + recompile (full pass) + consolidate-readiness suggestions

continuous ──── decay scoring (in-memory, no writes)
```

### Trigger 1: per-event — every write

**Fires:** `applyAgentMarkdownWrite` or `handleAgentPatch` returns successfully.
**Runs:** Deterministic-7 lint checks against the post-write state.
**Surface:** `hints[]` array on the response, surfaced through MCP `write_document` tool.
**Cost:** Sub-millisecond per check (graph index lookups + grep). 5ms instrumentation budget per `computeOrphanHints` precedent.
**Cross-host:** Universal — works on every OK target host because it's the existing `hints[]` channel.

### Trigger 2: session-end — context compact / disconnect

**Fires:** Hocuspocus session disconnect, or MCP server's keepalive WS close.
**Runs:** Final deterministic lint sweep + queue findings into a per-session "next-time" buffer.
**Surface:** Findings surface in the next session's first tool response (e.g., on `list_documents` or first `read_document`).
**Cost:** Per-session, not per-write — amortized cheap.
**Cross-host:** Universal via MCP server-internal state. Not host-event-driven.

### Trigger 3: daily — 10 PM nightly (the 5-phase pattern)

**Fires:** Cron / launchd / systemd / GitHub Actions cron / Anthropic Routines.
**Runs:** The eugeniughelbur-pattern 5-phase nightly:

| Phase | What it does | Operations |
|---|---|---|
| 1. Close day | Finalize daily/session log doc | Mechanical write |
| 2. Reconcile contradictions | Surface conflicting claims via sampling | LLM lint #1 |
| 3. Synthesize cross-source patterns | Surface emergent themes via sampling | LLM lint #6 (data gaps as new questions) |
| 4. Heal orphans | Suggest links for orphaned pages | Deterministic + LLM hybrid lint #5 |
| 5. Rebuild index | Recompute `index.md` | Mechanical |

Plus `recompile` runs on canonical articles whose evidence has shifted (per the bounded contract).

**Surface:** Findings file as `wiki/lint-reports/YYYY-MM-DD.md`. Recompile changes commit to the repo. PR opens for human review.
**Cost:** Several LLM calls per page; bounded by the workflow's time budget. Anthropic Routines handles billing; GitHub Actions / DIY uses your own credentials.
**Cross-host:** GitHub Actions is the LCD. Anthropic Routines is the cleanest Claude-Code-specific path.

### Trigger 4: weekly — Sunday 9 PM (deep audit)

**Fires:** Same scheduling primitives as daily, weekly cadence.
**Runs:** Deeper passes:
- Stale-claim detection across the entire wiki (LLM lint #2 + #16).
- Supersedes-chain validation (deterministic).
- Source-rot check (HTTP HEAD against every cited URL; archive-on-rot via Wayback).
- `recompile` full pass on all canonical articles whose evidence has shifted in the past week.
- Consolidate-readiness suggestions: "this research has been stable for 2+ weeks with no contradicting evidence — consider `consolidate`."

**Surface:** Weekly health report at `wiki/lint-reports/weekly-YYYY-MM-DD.md`. Suggestions surface as a separate doc the user can act on.
**Cost:** Heavier than daily. Run on a budget-aware schedule.

### Trigger 5: continuous — in-memory decay scoring

**Fires:** Hocuspocus `onChange` (mirrors `live-derived-index.ts` pattern).
**Runs:** Per-doc decay score updates. Importance × maturity × recency, ByteRover-AKL-style.
**Surface:** Editor UI badge per doc; available in API as `/api/lint-status` for external consumers.
**Cost:** O(1) per doc-change, no LLM calls.
**Cross-host:** UI signal; reaches all hosts via the OK preview surface.

---

## The Three Distribution Layers

### Layer 1: `hints[]` sentinel (universal floor)

**Mechanism:** Existing `hints[]` channel on `/api/agent-write-md` responses. The MCP `write_document` tool already passes them through.
**Coverage:** Every OK target host (Claude Code, Cursor, Codex, Windsurf, Copilot CLI, Continue, Aider, Claude Desktop, Cowork, Claude.ai web).
**Cost:** ~5 LOC per new check (one new `compute*Hints` function per check, called from `handleAgentWriteMd`).
**Implementation:** Phase 1 from prior `ok-knowledge-lint-integration` report — unchanged.

### Layer 2: Per-host hooks (best UX for Tier-A hosts)

**Mechanism:** `ok install-hooks` CLI command writes per-host config templates.
**Coverage:** 5 Tier-A hosts with native PreToolUse/PostToolUse-pattern hooks (Claude Code, Cursor, Codex, Windsurf, Copilot CLI).
**Cost:** ~300 LOC + 5 templates.
**Implementation:** Phase 2 from prior report. Single shared hook script (`packages/cli/src/hooks/lint-hook.ts`) with per-host JSON envelope adapters. Mirrors `installUserSkill` install-template pattern.

### Layer 3: Generic shell-job runner (agent-CLI-agnostic, modeled on GBrain Minions)

**Mechanism:** OK config has an `automation.jobs[]` array. Each job is `{name, schedule, cmd, argv, cwd, env, scope?, agent_label?, prompt_file?}`. OK runs jobs on schedule via the user's OS scheduler (launchd / systemd / cron) or via GH Actions. Off-by-default security gate `OK_ALLOW_SHELL_JOBS=1` mirrors GBrain's `GBRAIN_ALLOW_SHELL_JOBS=1`.

```yaml
# .open-knowledge/config.yml — fully agent-agnostic
automation:
  jobs:
    # Example A: pure-deterministic, no LLM involved
    - name: lint-deterministic-nightly
      schedule: "0 22 * * *"
      cmd: "/usr/local/bin/wiki-lint-deterministic.sh"   # user's bash script
      cwd: "."

    # Example B: user picked Claude Code (their choice, not OK's)
    - name: lint-semantic-nightly
      schedule: "0 23 * * *"
      cmd: "claude"
      argv: ["--print", "--prompt-file", "{prompt_file}"]
      prompt_file: ".open-knowledge/prompts/nightly-5-phase.md"
      env:
        ANTHROPIC_API_KEY_FILE: "/etc/secrets/anthropic"

    # Example C: user picked Codex (different teammate, different tool)
    - name: lint-semantic-via-codex
      schedule: "0 23 * * *"
      cmd: "codex"
      argv: ["--print", "--prompt-file", "{prompt_file}"]
      prompt_file: ".open-knowledge/prompts/nightly-5-phase.md"
      env:
        OPENAI_API_KEY_FILE: "/etc/secrets/openai"

    # Example D: user picked local Ollama via Aider
    - name: lint-via-local-ollama
      schedule: "0 23 * * *"
      cmd: "aider"
      argv: ["--message", "{prompt}", "--model", "ollama/llama3.1", "--no-auto-commits"]
      prompt_file: ".open-knowledge/prompts/nightly-5-phase.md"

    # Example E: user picked Anthropic Routines (cloud-managed)
    - name: lint-via-routines
      schedule: "0 23 * * *"
      cmd: "anthropic-routines"
      argv: ["submit", "--prompt-file", "{prompt_file}"]
```

**Substitution placeholders OK provides:** `{prompt}` (inline string from `prompt_file`), `{prompt_file}` (path to the prompt template), `{cwd}` (resolved content dir), `{report_path}` (suggested path for findings output), `{agent_label}` (per-stream attribution).

**Coverage:** Universal — every agent has a CLI version, plus pure-bash and cloud-managed options. The runner doesn't know or care what kind of `cmd` it's running.

**What OK ships:**
- The runner itself (parses `automation.jobs[]`, substitutes placeholders, execs).
- Prompt templates as plain markdown at `.open-knowledge/prompts/*.md` — agent-agnostic specs of "what the nightly should do."
- Example workflow files in `examples/scheduling/` for several agent CLIs.
- `ok schedule install` CLI helper that detects the user's scheduler (launchd/systemd/cron) and writes the corresponding entry. Asks the user "what `cmd` should we run?" — does not pick.
- Off-by-default security gate; production deployments must opt in.

**What OK does NOT ship:**
- A default agent.
- API credentials.
- A choice of LLM provider.
- An assumption about which `cmd` will be used.

**Cost:** ~80 LOC for the runner + ~5 example YAMLs + ~3 prompt templates (`nightly-5-phase.md`, `weekly-deep-audit.md`, `recompile-eligible.md`).
**Implementation:** Phase 4. Reuses existing `research --headless` chain *if and only if* the user's chosen `cmd` invokes an agent that calls `research`; bypass-able for pure-deterministic jobs.

**Industry precedent:** GBrain Minions ([evidence/precedent-shell-job-runners.md](evidence/precedent-shell-job-runners.md)) runs 21 cron jobs in production with this exact shape. The "generic shell-job runner" pattern is convergent, not novel.

---

## Stream Isolation

**Per-topic streams via folder + `AGENT_LABEL` conventions:**

```yaml
# .open-knowledge/config.yml
folders:
  - match: "articles/auth/**"
    frontmatter:
      title: Auth Articles
      tags: [canonical, auth]
    consolidationStream: auth   # NEW

  - match: "articles/editor/**"
    frontmatter:
      title: Editor Articles
      tags: [canonical, editor]
    consolidationStream: editor   # NEW

  - match: "research/**"
    frontmatter:
      status: provisional
    # no consolidationStream — research articles don't belong to a stream until consolidated
```

**Per-stream nightly workers** ride on `AGENT_LABEL`:
```bash
AGENT_LABEL=lint-nightly-auth claude --print "Run lint + recompile against articles/auth/"
AGENT_LABEL=lint-nightly-editor claude --print "Run lint + recompile against articles/editor/"
```

Each worker:
- Operates on its own folder slice.
- Attributes writes via the existing writer-ID taxonomy: `agent-<connId>` with `displayName: lint-nightly-auth`.
- Doesn't cross-contaminate other streams.

**Cross-stream concerns** are handled by global lint passes (tag consistency, link integrity, index drift) — these already see the whole KB.

**Same-doc concurrency** (rare, only when two streams both want to recompile the same canonical article — happens when a doc spans streams):
- Frontmatter version field: `canonicalVersion: <int>`.
- Recompile reads version N → composes rewrite → writes only if still N (CAS).
- On conflict: skip + log + retry on next nightly. Idempotent.

**No new infrastructure.** The CRDT layer already handles per-doc concurrency for content edits; CAS is needed only for the metadata-level "only recompile if no other recompile happened in the meantime" check.

---

## Component-By-Component Plumbing

### What's already in place (no changes needed)

| Component | Where | Role |
|---|---|---|
| `hints[]` channel on `/api/agent-write-md` | `packages/server/src/api-extension.ts:1626-1648` | Universal sentinel for every write |
| `write_document` MCP tool passes hints through | `packages/cli/src/mcp/tools/write-document.ts:102-145` | Surfaces hints to agent |
| `applyAgentMarkdownWrite` | `packages/server/src/agent-sessions.ts:92-107` | Single canonical write surface; OTel span |
| `live-derived-index.ts` extension pattern | `packages/server/src/live-derived-index.ts` | Template for `live-knowledge-lint` |
| `installUserSkill` install template | `packages/server/src/skill-install.ts` | Template for `ok install-hooks` |
| `consolidate` MCP tool (current) | `packages/cli/src/mcp/tools/consolidate.ts` | User-decides, STOP gate, unchanged |
| `research --headless` mode | `packages/cli/src/mcp/tools/research.ts:35-43` | Auto-research engine |
| Writer-ID taxonomy (precedent #25) | `AGENTS.md` + shadow repo | Per-stream attribution slot |
| `.open-knowledge/config.yml` `folders:` | Existing | Stream isolation surface |
| `@modelcontextprotocol/sdk` | Imported in `server.ts` | Sampling available, not yet wired |
| MCP server notification handlers | `server.ts:294` | Notifications already wired |

### What needs adding

| Component | Where | LOC | Phase |
|---|---|---|---|
| New `compute*Hints` functions (4 net-new deterministic checks) | `packages/server/src/lint/deterministic-checks.ts` | ~200 | 1 |
| Wire new hints into `handleAgentWriteMd` | `api-extension.ts:1626` (extend existing site) | ~10 | 1 |
| `LintFinding` shared type | `packages/core/src/lint/types.ts` | ~30 | 1 |
| `lint` MCP tool (aggregator) | `packages/cli/src/mcp/tools/lint.ts` | ~80 | 1 |
| `ok install-hooks` CLI command | `packages/cli/src/commands/install-hooks.ts` | ~150 | 2 |
| Shared hook script | `packages/cli/src/hooks/lint-hook.ts` | ~80 | 2 |
| Per-host hook config templates | `packages/cli/src/hooks/templates/*.{json,toml}` | ~5 templates | 2 |
| MCP sampling capability registration | `packages/cli/src/mcp/server.ts` (extend) | ~30 | 3 |
| `lint_semantic` MCP tool | `packages/cli/src/mcp/tools/lint-semantic.ts` | ~150 | 3 |
| Generic shell-job runner (parses `automation.jobs[]`, substitutes placeholders, execs) | `packages/cli/src/scheduler/runner.ts` | ~80 | 4 |
| `automation.jobs[]` schema in config + `OK_ALLOW_SHELL_JOBS=1` security gate | `packages/cli/src/config/schema.ts` (extend) | ~30 | 4 |
| Prompt templates (agent-agnostic) | `.open-knowledge/prompts/{nightly-5-phase,weekly-deep-audit,recompile-eligible}.md` | ~3 templates | 4 |
| Example workflow YAMLs (per-CLI examples, not defaults) | `examples/scheduling/{claude,codex,routines,aider-ollama,deterministic-only}.yml` | ~5 examples | 4 |
| `ok schedule install` CLI helper (asks user for `cmd`, writes scheduler entry) | `packages/cli/src/commands/schedule.ts` | ~50 | 4 |
| `live-knowledge-lint.ts` Hocuspocus extension | `packages/server/src/live-knowledge-lint.ts` | ~120 | 5 |
| CC1 channel registration for `'lint'` | `packages/server/src/cc1-broadcast.ts` (extend) | ~10 | 5 |
| `recompile` MCP tool | `packages/cli/src/mcp/tools/recompile.ts` | ~200 | 6 |
| Recompile section-allowlist + audit-trail logic | (in `recompile.ts`) | (above) | 6 |
| `consolidationStream:` schema in `config.yml` | `packages/cli/src/config/schema.ts` (extend) | ~20 | 7 |
| Stream-aware index composition | `packages/server/src/live-derived-index.ts` (extend) | ~30 | 7 |
| Version-CAS for canonical articles | `packages/server/src/agent-sessions.ts` (extend) | ~50 | 7 |

**Total: ~1,200 LOC** across 7 phases + 7 small templates.

---

## Sequencing — Revised From Prior Integration Report

**Value-per-cost ordering**, with rationale:

### Phase 1: Hints-channel deterministic checks (~280 LOC)

**Why first:** Universal floor. Lights up immediately for every OK user. Zero protocol changes. Lowest risk, highest reach.

**What ships:** 4 net-new `compute*Hints` functions; `LintFinding` shared type; `lint` aggregator MCP tool; updated `SKILL.md` documenting the hint types.

**User-facing change:** Every write returns lint findings inline. Agent sees them in chat, fixes them in the next turn.

### Phase 4: Generic shell-job runner + prompt templates + per-CLI examples (~165 LOC + templates)

**Why second:** Reuses everything from Phase 1 + the existing `research --headless` chain. Demonstrates the auto-research loop end-to-end with minimal investment. The runner is **agent-CLI-agnostic** — modeled on GBrain Minions, the convergent industry pattern.

**What ships:**
- `automation.jobs[]` config schema + the runner that parses it, substitutes placeholders (`{prompt}`, `{prompt_file}`, `{cwd}`, `{report_path}`, `{agent_label}`), and execs.
- `OK_ALLOW_SHELL_JOBS=1` off-by-default security gate (mirrors GBrain).
- Prompt templates as agent-agnostic markdown specs (`.open-knowledge/prompts/nightly-5-phase.md`, etc.).
- Example workflow YAMLs in `examples/scheduling/` for several agent CLIs (Claude Code, Codex, Anthropic Routines, Aider+Ollama, deterministic-only-no-LLM).
- `ok schedule install` CLI helper that detects the user's scheduler and writes the entry; **asks the user for the `cmd`, doesn't pick**.

**Critical: OK ships no default agent.** A user can run pure-deterministic jobs with no LLM at all. A user who wants the LLM-required checks supplies their own agent CLI in the `cmd` field. **OK is the runner; the user is the orchestrator.**

**User-facing change:** Daily and weekly health reports land as PRs (or whatever the user's chosen `cmd` does) — reviewable, mergeable, auditable. Pure-deterministic users get value with zero LLM cost. LLM-using users pick their stack.

**Industry precedent:** [evidence/precedent-shell-job-runners.md](evidence/precedent-shell-job-runners.md) — GBrain runs 21 cron jobs in production with this exact shape.

### Phase 6: Recompile primitive (~200 LOC)

**Why third:** Closes the autonomy-axis gap. `recompile` MCP tool with section-allowlist + audit-trail + evidence-bounded contract. Composes with Phase 4 nightlies (the nightly invokes recompile on shifted-evidence canonicals).

**What ships:** New `recompile` MCP tool; section-allowlist; audit-trail frontmatter convention.

**User-facing change:** Canonical articles' Trade-offs / Alternatives / Implementation notes / Further reading sections stay current; Decision and Rationale require human-driven `consolidate`.

### Phase 3: MCP sampling for LLM-required checks (~180 LOC)

**Why fourth:** Adds the LLM-required 5 checks. Validates cross-host MCP-portability claim in production. Requires Phase 1 + 4 to be stable so the sampling infra has a proven harness.

**What ships:** Capability registration in `server.ts`; `lint_semantic` MCP tool that calls `sampling/createMessage` per check.

**User-facing change:** Contradictions, data gaps, lost-nuance, hallucination amplification, over-confident summaries — all detectable on demand.

### Phase 7: Stream isolation (~100 LOC)

**Why fifth:** Becomes important once multiple users (or nightly workers) operate concurrently on the same KB. Phase 4's nightly is single-stream by default; this enables per-topic parallelism.

**What ships:** `consolidationStream:` schema; stream-aware index composition; canonical-article version-CAS; updated nightly templates that fan out per stream.

**User-facing change:** `lint-nightly-auth` and `lint-nightly-editor` workers run concurrently without crashing into each other.

### Phase 2: Tier-A host hooks (~310 LOC + templates)

**Why sixth:** Best-UX layer for power users on hook-supporting hosts. The lower phases provide the universal floor; this is the polish layer for the 5 hosts that can do better.

**What ships:** `ok install-hooks` CLI command; shared `lint-hook.ts` script; per-host config templates.

**User-facing change:** Tier-A users get fail-closed lint enforcement (writes that introduce dead links can be blocked at the hook layer).

### Phase 5: Live decay scoring extension (~130 LOC)

**Why seventh:** UI-side polish. Once users have lint findings, they want a visual signal — but this is purely additive UX, lowest urgency.

**What ships:** `live-knowledge-lint.ts` Hocuspocus extension; `'lint'` CC1 channel; per-doc decay score in editor file tree.

**User-facing change:** File tree shows lint badge per doc; decay score visible.

---

## The End-to-End User Story

### A user writes a wiki article

1. User in Claude Code: *"add a page about auth token refresh"*
2. Claude calls `mcp__open-knowledge__write_document(docName: "articles/auth/token-refresh", markdown: "...", position: "replace")`
3. OK MCP server forwards to `/api/agent-write-md`.
4. `applyAgentMarkdownWrite` mutates the CRDT.
5. `handleAgentWriteMd` runs the deterministic-7 lint checks against the post-write state. **(Phase 1)**
6. Findings: `[{type: 'redlink', concept: 'JWT', message: '"JWT" mentioned but no page exists'}, {type: 'no-source', message: 'Article has no link to raw/'}]`.
7. Response includes `hints: [...]` array.
8. MCP `write_document` tool passes hints through to Claude as `structured.hints` plus human-readable lines.
9. Claude reads hints, decides to fix: creates `articles/auth/jwt.md` and adds a `[[raw/auth-rfc-7519]]` reference.

### Tier-A host user gets fail-closed enforcement

10. User runs `ok install-hooks --host claude-code`. **(Phase 2)**
11. Command writes a `PostToolUse` hook to `.claude/settings.json` matched on `mcp__open-knowledge__write_document`.
12. Next session, when Claude writes a doc with lint findings, the hook script invokes the `lint` MCP tool with `mode: 'block-on-error'`. If any high-confidence finding is present, exit code 2 — Claude is told the write was rejected.

### Nightly 5-phase runs at 10 PM (user supplied the agent CLI)

13. The user previously added an `automation.jobs[]` entry to their `.open-knowledge/config.yml`. They picked their own `cmd` — could be `claude`, `codex`, `aider`, `anthropic-routines`, or anything else. **OK never prescribed a default.** **(Phase 4)**
14. The user's chosen scheduler (launchd / systemd / cron / GH Actions) fires the job. The runner reads `cmd + argv`, substitutes `{prompt_file}` with the path to `.open-knowledge/prompts/nightly-5-phase.md`, execs.
15. The user's agent CLI starts up, reads its config (which the user already wired to include OK's MCP server), connects to the user's chosen LLM provider with the user's credentials, reads the prompt template.
16. Phase 1 (close day): writes `wiki/daily/2026-04-27.md` summarizing today's session activity.
17. Phase 2 (reconcile): invokes `lint_semantic` for contradictions check **(Phase 3)**. Finds `articles/auth/oauth.md` says "OAuth 2.0" and `articles/auth/token-refresh.md` says "OAuth 2.1 required" — surfaces as conflict.
18. Phase 3 (synthesize): invokes `lint_semantic` for data gaps. Finds "DPoP mentioned in 3 articles but no canonical page" — surfaces as research suggestion.
19. Phase 4 (heal orphans): finds 5 orphan pages, suggests parent hubs, agent accepts the suggestions.
20. Phase 5 (rebuild index): `index.md` is recomputed; agent CLI exits.
21. The user's CI/scheduler opens a PR (or commits directly, depending on their setup). User reviews Monday morning.

### Recompile fires on shifted-evidence canonicals

21. During the nightly, the workflow also checks each canonical article's `recompiled:` frontmatter against the mtime of its `sources:` and linked research. **(Phase 6)**
22. `articles/auth/oauth.md` has `recompiled: 2026-03-15`; one of its sources (`raw/auth-rfc-9700.md`) was added 2026-04-20.
23. Workflow invokes `recompile articles/auth/oauth.md`. The tool reads the article + its sources, identifies that `Trade-offs` and `Alternatives considered` sections are eligible for re-derivation.
24. New `Trade-offs` section incorporates the new RFC. `Decision` and `Rationale` are untouched.
25. Article gets a new `recompiled: 2026-04-27` entry plus an `audit:` field listing what was changed.
26. Diff shows up in the PR. User reviews — sees Decision/Rationale unchanged, accepts the Trade-offs update.

### Multiple streams run concurrently (different teams may pick different agents)

27. The repo grows. User adds per-stream jobs to `automation.jobs[]` — and **each stream's `cmd` can be a different agent CLI** if different teams have different preferences:
    ```yaml
    automation:
      jobs:
        - name: lint-nightly-auth
          schedule: "0 22 * * *"
          scope: "articles/auth/**"
          agent_label: "lint-nightly-auth"
          cmd: "claude"           # auth team uses Claude
          argv: ["--print", "--prompt-file", "{prompt_file}"]
        - name: lint-nightly-editor
          schedule: "0 23 * * *"
          scope: "articles/editor/**"
          agent_label: "lint-nightly-editor"
          cmd: "codex"            # editor team uses Codex
          argv: ["--print", "--prompt-file", "{prompt_file}"]
    ```
    **(Phase 7)**
28. Both run staggered, each writing only its folder slice. Per-stream attribution rides on `agent_label`, threading into OK's existing writer-ID taxonomy (precedent #25). Cross-stream concerns (tag consistency, dead links across streams) are handled by a separate weekly deep-audit job.
29. Same-doc concurrency (rare): an article spanning streams gets a version-CAS check — second writer detects version mismatch, retries on next run.

### User triggers consolidate manually

30. User: *"OK we decided. Consolidate the JWT-vs-PASETO research."*
31. Claude invokes `mcp__open-knowledge__consolidate(topic: "JWT vs PASETO")`.
32. The tool runs the existing STOP gate: *"What is the actual decision? What alternatives were rejected? What's the rationale?"*
33. User answers; Claude writes the canonical article with `status: canonical`, `supersedes: research/jwt-vs-paseto.md`.
34. Existing behavior, unchanged.

---

## The deeper principle: OK is substrate, not framework

**OK is to knowledge what git is to code.** Git doesn't prescribe your editor, your CI provider, your code review tool. It provides the substrate — the data model + the protocols — and lets the ecosystem build on top.

The same principle applies to knowledge-lint and overnight automation:

| OK provides | OK does NOT provide |
|---|---|
| The data model (markdown + frontmatter + CRDT) | An agent. |
| The HTTP API for deterministic ops | API credentials. |
| The MCP tool surface for agent ops | A choice of LLM provider. |
| Prompt templates that say "what an agent should do" | A default `cmd` for the runner. |
| The shell-job runner that execs the user's `cmd` | An assumption about what the `cmd` will be. |
| Per-CLI examples in `examples/scheduling/` | A "blessed" agent CLI. |

This makes the user story **honest about what's free and what requires choice**:
- **Phase 1 + Phase 4-deterministic-jobs**: free, works for everyone, zero choices forced.
- **Phase 4-LLM-jobs + Phase 3 (sampling) + Phase 6 (recompile)**: requires you to pick an agent and bring credentials. Your choice, your cost.
- **`consolidate` (existing)**: a primitive callable from any agent the user has — STOP gate ensures human-decides regardless of which agent.

**This is exactly GBrain's stance applied to OK's compatibility matrix.** GBrain ships generic Minions plus opinionated Hermes/OpenClaw skills. OK ships generic shell-jobs plus an agent-agnostic skill. The runner is the same shape; the difference is that OK's skill works with any MCP-compliant agent rather than a specific stack.

**The right user story is "OK works the moment you install it; LLM features are opt-in via your agent of choice."**

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Editor UI for lint findings** — Phase 5 feeds the substrate (`'lint'` CC1 channel + `live-knowledge-lint` extension), but the rendering decision (badges in file tree? inline annotations? a dedicated panel?) is a UX question requiring design work, not just engineering.
- **Cost / quota awareness** for nightlies — the LLM-required checks (Phase 3) running on every page weekly could be expensive. Anthropic Routines includes this in the Max plan; DIY users need budget caps in the workflow.
- **Failure-mode semantics for `recompile` conflicts** — if the section-allowlist heuristic incorrectly classifies a section as recompile-eligible, the user gets a bad rewrite. The fix is human review of the PR; the prevention is a smaller default allowlist + opt-in expansion.
- **Same-doc cross-stream conflicts** — version-CAS works for "two recompiles in flight"; less clear for "one recompile + one human edit." CRDT handles content-level concurrency, but the *frontmatter* canonicalVersion bump is its own ordering concern.

### Out of Scope

- Detailed UX mockups.
- Specific cost-budget configurations.
- The redmizt "18 architectural extensions" research direction (gist returned 404; could surface additional patterns).

---

## References

### Evidence Files
- [evidence/precedent-shell-job-runners.md](evidence/precedent-shell-job-runners.md) — GBrain Minions architecture (21 production cron jobs, agent-CLI-agnostic, off-by-default security gate); Pratiyush/llm-wiki's deterministic-vs-LLM split; aaronoah's BYO-as-agent-agnostic-skill pattern; eugeniughelbur's prescriptive Claude Code lock-in; convergent design choices.

### Internal Sources
- `packages/server/src/api-extension.ts` — handler functions; `hints[]` channel.
- `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite`.
- `packages/server/src/live-derived-index.ts` — extension pattern template.
- `packages/server/src/skill-install.ts` — install-template precedent.
- `packages/cli/src/mcp/tools/write-document.ts` — hints surfaced through MCP.
- `packages/cli/src/mcp/tools/consolidate.ts` — STOP-gated decision tool (preserved).
- `packages/cli/src/mcp/tools/research.ts` — `--headless` mode for auto-research.
- `packages/cli/src/mcp/server.ts` — MCP server, sampling SDK already imported.
- `AGENTS.md` precedent #25 — writer-ID taxonomy.
- `.open-knowledge/config.yml` — folder-rules surface for stream isolation.

### Related Research
- [reports/gbrain-vs-openknowledge-parity/](../gbrain-vs-openknowledge-parity/) — **the canonical 1P GBrain coverage in this repo** (2026-04-27). This integration architecture's shell-job runner is parity work item #5 in that audit's ranked list. The Minions / dream / doctor patterns referenced throughout this report all trace to that audit's evidence files.
- [reports/linting-coverage-and-gaps/](../linting-coverage-and-gaps/) — what OK has today (mostly nothing for content).
- [reports/knowledge-linting-karpathy-workflow/](../knowledge-linting-karpathy-workflow/) — the 17-check taxonomy + cadence + failure modes (extended in this report).
- [reports/agent-host-hooks-cross-host/](../agent-host-hooks-cross-host/) — where to fire it (5 hosts have hooks; MCP-portable alternatives; auto-research surfaces).
- [reports/ok-knowledge-lint-integration/](../ok-knowledge-lint-integration/) — the earlier integration plan this report supersedes.
- [reports/consolidate-and-overnight-patterns/](../consolidate-and-overnight-patterns/) — the reframe of consolidate-class operations as part of knowledge lint; 5-trigger taxonomy.
- [reports/compiled-truth-timeline-content-conventions/](../compiled-truth-timeline-content-conventions/) — six-domain convergent recompilation pattern.
- [reports/open-knowledge-prior-art-eight-sources/](../open-knowledge-prior-art-eight-sources/) — Karpathy gist + 7 other sources including the original gist-era GBrain coverage (superseded by `gbrain-vs-openknowledge-parity/` for current state).
