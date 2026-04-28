# Evidence: D1 — Production Yjs Server-Restart Persistence Patterns

**Dimension:** D1 — Prior art: how production Yjs servers persist state across restart
**Date:** 2026-04-23
**Sources:** Hocuspocus docs + source, y-leveldb, y-redis, Jupyter RTC docs, AFFiNE/BlockSuite, GitHub issues

---

## Key sources referenced

- [ueberdosis/hocuspocus extension-sqlite/SQLite.ts](https://github.com/ueberdosis/hocuspocus/blob/main/packages/extension-sqlite/src/SQLite.ts) — official binary-persistence extension
- [Hocuspocus Persistence Guide](https://tiptap.dev/docs/hocuspocus/guides/persistence) — docs explicitly warning against text-as-truth
- [Hocuspocus issue #344](https://github.com/ueberdosis/hocuspocus/issues/344) — canonical content-duplication bug report
- [Hocuspocus issue #848](https://github.com/ueberdosis/hocuspocus/issues/848) — double-applyUpdate variant
- [yjs/y-leveldb src/y-leveldb.js](https://github.com/yjs/y-leveldb) — delta-log + snapshot compaction
- [yjs/y-redis](https://github.com/yjs/y-redis) — Redis streams + S3 blob
- [jupyterlab/jupyter-collaboration docs](https://jupyterlab-realtime-collaboration.readthedocs.io/en/latest/configuration.html) — text-as-truth precedent
- [jupyter-collaboration issue #233](https://github.com/jupyterlab/jupyter-collaboration/issues/233)
- [BlockSuite docs](https://block-suite.com/guide/store.html), [AFFiNE architecture blog](https://affine.pro/blog/what-happens-after-you-press-a-in-a-collaborative-editor-platform-io)
- [Yjs prune discussion](https://discuss.yjs.dev/t/clear-document-history-and-reject-old-updates/945)

---

## Findings

### Finding 1: Hocuspocus SQLite extension — binary-as-truth, single row per doc

**Confidence:** CONFIRMED

**Evidence:** Schema: `CREATE TABLE IF NOT EXISTS "documents" ("name" varchar(255) NOT NULL, "data" blob NOT NULL, UNIQUE(name))`. Store: `INSERT ... ON CONFLICT(name) DO UPDATE SET data = $data` where `$data = Buffer.from(Y.encodeStateAsUpdate(doc))`. Fetch: `SELECT data FROM documents WHERE name = $name ORDER BY rowid DESC` → `Uint8Array` → Hocuspocus calls `applyUpdate(document, loadedDocument)` (verified at `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/@hocuspocus/server/src/Hocuspocus.ts:403-405`).

**Implication:** Hocuspocus's canonical pattern is one Yjs merged snapshot per doc, replaced on each flush. No coordination with any external textual format. This is the DEFAULT that Open Knowledge's markdown-first persistence deviates from.

### Finding 2: Hocuspocus docs explicitly warn against text-as-truth persistence

**Confidence:** CONFIRMED (direct quote)

**Evidence:** [Hocuspocus Persistence Guide](https://tiptap.dev/docs/hocuspocus/guides/persistence):

> **"Do not be tempted to store the Y.Doc as JSON and recreate it as YJS binary when the user connects. This will cause issues with merging of updates and content will duplicate on new connections."**

**Implication:** The warning exists precisely because users reach for text-as-truth and hit the duplication bug. Open Knowledge's architecture must engineer AROUND this failure mode, not alongside it. This is not a hypothetical risk — it's the first-line warning in the framework's own docs.

### Finding 3: Issues #344 and #848 confirm the bug class is endemic

**Confidence:** CONFIRMED

**Evidence:**
- **#344:** Backend restart → client reconnects → `onLoadDocument` content gets **appended** to live client state rather than merging. Community workaround: always persist binary, never recompute from text.
- **#848:** `Database.onLoadDocument` applies update, then `Hocuspocus.ts:473-483` applies it again because the extension returned the same doc instance — duplicate `applyUpdate` call. Fix: extension must not return the doc when it has applied in-place.

**Implication:** Every `onLoadDocument` that produces CRDT state from a non-CRDT source is a potential #344. The fix pattern is: preserve binary CRDT state across restart so reconnect is a no-op at the CRDT layer.

### Finding 4: y-leveldb — delta log converging to snapshot

**Confidence:** CONFIRMED

**Evidence:** Keys: `['v1', docName, 'update', clock]` (incremental updates) + `['v1_sv', docName]` (state-vector snapshot). Recovery: fetch all updates, apply sequentially to a fresh Y.Doc. Above `PREFERRED_TRIM_SIZE = 500` updates, `flushDocument()` merges via `Y.mergeUpdates()`, writes one snapshot, deletes the log.

**Implication:** Even the "delta log" storage pattern converges to a merged binary snapshot as compaction strategy. No textual coordination anywhere in the y-leveldb pipeline.

### Finding 5: y-redis — Redis streams + S3 blob (horizontally scaled variant)

**Confidence:** CONFIRMED

**Evidence:** Redis streams per room carry live updates; a worker periodically drains them, merges into the existing S3 blob, writes metadata to Postgres. Storage format remains encoded Yjs update blob, not text.

**Implication:** Horizontally scaled variant still keeps Yjs binary as the single source of truth. Scale doesn't change the architectural shape.

### Finding 6: Jupyter Real-Time Collaboration is THE precedent for text-as-truth + binary-as-cache

**Confidence:** CONFIRMED (direct doc quote)

**Evidence:** [jupyter-collaboration configuration docs](https://jupyterlab-realtime-collaboration.readthedocs.io/en/latest/configuration.html):

> "Any change made to a document is saved to disk in an SQLite database file called `.jupyter_ystore.db`. ... **it is fine to just ignore it, including in your version control system (don't commit this file). If you happen to delete it, there shouldn't be any serious consequence either.**"

The `.ipynb` file on disk is the source of truth; the YStore SQLite DB is a disposable cache preserving the update timeline + undo history. Binary is rebuildable from text at any time. Uses `pycrdt`'s `SQLiteYStore` (delta-log style, not just a blob) so undo history survives restarts.

**Implication:** This is the closest prior art for Open Knowledge's intended architecture, and it ships in production at scale (JupyterLab serves millions of notebooks). The "binary-as-cache, text-as-truth" pattern is not novel — Jupyter RTC demonstrates it works. BUT: it's outside the Hocuspocus grain. OK essentially ports the Jupyter model onto Hocuspocus rather than inheriting Hocuspocus's default.

### Finding 7: AFFiNE/BlockSuite — binary-authoritative at scale

**Confidence:** INFERRED (could not fully read DocStorageAdapter source)

**Evidence:** Server-side: Postgres (metadata) + S3 (Yjs blobs, `y-octo` native engine). Markdown/HTML exist only as block-snapshot exports via the transformer system — not as backing truth.

**Implication:** Unlike Jupyter, AFFiNE treats text as an export format and Yjs as durable truth. Reinforces that OK's chosen path (text-as-truth) is the minority pattern.

### Finding 8: Liveblocks / Tiptap Cloud — opaque, binary-as-truth

**Confidence:** INFERRED (docs don't describe server internals)

**Evidence:** [Liveblocks Yjs API docs](https://liveblocks.io/docs/api-reference/liveblocks-yjs) describe only client IndexedDB caching; server persistence is opaque.

**Implication:** Managed SaaS offerings give no user-facing restart contract beyond "it just works" — they retain Yjs binary behind the curtain. Suggests the pattern is viable operationally.

### Finding 9: GC of stale binary state has no clean solution

**Confidence:** CONFIRMED

**Evidence:** [Yjs prune discussion thread](https://discuss.yjs.dev/t/clear-document-history-and-reject-old-updates/945). No safe way to prune binary history while offline clients may reconnect with stale updates. Two documented approaches: (a) rotate `documentName` (`docId:sessionId`) so stale updates arrive at a dead room; (b) clear YMap keys (tombstones retained, not full GC).

**Implication:** Open Knowledge's "prune binary after N days quiet" policy requires either the docName-rotation trick, a force-resync signal to reconnecting clients, or accepting that offline edits older than retention window are discarded. Most likely: binary sidecar is short-lived and regenerable; the real durability is markdown.

---

## Comparison Table

| Library / System | Storage medium | Format | Textual coordination | Restart recovery |
|---|---|---|---|---|
| **Hocuspocus SQLite ext** | SQLite blob column | Merged snapshot (`encodeStateAsUpdate`) | None; binary is truth | Load blob → `applyUpdate` into fresh Y.Doc |
| **Hocuspocus Database ext** | User-supplied (Postgres/Mongo/…) | `Uint8Array` merged snapshot | None | Fetch → `applyUpdate` |
| **y-leveldb** | LevelDB | Delta log + state-vector; auto-compacted to snapshot at 500 updates | None | Replay all updates |
| **y-redis** | Redis streams (live) + S3 (durable) + Postgres (metadata) | Encoded Yjs blob in S3, update refs in stream | None | Worker merges stream into S3 blob |
| **Jupyter RTC (pycrdt SQLiteYStore)** | SQLite `.jupyter_ystore.db` | Delta log with timeline preservation | **`.ipynb` on disk IS truth; cache is disposable** | Re-read `.ipynb` from disk; YStore provides undo-history continuity |
| **AFFiNE / BlockSuite** | Postgres + S3 | Yjs binary (`y-octo`) | Markdown/HTML only as export snapshots | Load Yjs blob from S3 |
| **Liveblocks / Tiptap Cloud** | Opaque managed | Presumed Yjs binary | None exposed | Opaque to user |

---

## Synthesis

**The prevailing pattern is binary-as-truth, text-as-export.** Every commercial and OSS Yjs server except Jupyter treats `encodeStateAsUpdate` output as the durable unit of persistence.

**Jupyter RTC is the singular precedent for "text-as-truth + binary-as-cache."** Validates that OK's architecture is not novel, but it is outside the Hocuspocus grain. The duplication failure mode (#344) is the exact hazard to design against.

**GC of stale binary state requires explicit coordination** (docName rotation, force-resync signals, or accepted data loss).

---

## Gaps / follow-ups

- AFFiNE `DocStorageAdapter` source not read directly (fetch timeout). Persistence specifics inferred from architecture blog.
- Did not read `jupyter-collaboration` YRoom lifecycle code — exact mechanism by which Jupyter avoids #344 when re-reading `.ipynb` not source-verified.
- `pycrdt` `SQLiteYStore` schema not read directly.
- Liveblocks / Tiptap Cloud have no public restart contract detail.
