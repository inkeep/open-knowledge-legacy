---
title: "Knowledge Lint as KB-Integrity-Over-Time: Lint, Recompile, Consolidate, and Overnight Workflows"
description: "Reframes consolidate-class operations as part of the broader knowledge-lint discipline rather than a separate concern. Maps three operations on one autonomy-vs-evidence axis: lint (fully autonomous, surfaces findings), recompile (bounded autonomous, evidence-driven re-derivation, the gap OK currently lacks), and consolidate (human-decides, current STOP-gated tool). Surveys community overnight workflow patterns (eugeniughelbur 5-phase nightly + Sunday weekly + per-compaction; Pratiyush llmwiki sync via launchd/systemd; Anthropic Claude Code Routines Q1 2026; Auto-Dream / Sleep Consolidation; the convergent 5-trigger taxonomy). Addresses independent decision-streams via per-topic isolation + writer-ID labeling."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Open Knowledge
  - Karpathy LLM Wiki
  - GBrain
  - Anthropic Claude Code Routines
  - eugeniughelbur obsidian-second-brain
  - Pratiyush llm-wiki
topics:
  - knowledge linting at scale
  - consolidate workflow
  - recompile pattern
  - compiled truth and timeline
  - overnight workflows
  - independent decision streams
  - sleep consolidation
  - 5-trigger taxonomy
  - bounded autonomy
---

# Knowledge Lint as KB-Integrity-Over-Time: Lint, Recompile, Consolidate, and Overnight Workflows

**Purpose:** Reframe consolidate-class operations as part of the broader knowledge-lint discipline (per the user's correction). Map three distinct operations on one autonomy axis. Survey community overnight workflow patterns. Address how independent decision-streams compose without crashing into each other.

**Framing:** Mixed 1P/3P — 1P investigation of OK's `consolidate.ts` against the broader 3P landscape of overnight workflow patterns the community has developed.

---

## Executive Summary

**Consolidate-class operations are part of knowledge lint at the broader frame.** Detecting stale canonical claims, recompiling canonical state when evidence shifts, and isolating parallel decision-streams are all subspecies of "keeping the knowledge base honest about the world it represents." The earlier framing in the prior `ok-knowledge-lint-integration` report drew too hard a line between `lint` and `consolidate` — at scale, KB-integrity-over-time *is* lint, and consolidate-class operations are part of that discipline.

**The cleaner model is three operations on one autonomy axis:**

| Operation | Trigger | Autonomy profile | What it writes |
|---|---|---|---|
| **`lint`** (deterministic + LLM-required) | Continuous + scheduled | Fully autonomous | Findings (`hints[]`) — no claims |
| **`recompile`** (the gap OK currently lacks) | Evidence-shift detected | Bounded autonomous — rewrites constrained by timeline evidence | Updated canonical state with audit trail |
| **`consolidate`** (current OK tool) | User-driven, one-shot | Human-decides — STOP gate enforces | Net-new canonical articles |

The autonomy gradient is **lint surfaces → recompile re-derives → consolidate decides**. Each layer makes more substantial claims and requires more authority. Current OK has lint primitives (graph-health endpoints + `hints[]` channel) and `consolidate` (STOP-gated), but lacks the middle layer — `recompile`-class evidence-driven re-derivation. **The "compiled truth + timeline" pattern from this repo's prior research (six-domain convergent solution) is the missing primitive**: GBrain, ByteRover, Wikipedia, Zettelkasten, NIE intelligence reports, and Karpathy llm-wiki all implement it; OK currently doesn't.

**Community overnight workflow patterns have converged on a five-trigger taxonomy** that's richer than the four classes from the prior `knowledge-linting-karpathy-workflow` report. The new addition is **session-end** (fires when the user disconnects or context compacts, distinct from clock-based time triggers). The strongest reference patterns:

- **eugeniughelbur/obsidian-second-brain — 5-phase nightly at 10 PM** (close day → reconcile contradictions → synthesize cross-source patterns → heal orphans → rebuild index) + Sunday 9 PM weekly health audit + post-compaction background fires.
- **Pratiyush/llm-wiki** — `llmwiki sync` via native OS schedulers (launchd/systemd/Task Scheduler), idempotency over crash recovery, principle: "consolidation is human-in-loop, bookkeeping is automated."
- **Anthropic Claude Code Routines (Q1 2026)** — first-class cloud cron for Claude Code, Max plan only.
- **Auto-Dream / Sleep Consolidation** — biological-sleep-as-metaphor pattern emerging across multiple implementations for *deep* overnight LLM-judgment passes.

**Independent decision-streams are the multi-agent-merge problem the prior research already named.** No production system implements true concurrent compilation merge; all serialize writes. For OK, the pragmatic shape is **per-topic stream isolation** via folder slices (`articles/auth/`, `articles/editor/`) plus `AGENT_LABEL` conventions on autonomous workers. OK's existing writer-ID taxonomy (precedent #25, five classes) accommodates this without protocol changes.

**Key Findings:**
- **Reframe consolidate-class operations as part of knowledge lint at the broader frame.** The hard distinction the prior report drew was an artifact of OK's current `consolidate.ts` STOP gate, not an architectural truth.
- **OK has a missing primitive** — `recompile`-class evidence-driven re-derivation. The "compiled truth + timeline" pattern from prior research is the convergent solution; six historical systems implement it; OK doesn't.
- **Community overnight patterns have converged on 5 trigger classes** (per-event, session-end, daily, weekly, continuous-decay). 5-phase nightlies are the dominant shape; Sunday weeklies are the convention for deep audits.
- **Anthropic Claude Code Routines (Q1 2026)** is the first-class cloud cron for Claude Code users. Cross-host LCD remains GitHub Actions.
- **Independent streams are folder + AGENT_LABEL conventions**, not new infrastructure. OK's writer-ID taxonomy already accommodates per-stream attribution.
- **The conservative default for autonomous re-derivation**: only re-derive sections grounded in observable evidence (`Trade-offs`, `Alternatives considered`, `Further reading`); never re-derive sections that encode user-decided rationale (`Decision`, `Rationale`). Preserves the spirit of the STOP gate while enabling bounded autonomy.

---

## Research Rubric

**Primary question:** How do consolidate-class operations and overnight workflows fit into the broader knowledge-lint discipline, what's the right autonomy boundary, and how do independent streams compose?

**Reader cares most about:** A coherent model that doesn't artificially separate "lint" from "consolidate" — both serve KB integrity. Concrete patterns from working community implementations. The shape of the gap OK currently has.

**Dimensions (P0):**
1. **The autonomy axis** — three operations (lint / recompile / consolidate), trigger-and-write semantics for each.
2. **Community overnight workflow patterns** — concrete reference implementations.
3. **Independent decision-streams** — how parallel consolidation workflows compose.

**P1:**
4. **The conservative default for autonomous re-derivation** — which sections are safe to recompile vs require human re-confirmation.

**Stance:** Reframe + landscape. Acknowledges the prior report's framing was too rigid.

---

## Detailed Findings

### 1. The autonomy axis — three operations, one model

**Finding:** Lint, recompile, and consolidate are three points on the same autonomy-vs-evidence axis. OK has lint primitives and consolidate; the recompile gap is what's missing.

**Evidence:** [evidence/consolidate-vs-other-operations.md](evidence/consolidate-vs-other-operations.md)

The model:

```
                    Authority required
   Lint surfaces ────────────────────────► Consolidate decides
        │                                          │
        │            ◄──── Recompile ─────►        │
        │           (evidence-bounded               │
        │            autonomous rewrite)            │
        │                                          │
   Fully autonomous                       Human-decides
   No claims                              New canonical claims
```

The gradient:
- **`lint` (deterministic + LLM-required)** — read-only, surfaces findings. The `hints[]` channel from the prior `ok-knowledge-lint-integration` report.
- **`recompile`** — writes re-derived canonical state, but **bounded by evidence** (the timeline below the line, the `sources:` frontmatter, the `supersedes:` chain). The LLM doesn't fabricate; it re-states the compiled zone in light of accumulated evidence. **Autonomous within constraints.**
- **`consolidate` (current OK tool)** — writes net-new canonical state for *new* decisions. Requires human input on what was decided and why. The STOP gate enforces this.

**The gap in OK today:** lint primitives exist (`/api/dead-links`, `/api/orphans`, etc.); consolidate exists (with the STOP gate); recompile doesn't. Six-domain prior research (`compiled-truth-timeline-content-conventions/`) shows recompile is convergent: GBrain's `maintain` skill, ByteRover's AKL maturity decay, Wikipedia's continuous editing, Zettelkasten's permanent-note refinement, NIE intelligence supersession, Karpathy llm-wiki's lint-with-data-gaps all implement variants. OK currently doesn't.

**Implications:**
- The conceptual boundary between lint and consolidate dissolves at the broad frame: **both serve KB integrity over time**. The hard line drawn earlier was an artifact of literal-reading OK's current `consolidate.ts`, not a deeper truth.
- The right shape for OK is probably to **add `recompile`-class operations** rather than expanding `consolidate`'s authority — preserves the STOP gate's semantic clarity (consolidate = new decisions) while filling the evidence-driven re-derivation gap.
- Concretely: a `recompile` MCP tool (or `lint --fix` mode) that operates only on evidence-grounded sections (`Trade-offs`, `Alternatives considered`, `Further reading`) of canonical articles, leaving `Decision` and `Rationale` untouched until a human re-runs `consolidate`.

**Decision triggers:**
- If users complain "my canonical articles cite stale sources but `consolidate` won't help" — recompile is the answer.
- If users complain "my parallel research streams overwrite each other" — stream isolation (next finding) is the answer.

---

### 2. Community overnight workflow patterns

**Finding:** Five trigger classes (per-event, session-end, daily, weekly, continuous-decay) compose into the patterns working implementations ship today. The 5-phase nightly is the dominant shape.

**Evidence:** [evidence/community-overnight-workflows.md](evidence/community-overnight-workflows.md)

The five trigger classes:

| Class | What fires | Cadence | Operations suited |
|---|---|---|---|
| **Per-event (activity)** | After every write / ingest / N-th turn | Synchronous | Deterministic lint (write hints), source-traceability |
| **Session-end (use)** | When user disconnects / context compacts | Per-session | Index rebuild, "close the day," queue findings for next session |
| **Daily (time)** | Nightly cron / launchd / systemd | Daily, fixed time | 5-phase nightly: reconcile, synthesize, heal orphans, rebuild index, decay-score |
| **Weekly (time)** | Sunday-night cron convention | Weekly | Deep audits: stale-claim detection, supersedes-chain validation, source-rot |
| **Continuous (decay)** | In-memory scoring updated on every change | Real-time | Importance/maturity decay, freshness ranking |

Plus **on-demand**: `/lint`, `/consolidate`, `/research --headless` triggered explicitly.

**Reference implementations:**

- **[eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain)** — the cleanest working pattern:
  - **10 PM nightly**: 5-phase agent (close day → reconcile contradictions → synthesize cross-source patterns → heal orphans → rebuild index).
  - **Sunday 9 PM**: weekly health audit.
  - **Post-compaction**: background fires "after every context compaction. You keep working. The vault updates itself."
  - 31 commands; vault-first research; scheduled agents.

- **[Pratiyush/llm-wiki](https://github.com/Pratiyush/llm-wiki)** — OS-scheduler-native:
  - `llmwiki sync` via launchd/systemd/Task Scheduler.
  - `llmwiki all` (build → graph → export → lint) for comprehensive runs.
  - Idempotency over crash recovery: *"re-running any command is safe and cheap"*.
  - Principle: *"consolidation is human-in-loop, bookkeeping is automated."*

- **Anthropic Claude Code Routines (Q1 2026)** — first-class cloud cron:
  - *"Claude Code can now run on managed cloud infrastructure on a cron schedule."*
  - Max plan ($20/month). Headless mode in cloud. Repo + shell + credentials access.
  - Tracking issue [anthropics/claude-code#30649](https://github.com/anthropics/claude-code/issues/30649) shows community demand history.

- **Auto-Dream / Sleep Consolidation** — biological-sleep metaphor:
  - *"Auto-Dream, a memory consolidation feature modeled on how brains process sleep, is partially rolled out as of April 2026."*
  - Matches the gist-comments "Sleep Consolidation" pattern (DPC Messenger): *"Agents periodically reviewing archives to identify contradictions, propose refinements, and distinguish weak from important memories."*
  - Functionally: scheduled LLM-judgment passes that surface findings rather than auto-resolve.

**Cross-host options for triggering**:
- **OS-native** (launchd/systemd/Task Scheduler) — Pratiyush's recommendation; lowest overhead; per-OS.
- **Anthropic Routines** — Claude Code only, paid plan, cleanest UX.
- **GitHub Actions** — cross-host LCD; works for any agent CLI; recommended in prior `agent-host-hooks-cross-host` report.
- **MCP server-internal scheduling** — for *continuous-decay* triggers within OK itself; existing `live-derived-index.ts` pattern.

**Implications:**
- **The 5-phase nightly is the convergent shape** — multiple implementations (eugeniughelbur, Auto-Dream, llmwiki all) ship variants. OK's overnight surface should follow this template.
- **Sunday-night weekly is the convention for deep audits** — implementations differentiate "shallow nightly" (mostly mechanical) from "deep weekly" (LLM-required checks).
- **Idempotency is the resilience strategy** — every implementation surveyed prefers "safe to re-run" over complex recovery.

**Decision triggers:**
- If shipping for Claude Code Max users: Routines is the lowest-friction path.
- If shipping cross-host: GitHub Actions templates.
- If shipping for power-users on local machines: `ok install-hooks` extended with `ok install-cron` (per-OS scheduler templates).

---

### 3. Independent decision-streams

**Finding:** "Independent workflows and streams" is the multi-agent-merge problem the prior research already named. The pragmatic shape for OK is per-topic stream isolation via folder slices + `AGENT_LABEL` conventions, riding on the existing writer-ID taxonomy.

**Evidence:** [evidence/consolidate-vs-other-operations.md](evidence/consolidate-vs-other-operations.md) §Finding 4 + prior `compiled-truth-timeline-content-conventions/` research.

Per the prior research, four merge strategies for markdown+git systems:
1. **Serialized writes** (one agent at a time, lock file) — simplest, sufficient for 1-3 agents.
2. **Optimistic locking (CAS)** — version number on compiled truth.
3. **Section-level three-way merge** — independent sections allow parallel rewrites; same-section conflicts require resolution.
4. **CRDT-based metadata merge** — CRDT for staleness flags, claim confidence; serialize prose rewrites.

OK already has CRDT for content (Yjs) and shadow-repo for attribution. The infrastructure for parallel writes exists; what's missing is **stream-isolation discipline**:

**Stream isolation is convention, not infrastructure:**
- Each consolidation stream operates on its own folder slice (e.g., `articles/auth/`, `articles/editor/`).
- Cross-stream concerns are limited to:
  - Tag taxonomy consistency (Karpathy lint check #8).
  - Cross-stream link integrity (already covered by dead-link + orphan checks).
  - Index drift (the `index.md` aggregates across streams).
- Per-stream attribution rides on `AGENT_LABEL`: e.g., `lint-nightly-auth`, `lint-nightly-editor`.

**Existing OK primitives that already accommodate this:**
- **Writer-ID taxonomy (precedent #25)** — five classes (`agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`). Per-stream attribution is `AGENT_LABEL` on top of `agent-<connId>`. Already shadow-repo-audited.
- **`.open-knowledge/config.yml` `folders:` block** — folder rules with frontmatter defaults. A `consolidationStream:` key on each folder rule would make stream membership declarative.
- **CRDT per-doc isolation** — concurrent writes to *different* docs are already conflict-free; the merge problem only arises within a single doc.

**Implications:**
- **No new infrastructure needed for stream isolation.** It's a `config.yml` convention + `AGENT_LABEL` discipline + lint-aware orchestration.
- The cross-stream concerns are already covered by existing lint primitives — no new checks are needed for tag consistency, cross-stream links, or index drift; these are global lint passes that already see the whole KB.
- The same-doc concurrency case (two streams trying to recompile the same canonical) is the only real merge concern. Strategy 2 (optimistic locking) is the prior research's pragmatic recommendation: a version number in frontmatter + CAS check on write.

**Decision triggers:**
- If only one autonomous stream is running (single nightly): no merge concerns.
- If multiple streams run concurrently (per-topic nightlies for `auth`, `editor`, `deployment`): folder slicing handles 95% + version-CAS handles the rare same-doc case.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **The redmizt "Beyond the Wiki" gist** (referenced in initial search results as "18 architectural extensions for multi-agent production") returned 404 on fetch. Worth a separate look — it may have additional patterns for active learning + framework self-improvement.
- **Per-OS scheduler templates** (launchd plist, systemd unit, Task Scheduler XML) weren't deeply traced. Existing community implementations describe the shape but don't ship turnkey templates. A future OK contribution could.
- **The conservative default for autonomous re-derivation** — which sections of canonical articles are safe to recompile vs require human re-confirmation — is suggested but not concretely specified. A short specification document would settle this before implementation.
- **Active-learning patterns** — using user-feedback-on-lint-findings to tune future lint sensitivity — surfaced as a direction in search results but wasn't deeply investigated.

### Out of Scope (per Rubric)

- Per-implementation source-code reviews of every community pattern (5+ implementations exist; representative coverage not exhaustive).
- Specific GitHub Action / launchd / systemd config files (templates would belong to a follow-up integration spec).
- Detailed failure-mode handling for cross-stream merge conflicts (the prior research's CAS recommendation is sufficient; per-failure handling would belong to a recompile spec).

---

## References

### Evidence Files
- [evidence/consolidate-vs-other-operations.md](evidence/consolidate-vs-other-operations.md) — Reframe of consolidate as part of knowledge lint; three-operation autonomy axis; the missing recompile primitive; independent stream isolation.
- [evidence/community-overnight-workflows.md](evidence/community-overnight-workflows.md) — Eugeniughelbur 5-phase nightly; Pratiyush OS-scheduler-native; Anthropic Routines; Auto-Dream / Sleep Consolidation; 5-trigger taxonomy.

### Internal Sources
- `packages/cli/src/mcp/tools/consolidate.ts` — current STOP-gated consolidate tool.
- `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite`.
- `AGENTS.md` precedent #25 — writer-ID taxonomy.
- `.open-knowledge/config.yml` — folder rules infrastructure.

### External Sources
- [Karpathy LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — canonical reference.
- [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) — 5-phase nightly + Sunday weekly + post-compaction.
- [Pratiyush/llm-wiki](https://github.com/Pratiyush/llm-wiki) — `llmwiki sync` via OS schedulers.
- [Anthropic Claude Code Routines (cloud cron)](https://github.com/anthropics/claude-code/issues/30649).
- [Claude Code Headless Mode docs](https://code.claude.com/docs/en/headless).
- [LLM Wiki v2 (rohitg00 gist)](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) — Karpathy v2 with agentmemory lessons.

### Related Research (in this repo)
- [reports/compiled-truth-timeline-content-conventions/](../compiled-truth-timeline-content-conventions/) — six-domain convergent recompilation pattern.
- [reports/knowledge-linting-karpathy-workflow/](../knowledge-linting-karpathy-workflow/) — 17-check taxonomy + 4-trigger taxonomy (this report extends to 5).
- [reports/agent-host-hooks-cross-host/](../agent-host-hooks-cross-host/) — auto-research surfaces and GitHub Actions LCD.
- [reports/ok-knowledge-lint-integration/](../ok-knowledge-lint-integration/) — earlier integration report whose framing this report corrects.
- [reports/open-knowledge-prior-art-eight-sources/](../open-knowledge-prior-art-eight-sources/) — Karpathy gist + 7 other sources including GBrain's `maintain` skill.
