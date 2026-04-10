# Evidence: Integration Patterns

**Dimension:** D8 — Integration patterns
**Date:** 2026-04-02
**Sources:** Orama source code, Fumadocs docs (fumadocs.dev), web search results

---

## Key files referenced

- `packages/orama/src/index.ts` — public API exports
- `packages/orama/src/methods/create.ts` — plugin system and hooks
- Fumadocs Orama integration docs: https://www.fumadocs.dev/docs/headless/search/orama

---

## Findings

### Finding: Orama provides a comprehensive hook system for lifecycle events
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/create.ts` (lines 177-194)

```typescript
const orama = {
  // ...
  beforeInsert: [],
  afterInsert: [],
  beforeRemove: [],
  afterRemove: [],
  beforeUpdate: [],
  afterUpdate: [],
  beforeUpsert: [],
  afterUpsert: [],
  beforeSearch: [],
  afterSearch: [],
  beforeInsertMultiple: [],
  afterInsertMultiple: [],
  beforeRemoveMultiple: [],
  afterRemoveMultiple: [],
  beforeUpdateMultiple: [],
  afterUpdateMultiple: [],
  beforeUpsertMultiple: [],
  afterUpsertMultiple: [],
  afterCreate: [],
}
```

Plugins register hooks via the plugin system. Hooks can be sync or async.

### Finding: Fumadocs uses Orama via createFromSource() for server-side search
**Confidence:** CONFIRMED
**Evidence:** Fumadocs documentation at fumadocs.dev

```typescript
import { createFromSource } from 'fumadocs-core/search/server';
export const { GET } = createFromSource(source, { language: 'english' });
```

Fumadocs creates search indexes from its source object, extracting structuredData (title, description, URL, content sections). It serves search via an API route.

### Finding: Fumadocs also supports static search (client-side index)
**Confidence:** CONFIRMED
**Evidence:** Fumadocs docs — "Static Search requires clients to download the exported search indexes." For large docs sites, Fumadocs recommends cloud solutions instead of static.

### Finding: Orama works identically server-side and client-side — no special setup
**Confidence:** CONFIRMED
**Evidence:** Source code analysis. Orama is pure TypeScript with no Node.js-specific APIs in the core. The package.json exports support deno, browser, import, and require targets. All functions work in any JavaScript runtime.

### Finding: Incremental document updates are straightforward — insert/update/remove individual docs
**Confidence:** CONFIRMED
**Evidence:** API surface: `insert(db, doc)`, `update(db, id, newDoc)`, `remove(db, id)`. No need to rebuild the full index. Each operation modifies the in-memory index incrementally.

However, update is implemented as remove + insert (not a patch). The consumer must provide the full document.

### Finding: No Orama + Yjs/CRDT examples found
**Confidence:** NOT FOUND
**Evidence:** Web search for "Orama CRDT Yjs" returned no relevant results. No integration exists in the ecosystem.

### Finding: No Orama + MCP server examples found
**Confidence:** NOT FOUND
**Evidence:** Web search returned no results. No MCP server plugin or example exists.

### Finding: Plugin system is component-based — plugins can replace core components
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/create.ts` (lines 100-118) — Plugins with `getComponents()` can provide custom index, documentsStore, sorter, or tokenizer implementations. This is how plugin-pt15 and plugin-qps replace the default search algorithm.

---

## Gaps / follow-ups

- Building an MCP server around Orama would be novel — no existing examples
- Yjs/CRDT integration would require custom hooks (afterInsert/afterRemove syncing to Yjs doc)
- No filesystem watcher — consuming app must handle file change detection and re-indexing
