# Evidence: Shadow Repo Attribution Enrichment

**Dimension:** D3 — Shadow repo attribution enrichment
**Date:** 2026-04-14
**Sources:** Open Knowledge codebase (packages/server, packages/core, packages/cli)

---

## Key files referenced

- `packages/server/src/shadow-repo.ts:31-35,120-197` — WriterIdentity, commitWip
- `packages/core/src/shadow-repo-layout.ts:112-122` — parseWriterId, classifyWriterId
- `packages/cli/src/content/shadow-log.ts:1-180` — shadow commit reading and enrichment
- `packages/server/src/persistence.ts:159-163` — defaultWriter

---

## Findings

### Finding: `WriterIdentity` maps cleanly to git commit semantics
**Confidence:** CONFIRMED
**Evidence:** `shadow-repo.ts:31-35`

```typescript
interface WriterIdentity {
  id: string;    // Used in ref path: refs/wip/<branch>/<id>
  name: string;  // Used as GIT_AUTHOR_NAME
  email: string; // Used as GIT_AUTHOR_EMAIL
}
```

This is the minimal identity surface. Richer identity can be encoded into these fields without schema changes:
- `id`: `agent-<connectionId>` (satisfies `parseWriterId` classification)
- `name`: `Claude Code (my-label)` (displays in `git log` and timeline)
- `email`: `agent-<connectionId>@openknowledge.local` (unique per connection)

### Finding: `parseWriterId` already supports agent classification via prefix
**Confidence:** CONFIRMED
**Evidence:** `shadow-repo-layout.ts:112-122`

```typescript
if (id.startsWith('agent-')) return { id, classification: 'agent', isAgent: true };
if (id.startsWith('human-')) return { id, classification: 'human', isAgent: false };
// etc.
```

No code changes needed for classification — just pass `id: 'agent-<connectionId>'` and it works.

### Finding: `shadow-log.ts` reads `writerName` from git author name — label encoding propagates free
**Confidence:** CONFIRMED
**Evidence:** `shadow-log.ts` git log format: `%H|%aI|%an|%s`

The CLI reads `%an` (author name) as `writerName`. If agent identity is encoded in `GIT_AUTHOR_NAME` (e.g. `Claude Code (research-agent)`), it propagates to the timeline display with no CLI changes.

### Finding: Multiple commit paths exist, each with different writer handling
**Confidence:** CONFIRMED

| Commit path | Writer | Current identity |
|-------------|--------|-----------------|
| `commitWip()` | Parameterized | Always receives `defaultWriter: { id: 'server' }` |
| `commitUpstreamImport()` | Hardcoded | `UPSTREAM_WRITER: { id: 'upstream' }` |
| `safetyCheckpoint()` | Hardcoded | `SAFETY_WRITER: { id: 'openknowledge-server' }` |
| `parkBranch()` | From sessionId | `human-<sessionId>` |
| `saveVersion()` | From API | Accepts `writers[]`, defaults to `[{ id: 'server' }]` |

Only `commitWip()` needs agent identity threading. The others are correctly attributed.

### Finding: Structured metadata in commit messages is an option for richer identity
**Confidence:** INFERRED

Git commit messages can carry structured metadata:
```
Agent write: intro.md

agent-connection-id: abc-123-def
agent-client-name: claude-code
agent-client-version: 1.42.1
agent-label: research-agent
```

This would require parsing in `shadow-log.ts` but enables richer attribution without extending `WriterIdentity`.

---

## Gaps / follow-ups

- The L2 debounce coalesces writes from all sources into one commit. A per-agent WIP ref strategy would create separate refs (`refs/wip/main/agent-abc`, `refs/wip/main/agent-def`) but requires tracking which agent dirtied which doc.
- `saveVersion()` should pass the connected agents' identities in the `writers[]` array — currently the MCP tool doesn't.
