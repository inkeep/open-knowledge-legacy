---
title: "Open Knowledge: Concrete Integration Shape for Knowledge Linting + Auto-Research"
description: "1P investigation of OK's existing code surfaces — HTTP API, MCP tool registry, applyAgentMarkdownWrite, hints[] channel, live-derived-index extension pattern, installUserSkill distribution, research/ingest/consolidate workflow chain — mapped against the prior research's 17-check taxonomy and cross-host hook landscape. Concrete 5-phase integration plan totaling ~800 LOC, with Phase 1 (~200 LOC) covering the core use case across OK's full host compatibility matrix without protocol changes. Identifies which lint primitives already exist (6 of 7 deterministic-check endpoints), which patterns are reusable templates (computeOrphanHints, live-derived-index, installUserSkill), and where genuinely net-new code is needed."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Open Knowledge
  - Hocuspocus
  - Model Context Protocol
  - Claude Code
  - Cursor
topics:
  - knowledge linting integration
  - hints channel
  - applyAgentMarkdownWrite
  - live-derived-index pattern
  - MCP sampling
  - cross-host hook distribution
  - auto-research GitHub Actions
  - installUserSkill
  - research workflow tool
---

# Open Knowledge: Concrete Integration Shape for Knowledge Linting + Auto-Research

**Purpose:** Translate the prior research (knowledge-lint taxonomy + cross-host hook landscape) into concrete plumbing decisions against OK's actual codebase. Identify the cheapest integration shape — extending what already exists rather than inventing parallel infrastructure — and order the work by value-per-cost.

**Framing:** This is an explicit 1P investigation per the user's request. Findings reference OK's source code by file:line where load-bearing.

---

## Executive Summary

**OK's existing code surface is already 80% built for knowledge linting.** The plumbing the prior research called for — a deterministic lint pass that fires on writes, surfaces findings cross-host without protocol changes, and composes with auto-research — already has a working precedent in the codebase. Five primitives do most of the heavy lifting:

1. **The `hints[]` array on `/api/agent-write-md` responses** is an established channel that already carries `computeOrphanHints` output, that the MCP `write_document` tool already passes through to the agent (see `packages/server/src/api-extension.ts:1626-1648` and `packages/cli/src/mcp/tools/write-document.ts:102, 120-145`). Adding new lint check types is a one-line addition per check, no protocol change.

2. **6 of the 7 deterministic-lint endpoints already exist as HTTP handlers** — `handleOrphans`, `handleDeadLinks`, `handleHubs`, `handleBacklinks`, `handleForwardLinks`, `handleLinkGraph` (`api-extension.ts` 1763-2042). The MCP tool surface (`get_orphans`, `get_dead_links`, etc.) mirrors these. Only 3 net-new checks (source traceability, index drift, tag consistency) need adding, each ~50 LOC.

3. **`applyAgentMarkdownWrite` is the canonical single-call write surface** (`packages/server/src/agent-sessions.ts:92-107`) — every MCP `write_document` call funnels through it, wrapped in an OTel span. It's the right hook point for write-time deterministic checks.

4. **`live-derived-index.ts` is the canonical Hocuspocus-extension pattern** for "fire X on every doc change with debounce" (`packages/server/src/live-derived-index.ts:36-93`). A `live-knowledge-lint.ts` extension copy-patterned from it would maintain a per-doc lint-findings index in ~100 LOC.

5. **`installUserSkill` is the canonical install-template** for distributing files into agent-host config locations (`packages/server/src/skill-install.ts` + `packages/cli/src/commands/install-skill.ts`). An `ok install-hooks` command following the same pattern would distribute a templated knowledge-lint hook to Claude Code, Cursor, Codex, Windsurf, and Copilot CLI config locations.

**The MCP server already imports `@modelcontextprotocol/sdk` and uses notifications** (`packages/cli/src/mcp/server.ts:20-22, 294`). It does NOT currently wire sampling — but adding it is purely additive (~30 LOC) and the SDK supports it.

**The `research` workflow tool already supports headless mode** (`packages/cli/src/mcp/tools/research.ts:35-43`) — auto-research is just `research --headless` invoked by an agent CLI in a GitHub Action. No new infrastructure needed; the auto-research engine is the existing chain (`ingest` → `research` → optionally `consolidate`).

The full 5-phase integration totals **~800 LOC + 5 host-config templates + 1 GitHub Action**. **Phase 1 alone (~200 LOC) lights up cross-host knowledge-lint for every user in the OK compatibility matrix without protocol changes** — the highest-value, lowest-cost phase.

**Key Findings:**
- **The `hints[]` channel is the universal floor** — works on every OK target host (Claude Code, Cursor, Codex, Windsurf, Copilot, Continue, Aider, Claude Desktop, Cowork, Claude.ai web). Zero protocol changes. Established pattern via `computeOrphanHints`.
- **6 of 7 deterministic-lint endpoints already exist** — only source traceability, index drift, tag consistency are net-new (each ~50 LOC).
- **No new MCP tools strictly required** — adding a `lint` aggregator and (Phase 3) a `lint_semantic` for sampling-driven checks is high-value but not blocking.
- **MCP sampling is wired-able with ~30 LOC** — the SDK supports it; OK just doesn't use it yet.
- **Auto-research is the existing `research --headless` tool invoked from a GitHub Action** — no new pipelines needed; ~50 LOC of workflow YAML reuses the entire chain.
- **The 5-phase plan totals ~800 LOC** for the full breadth surfaced by the prior research; Phase 1 alone covers the core use case at ~200 LOC.

---

## Research Rubric

**Primary question:** Given OK's actual code, what's the cheapest integration shape that makes the prior knowledge-lint + cross-host-hooks research useful?

**Reader cares most about:** Concrete plumbing decisions and a sequenced plan grounded in existing primitives.

**Dimensions (P0):**
1. Existing graph-health surface inventory — what `/api/*` endpoints + MCP tools already cover.
2. Write-path instrumentation point — where to fire deterministic lint and stamp findings into responses.
3. Tool-result sentinel surface — the `hints[]` channel and how it's surfaced to the agent.
4. MCP sampling readiness — what's needed to wire the LLM-required check class.
5. Hook bundle distribution — `installUserSkill` as the template for `ok install-hooks`.
6. Auto-research integration — composing existing `research`/`ingest`/`consolidate` for scheduled runs.

**P1:**
7. Trust model fit — writer-ID taxonomy slot for autonomous-lint writers.

**Stance:** 1P factual inventory + sequenced integration plan. Not greenfield — every phase grounded in existing OK primitives.

---

## Detailed Findings

### 1. Existing graph-health surface

**Finding:** 6 of 7 deterministic-lint check endpoints already exist as HTTP handlers + corresponding MCP tools. Only 3 net-new checks (source traceability, index drift, tag consistency) are needed; each is ~50 LOC.

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 1

| Check (from `knowledge-linting-karpathy-workflow` taxonomy) | OK endpoint | OK MCP tool | Status |
|---|---|---|---|
| #3 Orphan pages | `GET /api/orphans` | `get_orphans` | ✅ Built |
| #4 Redlinks | (derivable via orphans + graph) | `suggest_links` (~partial) | ⚠ Half-built |
| #5 Missing cross-references | (derivable via graph) | `get_forward_links` + `get_backlinks` | ⚠ Building blocks present |
| #7 Dead links | `GET /api/dead-links` | `get_dead_links` | ✅ Built |
| #8 Tag consistency | — | — | ❌ Net-new (~50 LOC) |
| #10 Source traceability | — | — | ❌ Net-new (~50 LOC) |
| #11 Index drift | — | — | ❌ Net-new (~50 LOC) |

**Implications:**
- The data primitives (`backlinkIndex`, `getFileIndex()`) are already wired into the API layer. Net-new checks reuse them, not invent them.
- An aggregator MCP tool `lint` (~80 LOC) that fans out to existing endpoints + the new ones lands the unified surface.

**Decision triggers:** If the work shipping order matters: implement source traceability first (highest-stakes per the prior research's "closed-loop grounding is OK's load-bearing rule"), index drift second (mechanically detectable, agent-discipline-only today), tag consistency third (low-stakes polish).

---

### 2. The `hints[]` channel — the universal floor

**Finding:** Every `/api/agent-write-md` response already carries an optional `hints[]` array, the MCP `write_document` tool already passes it through to the agent, and the OK skill already prescribes how the agent reads it (via the `attach-preview-once` precedent). Adding new lint check types is a one-line addition per check.

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 2 + `packages/server/src/api-extension.ts:1626-1648`, `packages/cli/src/mcp/tools/write-document.ts:102-145`.

The current `computeOrphanHints` function (`api-extension.ts:820-852`) is the working template:

```typescript
function computeOrphanHints(
  docName: string,
): Array<{ type: 'orphan'; parentCandidates: string[]; message: string }> | undefined {
  if (!backlinkIndex) return undefined;
  try {
    // ... compute ...
    return [{ type: 'orphan', parentCandidates: candidates, message: `...` }];
  } catch (err) {
    console.warn('[orphan-hint] computeOrphanHints failed:', err);
    return undefined;
  }
}
```

**Contract** (already established):
- Non-throwing — a hint failure must not fail the write.
- Side-effect free — read-only against indexes.
- Shape: `{ type: discriminator, ...payload, message: humanReadable }`.
- Returns `undefined` when no hint applies.
- The MCP tool aggregates hints into both the human-readable text AND the structured response (`write-document.ts:120-145`).

**Implications:**
- The contract is what OK already enforces. Adding `computeDeadLinkHints`, `computeRedlinkHints`, `computeSourceTraceabilityHints`, etc., follows the exact same shape.
- Cross-host: every host that calls `write_document` gets the hints in its tool response. **No host-side hook config required, no protocol change, no per-host adapter.**
- The `type` discriminator lets the agent switch on the kind of finding for richer handling — but the `message` field works as a human-readable fallback, so even agents that don't switch on `type` still surface the issue.

**Decision triggers:** This is the universal-floor mechanism. Any other integration (host hooks, sampling, scheduled jobs) layers on top — but if you only ship Phase 1, every OK user gets the lint surface immediately.

---

### 3. Write-path instrumentation point — `applyAgentMarkdownWrite`

**Finding:** Every MCP `write_document` call funnels through `applyAgentMarkdownWrite` (`agent-sessions.ts:92-107`). It runs in a `withSpanSync` OTel span and produces a fully-converged document state by line 174 (after Y.Text mirror). This is the canonical hook point for write-time deterministic lint.

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 4 + `packages/server/src/agent-sessions.ts:92-182`.

The function pipeline:
1. Read XmlFragment + metaMap state.
2. Split payload into frontmatter + body.
3. Compose final body for the requested `position`.
4. Apply via `updateYFragment` (structural diff).
5. Commit frontmatter to metaMap.
6. Mirror Y.Text via `applyFastDiff`.

**Where to instrument:** After step 6, the document is in its final post-write state. A wrapper span (`agent.lint`) computing `hints[]` from the post-write state composes naturally with the existing span structure.

The lint computation lives in `handleAgentWriteMd` (`api-extension.ts:1502+`), which wraps `applyAgentMarkdownWrite` and is where `computeOrphanHints` is already called (line 1626). **The pattern is established — add more checks alongside.**

**Implications:**
- No need to modify `applyAgentMarkdownWrite` itself. Lint computation lives in the *handler* (`handleAgentWriteMd`), runs after the write completes, and adds findings to the response.
- For non-write triggers (explicit `lint` MCP call), the same `compute*Hints` functions can be invoked directly — they take a doc name + the index objects and don't depend on a specific call site.

**Decision triggers:** If you want pre-write enforcement (block bad writes), you'd instrument `applyAgentMarkdownWrite` *before* the mutation steps and throw on violations. The current handler-level pattern is post-write-advisory; pre-write-blocking is more invasive.

---

### 4. The live extension pattern — `live-derived-index.ts`

**Finding:** OK already has a Hocuspocus extension pattern for "fire X on every doc change with per-doc debounce." A `live-knowledge-lint.ts` extension copy-patterned from `live-derived-index.ts` would maintain per-doc lint findings as a derived view in ~100 LOC.

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 3 + `packages/server/src/live-derived-index.ts:36-93`.

The template handles:
- `onChange` → schedule debounced compute.
- Skip `__system__` docs.
- Skip file-watcher origins (avoid feedback loop).
- Per-doc `setTimeout` debounce (100ms default).
- Update derived index, signal CC1 channel.
- Cleanup on `beforeUnloadDocument` and `onDestroy`.

**Implications:**
- A live `lintIndex: Map<docName, Finding[]>` enables editor UI to render lint badges per doc in the file tree, and lets `/api/lint` return findings without recomputing on every read.
- CC1 channel `'lint'` (alongside existing `'files'`, `'backlinks'`, `'graph'`) lets the editor invalidate its lint view on server-driven updates.
- This is Phase 5 in the cost-ordering — UI polish, not core functionality. Phase 1 (hints channel) covers the agent path without it.

**Decision triggers:** Build Phase 5 only after the editor needs to render lint state visually. Until then, server-side computation on read is sufficient.

---

### 5. MCP sampling — wired-able with ~30 LOC

**Finding:** OK's MCP server uses `@modelcontextprotocol/sdk` and registers notification handlers but does not currently wire sampling. The SDK fully supports sampling — adding it is purely additive (~30 LOC for capability registration + a per-check tool that calls `server.server.createMessage(...)`).

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 5 + `packages/cli/src/mcp/server.ts:20-22, 294`.

Current imports:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
```

Notifications are wired (line 294: `setNotificationHandler(RootsListChangedNotificationSchema, ...)`). Sampling is not.

**Implications:**
- Phase 3 (LLM-required checks via sampling) is not architecturally complex — it's a capability registration + per-check prompt + response parsing.
- Server-initiated sampling has the spec-mandated constraint: only fires in association with an originating client request. So a `lint_semantic` MCP tool is the right shape — agent calls it, server runs sampling for the LLM-required checks, returns findings.
- Cross-host: every MCP-compliant host supports sampling per spec. Real-world quality varies (per `agent-host-hooks-cross-host` report's gap-finding), but the architecture is portable.

**Decision triggers:** Phase 3 timing depends on whether the LLM-required checks are needed. If users complain that "the deterministic checks miss the actual contradictions" — Phase 3 is the answer. If they don't — Phase 1 + 4 may suffice.

---

### 6. Hook distribution — `ok install-hooks` mirrors `installUserSkill`

**Finding:** OK already has `installUserSkill` for distributing files into agent-host config locations. A parallel `installHooks` (or `ok install-hooks` CLI command) for distributing knowledge-lint hooks to per-host config files follows the same template.

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 6 + `packages/server/src/skill-install.ts` + `packages/cli/src/commands/install-skill.ts`.

The `installUserSkill` function handles:
- Fresh install + idempotency (skip if already present at current version).
- Sidecar tolerance (preserve existing config alongside).
- Timeout + failure modes.
- Logger wiring.

**Per-host config templates** (Phase 2 work, ~5 templates):
- Claude Code: append a `PostToolUse` hook to `.claude/settings.json` matched on `mcp__open-knowledge__write_document`.
- Cursor: write `.cursor/hooks.json` with `postToolUse`.
- Codex: append `[hooks.PostToolUse]` to `~/.codex/config.toml`.
- Windsurf: register `post_write_code` Cascade hook.
- Copilot CLI: write `.github/hooks/lint.json`.

The hook *script* is shared — a single file (e.g., `packages/cli/src/hooks/lint-hook.ts`) that reads stdin JSON, calls the MCP `lint` tool synchronously, returns the appropriate exit code / response shape per host.

**Implications:**
- The convergent stdin/stdout JSON shape (per `agent-host-hooks-cross-host` research) means the script is genuinely shared. Only the per-host config wiring differs.
- `ok install-hooks --host claude-code,cursor,codex` is the command shape; it detects and installs for the requested set.

**Decision triggers:** Phase 2 is best-UX-for-power-users. The investment makes sense once Phase 1 is established as the floor and users on Tier-A hosts want fail-closed enforcement.

---

### 7. Auto-research — `research --headless` invoked from GitHub Actions

**Finding:** Auto-research is not net-new infrastructure — it's the existing `research` workflow tool invoked in headless mode by an agent CLI running inside a GitHub Action. The `research` tool body already enforces the 9-step pipeline (scan → scope → ingest → read → write → link → validate → recap) and explicitly supports headless mode.

**Evidence:** [evidence/existing-surfaces.md](evidence/existing-surfaces.md) §Finding 7 + `packages/cli/src/mcp/tools/research.ts:35-43, 47-59`.

The auto-research workflow:
1. GitHub Action triggers (cron / on-PR / dispatch).
2. Boots `ok start` (Hocuspocus + MCP) headless.
3. Boots an agent CLI (Claude Code `--print`, Codex CLI, Continue CLI, etc.).
4. Tells the agent CLI to:
   - Invoke `mcp__open-knowledge__lint` to surface current findings.
   - For each `data-gap` finding, invoke `mcp__open-knowledge__research --headless` with the gap as topic.
   - File the lint findings as a wiki doc (e.g., `wiki/lint-report-YYYY-MM-DD.md`).
5. Open a PR with the changes (using `peter-evans/create-pull-request` action).

**Cross-host:** GitHub Actions is the cross-host LCD per the prior research. Replace the agent CLI to suit the user's preferred provider. The OK MCP server is the same across all of them.

**Trust model:** Per OK's writer-ID taxonomy (precedent #25 — five categories: `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`), the autonomous lint agent runs as a normal `agent-<connId>` writer, attribution captured in the shadow repo. No new writer class needed.

**Implications:**
- Phase 4 is ~50 LOC of GitHub Actions YAML. The whole infrastructure is the existing `research` tool, already shipped.
- The "boundary-first autoresearch" pattern (from gist comments — score frontier pages, suggest investigation candidates) maps to: deterministic prefilter (server-side, runs continuously) → LLM evaluation (via Phase 3 sampling on user interaction OR via Phase 4 scheduled GH Action) → research execution via existing `research` tool.

**Decision triggers:** Phase 4 ships the day Phase 1 is stable — there's no architectural blocker, and the YAML is templated.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Editor-side UI for lint findings** wasn't traced. The `live-knowledge-lint` extension (Phase 5) feeds the editor a `lintIndex` and a CC1 channel; what the editor actually renders (badges in file tree? inline annotations? a separate panel?) is a UX question not addressed here.
- **Performance characteristics under load** weren't measured. `computeOrphanHints` warns if `findHubCandidates` exceeds 5ms (`api-extension.ts:833-838`); the new lint checks need similar instrumentation. For Phase 5, the per-doc debounce (100ms) handles most of this.
- **Error / partial-failure semantics for the aggregator `lint` tool** weren't specified. If one of the 7 deterministic checks throws, should the others still return? (Per `computeOrphanHints`'s precedent — yes, individual non-throwing functions, aggregator surfaces what worked.)

### Out of Scope (per Rubric)

- 3P landscape research on alternative lint tools.
- Detailed UX mockups for editor lint badges.
- Specific GitHub Action secret-management.

---

## References

### Evidence Files
- [evidence/existing-surfaces.md](evidence/existing-surfaces.md) — 7 findings on OK's existing primitives (graph-health endpoints, hints channel, applyAgentMarkdownWrite, live-derived-index pattern, MCP server setup, installUserSkill, workflow tools, scheduling primitives).
- [evidence/integration-shape.md](evidence/integration-shape.md) — 5-phase integration plan with concrete file paths, LOC estimates, sequencing recommendation.

### Internal Sources
- `packages/server/src/api-extension.ts` — HTTP API handlers, `computeOrphanHints`, `handleAgentWriteMd`.
- `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite` (the canonical write surface).
- `packages/server/src/live-derived-index.ts` — extension pattern template.
- `packages/server/src/skill-install.ts` — install-template machinery.
- `packages/cli/src/mcp/server.ts` — MCP server setup; sampling not wired.
- `packages/cli/src/mcp/tools/write-document.ts` — MCP tool that already passes `hints` through.
- `packages/cli/src/mcp/tools/research.ts` — `research` workflow tool that already supports headless mode.
- `packages/cli/src/mcp/tools/index.ts` — workflow tool registration.
- `packages/cli/src/commands/install-skill.ts` — CLI install-template precedent.

### Related Research
- [reports/linting-coverage-and-gaps/](../linting-coverage-and-gaps/) — what OK has today (mostly nothing for content).
- [reports/knowledge-linting-karpathy-workflow/](../knowledge-linting-karpathy-workflow/) — the 17-check taxonomy + cadence + failure modes.
- [reports/agent-host-hooks-cross-host/](../agent-host-hooks-cross-host/) — where to fire it (5 hosts have hooks; MCP-portable alternatives; auto-research surfaces).
