# Evidence: Link Integrity & Graph Health

**Dimension:** Dead links, orphans, hubs, backlinks — what's detected, by what surface, with what enforcement
**Date:** 2026-04-27
**Sources:** `packages/cli/src/mcp/tools/`, OK skill, all CI workflows

---

## Key files referenced

- `packages/cli/src/mcp/tools/get-dead-links.ts`
- `packages/cli/src/mcp/tools/get-orphans.ts`
- `packages/cli/src/mcp/tools/get-hubs.ts`
- `packages/cli/src/mcp/tools/get-backlinks.ts`
- `packages/cli/src/mcp/tools/get-forward-links.ts`
- `packages/server/assets/skills/open-knowledge/SKILL.md`

---

## Findings

### Finding: `get_dead_links` exists as an MCP tool, finds missing internal page targets
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/get-dead-links.ts:14-20`

```text
'[Requires: Hocuspocus server] Find missing internal page targets across the corpus.',
'Returns grouped dead links keyed by missing target with source-doc rows as JSON.',
'',
'**Parameters:**',
'- `sourceDocNames` (optional) — Referring source docs to narrow the audit with OR semantics',
```

Implementation calls `GET /api/dead-links` against the running Hocuspocus server. Strict-exact match (per skill §Linking).

**Implications:** Detection capability exists and is callable; the gating story is the open question.

### Finding: `get_orphans` exists, supports three modes (`incoming`, `outgoing`, `both`)
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/get-orphans.ts:14-20, 37-39`

```text
'[Requires: Hocuspocus server] Find disconnected pages in the knowledge graph.',
'Returns orphaned pages as JSON.',
...
mode: z.enum(ORPHAN_MODES).optional()
  .describe('Filter which type of graph disconnection to surface'),
```

Three lenses:
- `incoming` — docs that nothing links *to* (no backlinks).
- `outgoing` — docs that link *out to* nothing.
- `both` — fully disconnected.

**Implications:** Identical posture to dead-link audit — capability present, enforcement absent.

### Finding: `get_hubs` and `get_backlinks` complete the graph-navigation surface
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/index.ts` registers all of: `get_dead_links`, `get_orphans`, `get_hubs`, `get_backlinks`, `get_forward_links`, `suggest_links`.

```text
$ ls packages/cli/src/mcp/tools/
consolidate.ts edit-document.ts exec.ts get-backlinks.ts get-dead-links.ts
get-forward-links.ts get-history.ts get-hubs.ts get-orphans.ts
ingest.ts list-documents.ts preview-url.ts read-document.ts
rename-document.ts research.ts rollback-to-version.ts save-version.ts
search.ts shared.ts suggest-links.ts write-document.ts ...
```

**Implications:** A full graph-health audit kit is exposed via MCP — no missing primitive blocks an automated audit. The blocker is the absence of a runner.

### Finding: All graph-health tools require the Hocuspocus server to be running
**Confidence:** CONFIRMED
**Evidence:** `get-dead-links.ts:14`, `get-orphans.ts:14`

```text
'[Requires: Hocuspocus server] ...'
```

Both tools return `HOCUSPOCUS_NOT_RUNNING_ERROR` if the server is down.

**Implications:** Any CI integration would need to boot Hocuspocus headless first (or call the underlying HTTP endpoints directly via a script). Non-trivial but tractable.

### Finding: The OK skill prescribes per-write `get_dead_links` invocation; nothing enforces it
**Confidence:** CONFIRMED
**Evidence:** `SKILL.md:86`

```text
- **Verify before walking away.** After writing a doc, call
  `get_dead_links({ sourceDocNames: ['your/doc'] })` to find broken
  references. Fix each redlink or explicitly accept it.
```

This is a behavioral rule loaded into the agent's context. There is no telemetry, no test, no CI assertion that confirms the call actually happened on any given turn.

**Implications:** The dependency on agent self-discipline is total. A turn that writes 5 docs and calls `get_dead_links` zero times is indistinguishable from a turn that writes 5 docs and calls it 5 times — the wiki state is the only signal.

### Finding: No CI workflow invokes any of these tools
**Confidence:** CONFIRMED
**Evidence:** Negative grep across `.github/workflows/`

```text
$ grep -E "(get_dead_links|get_orphans|get_hubs|hocuspocus|ok start)" \
    .github/workflows/*.yml
# No results.
```

**Implications:** Wiki-content health has zero automated checkpoint. Every audit is initiated either by a human (running the MCP tool from a chat session, or via the editor UI) or by an agent following the skill.

### Finding: The graph-health tools were originally added as an *editor surface*, not an audit pipeline
**Confidence:** CONFIRMED
**Evidence:** Git log on the relevant tool files

```text
$ git log --oneline -- packages/cli/src/mcp/tools/get-dead-links.ts \
                       packages/cli/src/mcp/tools/get-orphans.ts
12ee3d69 feat: add dead-link audit surface (#141)
6517724d Finish V0-11 graph surfaces with fullscreen Orphans and Hubs (#140)
39fcd877 Wiki links: backlink graph, HTTP + MCP APIs, and editor backlinks panel (#71)
c5b9671f feat: agent nav + cadence + preview URL + exec hardening (#158)
d901f563 Zero-Ceremony Resume — lifecycle split, MCP detached spawn, ...
```

Commit titles describe editor panels and agent-nav surfaces — not CI gates.

**Implications:** The framing of these tools is "live audit panel + agent-callable API," not "deterministic regression gate." Re-purposing them as a gate is an explicit step that hasn't been taken.

---

## Negative searches

- `grep -rE "scheduled.*(orphan|dead-link|wiki-audit)" .github/` → no results.
- `grep -E "test:wiki|test:content|test:graph|lint:graph" turbo.json package.json packages/*/package.json` → no results.
- `grep -rE "preCommit.*\.md\b" .husky/` → only the AGENTS.md size script; no per-doc content check.

---

## Gaps / follow-ups

- The MCP tools all proxy to HTTP endpoints under `/api/...` (e.g. `/api/dead-links`, `/api/orphans`). A CI workflow that boots `open-knowledge start` headless and curls these endpoints would be the lightest-weight path to a gate — no capability work needed, just orchestration.
- `suggest_links` exists but is a creation-time aid, not a health audit.
