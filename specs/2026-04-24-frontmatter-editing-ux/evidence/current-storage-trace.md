---
name: current-storage-trace
description: Initial code trace of how `Y.Map('metadata')['frontmatter']` is read and written across the codebase today, establishing the migration blast radius for D2 (per-key storage).
type: spec-evidence
sources:
  - packages/core/src/bridge/frontmatter-y.ts
  - packages/server/src/server-observers.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/external-change.ts
  - packages/server/src/persistence.ts
  - packages/server/src/live-derived-index.ts
  - packages/server/src/suggest-links.ts
  - packages/server/src/standalone.ts
  - packages/app/src/editor/observers.test.ts
  - packages/app/tests/integration/test-harness.ts
  - packages/app/tests/integration/session-undo-manager.test.ts
  - packages/app/tests/fidelity/bridge-observer-conversion.test.ts
date: 2026-04-24
---

# Current storage trace

**Storage shape today:** `Y.Map('metadata')['frontmatter']` = a single string holding the raw YAML frontmatter (without the `---` fences). Confirmed in [`packages/core/src/bridge/frontmatter-y.ts`](../../../packages/core/src/bridge/frontmatter-y.ts):

```ts
export function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const fm = metaMap.get('frontmatter');
  return typeof fm === 'string' ? fm : '';
}
```

CRDT semantics: a single Y-value at a single Y-Map key. Concurrent writes to this slot resolve as document-level last-write-wins on the entire frontmatter string.

## Touch sites identified (initial scan)

`grep -ln "getMap.*metadata\|getMap('metadata')"` across packages turned up 14 files. Production sites:

| File | Role |
|---|---|
| [`packages/core/src/bridge/frontmatter-y.ts`](../../../packages/core/src/bridge/frontmatter-y.ts) | Canonical reader (`getFrontmatter(doc)`) |
| [`packages/server/src/server-observers.ts`](../../../packages/server/src/server-observers.ts) | Observer A (prepend on serialize), Observer B (parse from source mode YAML, cache) |
| [`packages/server/src/api-extension.ts`](../../../packages/server/src/api-extension.ts) | MCP / HTTP write handlers (`write_document`, `edit_document`, patch handler at L2106) |
| [`packages/server/src/agent-sessions.ts`](../../../packages/server/src/agent-sessions.ts) | Per-session agent write context (`applyAgentMarkdownWrite`) |
| [`packages/server/src/external-change.ts`](../../../packages/server/src/external-change.ts) | File-watcher path (disk → Y.Doc) |
| [`packages/server/src/persistence.ts`](../../../packages/server/src/persistence.ts) | Y.Doc → disk persistence |
| [`packages/server/src/live-derived-index.ts`](../../../packages/server/src/live-derived-index.ts) | Derived indexes that read frontmatter |
| [`packages/server/src/suggest-links.ts`](../../../packages/server/src/suggest-links.ts) | Link-suggestion feature reads metadata |
| [`packages/server/src/standalone.ts`](../../../packages/server/src/standalone.ts) | Standalone server boot |

Test sites (must update with migration but don't shape contract):

| File | Role |
|---|---|
| [`packages/server/src/server-observers.test.ts`](../../../packages/server/src/server-observers.test.ts) | Observer contract tests |
| [`packages/server/src/api-agent-frontmatter.test.ts`](../../../packages/server/src/api-agent-frontmatter.test.ts) | MCP write path tests |
| [`packages/server/src/external-change.test.ts`](../../../packages/server/src/external-change.test.ts) | File-watcher tests |
| [`packages/app/src/editor/observers.test.ts`](../../../packages/app/src/editor/observers.test.ts) | Client observer tests |
| [`packages/app/tests/integration/test-harness.ts`](../../../packages/app/tests/integration/test-harness.ts) | Integration harness |
| [`packages/app/tests/integration/session-undo-manager.test.ts`](../../../packages/app/tests/integration/session-undo-manager.test.ts) | Undo-manager integration |
| [`packages/app/tests/fidelity/bridge-observer-conversion.test.ts`](../../../packages/app/tests/fidelity/bridge-observer-conversion.test.ts) | Bridge fidelity |

## Concrete write site (representative)

[`packages/server/src/api-extension.ts:2106-2148`](../../../packages/server/src/api-extension.ts#L2106-L2148) — patch handler:

```ts
session.dc.document.transact(() => {
  const xmlFragment = session.dc.document.getXmlFragment('default');
  const metaMap = session.dc.document.getMap('metadata');
  const currentFm = (metaMap.get('frontmatter') as string | undefined) ?? '';
  const currentBody = mdManager.serialize(...);
  const currentFull = prependFrontmatter(currentFm, currentBody);

  // ... compute newFull as a string-spliced result ...

  const { frontmatter: newFm, body: newBody } = stripFrontmatter(newFull);
  if (newFm !== currentFm) {
    metaMap.set('frontmatter', newFm);   // ← single-string write site
  }
  applyAgentMarkdownWrite(session.dc.document, newBody, 'replace');
}, session.origin);
```

This is the shape every write-side touch will need to evolve: from "set the whole YAML string at one key" to "serialize per-key Y-Map to YAML, then either: (a) splice into the document text at the character level then re-parse to per-key updates, or (b) compute property-level diff and apply per-key updates directly." Decision needed.

## Observed read pattern (representative)

`getFrontmatter(doc)` is used to compose the full markdown for downstream concerns (search, indexing, agent-write payload composition). Callers want a string today. Under per-key storage they will either:

- Continue to receive a string (the function serializes per-key on demand) — preserves caller contract; cost is recomputation; OR
- Migrate to a structured reader (`getFrontmatterMap(doc)` returning `Record<string, unknown>`) — preserves type fidelity; cost is N caller migrations.

Likely both — reader function evolves to expose both shapes and callers pick.

## Items deferred to /explore deep dive

A `general-purpose` Task subagent loading `/explore` is the right tool for full surface-mapping at L2 depth across all 14 sites with structured output. This file captures only the L1 grounding from initial reads. Subagent dispatch deferred until after backlog confirmation in this session.

## Implications for D2 (LOCKED — per-key storage)

The migration is a non-trivial, cross-cutting change affecting at least 9 production source files plus test infrastructure. Three sub-decisions fall out:

1. **Reader API surface** — extend `getFrontmatter(doc)` (string output, preserve callers) and add `getFrontmatterMap(doc)` (structured), or replace.
2. **Writer API surface** — every `metaMap.set('frontmatter', newFm)` site becomes a per-key apply. Need a single helper (`applyFrontmatterUpdate(doc, partial)` or similar) so the discipline is centralized like `applyAgentMarkdownWrite` is for body writes.
3. **Migration trigger** — when does an existing in-flight Y.Doc convert from single-string to per-key? On next load? Lazily on first per-key read? On first form interaction? Affects rollout / feature flag shape.

These become discrete decisions in the iterative loop.
