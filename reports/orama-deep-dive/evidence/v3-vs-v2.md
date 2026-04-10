# Evidence: Orama v3 vs v2

**Dimension:** D11 — Orama v3 vs v2
**Date:** 2026-04-02
**Sources:** Orama source code, benchmarks, web search, GitHub issues

---

## Findings

### Finding: The biggest v3 change — core operations are synchronous by default
**Confidence:** CONFIRMED
**Evidence:** `benchmarks/index.js` — v2.1.1 benchmarks use `async/await`, while v3 benchmarks call functions synchronously.

In v2, all operations (create, insert, search, etc.) were async. In v3, they are synchronous when no async hooks are registered. Async behavior kicks in only when plugins register async beforeInsert/afterInsert/beforeSearch/afterSearch hooks.

From `packages/orama/src/methods/insert.ts` (lines 25-37):
```typescript
const asyncNeeded =
  isAsyncFunction(orama.beforeInsert) ||
  isAsyncFunction(orama.afterInsert) ||
  isAsyncFunction(orama.index.beforeInsert) ||
  isAsyncFunction(orama.index.insert) ||
  isAsyncFunction(orama.index.afterInsert)

if (asyncNeeded) {
  return innerInsertAsync(orama, doc, language, skipHooks, options)
}
return innerInsertSync(orama, doc, language, skipHooks, options)
```

This is a significant performance improvement — eliminates microtask overhead for the common case.

### Finding: v3 added AnswerSession (RAG/chat) capability
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/index.ts` (line 11) — `export { AnswerSession } from './methods/answer-session.js'`

README: "Since v3.0.0, Orama allows you to create your own ChatGPT/Perplexity/SearchGPT-like experience." This is the headline v3 feature — built-in RAG with Orama's search as the retrieval layer.

### Finding: v3 added pinning/merchandising rules
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/index.ts` (line 4) — `export { insertPin, updatePin, deletePin, getPin, getAllPins } from './methods/pinning.js'`

Pinning allows promoting or anchoring specific results for given queries. Applied after search scoring but before pagination.

### Finding: v3 added upsert operations
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/index.ts` (line 10) — `export { upsert, upsertMultiple } from './methods/upsert.js'`

### Finding: v3 added plugin-pt15 and plugin-qps (alternative search algorithms)
**Confidence:** CONFIRMED
**Evidence:** Both packages exist in the monorepo at v3.1.18. Benchmarks compare "latest with PT15" and "latest with QPS" variants.

### Finding: v2 to v3 migration caused issues for some users
**Confidence:** CONFIRMED
**Evidence:** GitHub issue #869 — "Upgrading to v3.0.4 Causing Search Failures." Users reported incorrect results after upgrade.

### Finding: v3 is stable at v3.1.18 (well past the initial 3.0.0 release)
**Confidence:** CONFIRMED
**Evidence:** Current version 3.1.18 indicates 18 patch releases since 3.1.0, suggesting active bugfixing and stability improvements.

### Finding: No official migration guide from v2 to v3
**Confidence:** INFERRED
**Evidence:** Web search for "Orama v2 to v3 migration guide" returned no official documentation. The breaking changes are not formally documented.

Key migration concerns:
1. Return type changes: v2 all-async -> v3 sync-or-async (return `T | Promise<T>`)
2. API signature changes (unconfirmed — no migration doc found)
3. Schema format may have changed (10 types in v3, unclear what v2 supported)

---

## Summary of v3 changes

| Change | Type | Impact |
|--------|------|--------|
| Sync-by-default operations | Breaking | Major performance improvement; callers may need to handle `T \| Promise<T>` |
| AnswerSession (RAG/chat) | Addition | New v3-only feature |
| Pinning rules (merchandising) | Addition | New v3-only feature |
| Upsert operations | Addition | Convenience addition |
| PT15 / QPS search algorithms | Addition | Alternative search strategies via plugins |
| 10 data types including geopoint | Likely addition | Some types may be new in v3 |

---

## Gaps / follow-ups

- Exact list of v2-to-v3 breaking changes is not documented
- Performance delta between v2 and v3 not quantified (benchmarks exist but no published numbers)
