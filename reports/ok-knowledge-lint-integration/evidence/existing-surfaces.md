# Evidence: OK's Existing Surfaces That Already Cover Most of the Lint Story

**Dimension:** What primitives in the OK codebase today can be extended with near-zero net-new work to support knowledge linting + auto-research
**Date:** 2026-04-27
**Sources:** OK source code (1P)

---

## Findings

### Finding: 6 of 7 deterministic-lint endpoints already exist
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts` handler-name inventory:

| Lint check | Endpoint | Handler | Status |
|---|---|---|---|
| Orphan pages | `GET /api/orphans` | `handleOrphans` (line 1944) | ✅ Built |
| Hub candidates | `GET /api/hubs` | `handleHubs` (line 1975) | ✅ Built |
| Dead links (internal) | `GET /api/dead-links` | `handleDeadLinks` (line 2001) | ✅ Built |
| Backlinks (single doc) | `GET /api/backlinks` | `handleBacklinks` (line 1763) | ✅ Built |
| Backlink counts (bulk) | `GET /api/backlink-counts` | `handleBacklinkCounts` (line 1803) | ✅ Built |
| Forward links | `GET /api/forward-links` | `handleForwardLinks` (line 1832) | ✅ Built |
| Link graph | `GET /api/link-graph` | `handleLinkGraph` (line 1878) | ✅ Built |
| Source traceability | (would be new) | — | ❌ Net-new — but trivial: grep wiki/ for `[[raw/...]]` patterns or markdown-link-to-`raw/` |
| Index ↔ content drift | (would be new) | — | ❌ Net-new — but trivial: diff `index.md` against `find content/` |
| Tag consistency | (would be new) | — | ❌ Net-new — aggregate frontmatter `tags:` across all files; flag near-duplicates |

**Implications:**
- Of the 7 deterministic checks identified in the prior `knowledge-linting-karpathy-workflow` report (#3, #4, #7, #8, #9, #10, #11), **5 are already exposed via HTTP API** (orphans=#3, redlinks-via-orphans+graph=#4, dead-links=#7, source-traceability via existing graph=hint at #10, hubs as a complement). The remaining 2 (tag consistency #8, index drift #11) are <50 lines of code each.
- The MCP tool surface mirrors the API: `get_orphans`, `get_dead_links`, `get_hubs`, `get_backlinks`, `get_forward_links`, `suggest_links`. Adding `get_lint_findings` (an aggregator that runs all checks at once) would be a thin wrapper over the existing HTTP endpoints.

### Finding: The `hints[]` array is already an established response channel on every agent write
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:1626-1648`:

```typescript
const hints = computeOrphanHints(resolvedDocName);
// ...
json(res, 200, {
  ok: true,
  timestamp,
  subscriberCount,
  systemSubscriberCount,
  ...(hints ? { hints } : {}),
  ...(summaryResponse ? { summary: summaryResponse } : {}),
});
```

`computeOrphanHints` (line 820) is the canonical example:

```typescript
function computeOrphanHints(
  docName: string,
): Array<{ type: 'orphan'; parentCandidates: string[]; message: string }> | undefined {
  if (!backlinkIndex) return undefined;
  try {
    const backlinks = backlinkIndex.getBacklinks(docName);
    if (backlinks.length > 0) return undefined;
    const candidates = findHubCandidates(docName, getFileIndex());
    if (candidates.length === 0) return undefined;
    const wikiLinks = candidates.map((c) => `[[${c}]]`).join(', ');
    return [
      {
        type: 'orphan',
        parentCandidates: candidates,
        message: `This doc has no backlinks yet. ...`,
      },
    ];
  } catch (err) {
    console.warn('[orphan-hint] computeOrphanHints failed:', err);
    return undefined;
  }
}
```

Note: **non-throwing** ("a hint-computation failure must not fail the write"); **side-effect free** (read-only against `backlinkIndex` + `getFileIndex()`); **shape is `{ type, ...payload, message }`**.

The MCP tool surfaces these hints directly — `packages/cli/src/mcp/tools/write-document.ts:102, 120-124, 143-145`:

```typescript
const hints = Array.isArray(result.hints) ? result.hints : undefined;
// ...
if (hints) {
  for (const hint of hints) {
    if (hint.message) lines.push(hint.message);
  }
}
// ...
if (hints) {
  structured.hints = hints;
}
```

**Implications:**
- **Adding a new lint check is one new function** alongside `computeOrphanHints` — same shape (`{ type, ...payload, message }`), same non-throwing contract, same surfacing logic. The MCP tool already passes them through to the agent. Zero protocol changes.
- The `type` discriminator means findings can carry custom payload shapes per check (e.g., `{ type: 'dead-link', target, sources, message }`). The agent reads the `message` for human-readable output and can switch on `type` for richer handling.

### Finding: `live-derived-index.ts` is the canonical Hocuspocus extension pattern for "fire X on every doc change"
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/live-derived-index.ts:1-93` (verbatim):

```typescript
export function createLiveDerivedIndexExtension(options: LiveDerivedIndexOptions): Extension {
  const { backlinkIndex, signalChannel, debounceMs = 100 } = options;
  const pendingByDoc = new Map<string, ReturnType<typeof setTimeout>>();

  function schedule(docName: string, document: Document): void {
    clearPending(docName);
    pendingByDoc.set(
      docName,
      setTimeout(() => {
        pendingByDoc.delete(docName);
        try {
          backlinkIndex.updateDocumentFromMarkdown(docName, serializeLiveDocument(document));
          signalChannel?.('backlinks');
          signalChannel?.('graph');
        } catch (err) {
          console.error(`[live-derived-index] Failed to update backlinks for ${docName}:`, err);
        }
      }, debounceMs),
    );
  }

  return {
    async onChange({ documentName, document, transactionOrigin }) {
      if (isSystemDoc(documentName)) return;
      // Disk events already update the derived views in the watcher path.
      if (isLocalOriginLike(transactionOrigin) && transactionOrigin.context?.origin === 'file-watcher') return;
      schedule(documentName, document);
    },
    async beforeUnloadDocument({ documentName }) { clearPending(documentName); },
    async onDestroy() { ... },
  };
}
```

The extension hooks Hocuspocus's `onChange` lifecycle, debounces per-doc (100ms default), runs derived computation, and signals subscribed clients via the CC1 broadcast channel.

**Implications:**
- A `live-knowledge-lint` extension would follow the *exact same pattern*: hook `onChange`, debounce per doc, run deterministic lint checks on the post-change state, store findings in a `lintIndex: Map<docName, Finding[]>`, signal channel `'lint'` via CC1, surface via `hints` on the next `/api/agent-write-md` response.
- The pattern handles every observability concern that matters: skip `__system__`, skip file-watcher origin (avoid feedback), debounce, error containment.
- **Cost: roughly 100 lines of TypeScript** for a complete extension wired into the boot path.

### Finding: `applyAgentMarkdownWrite` is a single-call surface that all agent writes flow through
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/agent-sessions.ts:92-107`:

```typescript
export function applyAgentMarkdownWrite(
  document: Document,
  markdown: string,
  position: 'append' | 'prepend' | 'replace',
): void {
  withSpanSync(
    'agent.applyAgentMarkdownWrite',
    {
      attributes: {
        'doc.name': document.name,
        'agent.write_position': position,
        'agent.markdown.bytes': markdown.length,
      },
    },
    () => applyAgentMarkdownWriteInner(document, markdown, position),
  );
}
```

This is the canonical agent write — every MCP `write_document` call ends up here (via `handleAgentWriteMd` → `applyAgentMarkdownWrite`). It runs in a single OTel span.

**Implications:**
- For *write-time* deterministic lint, `applyAgentMarkdownWrite` is the single point of instrumentation. After step 6 (Y.Text mirror complete), the document is in its final post-write state — that's where to compute lint findings to surface in the response.
- The function is wrapped in `withSpanSync` so adding lint timing as a child span is trivial (`withSpanSync('agent.lint', ..., () => computeLintFindings(...))`).

### Finding: OK's MCP server uses `@modelcontextprotocol/sdk` and supports notifications, but does not currently wire sampling
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/server.ts:20-22`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
```

The server imports `RootsListChangedNotificationSchema` (notifications) and uses `setNotificationHandler` (line 294). It does NOT currently import or use `CreateMessageRequestSchema` or any sampling-related types.

The `McpServer` class from the SDK supports sampling — it's just not wired in OK today.

**Implications:**
- **Adding sampling is purely additive** — register a handler that, when needed, calls `server.server.createMessage({ ... })` to ask the host's LLM to evaluate a contradiction / data gap / nuance question. The infrastructure is in the SDK; OK just doesn't use it yet.
- **Cost: ~50 lines** to add a sampling-backed lint check that fires only on explicit `lint` MCP tool invocation (so it doesn't add overhead to ordinary writes).

### Finding: `installUserSkill` is the canonical skill-distribution path; could analogously install hooks
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/index.ts:232` (`installUserSkill` is exported); `packages/server/src/skill-install.ts` + tests cover fresh install, idempotency, sidecar tolerance, timeout, failure modes.

The CLI already exposes `ok install-skill` (`packages/cli/src/commands/install-skill.ts`).

**Implications:**
- A parallel `installHooks` (or `ok install-hooks`) command would shell out to write per-host hook config files: `.claude/settings.json` + `hooks` block (Claude Code), `.cursor/hooks.json` (Cursor), `.codex/config.toml` `[hooks]` (Codex). The hook *script* itself ships with OK and lives at a known path; the per-host config just points at it.
- The same idempotency, sidecar, and timeout machinery from `installUserSkill` applies — this is template-pattern, not new architecture.

### Finding: Workflow tools (`ingest`, `research`, `consolidate`) are the auto-research building blocks
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/mcp/tools/index.ts:31, 58, 71, 94-96` registers all three; `packages/cli/src/mcp/tools/research.ts` body shows the 9-step research pipeline (scan → scope → ingest → read → write → link → validate → recap).

The `research` tool's body (line 23 onward) explicitly enforces:
- Path A (default) = persistent provisional article with `sources:` frontmatter.
- Headless mode for "non-interactive container environments".
- Mandatory step order with hard gates.

**Implications:**
- **Auto-research is just `research --headless` triggered by lint findings or scheduled.** The tool's body already supports headless mode; the auto-research caller invokes the existing tool with `--headless` semantics.
- Concretely: a GitHub Actions workflow boots `ok start` (Hocuspocus + MCP) → boots Claude Code in `--print` headless mode → tells Claude Code to invoke the `research` MCP tool on each lint-flagged "data gap" → Claude Code runs the existing 9-step pipeline → writes wiki articles → commits to the repo.
- **Zero new tools needed** — the existing chain is the auto-research engine.

### Finding: Internal scheduling primitives already exist
**Confidence:** CONFIRMED
**Evidence:**
- `packages/server/src/boot.ts:288, 313` — `setInterval` for ping timer + idle-shutdown.
- `packages/server/src/idle-shutdown.ts:41` — injectable scheduler interface (`Scheduler` type) per precedent #13b.
- `packages/server/src/live-derived-index.ts:48` — per-doc `setTimeout` debounce.

**Implications:**
- For server-side *continuous-decay* triggers (the 4th class from the knowledge-linting research) — periodically scoring all wiki pages by orphan-distance, source-age, etc. — the existing scheduler abstraction handles it. A `lint-scheduler.ts` would mirror `idle-shutdown.ts`'s shape.
- For *Sleep Consolidation* patterns: a scheduled background task that runs LLM-required lint via sampling. Constraint per MCP spec: server-initiated sampling requires an originating client request, so this fires on user reconnect, not on independent server schedule. Pure server-side LLM passes need an external trigger (cron + headless agent CLI).

---

## Negative findings

- **No existing schema for "lint findings"** in OK — `computeOrphanHints` returns an inline structural type. A shared `LintFinding` type would unify the various check outputs.
- **No persistence layer for lint findings** beyond per-write `hints[]` — findings are computed on each write and not stored. For a "lint history" view (which would let users see decay over time), a `lint_findings.jsonl` log would need adding. Borderline new infrastructure; the simpler approach is to compute on read.
- **No `lint` MCP tool** registered today. The check infra is in `/api/*` endpoints; no aggregate "run all checks against a doc and return findings" MCP tool exists. Adding one (~50 lines) would unify the agent surface.

---

## Gaps / follow-ups

- **`@inkeep/open-knowledge-core` extension surface** wasn't traced — some lint logic might naturally live in `core` (pure utilities) rather than `server`. The check (read backlink-index, scan markdown for redlinks, etc.) is server-side because it needs the live `backlinkIndex`; the *finding type* could live in `core`.
- **CC1 broadcast channel for `'lint'`** would need a registration alongside existing `'files'` / `'backlinks'` / `'graph'` channels; trivial but not yet present.
