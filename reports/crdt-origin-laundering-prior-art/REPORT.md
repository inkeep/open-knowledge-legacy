# CRDT Origin-Laundering: Prior Art and Ecosystem Survey

**Status:** Final
**Date:** 2026-04-13
**Author:** Claude (research subagent ensemble)
**Framing:** 3P external survey — how other CRDT collaborative editors handle (or avoid) the problem where a sync/bridge layer overwrites CRDT Items during reconciliation, breaking per-origin UndoManager tracking.

---

## Executive summary

**"Origin-laundering"** is the pattern where a sync bridge reads content under one transaction origin and re-emits it under another, making the new CRDT Items invisible to a per-origin UndoManager. Undo can then restore the ORIGINAL items (now tombstoned) but cannot touch the REPLACEMENT items — producing "zombie content" in the live document.

**The core finding:** **This problem is Yjs-shaped.** It arises from Yjs's choice to put origin on the transaction (transient annotation not persisted to CRDT wire format) rather than on the character/op itself. Automerge and academic RGA-undo literature put the actor on the character, which makes the problem disappear structurally.

**No surveyed editor has our exact architecture** (two first-class Y types bound to two editing surfaces with bidirectional observers). Every other Yjs editor uses ONE primary Y type. So the zombie-content pattern as we see it is architecturally unique to Open Knowledge.

**The closest prior art is BlockSuite.** They use `{proxy: true}` as an object origin to distinguish internal mirror writes from user writes. This is structurally aligned with our `'sync-from-tree'` origin convention — but doesn't fix our sharper problem where mirror writes overlay previously-tracked Items in the same Y type.

**Our proposed fix** (content-comparison gate + character-level diff in Observer A) **has no direct precedent** in academic or engineering literature. The closest analogs are:
- **y-prosemirror's structural diff** (`updateYFragment`) — preserves Items in untouched subtrees by not mutating them. Same *principle* (skip unnecessary mutation), different *mechanism* (tree-tree structural walk vs. string-string content comparison).
- **automerge-prosemirror's `prosemirror-changeset` reconciliation** — compares PM output vs. AM normalization after-the-fact. Structural analog but applied for a different purpose (normalization self-check).

**Three patterns our work would name for the first time:**
1. Content-comparison gate before CRDT delete+insert
2. Character-level diff as an Item-preservation lever in serialize→diff→apply bridges
3. Origin-aware reconciliation at the bridge layer (vs. ingress filter)

---

## Research rubric

| ID | Dimension | Status |
|---|---|---|
| D1 | y-prosemirror `updateYFragment` internals | ✅ Evidence: `d1-y-prosemirror-updateyfragment.md` |
| D2 | Yjs ecosystem (BlockNote, Milkdown, Plate, BlockSuite, slate-yjs) sync patterns | ✅ Evidence: `d2-yjs-ecosystem-sync-patterns.md` |
| D3 | Yjs UndoManager internals — any built-in mechanism? | ✅ Evidence: `d3-yjs-undomanager-internals.md` |
| D4 | Automerge-ProseMirror — equivalent problem and how it's handled | ✅ Evidence: `d4-automerge-prosemirror.md` |
| D5 | Academic + engineering literature on undo in the presence of sync bridges | ✅ Evidence: `d5-literature-and-engineering-blogs.md` |
| D6 | Named-pattern audit: are our proposed patterns documented elsewhere? | ✅ Covered in `d5-literature-and-engineering-blogs.md` Finding 6 |

---

## Key findings by dimension

### D1: y-prosemirror does structural diff, not serialize→diff→apply

`updateYFragment` walks tree-to-tree via prefix/suffix skip + per-Item equality + recursive subtree diff. Critical behaviors:

1. **Equal subtrees: zero Item mutations.** When `equalYTypePNode` matches a prefix/suffix pair, only the mapping updates — no Y-type mutation. Original Items (with original `client`/`clock`) stay.
2. **Surgical text diff.** `updateYText` uses `simpleDiff` on Y.XmlText string form, emits `delete+insert` for only the CHANGED characters. Surrounding characters AND the text container are preserved.
3. **Explicit minimal-mutation principle.** Code comment at `sync-plugin.js:1283-1285` references [y-prosemirror#108](https://github.com/yjs/y-prosemirror/issues/108): *"Only delete the content of the Y.Text to retain remote changes on the same Y.Text object"* — documented policy to avoid clobbering remote writers.
4. **New bytes get `ySyncPluginKey` origin.** No attempt to re-emit under the original writer's clientID.

**Takeaway:** y-prosemirror's origin preservation is STRUCTURAL, not origin-tag-based. Items survive because they aren't touched, not because origin is preserved through re-emission.

**Transferable principle:** Minimal-mutation + prefix/suffix skip + per-unit equality gate. Our `applyByPrefixSuffix` already captures prefix/suffix skipping; the proposed content-comparison gate is analogous to `equalYTypePNode`.

### D2: No other Yjs editor has our architecture; BlockSuite is the closest

| Editor | Primary Y type | Secondary Y type? | Origin-laundering risk |
|---|---|---|---|
| y-prosemirror | Y.XmlFragment | — | LOW (structural diff) |
| slate-yjs | Y.Text + Y.Array | — | NONE (ops-based) |
| BlockNote, Milkdown | Y.XmlFragment (via PM) | — | LOW (inherits y-prosemirror) |
| Plate | Y.Text + Y.Array (via Slate) | — | NONE (inherits slate-yjs) |
| BlockSuite | Y.Map / Y.Array (block tree) | Proxy mirror to typed state | MEDIUM (mitigated by `{proxy:true}`) |
| **Open Knowledge** | **Y.XmlFragment + Y.Text** (both first-class) | **—** | **HIGH — active spec target** |

**BlockSuite's pattern:** UndoManager's `trackedOrigins` check matches `tr.origin.constructor`. By passing a plain object `{proxy: true}` as origin, reactive-mirror writes are automatically filtered out. Mirrors: `base-reactive-data.ts:9-40`, `history-extension.ts:22-24`, `store.ts:371-384`.

**Why this pattern doesn't solve our problem:** BlockSuite's mirror writes to a DIFFERENT Y type that user undo isn't tracking at all. Our mirror writes to Y.Text, which IS the source-mode user's undo target. The mirror OVERLAYS user Items — we already don't track it, but that's exactly what creates the zombie pattern.

**slate-yjs is the gold standard but unreachable for us.** Their ops-based translation (Slate op → Y-op) bypasses the whole serialize→diff→apply cycle. Our upstream is PM/TipTap transactions, not direct Slate ops.

**Architectural observation:** The ecosystem's implicit design convention is **"don't maintain two first-class Y types."** The reason origin-laundering doesn't appear in most issue trackers is that the community avoids the problem by not having two Y types bound to two editors. Our dual-representation model is an intentional product choice (source mode ↔ WYSIWYG parity), so we own the bridge complexity.

### D3: Yjs UndoManager has NO built-in mechanism for this problem

From `node_modules/yjs/src/utils/UndoManager.js` traced line-by-line:

1. **Configuration surface is exactly 6 options.** `captureTimeout`, `captureTransaction`, `deleteFilter`, `trackedOrigins`, `ignoreRemoteMapChanges`, `doc`. No other hooks.
2. **Untracked-origin transactions are dropped ENTIRELY.** No StackItem, no bookkeeping, no `keepItem`. Items from non-tracked origins are INVISIBLE to the UM.
3. **StackItem contains only insertions+deletions — no cross-reference protection.**
4. **undo() can't reach zombie content by construction.** Zombie Items were never captured → UM has no record → silent no-op.
5. **`parentSub` branch protection only covers Y.Map/Y.Xml attrs, NOT Y.Text/Y.XmlFragment content.** Our problem domain is exactly the unprotected branch.
6. **dmonad's explicit position (author of Yjs):** application-layer responsibility. Canonical recommendation across [yjs#157](https://github.com/yjs/yjs/issues/157), [#273](https://github.com/yjs/yjs/issues/273), [#624](https://github.com/yjs/yjs/issues/624): *"use the transaction origin to selectively capture operations"* and propagate original origins through bridges.
7. **`deleteFilter` and `captureTransaction` don't help.** They can't retroactively evict a prior StackItem when a later tx overlays it.

**dmonad's three recommended approaches:**
1. Bridge propagates the original origin (requires per-character attribution — we don't have)
2. Pre-undo reconciliation in `stack-item-popped` / `stack-item-added` listener (undo-layer)
3. Add bridge origin to `trackedOrigins` (would incorrectly reverse user typing that flowed through the bridge — not viable for us)

**Our content-comparison approach is equivalent to #2 but at the sync-layer** — preventing the delete+reinsert when content matches preserves original Items, so UM's StackItem still references live Items.

### D4: Automerge-ProseMirror sidesteps the problem via architectural placement

**Automerge has no `trackedOrigins` equivalent.** Granularity options are:
- Actor ID (per-session, on every change — stored on the CRDT, not transient)
- Change metadata (message, time)

**Undo is delegated to `prosemirror-history`** — a client-local PM plugin, not a CRDT-layer mechanism. [automerge-prosemirror#19](https://github.com/automerge/automerge-prosemirror/issues/19) documents the EXACT structural dual of our problem: *"It would be nice to mark transactions created by incoming patches with `tx.setMeta('addToHistory', false)` so that only local changes are added to the history stack."* Resolution: fix lives entirely in PM's `history` plugin, not Automerge's.

**Why our problem is SHARPER:**
1. We run undo on the CRDT layer itself (Yjs UndoManager on Y.Text)
2. Sync updates arrive origin-less at the CRDT layer
3. Two first-class Y types force the mirror to write to the SAME Y type that undo tracks

Automerge-prosemirror sidesteps all three by putting undo upstream of the sync boundary.

**Structural insight:** In Automerge, "who wrote this" is a property of the STORAGE layer. In Yjs, it's a property of HOW IT ARRIVED. Origin-laundering is a Yjs-shaped problem by design.

### D5: Academic literature uses the Automerge model; engineering-blog literature sidesteps entirely

- **Peritext:** Formatting intent preservation, NOT author attribution. Not applicable.
- **Yi/Imine/Ignat (2015)**, "A CRDT Supporting Selective Undo for Collaborative Text Editing": extends RGA with per-character undo counter. Stores actor ON THE CHARACTER — the Automerge model. Closer to per-origin undo than Yjs's `trackedOrigins`, which treats origin as a property of the TRANSACTION.
- **Figma:** Client-local undo buffers, last-writer-wins. Deleted properties stored in the DELETING client's undo buffer, not on the server. Sidesteps origin-laundering by making undo a pure client-side restore-from-buffer operation.
- **Linear:** SyncAction model, not CRDT-based. Action-inverse replay.
- **Notion, Contentsquare:** No relevant authoritative writeup.

### D6: Named-pattern audit — all three candidates are UNCLAIMED

| Pattern | Documented elsewhere? | Closest prior art |
|---|---|---|
| Content-comparison gate before delete+insert in CRDT bridges | NO | automerge-prosemirror `prosemirror-changeset` reconciliation (different purpose: normalization self-check) |
| Character-level diff preserves more Items than line-level | NO | Inferred from Yjs INTERNALS (single-char inserts merge into one Item) |
| Origin-aware reconciliation at the BRIDGE layer (vs. ingress filter) | NO | Yjs `trackedOrigins` (ingress filter); [automerge-prosemirror#19](https://github.com/automerge/automerge-prosemirror/issues/19) `addToHistory: false` (one-bit workaround) |

---

## Implications for the Observer A origin-aware diff spec

### Validates the approach

1. **Content-comparison is the right layer.** Yjs community consensus (dmonad + issue history): application-layer. Our approach aligns with that.
2. **y-prosemirror proves the principle.** Minimal-mutation + prefix/suffix skip is the dominant pattern in the strongest comparable library. Our `applyByPrefixSuffix` already follows this; the proposed content-gate and char-level diff are extensions of the same principle.
3. **Character-level diff for the diverged path (Path B) aligns with y-prosemirror's surgical `updateYText`.** We're not inventing a new granularity — we're matching the standard.

### Flags alternatives to acknowledge (but not adopt)

4. **Origin-propagation (dmonad option #1) is cleaner but requires per-character attribution.** If Observer A could re-emit agent writes under `'agent-write'` origin, UM would capture replacement Items correctly. We don't have per-character attribution, so this requires either XmlFragment event-driven sync (NG4 in spec) or a custom attribution layer — both higher complexity for marginal gain over content-gate.
5. **Ops-based translation (slate-yjs model) is the gold standard.** Rewriting Observer A as PM step → Y.Text op translator would eliminate the problem structurally. Bigger architectural shift than either current spec approach OR NG4. Out of scope.

### Flags sharp edges

6. **BlockSuite's object-origin pattern doesn't solve our problem.** Their mirror writes to a different Y type; ours writes to the same Y type that source-mode undo tracks. Just using a distinctive origin isn't enough — we need to NOT replace Items with matching content in the first place.
7. **dmonad option #3 (add bridge origin to `trackedOrigins`) is explicitly not viable.** Would incorrectly reverse user typing that flowed through Observer A.
8. **Our problem is Yjs-shaped and architecture-unique.** We won't find a direct prior-art fix; we are naming patterns for the first time. This is a novelty claim worth articulating (see AGENTS.md precedents).

### Updates to SPEC.md OQ-1, OQ-2

- **OQ-1 (`diff_cleanupSemantic` vs `diff_cleanupEfficiency` for char-level):** y-prosemirror uses `simpleDiff` (no cleanup pass) in `updateYText`. For same-line collision scenarios, `diff_cleanupSemantic` is likely the closer match to their behavior. Empirical test still required but we have a default direction.
- **OQ-2 (exact-character overlap merge semantics):** No clear ecosystem precedent. y-prosemirror accepts that touched characters get `ySyncPluginKey` origin (attribution loss for those chars). Automerge punts to PM history. Our char-level diff narrows the blast radius but doesn't eliminate it at the exact-overlap case. Acceptable given no one else solves it either.

---

## Related reports (internal)

- `reports/peritext-on-yjs-feasibility/REPORT.md` — Peritext on Yjs feasibility (confirms Peritext = formatting intent, not attribution)
- `reports/crdt-observer-bridge-latency-analysis/REPORT.md` — Observer bridge latency (performance context for char-level diff decision)

---

## Open questions / follow-ups

1. **Could a custom per-character attribution layer on top of Y.Text enable origin-propagation (dmonad option #1)?** Would sidestep content-gate heuristics entirely. Bigger project. Not urgent.
2. **Does BlockSuite have internal issue discussions on Item overlap at proxy writes?** Quick scan didn't find one; full scan not done.
3. **Is there published work on CRDT sync-bridge design patterns that I missed?** Search was thorough but not exhaustive. If someone publishes "content-comparison gate" as a named pattern in the next 6 months, check for prior art before we claim novelty.

---

## Sources index

See per-dimension evidence files in `./evidence/`. Top-cited external:
- [yjs source on GitHub](https://github.com/yjs/yjs)
- [y-prosemirror source](https://github.com/yjs/y-prosemirror)
- [automerge-prosemirror](https://github.com/automerge/automerge-prosemirror) + [issue #19](https://github.com/automerge/automerge-prosemirror/issues/19)
- [BlockSuite](https://github.com/toeverything/blocksuite)
- [slate-yjs](https://github.com/bitphinix/slate-yjs)
- [Peritext — Ink & Switch](https://www.inkandswitch.com/peritext/)
- [Yi et al. 2015 selective undo for RGA](https://members.loria.fr/CIgnat/files/pdf/YuDAIS15.pdf)
- [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Yjs #273](https://github.com/yjs/yjs/issues/273), [#157](https://github.com/yjs/yjs/issues/157), [#624](https://github.com/yjs/yjs/issues/624), [#699](https://github.com/yjs/yjs/issues/699), [#736](https://github.com/yjs/yjs/issues/736)
