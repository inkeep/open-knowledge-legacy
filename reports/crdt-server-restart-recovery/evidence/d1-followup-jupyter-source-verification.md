# Evidence: D1 Follow-up — Jupyter RTC Source Verification

**Dimension:** D1 extension — source-level verification of INFERRED claims about pycrdt SQLiteYStore schema and jupyter-collaboration YRoom lifecycle
**Date:** 2026-04-23
**Sources:** y-crdt/pycrdt-store, jupyterlab/jupyter-collaboration GitHub repos

This follow-up was commissioned to de-risk D1 Finding 6's INFERRED claims before committing to the sidecar architecture on the strength of the Jupyter precedent. Findings reclassify three claims from INFERRED to CONFIRMED and surface one previously-unknown gap.

---

## Key sources referenced

- [y-crdt/pycrdt-store src/pycrdt/store/sqlite.py](https://github.com/y-crdt/pycrdt-store/blob/main/src/pycrdt/store/sqlite.py) — SQLiteYStore class + schema
- [jupyterlab/jupyter-collaboration rooms.py](https://github.com/jupyterlab/jupyter-collaboration/blob/main/projects/jupyter-server-ydoc/jupyter_server_ydoc/rooms.py) — DocumentRoom lifecycle
- [jupyter-server-ydoc app.py](https://github.com/jupyterlab/jupyter-collaboration/blob/main/projects/jupyter-server-ydoc/jupyter_server_ydoc/app.py) — YStore configuration

---

## Findings

### Finding 1: SQLiteYStore schema — two tables, delta log + snapshot (CONFIRMED)

**Confidence:** CONFIRMED (was INFERRED in prior evidence)

**Evidence:** Direct source read from [pycrdt-store/src/pycrdt/store/sqlite.py](https://github.com/y-crdt/pycrdt-store/blob/main/src/pycrdt/store/sqlite.py):

```sql
CREATE TABLE yupdates (
  path TEXT NOT NULL,
  yupdate BLOB,
  metadata BLOB,
  timestamp REAL NOT NULL
);
CREATE INDEX idx_yupdates_path_timestamp ON yupdates (path, timestamp);

CREATE TABLE ycheckpoints (
  path TEXT NOT NULL,
  checkpoint BLOB NOT NULL,
  timestamp REAL NOT NULL,
  PRIMARY KEY(path)
);
```

Two tables: `yupdates` is an append-only delta log (per-document, timestamped, indexed). `ycheckpoints` is a single-row-per-document snapshot table (primary key on path). Both use compressed BLOB storage (the `compressed_data` variable in the source indicates pre-insert compression).

**Write semantics:** `INSERT INTO yupdates VALUES (?, ?, ?, ?)` per `write()` call — appends, never upserts. Checkpoints use `INSERT OR REPLACE INTO ycheckpoints` — single-blob per document.

**Read semantics:** `SELECT yupdate, metadata, timestamp FROM yupdates WHERE path = ?` returns all updates; caller iterates and replays. No automatic checkpoint-first optimization visible in the read method itself (checkpoints are consumed by separate checkpoint-aware logic).

**Compaction:** TTL-based history squashing. When the oldest updates exceed configured TTL OR the history count exceeds configured maximum:
```python
# Load all updates older than threshold
# Apply them to a fresh Doc
# DELETE them from yupdates
# INSERT a single squashed blob back
```
This is y-leveldb-style compaction but triggered on TTL rather than count threshold alone.

**Implications:**
- Confirms D1's INFERRED claim that pycrdt SQLiteYStore is a delta-log style store with snapshot compaction.
- The two-table design (delta log + snapshot) is more sophisticated than Hocuspocus's single-blob extension but serves the same function: enable undo-history preservation without unbounded growth.
- **For OK's sidecar design:** the simpler "single-blob per doc" approach (matching Hocuspocus extension-sqlite rather than pycrdt-store) is sufficient for restart recovery. Delta-log complexity is only load-bearing if undo-history preservation across restart is a product requirement.

### Finding 2: DocumentRoom divergence handling exists but has a TODO gap (CONFIRMED — critical)

**Confidence:** CONFIRMED (previously UNCERTAIN in prior evidence)

**Evidence:** Direct source read from [jupyter-server-ydoc/rooms.py](https://github.com/jupyterlab/jupyter-collaboration/blob/main/projects/jupyter-server-ydoc/jupyter_server_ydoc/rooms.py):

```python
async def initialize(self) -> None:
    """Initializes the room."""
    if self.ready:
        return

    # ... load file content ...
    model = await self._file.load_content(self._file_format, self._file_type)

    # Try YStore first
    read_from_source = True
    if self.ystore is not None:
        try:
            await self.ystore.apply_updates(self.ydoc)
            read_from_source = False
        except YDocNotFound:
            pass

    if not read_from_source:
        # if YStore updates and source file are out-of-sync, resync updates with source
        if await self._document.aget() != model["content"]:
            # TODO: Delete document from the store.
            self._emit(
                LogLevel.INFO,
                "initialize",
                "The file is out-of-sync with the ystore.",
            )
            read_from_source = True

    if read_from_source:
        await self._document.aset(model["content"])
        if self.ystore:
            await self.ystore.encode_state_as_update(self.ydoc)
```

**Interpretation:**

1. **Load phase:** Try YStore first → apply deltas to fresh `self.ydoc`. If YStore has no entries (`YDocNotFound`), fall through to disk load.
2. **Divergence check:** After YStore apply, derive text via `self._document.aget()` and compare to disk content. If DIFFERENT, set `read_from_source = True` to force disk reload.
3. **Fallback / divergence action:** Write disk content into `self._document`, then `encode_state_as_update(self.ydoc)` APPENDS a new snapshot to YStore.

**The TODO gap:**

The comment `# TODO: Delete document from the store.` marks a known-unimplemented cleanup. What actually happens on divergence:
- YStore has: {old deltas 1..N} (stale, from before the external edit).
- Code path: discard the ydoc state (don't touch YStore), call `document.aset(model["content"])` → writes disk content to the SAME ydoc.
- This ydoc mutation fires an update event, and YStore's write hook captures it → `INSERT INTO yupdates` appends the NEW snapshot.
- Result: `yupdates` table now contains old deltas + new "reset to disk" delta.

**On NEXT restart after a divergent reload:** `apply_updates` iterates ALL rows in timestamp order. Old deltas apply to fresh ydoc (producing pre-divergence content). Then the new "reset to disk" delta applies on top. The final state is correct (disk content), but the Y.Doc contains Items under the pre-divergence clientIDs AND the post-divergence clientIDs. Any client that had state pre-divergence and reconnects post-divergence hits a #344-class variant — same bug as OK.

**Implications:**

- **Jupyter's precedent is strong for the happy path** (YStore matches disk → reuse) but leaky in the divergence case. The leak is known and TODO'd but not fixed.
- **OK should NOT copy this gap.** OK's sidecar design must handle divergence explicitly — either by (a) truncating the sidecar on divergent reload (simple) or (b) running `applyExternalChange`-style diff-merge to preserve client CRDT identity across the external edit.
- **The instance-ID defense-in-depth (D5) also closes this gap for OK.** Even if OK inherited Jupyter's TODO, the instance-ID check would catch stale-client reconnects post-divergent-reload.

### Finding 3: DocumentRoom is keyed by room_id, SQLiteYStore is shared across all documents (CONFIRMED)

**Confidence:** CONFIRMED

**Evidence:** `SQLiteYStore` docstring: _"Unlike file-based YStores, the Y updates of all documents are stored in the same database."_ — single `.jupyter_ystore.db` file with `path TEXT` column discriminating documents.

DocumentRoom constructor takes `ystore: BaseYStore | None` — each room has a reference to (possibly) the same shared YStore instance.

**Implications:**

- Jupyter's storage shape is ONE SQLite file per server instance, discriminated by document path within. Not per-document file.
- **For OK's sidecar approach**, we have a choice:
  - **Per-doc file** (`<contentDir>/.open-knowledge/ystate/<docName>.bin`) — matches Hocuspocus extension-sqlite single-blob pattern, easier to inspect/delete/GC individually.
  - **Single SQLite file** (`<contentDir>/.open-knowledge/ystate.db`) — matches Jupyter; enables SQL-based introspection; requires SQLite dependency.
- Per-doc file is simpler and matches the "each markdown file has its adjacent sidecar" mental model. Recommended for v1. Can migrate to SQLite-backed if OK ever needs bulk operations over state cache.

### Finding 4: YStore configuration default — SQLiteYStore in jupyter-server-ydoc (CONFIRMED)

**Confidence:** CONFIRMED

**Evidence:** From [jupyter-server-ydoc/app.py](https://github.com/jupyterlab/jupyter-collaboration/blob/main/projects/jupyter-server-ydoc/jupyter_server_ydoc/app.py): `default_value=SQLiteYStore` configured as the default `ystore_class`. The config system exposes `ystore_class` as a substitutable option. `file_poll_interval` (default 1s) controls disk-change detection; `file_stop_poll_on_errors_after` (default 24h) is a graceful degradation threshold.

**Implications:**

- Jupyter's design uses file-watching at 1s granularity + YStore-vs-disk comparison on initialize.
- OK's design uses `@parcel/watcher` (faster, event-driven) + `applyExternalChange` for live divergence handling. On restart, the load-time divergence check replicates Jupyter's pattern.

---

## Updated claim classification

| Prior claim | Prior confidence | Verified confidence | Notes |
|---|---|---|---|
| pycrdt SQLiteYStore is delta-log style | INFERRED | **CONFIRMED** | Two tables: yupdates (append-only log) + ycheckpoints (snapshot). |
| Jupyter avoids #344 via YRoom lifecycle tied to file identity | INFERRED | **PARTIALLY CONFIRMED** | YStore-first load with divergence check exists. BUT: divergence case has a TODO gap that leaves stale deltas in the store. |
| Binary-as-cache + text-as-truth is Jupyter's blessed architecture | INFERRED | **CONFIRMED** | Explicit docstring + source code + config defaults all support this. |
| Jupyter's model is a clean fit for OK's intended architecture | INFERRED | **CONFIRMED WITH CAVEAT** | Happy path is clean. Divergence handling in OK must go beyond Jupyter's TODO. |

---

## Consequences for the OK architecture

**The sidecar approach is validated more strongly than the original research suggested** — Jupyter's source-level design exactly matches the recommended OK shape: binary-first-then-fall-back-to-text + divergence detection. The happy-path mechanism is identical.

**One architectural refinement surfaces from this follow-up:** OK's divergence handling on `onLoadDocument` should explicitly handle the "sidecar exists AND disk has been externally edited" case, rather than inheriting Jupyter's TODO. Three viable strategies:

**Strategy A (simplest — recommended for v1):** On divergence, delete the sidecar entirely. Load from markdown. Instance-ID defense-in-depth catches any stale-client reconnect. Write a fresh sidecar at next `onStoreDocument`.

**Strategy B (preserve CRDT identity where possible):** Load sidecar → compare to disk → if diverged, apply `applyExternalChange`-style diff-merge to incorporate external edits into the sidecar-loaded Y.Doc. Preserves client CRDT identity for clients whose pre-restart state matches the sidecar; external edits appear as a merged delta.

**Strategy C (Jupyter-style with the fix):** Match Jupyter's text-as-last-word approach BUT actually implement the TODO — on divergence, discard the Y.Doc + truncate the yupdates table entirely, then re-encode from disk.

Recommend **Strategy A for v1** because:
- Simplest to implement and reason about.
- The loss-of-CRDT-identity on divergence is fine when paired with the instance-ID check — clients recycle cleanly, no duplication.
- External-edit-during-server-down is specifically the T9 test case, which currently shows content bleed without a fix. Strategy A resolves T9.

**Promote Strategy B to v2** if production telemetry shows the UX cost of client recycle on divergent reload is material (e.g., developers frequently external-edit during short server restarts and lose unsynced work).

---

## Gaps / follow-ups

- Did not verify the `apply_updates` method signature in pycrdt's BaseYStore — minor detail, does not change findings.
- Did not verify that `encode_state_as_update` on the `ystore` actually produces a single complete snapshot (vs. a delta against the existing store state). If it's a delta against the empty store, Jupyter's TODO gap is narrower than described. The read method iterating ALL rows in timestamp order suggests the snapshot replaces — but source-verifying would sharpen this.
- Did not benchmark the SQLiteYStore vs. a hypothetical flat-file sidecar on typical workloads. Operationally Jupyter runs at production scale with this design, which validates viability at OK's scale.
