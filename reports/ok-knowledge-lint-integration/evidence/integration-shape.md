# Evidence: The Concrete Integration Shape

**Dimension:** Where each piece plugs in, ordered by cost and value
**Date:** 2026-04-27
**Sources:** Synthesis of `existing-surfaces.md` against the prior research's 17-check taxonomy + cross-host hook landscape

---

## Findings

### Finding: Phase 1 — Universal floor (zero-protocol-change, ~200 LOC)

**Goal:** Cross-host knowledge-lint that works on Claude Code, Cursor, Codex, Windsurf, Copilot, Claude Desktop, Cowork, and Claude.ai web — all hosts in OK's compatibility matrix.

**Mechanism:** Extend the existing `hints[]` channel on `/api/agent-write-md` responses. Add a deterministic-7 lint pass to `applyAgentMarkdownWrite` (or a sibling extension that observes its output).

**Concrete integration points:**

1. **New file: `packages/server/src/lint/deterministic-checks.ts`** (~150 LOC)
   - Five pure functions following `computeOrphanHints` shape:
     - `computeDeadLinkHints(docName, backlinkIndex, fileIndex)` → `{type: 'dead-link', target, sources, message}[]`
     - `computeRedlinkHints(docName, backlinkIndex, fileIndex)` → `{type: 'redlink', concept, suggestedPath, message}[]`
     - `computeSourceTraceabilityHints(docName, fragmentJson, fileIndex)` → `{type: 'no-source', message}[]` (only for docs in `wiki/` or `articles/` paths)
     - `computeIndexDriftHints(fileIndex)` → `{type: 'index-drift', missingFromIndex, extraInIndex, message}[]` (runs once per session, not per write)
     - `computeTagConsistencyHints(allFrontmatters)` → `{type: 'tag-near-duplicate', tags, message}[]`

2. **Wire into `handleAgentWriteMd`** (~5 LOC delta):
   ```typescript
   const hints = [
     ...(computeOrphanHints(resolvedDocName) ?? []),
     ...(computeDeadLinkHints(resolvedDocName, ...) ?? []),
     ...(computeRedlinkHints(resolvedDocName, ...) ?? []),
     ...(computeSourceTraceabilityHints(resolvedDocName, ...) ?? []),
   ];
   ```

3. **MCP-side: zero change.** `write_document.ts` already passes `hints[]` through to the agent.

4. **Skill-side: ~10-line addition** to `SKILL.md` describing how to interpret the new `hint.type` discriminators (already supports `orphan`; add `dead-link`, `redlink`, `no-source`).

**Cross-host coverage:** All OK target hosts call MCP tools and read the responses. The `hints` array surfaces into chat as text plus structured data. **No host-side hook config required.**

**Evidence:**
- `existing-surfaces.md` Finding 2 (hints already an established channel).
- Existing `computeOrphanHints` is the working template.

### Finding: Phase 2 — Tier-A host hooks (best UX for ~5 hosts, ~300 LOC + per-host config templates)

**Goal:** For users on hook-supporting hosts, fail-closed lint enforcement (block the write if it would introduce a violation).

**Mechanism:** Ship a templated hook bundle that drops into each host's expected location.

**Concrete integration points:**

1. **New file: `packages/cli/src/hooks/`** with:
   - `lint-hook.ts` — single shared script, reads stdin JSON, calls a new `mcp__open-knowledge__lint` tool synchronously, returns exit code 2 (Claude Code / Cursor compat) or `{permission: "deny"}` (Cursor) or `{continue: false}` (Codex) based on host detection.
   - `templates/claude-code.json` — `.claude/settings.json` `hooks.PostToolUse` snippet.
   - `templates/cursor.json` — `.cursor/hooks.json` `postToolUse` snippet.
   - `templates/codex.toml` — `[hooks.PostToolUse]` table for `config.toml`.
   - `templates/windsurf.json` — `post_write_code` Cascade hook.
   - `templates/copilot.json` — `.github/hooks/lint.json` for Copilot CLI.

2. **New CLI command: `ok install-hooks`** (~100 LOC, mirrors `installUserSkill`):
   - Detect installed hosts.
   - For each detected host, write the appropriate config.
   - Idempotent (skip if already present); sidecar-tolerant (preserve existing hooks).

3. **New MCP tool: `lint`** (~80 LOC):
   - Aggregates the existing graph-health endpoints (`/api/dead-links`, `/api/orphans`, etc.) into a single response.
   - Optional `mode: 'block-on-error' | 'advisory'` parameter.
   - Per-doc filter for hook use case (lint just the doc being written).

**Per-host coverage:**
- Claude Code: ✅ `PostToolUse` matched on `mcp__open-knowledge__write_document`.
- Cursor: ✅ `postToolUse` matched on the same.
- Codex: ✅ `PostToolUse` with regex matcher.
- Windsurf: ✅ `post_write_code` (workflow-specific).
- Copilot CLI: ✅ `postToolUse`.
- Claude Desktop / Cowork / Claude.ai: ❌ no hooks → falls through to Phase 1 (universal floor).

**Evidence:**
- Cross-host research established schema convergence (`agent-host-hooks-cross-host` report).
- `installUserSkill` provides the install template pattern.

### Finding: Phase 3 — LLM-required checks via MCP sampling (~150 LOC)

**Goal:** Cover the 5 LLM-required lint checks (contradictions, data gaps, lost-nuance, hallucination amplification, over-confidence) using server-driven sampling — works on any MCP-compliant host.

**Mechanism:** Wire MCP sampling support into the OK MCP server. Add a `lint_semantic` MCP tool that uses `sampling/createMessage` to request LLM evaluations from the host.

**Concrete integration points:**

1. **Wire sampling in `packages/cli/src/mcp/server.ts`** (~30 LOC):
   ```typescript
   // After server.connect(transport):
   server.server.registerCapabilities({ sampling: {} });
   // Sampling itself is requested via server.server.createMessage(...)
   // No handler needed on server side — the client provides the LLM.
   ```

2. **New file: `packages/cli/src/mcp/tools/lint-semantic.ts`** (~100 LOC):
   - Per LLM-required check, build a prompt (e.g., "are these two pages contradictory?") with the doc content as context.
   - Call `server.server.createMessage({ ... })`.
   - Parse the response, return as a finding with `{type: 'contradiction'|'data-gap'|..., message, confidence}`.

3. **Compose with Phase 1**: when the agent invokes `lint`, the deterministic 7 fire synchronously; the semantic 5 fire asynchronously via sampling and stream findings back.

**Cross-host coverage:** Every MCP-compliant host supports sampling per spec. Quality may vary in practice (see prior research's gap-finding) — practical caveat, not architectural blocker.

**Evidence:**
- `existing-surfaces.md` Finding 5 (sampling not wired but available in SDK).
- `agent-host-hooks-cross-host` report's MCP-portable section.

### Finding: Phase 4 — Auto-research via existing `research` tool + GitHub Actions (~100 LOC of workflow YAML)

**Goal:** Scheduled / on-PR auto-research that fills data gaps detected by lint, regardless of host.

**Mechanism:** A GitHub Action that runs `ok start` (headless), boots Claude Code or another agent CLI in `--print` mode, tells it to invoke `lint` then `research --headless` on each data gap finding.

**Concrete integration points:**

1. **New file: `.github/workflows/wiki-lint.yml`** (~50 LOC):
   ```yaml
   name: Wiki Lint
   on:
     schedule:
       - cron: '0 4 * * *'  # nightly 4am UTC
     pull_request:
       paths: ['wiki/**', 'articles/**', 'specs/**']
     workflow_dispatch:
   jobs:
     lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: oven-sh/setup-bun@v2
         - run: bun install --frozen-lockfile
         - run: bunx @inkeep/open-knowledge start &
         - run: |
             claude --print "Run mcp__open-knowledge__lint, file findings as wiki/lint-report.md, then for each data-gap finding invoke mcp__open-knowledge__research --headless"
         - uses: peter-evans/create-pull-request@v6
           with:
             title: "Auto-research: nightly lint"
             body: "Generated by wiki-lint.yml"
   ```

2. **`research` tool already supports headless mode** (per `research.ts:35-43`) — no new tool needed.

3. **Writer-ID taxonomy already accommodates this case** — per OK's precedent #25, an "autonomous-lint-agent" would land as a normal `agent-<connId>` writer with a label. The existing shadow-repo audit trail captures attribution.

**Cross-host coverage:** GitHub Actions is the cross-host LCD per the prior research. Agent CLI is replaceable — same workflow can boot Codex CLI, Continue CLI, Aider, Copilot CLI.

**Evidence:**
- `existing-surfaces.md` Finding 7 (workflow tools are auto-research building blocks).
- Cross-host report's auto-research section.

### Finding: Phase 5 — Continuous decay scoring as a Hocuspocus extension (~100 LOC)

**Goal:** Surface "this page is rotting" signals in the editor UI and in lint output, beyond binary fresh/stale.

**Mechanism:** New Hocuspocus extension `live-knowledge-lint.ts` that mirrors `live-derived-index.ts`. Maintains an in-memory `lintIndex: Map<docName, Finding[]>` updated on every doc change, with debounce. Signals CC1 channel `'lint'` for editor UI consumption.

**Concrete integration points:**

1. **New file: `packages/server/src/live-knowledge-lint.ts`** (~100 LOC, copy `live-derived-index.ts` and substitute lint computation for backlink computation):
   - Hook `onChange`, debounce 100ms per doc.
   - Compute deterministic-7 findings on the post-change state.
   - Update `lintIndex`.
   - Signal CC1 `'lint'` channel.

2. **Wire CC1 channel in `packages/server/src/cc1-broadcast.ts`** — add `'lint'` to the existing channel set.

3. **Editor UI**: subscribe to `'lint'` channel, render a small badge per doc in the file tree showing finding count. (Out of scope for back-end — but the substrate is there.)

**Evidence:**
- `existing-surfaces.md` Finding 3 (`live-derived-index.ts` is the canonical extension pattern).

---

## Cost summary

| Phase | What | LOC | Cross-host coverage | Dependencies |
|---|---|---|---|---|
| 1 | Hints-channel deterministic checks | ~200 | All OK target hosts | None — already-established channel |
| 2 | Tier-A host hooks + `ok install-hooks` | ~300 + templates | 5 of 9 hosts (best UX where supported) | Phase 1 |
| 3 | MCP sampling for semantic checks | ~150 | All MCP-compliant hosts | Phase 1 |
| 4 | GitHub Actions auto-research | ~50 (YAML) | Cross-host LCD | Phase 1 + existing `research` tool |
| 5 | Live decay scoring extension | ~100 | UI signal across hosts | Phase 1 |

**Total: ~800 LOC** across 5 phases for full deployment of every dimension surfaced by the prior research. **Phase 1 alone (~200 LOC) covers the core knowledge-lint use case across the entire OK target host matrix without protocol changes.**

---

## Sequencing recommendation

The phases are ordered for **value-per-cost**:

1. **Phase 1 first** — universal floor that lights up immediately for every user. ~200 LOC. Lowest risk, highest reach.
2. **Phase 4 second** (auto-research GitHub Action) — ~50 LOC of YAML, reuses everything from Phase 1 + the existing `research` tool. Surfaces auto-research as a working pattern users can fork.
3. **Phase 3** (MCP sampling for semantic checks) — adds the LLM-required checks once Phase 1 + 4 are stable. Validates the cross-host MCP-portability claim in production.
4. **Phase 2** (Tier-A hooks) — best UX layer for power users, but requires more per-host plumbing. Worth it once Phase 1 is established as the floor.
5. **Phase 5** (live decay extension) — UI-side polish; lowest urgency.

---

## Negative findings

- **No need for new MCP tools beyond `lint` + optionally `lint_semantic`.** The graph-health primitives already exist as separate tools; an aggregator is the only missing piece.
- **No need for a new persistence layer** in Phase 1 — findings compute on read, surface inline, don't get stored. Phase 5 adds in-memory state via the live extension; only Phase 5 introduces server-side state.
- **No need for new MCP protocol features.** Sampling, elicitation, notifications all exist in the SDK; OK just uses notifications today and would need to opt into sampling.
