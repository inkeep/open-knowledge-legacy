# Evidence: Consolidate-Class Operations As Part Of Knowledge Lint (Broader Frame)

**Dimension:** Reframing — `consolidate`, `recompile`, and `lint` as three points on the same autonomy-vs-evidence axis
**Date:** 2026-04-27
**Sources:** OK source code (`packages/cli/src/mcp/tools/consolidate.ts`); Karpathy gist; prior `compiled-truth-timeline-content-conventions/` evidence

---

## The reframe

The earlier draft of this evidence file drew a hard line: "consolidate is structurally NOT a candidate for autonomous overnight runs." That's correct *for OK's current `consolidate.ts` tool* but misleading *for consolidate-class operations as a category*.

**At the level of "knowledge lint as KB-integrity-over-time," consolidate-class operations are part of the lint discipline.** Detecting stale canonical claims, recompiling canonical state when evidence shifts, and isolating parallel decision-streams are all subspecies of the same problem the deterministic-7 lint checks address: keeping the knowledge base honest about the world it represents.

The cleaner model is three operations on one axis:

| Operation | Trigger | Autonomy | What it writes | Maps to which trigger class? |
|---|---|---|---|---|
| **`lint`** (deterministic + LLM-required) | Continuous + scheduled | Fully autonomous | Findings (`hints[]` array) — no claims | Activity / time / continuous decay |
| **`recompile`** (the gap OK currently lacks) | Evidence-shift detected | **Bounded autonomous** — rewrites constrained by timeline evidence | Updated canonical state with audit trail | Time (weekly) / event (timeline pile-up) |
| **`consolidate` (current)** | User-driven, one-shot | **Human-decides** — STOP gate enforces | Net-new canonical articles | On-demand only |

The autonomy gradient is: **lint surfaces → recompile re-derives → consolidate decides**. Each layer makes more substantial claims and requires more authority to write.

---

## Findings

### Finding: OK's current `consolidate` is one of three possible canonical-layer operations
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/consolidate.ts:34-44` (the STOP gate, verbatim):

> ## STOP gate: has a decision actually been made?
>
> Consolidation is **promotion, not creation**. If the team hasn't decided, the resulting "canonical" article lies about the team's state of understanding [...] If the decision is still open, **do not consolidate**. Return and tell the user: "The research is still provisional. When the team decides, re-invoke `consolidate` with the outcome." Then stop.

This is the correct gate **for one specific operation**: net-new promotion of a fresh decision into a canonical article. It is NOT the gate for:
- Detecting that an existing canonical article has been silently superseded by newer research.
- Re-deriving an existing canonical article when its evidence base (sources, references, timeline entries) has shifted.
- Auto-superseding when a newer canonical on the same topic has been written.

**Implications:**
- The autonomy boundary OK currently enforces is *correctly conservative* for `consolidate` (= "make a fresh decision"), but it leaves a gap where evidence-driven re-derivation has no home.
- The pattern that fills that gap is the **"compiled truth + timeline" continuous-recompilation model** — already deeply researched in this repo (see `compiled-truth-timeline-content-conventions/`).

### Finding: The "compiled truth + timeline" pattern provides a bounded-autonomous recompilation contract
**Confidence:** CONFIRMED
**Evidence:** This repo's `reports/compiled-truth-timeline-content-conventions/REPORT.md` Executive Summary:

> "The 'compiled truth + timeline' pattern — splitting each knowledge entry into a rewritable current assessment and an append-only evidence base — is not a novel invention. It is a convergent solution that has been independently discovered in at least six domains [...] The structural logic is identical across all of them: the compiled zone is rewritten to reflect current best understanding; the evidence zone is append-only and never deleted."

> "The rewrite decision has two triggers. Immediate (on ingest: new evidence triggers recompilation of relevant sections) and deferred (on maintenance: periodic sweeps detect staleness when timeline has advanced beyond compiled truth)."

> "GBrain's maintain skill is the only system with explicit staleness detection: 'check if compiled_truth references dates > 6 months old without newer timeline entries.'"

**Implications:**
- This is the missing third operation. **`recompile`-class actions are bounded by the evidence below the line** — the LLM doesn't fabricate; it re-states the compiled zone in light of the timeline that's already accumulated. That's a meaningfully different autonomy profile from "decide a new canonical."
- The pattern's failure mode (per the prior research's failure-modes evidence): "stale compiled truth — timeline advances but compiled truth not recompiled." Recompilation is the *fix* for that failure mode. **Not running it is the lint failure, not running it.**
- OK's `consolidate.ts` was designed before this pattern was deeply researched. The prior research postdates the tool. Adding a `recompile`-class operation would close the gap.

### Finding: GBrain's `maintain` skill is the working precedent for bounded-autonomous recompilation
**Confidence:** CONFIRMED
**Evidence:** Per prior research (`reports/open-knowledge-prior-art-eight-sources/evidence/d6-garrytan-gbrain.md`):

> "**`maintain/SKILL.md`:** 8 lint checks — contradictions, stale info, orphan pages, missing cross-references, dead links, open thread audit, tag consistency, embedding freshness. Outputs a maintenance report as a new page."

GBrain merges lint *and* recompile into a single `maintain` skill. The skill:
- Detects staleness (`stale info` is one of the 8 checks).
- Outputs findings as a new page (i.e., a new wiki page summarizing detected issues).
- Implicit: when evidence has shifted enough, the compiled-truth zone of the affected entries gets rewritten *during* the maintain pass.

**Implications:**
- "Recompile" doesn't have to be a separate tool — it can be a more authoritative variant of `lint` that not only reports findings but *acts on* a constrained subset (the evidence-bounded ones).
- For OK's MCP surface, the cleanest shape is probably:
  - `lint` (read-only, returns findings)
  - `lint --fix` or a separate `recompile` tool (writes bounded re-derivations)
  - `consolidate` (user-driven, STOP-gated, current behavior preserved)

### Finding: Independent decision-streams are the multi-agent-merge problem the prior research already named
**Confidence:** CONFIRMED
**Evidence:** Prior research `compiled-truth-timeline-content-conventions/REPORT.md`:

> "**Multi-agent merge is unsolved in practice.** No production system implements true concurrent compilation merge. All surveyed systems serialize writes (GBrain via SQLite WAL, ByteRover via task queue). For markdown+git systems, optimistic locking with version-based CAS is the pragmatic approach."

The prior research's full table of merge strategies for markdown+git:

| Strategy | Pattern |
|---|---|
| 1. Serialized writes | One agent at a time. Lock file. |
| 2. Optimistic locking (CAS) | Version number on compiled truth. Read N → synthesize → write only if still N. |
| 3. Section-level three-way merge | Compiled truth structured into independent sections; same-section conflicts require resolution. |
| 4. CRDT-based metadata merge | CRDT for staleness flags, claim confidence; serialize prose rewrites. |

**Implications:**
- "Independent workflows and streams" is the multi-agent merge problem. OK has the right primitives (CRDT for content, shadow-repo for attribution) but doesn't currently expose stream-isolated lint/recompile workflows.
- The pragmatic shape is **per-topic stream isolation**: each consolidation stream operates on its own folder slice (e.g., `articles/auth/`, `articles/editor/`) and the cross-stream concerns are limited to:
  - Tag taxonomy consistency (Karpathy lint check #8).
  - Cross-stream link integrity (already covered by dead-link + orphan checks).
  - Index drift (the `index.md` aggregates across streams).
- **Stream isolation is naturally a folder-and-frontmatter convention**, not a new infrastructure concern. OK's existing `.open-knowledge/config.yml` `folders:` block (per `AGENTS.md`) is the right surface — each folder rule could carry a `consolidationStream:` key that downstream tools switch on.

### Finding: Three writer-ID classes already accommodate stream-isolated workflows
**Confidence:** CONFIRMED
**Evidence:** OK's writer-ID taxonomy (precedent #25 from `AGENTS.md`):

> Five categories: `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`.

For overnight workflows:
- **`agent-<connId>`** — autonomous-lint-agent fires under this class with a label (e.g., `AGENT_LABEL=lint-nightly`). Distinguishable from interactive agents in the shadow repo audit trail.
- **`openknowledge-service`** — internal service-driven writes (e.g., a `live-knowledge-lint` Hocuspocus extension auto-applying mechanical fixes). Pre-existing slot.
- Per-stream isolation can ride on `AGENT_LABEL` (e.g., `lint-nightly-articles-auth`, `lint-nightly-articles-editor`) without protocol changes.

**Implications:**
- No new writer class needed for the recompile / overnight workflows. The taxonomy already discriminates between human-interactive, autonomous-agent, and service-driven writes.
- **Per-stream attribution is just AGENT_LABEL conventions** — easy to surface in audit views, easy to filter in lint reports.

---

## Gaps / follow-ups

- The `recompile`-class operation doesn't currently exist as a named MCP tool in OK. Whether to add one (vs extending `lint` with a `--fix` mode) is a tool-design decision; both shapes work.
- The "independent workflow streams" angle has implications for how `index.md` is composed when multiple streams are active — currently OK's `live-derived-index.ts` rebuilds index on every change without stream-awareness. Stream-aware index composition is a separate small piece of work.
- The question of *which* canonical re-derivations are safe to run autonomously vs which require human re-confirmation is a per-domain judgment. A conservative default ("only re-derive `Trade-offs` and `Alternatives considered` sections; never re-derive `Decision` or `Rationale`") would preserve the spirit of the existing STOP gate while enabling bounded autonomy.
