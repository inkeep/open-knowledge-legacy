# Rejected alternatives

Evaluated and rejected during the 2026-04-14 ship's post-hardening `/debug` + `/research` sessions. Recorded here to prevent re-litigation.

## Option E — Observer B remote-reconcile (tactical)

**What.** Relax `observers.ts:608` `!transaction.local` guard. On remote Y.Text change, schedule a deferred `runObserverBSync` check. If post-grace-window `ytext.toString() !== serialize(fragment)`, rebuild XmlFragment from Y.Text via `updateYFragment`.

**Why rejected.** Does not prevent the race. Once Y.Text has duplicates from multi-writer Observer A race, Observer B would rebuild XmlFragment *from* the duplicated Y.Text. Bridge invariant would hold with duplicates on both sides — wrong content, silently preserved. Green CI, broken product. Exactly the "fragile test harness" anti-pattern the user asked to flag.

## Option A — Awareness-based leader election

**What.** Use Yjs awareness to elect one client (smallest clientID) as the sole Observer A writer. Other clients' Observer A becomes no-op on write side. On disconnect, next-lowest clientID takes over.

**Why rejected.** Research (conducted during 2026-04-14 ship post-hardening `/research` pass) surfaced three blockers:
1. **Awareness is gossip-based, not consensus-based.** Under network partition, two partitions each elect their own leader (smallest clientID in each partition). When partitions heal, BOTH "leaders" have written concurrently → same race returns.
2. **30-second disconnect detection window.** Without explicit disconnect (crash case), peers wait 30s before removing awareness entries. During the gap, no Y.Text writes → bridge-invariant-violated until timeout.
3. **No prior art in the Yjs ecosystem.** The Y.js community's canonical recommendation for write coordination is "server-enforced locks via backend" (direct quote from multiple GitHub discussions and Y.js docs). Awareness is for presence UI, not exclusive-write enforcement.

## Option C — Stable per-paragraph IDs in Y.Text

**What.** Give each paragraph a stable ID; Y.Text stores `<id>text</id>` segments. Observer A updates per-paragraph by ID match, never "append at end." Concurrent inserts of *different* paragraphs produce non-overlapping Y.Text ranges → no interleave.

**Why rejected.** Two sub-issues:
1. **Scan + insert is not atomic.** Two clients both scan for a paragraph ID's absence, both decide to insert. Race persists at the position-check layer even if the write layer is non-overlapping.
2. **Incompatible with CodeMirror source-mode UX.** ID cruft `<id>...</id>` in raw markdown is visible to users when they switch to source mode. Regressing product UX.

## Option 2 — Replace Y.Text with Y.Map

**What.** Store paragraphs as `Y.Map('paragraphs')` keyed by stable paragraph ID, value = paragraph text. Y.Map is LWW-per-key natively; concurrent writes to same key resolve by CRDT timestamp.

**Why rejected.** Loses character-level CRDT co-editing in source mode. Today, two users typing in the same paragraph in source mode merge character-by-character (Y.Text RGA). Under Y.Map, the same edit pattern LWW-clobbers (last-writer-wins at the key level). Product regression. Also requires a custom Y.Map↔CodeMirror binding (no existing library); 1-2 weeks engineering.

## Option "last-write-wins at Y.Text CRDT primitive layer"

**What.** Each Observer A write replaces entire Y.Text content (`ytext.delete(0, len); ytext.insert(0, canonicalFullContent)`) under a CRDT-stable version-stamped origin. Non-stale writes are dropped by a garbage-collection pass.

**Why rejected.** Y.Text is a **sequence CRDT (RGA)**, not a register CRDT (LWW-Register). Two concurrent "delete-all + insert-canonical" operations do NOT resolve to one winner — they produce character-level interleave at the CRDT protocol layer. I verified this during the `/debug` pass: changing Observer A to "full replace" makes the race *worse* — concurrent identical writes interleave into duplicate-character soup (`"hheelllloo"` instead of `"hello"`).

There is no Y.Text primitive for "skip this operation if version is stale." Any garbage-collection-post-hoc approach requires a custom CRDT layer on top of Y.Text. Out of scope; the server-authoritative design achieves the same semantic (LWW at server) without needing a custom CRDT.

## Option B — Server-authoritative Observer A only (WYSIWYG side)

**What.** Server owns Observer A (XmlFragment → Y.Text). Client Observer A writes become no-op. Client Observer B unchanged.

**Why not chosen (superseded by full symmetric design).** Fixes only Case 1 (concurrent WYSIWYG writers). Leaves Case 2 (concurrent source-mode writers) structurally broken. User directive during 2026-04-14 ship: "research more and also think through the test plan so we can have coverage for this class of concurrent writers on either side" led to full symmetric server-authoritative design (SPEC §7a — both observers on server).

## Option I — Awareness-based source-mode exclusivity (UX-mode-locking)

**What.** "One user in source mode at a time." Others see a lock indicator and remain in WYSIWYG. Source mode is not a concurrent-edit surface.

**Why deferred, not rejected.** `reports/source-toggle-architecture/` evaluates this as the canonical industry pattern. It is the only design that avoids the concurrent-mode problem at the product layer rather than the architecture layer. However:
1. It changes user-facing UX (visible mode-lock indicator, "unlock"/"steal" flow).
2. It is orthogonal to the server-authoritative architecture fix — they can coexist.

Deferred to post-V0 as a product decision. Server-authoritative (invisible to users) lands first.

## Option — Dual-CRDT elimination (Y.js 14 unified YType)

**What.** Eliminate Y.XmlFragment+Y.Text split. Single unified YType with dual bindings (TipTap and CodeMirror).

**Why deferred.** `reports/peritext-on-yjs-feasibility/`: Yjs 14 unified YType exists only in pre-release. Not yet compatible with TipTap/Hocuspocus pinned versions. Multi-week ecosystem-wait + migration. Tracked as long-term future work in `projects/v0-launch/PROJECT.md`. Server-authoritative is the correct short-term answer; unified YType is the correct long-term answer.

## Option 8 — Server-side post-merge reconciliation (reactive, not preventive)

**What.** Keep client observers writing the derived CRDT exactly as they do today. Server runs a reconciliation pass after CRDT sync settles: if `serialize(XmlFragment) !== ytext.toString()`, server performs a corrective transaction. This is the same pattern as `applyExternalChange` + `reconcile()` for file-watcher divergence — apply to observer-bridge divergence instead.

**Why rejected.** Three compounding reasons:

1. **User-visible corruption window.** Reconciliation detects divergence AFTER it has propagated to clients. Between the race producing duplication and the server's corrective write propagating back, users see RGA-interleave in the editor — "hheelllloo" or duplicated paragraphs. For a prose editor, visible broken-typing is disqualifying even if transient (50-150ms window). The race rate is 2-4% in the fuzzer; in production user sessions with concurrent editors, this would produce visible artifacts at a rate users would notice and report.

2. **Heuristic detection is non-trivial.** "Y.Text contains content not in serialize(XmlFragment)" could be (a) RGA-interleave from a race (detect and fix), (b) legitimate client source-mode edit that hasn't been reconciled yet (don't touch), or (c) transient state during normal CRDT propagation. Distinguishing these requires timing windows and state tracking that's itself a source of bugs.

3. **Corrective-write cascade risk.** The corrective write lands under some origin. If that origin triggers client Observer A reactions, we're back in the multi-writer race. Adding a new "reconciliation origin" that's guarded against adds complexity without eliminating the underlying race (just moves where it's fought).

**Why the file-watcher precedent doesn't transfer.** `applyExternalChange`-style reconciliation works for file-watcher because (a) disk changes are unambiguous sources of truth (no question of "whose edit wins"), (b) the correction is bounded and directional (disk → CRDT), and (c) the user already expects file-watcher changes to appear. Observer-bridge divergence is ambiguous in source of truth and bidirectional in correction needs; the file-watcher pattern doesn't map cleanly.

**Why it was tempting.** Simpler rollout (no mode coordination, no client changes). Faster to implement (~1 day vs. 3-4 days for server-authoritative). Would close the 2-4% fuzzer flake.

**Why we chose server-authoritative over Option 8 despite the cost difference.** Under greenfield principles, architectural correctness beats expediency. Server-authoritative solves the race structurally (single-writer-by-design) rather than reactively (detect-and-correct). Reactive approaches compound costs over time: heuristic detection needs ongoing tuning, corrective cascades introduce new failure modes, and user-visible corruption even briefly erodes product trust. For a prose editor where typing is the primary interaction, we can't ship a known-visible-corruption design.

**When would this be the right choice?** Not for this product. Potentially for a non-real-time collaborative text tool where brief correction windows are acceptable (e.g., a document-review tool where only finalizers see diffs, or a batch-processing pipeline). Not our case.

## Summary ranking

| Option | Fixes WYSIWYG race? | Fixes source-mode race? | Preserves bidirectional API? | Preserves char-level co-edit? | User-visible defects? | Effort | Chosen? |
|---|---|---|---|---|---|---|---|
| E (remote-reconcile at Observer B) | ✗ (propagates dupes) | ✗ | ✓ | ✓ | ✓ (dupes on both sides) | S | No |
| A (awareness leader election) | ✗ (gossip ≠ consensus) | ✗ | ✓ | ✓ | ✓ (partition-split) | M | No |
| C (per-paragraph IDs in Y.Text) | ✗ (scan-insert not atomic) | ✗ | ✓ | ✓ | ✓ (ID cruft in source) | L | No |
| 2 (Y.Text → Y.Map) | ✓ | ✓ | ✗ | ✗ (LWW-clobbers char edits) | ✓ (source-mode regression) | L | No |
| LWW at Y.Text CRDT primitive | ✗ (no primitive) | ✗ | ✓ | ✓ | N/A | unknown | No |
| B (server-only Observer A) | ✓ | ✗ | ✓ | ✓ | ✓ (source-side race) | M | Superseded |
| 8 (server-side reconciliation) | ✓ (after window) | ✓ (after window) | ✓ | ✓ | ✓ (visible corruption window) | S (~1d) | No |
| **Server-authoritative (full, this spec)** | **✓** | **✓** | **✓** | **✓** | **✗** | **M (3-4 days)** | **Yes** |
| I (UX mode-lock — Option I from source-toggle report) | ✓ | ✓ | ✓ | N/A (one-at-a-time) | ✗ | M | Deferred to post-V0 |
| Unified YType (Yjs 14) | ✓ | ✓ | ✓ | ✓ | ✗ | XL (multi-week) | Long-term |
