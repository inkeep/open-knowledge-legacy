---
topic: Data-source gaps in proposed EnrichedMeta shape
sources:
  - packages/cli/src/mcp/tools/read-document.ts:88-119
  - packages/cli/src/mcp/tools/read-document.ts:140
  - packages/cli/src/bash/index.ts:140-176
confidence: HIGH
---

# Data-source gaps in proposed EnrichedMeta shape

SPEC §9 proposes `EnrichedMeta { title, description, tags[], backlinkCount, modified, catalogCategory, path }`. Worldmodel surfaced two fields without current data sources:

## 1. `modified` timestamp

No current code reads `fs.stat().mtime` for wiki files. The closest source is `gitLog(path, N)` (`packages/cli/src/bash/index.ts:140-176`), which returns commit date — not filesystem modified time. For a content directory with uncommitted edits, these diverge.

**Implication for DEP-1 (shared `enrichPath`):** the helper needs either:
- (a) `fs.stat(abs).mtime` read per path — cheap (≈0.1ms per file) but N-amplifies for `exec` output with many paths.
- (b) Use `gitLog[0].date` (latest commit) — matches current `read_document` implicit semantics; diverges on uncommitted edits.
- (c) Both, labeled distinctly.

No existing callsite forces a choice; this is a **new data-plumbing decision**, not a re-use.

## 2. `backlinkCount` as integer

`read-document.ts:88-119` (`fetchBacklinks`) calls `httpGet(serverUrl, /api/backlinks?docName=...)` and returns the **full backlink array**. Callers that want count take `.length`. No count-only endpoint exists in `packages/server/src/api-extension.ts` (inferred; not re-verified).

**Implication for `exec` output:** if `ls articles/` returns 20 paths, enrichment does 20 backlink API calls to populate `backlinkCount` for each. At ~10-50ms per call over localhost, that's 200ms-1s added latency per `exec` invocation on a medium-sized `ls`. This is an **N-amplification risk** not flagged in SPEC §14.

**Mitigations:**
- (a) Add `/api/backlinks/count?docName=...` or `/api/backlinks-batch?docNames=...` endpoint — server-side, coordinate with Dima on V0-4 shared-API work.
- (b) Skip `backlinkCount` in `exec` enrichment; include only in single-path `exec("cat X.md")` enrichment (falls back to full backlinks there).
- (c) Parallel dispatch all backlink calls (Promise.all) — still N RTTs but concurrent; probably sufficient for v0.
- (d) Pre-compute an in-memory backlink count map in the server (exists? check `packages/server/src/backlink-index.ts`).

## 3. Check: backlink-index.ts

`packages/server/src/backlink-index.ts` exists (seen in earlier `ls` output). Worth reading to see if it already maintains count data that could be exposed cheaply via HTTP — would close gap (2) with minimal work.

## Risk downstream for DEP-1 PR

DEP-1's scope is currently "factor shared `enrichPath()` from existing inlined code." If the enrichment shape we want for `exec` is a **superset** of what `read_document`/`search` already compute, DEP-1 is no longer a pure refactor — it needs (a) new `fs.stat` read, (b) a backlink-count strategy. Either DEP-1 scope grows, or `exec`'s enrichment is smaller than advertised.

SPEC A2 currently assumes "DEP-1 will be factored before V0-24 impl starts" — this discovery means A2 should also verify "DEP-1 scope includes the new data-source work, or `exec` enrichment shape is reduced."
