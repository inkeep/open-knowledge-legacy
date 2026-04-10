# Logseq — Datascript Graph DB & Backlink Source Code Evidence

## Datascript Schema

### Core linking attribute: `:block/refs`
**File:** `deps/db/src/logseq/db/frontend/schema.cljs:56-108`

```clojure
:block/refs   {:db/valueType :db.type/ref, :db/cardinality :db.cardinality/many}
:block/page   {:db/valueType :db.type/ref, :db/index true}
:block/parent {:db/valueType :db.type/ref, :db/index true}
:block/tags   {:db/valueType :db.type/ref, :db/cardinality :db.cardinality/many}
:block/link   {:db/valueType :db.type/ref, :db/index true}
:block/alias  {:db/valueType :db.type/ref, :db/cardinality :db.cardinality/many, :db/index true}
```

`:block/refs` at line 71 — `db.type/ref` with `db.cardinality/many`. Datascript automatically maintains a VAET reverse index for ref-type attributes, accessible via `:block/_refs`.

## Backlink Query Mechanism

### Primary: Datascript reverse refs (`:block/_refs`)
**File:** `deps/db/src/logseq/db/common/reference.cljs:247-292`
```clojure
;; get-linked-references — primary backlink API
;; Line 261:
(mapcat (fn [pid] (:block/_refs (d/entity db pid))) ids)
```

### Batch: `get-block-refs` with alias resolution
**File:** `deps/db/src/logseq/db/common/initial_data.cljs:179-191`
- Resolves aliases first, then collects `(:block/_refs entity)` across all alias ids

### Datalog queries for graph view
**File:** `deps/db/src/logseq/db.cljs:716-729`
```clojure
;; get-pages-relation — full page-to-page reference graph
[:find ?p ?ref-page
 :where
 [?block :block/page ?p]
 [?block :block/refs ?ref-page]]
```

### Unlinked references (text-based search)
**File:** `deps/db/src/logseq/db/common/reference.cljs:294-311`
- `get-unlinked-references` scans `:block/title` via AVET index for substring matches NOT in `:block/refs`

### Reactive query invalidation
**File:** `src/main/frontend/worker/react.cljs:41-46`
- `get-affected-queries-keys` filters transaction datoms for `:block/refs` changes, emits `[::refs ref-id]` keys

## Ref Computation (Link Storage)

### `db-rebuild-block-refs` — computes full ref set from 5 sources
**File:** `deps/outliner/src/logseq/outliner/pipeline.cljs:94-133`
- Sources: content refs (UUIDs), tag refs, link refs, property key refs, property value refs
- Deduplicates and removes self-refs

### Content ref pattern: `[[uuid]]`
**File:** `deps/db/src/logseq/db/frontend/content.cljs:10-17`
```clojure
;; id-ref-pattern regex extracts UUID references from block content
```

## Index Building

### Incremental: per-transaction ref recomputation
**File:** `src/main/frontend/worker/pipeline.cljs:480-523`
- `transact-pipeline` calls `rebuild-block-refs` on each transaction
- Computes old vs new ref sets → `:db/add` / `:db/retract` datoms

**File:** `src/main/frontend/worker/pipeline.cljs:37-61`
```clojure
;; rebuild-block-refs: computes old vs new ref sets
;; produces incremental :db/add / :db/retract operations
```

### Batch: new graph / import
**File:** `deps/outliner/src/logseq/outliner/pipeline.cljs:146-153`
- `transact-new-db-graph-refs` iterates all blocks and computes refs in one batch

### Deletion cleanup
**File:** `deps/db/src/logseq/db/common/delete_blocks.cljs:24-46`
- `build-retracted-tx` finds all referencing blocks via `:block/_refs`, retracts ref datoms, replaces embedded references in title text

## Advanced Features

### Linked reference filtering with effective-refs tree walk
**File:** `deps/db/src/logseq/db/common/reference.cljs:80-93`
- `effective-refs-fn` computes `effective-refs(eid) = own-refs(eid) UNION effective-refs(parent(eid))` with memoization

**File:** `deps/db/src/logseq/db/common/reference.cljs:95-119`
- `allowed-subtree-refs-fn` prunes branches under excluded refs
