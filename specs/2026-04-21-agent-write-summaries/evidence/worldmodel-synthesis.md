---
name: worldmodel-synthesis
description: Synthesis of the /worldmodel subagent's broader-landscape investigation — adjacent surfaces, prior art, cross-cutting concerns, and unresolved senior-reviewer questions
type: spec-evidence
sources:
  - packages/core/src/types/awareness.ts
  - packages/server/src/agent-focus.ts
  - packages/app/src/components/SystemDocSubscriber.tsx
  - packages/app/src/editor/plugins/agent-flash-source.ts
  - packages/cli/src/content/shadow-log.ts
  - packages/cli/src/content/enrichment.ts
  - packages/server/src/timeline-query.ts
  - reports/mcp-agent-attribution-implementation/REPORT.md
  - reports/auto-persistence-version-history-patterns/REPORT.md
  - reports/compiled-truth-timeline-content-conventions/REPORT.md
  - reports/git-lifecycle-push-pull-merge-patterns/.../commit-message-ux.md
  - specs/2026-04-10-document-timeline-rollback/SPEC.md
  - specs/2026-04-14-mcp-agent-attribution/SPEC.md
  - specs/2026-04-21-multi-agent-presence/SPEC.md
captured: 2026-04-21
---
# Worldmodel synthesis — agent-write summaries

## High-value findings beyond the workshop

### F1. The CLI/MCP `exec` enrichment is a free secondary consumer

`packages/cli/src/content/shadow-log.ts:121` already calls `parseContributors(rawBody)` per shadow commit, and `packages/cli/src/content/enrichment.ts:160` exposes the result as `history.contributors[]` on every `exec` listing/read response. **Adding `summariesByDoc` to the JSON shape means agents calling `exec("ls reports/")` or `read_document(...)` see prior agents' summaries automatically — zero extra wiring.**

This bumps the persona model: the "future analytics consumer" (P3) becomes an *immediate* consumer the moment v1 ships. Specifically: agents reading prior history before writing (a common pattern in this repo's spec/report workflow) get a richer signal of "what was done before me."

### F2. Existing `ActivityEntry.description` field is written-but-not-read

`packages/core/src/types/awareness.ts:44-49` declares an optional `description?` field on `ActivityEntry` (Y.Map('activity') ephemeral side-channel, 30s TTL). It's currently auto-populated by `api-extension.ts:1095, 1180, 1715` as `"Added (${agentName}): ${content.slice(0, 50)}"` — but the only reader is `agent-flash-source.ts:96-119`, which ignores it (only consumes `timestamp`).

**Convergence question:** should the agent-supplied `summary` also populate `ActivityEntry.description` so that future flash tooltips could surface it? Two views:

- **Unify** (yes): single channel for "what just happened," future flash UI wins for free.
- **Decouple** (no): presence channels (Y.Map('activity'), AgentFocusEntry) are ephemeral; shadow `ok-contributors:` is durable. Different concerns.

**Recommendation:** decouple for v1 (NG10). The two channels serve different consumers (live presence vs. durable history); unifying now creates coupling without a near-term consumer. Future work can wire them when an actual flash-tooltip use case lands.

### F3. `saveVersion` does NOT carry contributors into project-git

`packages/server/src/api-extension.ts:1880-1900` — when the user clicks Save Version, the project-repo commit body is `userMessage ?? \`Checkpoint v$\{n}\``. The intermediate WIP commits' `ok-contributors:\` lines do NOT aggregate into the checkpoint commit body.

**Implication:** summaries are shadow-local. They don't cross to GitHub via the existing sync path. This is consistent with current behavior (contributors don't cross today either), but it's a real gap to document — a future spec might decide to fold contributor + summary lines into the checkpoint commit body for export-bound history (NG11).

### F4. V0-14 `applyAgentUndo` forward-compat lock

The bridge-convergence spec `specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md` §7e has a STOP rule: V0-14's future undo handler MUST follow the `applyAgentMarkdownWrite` template and call `recordContributor`. **If `summary` ships in v1, V0-14 must inherit the param** — otherwise undo rows in the timeline will be summary-less while every other write surface has them.

**Action:** add to §16 STOP\_IF.

### F5. Cluster A multi-agent presence spec is in flight

`specs/2026-04-21-multi-agent-presence/SPEC.md` proposes `AgentPresenceEntry { displayName, icon, color, currentDoc, mode, ts }` on `__system__` awareness. Cluster A (NOT NOW) would build an "Activity sidebar" surfacing live agent state.

**Convergence:** the activity sidebar would be the second consumer of summary-style intent (after TimelinePanel). Summaries on `AgentFocusEntry` / `AgentPresenceEntry` would let the sidebar show "Claude is currently working on: <summary>" in real time. **Out of v1 scope** but design should not preclude — keep the MCP tool param shape symmetric so a future server change can broadcast summary on `__system__` awareness without re-shaping the MCP API.

### F6. Prior art convergence: 50-char target

- **GitHub Desktop:** `IdealSummaryLength=50`, `MaxSummaryLength=72` for git commit subject lines.
- **Wikipedia edit summaries:** 500-char hard cap (longer than ours; our bullet UI is denser).
- **ByteRover atomic ops:** mandatory `reason` per write (closest semantic kin; mandatory not optional — our optional+nudge is a deliberate departure).
- **Cursor Composer:** session-summarization for long conversations, no per-edit intent capture (we go further).
- **Linear AI Agent:** activity feed + AI-summary digest (different surface).
- **Claude Code default:** `Co-Authored-By: Claude` trailer on commits; no per-edit free-form summary.

The 50-char choice has industry precedent. The optional+nudge stance is novel vs. ByteRover's mandatory `reason`.

### F7. PII/civility hint for tool descriptions

Wikipedia explicitly warns about civility for edit summaries. For agent-supplied summaries, a short "no PII / no secrets" hint in the MCP tool description is cheap insurance — agents may otherwise echo content from the doc body verbatim into the summary, which is fine in most cases but could leak sensitive content into shadow git history.

**Recommendation:** add a one-line hint to all four MCP tool descriptions: *"Avoid including secrets or PII — summaries are persisted to git history."*

### F8. Per-write summary list aggregation policy (subtle)

`pendingContributors` accumulates `Set<docName>` per agent across the debounce window. Today multiple writes to the same (agent, doc) collapse into one Set entry. Adding summaries means deciding accumulation policy:

- **(a) Latest-wins per (agent, doc):** one summary string per pair, replaced on each write. Loses intermediate intent.
- **(b) Per-write list:** array of summaries per (agent, doc), append on each write. Preserves all intent. **(Workshop choice.)**
- **(c) Snapshot-only:** one summary per drained snapshot. Loses per-write granularity.

Workshop locked (b). Confirms the choice — array semantics are the right shape, and `restoreContributors` on commit-failure must preserve order (concat-merge, not dedup) so retries don't lose intent.

### F9. `get_history` MCP tool — agent-to-agent narrative chaining

The `/api/history` endpoint exists as HTTP-only (consumed by TimelinePanel) but is not yet exposed as a first-class MCP tool. If/when it becomes one (a natural future step — agents would want to read prior history to chain work), the **primary user of summaries shifts from human → next agent**. This reinforces F1 — the agent-side reading surface is potentially the more important one long-term.

**Out of v1 scope** but reinforces: design the JSON shape to be machine-friendly (already true with structured `summariesByDoc`).

## Cascades to SPEC.md from worldmodel

The following are agent-discipline updates persisted to SPEC.md (no user judgment needed, surfaced in §2 "what evolved" of the response):

- **§4 P3 persona** — bump from "future analytics consumer" to immediate "agent-to-agent narrative chaining" reader (via `exec` enrichment + future `get_history` MCP). Reflects F1.
- **§3 NG10** — don't unify with `ActivityEntry.description` in v1 (decouple presence vs. durable history channels). Reflects F2.
- **§3 NG11** — don't carry summaries into project-git via `saveVersion` in v1. Reflects F3.
- **§16 STOP\_IF** — V0-14 `applyAgentUndo` MUST inherit `summary` param. Reflects F4.
- **§15 Future Work (Identified)** — Cluster A activity sidebar consumption. Reflects F5.
- **§15 Future Work (Identified)** — `get_history` first-class MCP tool exposure. Reflects F9.
- **§6 FR14** — verify summaries appear in `exec` enrichment output (free secondary win). Reflects F1.
- **§6 FR15** — tool descriptions include PII/secrets hint. Reflects F7.
- **§10 D12** — DIRECTED: `exec` enrichment auto-carries summaries (positive externality, no opt-out in v1).
- **§10 D13** — DIRECTED: decouple `ActivityEntry.description` from `summariesByDoc`; channels stay independent.

## Net change to backlog

- **No new user-judgment OQs surfaced.** Worldmodel raised candidates (D-ACT, D-PII, D-EXEC) but each can be self-resolved with strong recommendation + cascade.
- **D1/D2/D3 from prior batch remain pending** user input (rename/rollback plumbing, mixed-render UX, single-string vs. array).
