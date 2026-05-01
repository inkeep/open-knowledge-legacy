---
date: 2026-04-30
reviewer: senior-engineer-cold-read
spec: specs/2026-04-30-realtime-frontmatter-entries/SPEC.md
baseline-commit: c1c76cb7
---

# Design challenge — Realtime frontmatter entries

Cold read of the spec by an engineer who has not been in the iterative loop. Findings are organized by the prompts the user explicitly asked about (1–10), with severity, evidence, and a recommendation each.

Severity legend:
- **HIGH** — landing as-is is likely to ship a regression or burn the team's time mid-implementation.
- **MED** — defensible decision, but the spec's framing under-states the risk; surface to user judgment.
- **LOW** — tooth-pick; flag and move on.

---

## 1) D8 / D9 / D10 — full Y.Map elimination + Observer Meta deletion + L3 deletion

### Severity: HIGH (one specific gap)

The aggregate decision (rip ~7 files, eliminate per-key store, delete L3) is consistent and the LOC math holds. But there is a **circularity bug in the assumption chain that catches malformed YAML**, and it survives into the SPEC body unflagged.

**Evidence — the circularity:**
- D21 (error envelope) cites `setFrontmatterFromYaml`'s "keep last valid per-key state" as the precedent for the panel's last-valid behavior. Direct quote: *"Last-valid behavior matches predecessor's `setFrontmatterFromYaml` 'keep last valid' semantics."*
- §13 "Next actions" item 3 explicitly lists `setFrontmatterFromYaml` (and `setFrontmatterProperty`, `getFrontmatterMap`, `getFrontmatter`, `composeFrontmatterForStore`, `writeFrontmatterDualSlot`) in the **deletion** set.
- A3 (assumption) says: *"Eliminating L3 validation infra does not leave a defense gap, because `setFrontmatterFromYaml`'s 'keep last valid' semantics + Observer B's parse-failure handling cover the malformed-YAML case."*

A3's defense rests on a function the same spec deletes. The **panel** can compute its own last-valid (D20/D21 read-pathway), but that is a UI-side cosmetic — the disk YAML, the agent-write input, and the file-watcher input all flow through Y.Text directly, with no central "is this YAML parseable?" gate. After D26, `onStoreDocument` writes `ytext.toString()` to disk verbatim — there is no parse step on the way out, so a doc whose Y.Text region is malformed (because some writer put it there) is now persisted to disk verbatim.

**Concretely, where the gap exists:**
- **File-watcher**: Today's `applyExternalChange` calls `setFrontmatterFromYaml` which logs but tolerates malformed disk YAML (per-key state stays). After D26, that call is deleted; the malformed disk content lands directly in Y.Text under a paired `FILE_WATCHER_ORIGIN`. If the user fixed it on disk, fine; if they had it malformed temporarily and the watcher fired, Y.Text now contains malformed YAML and the next `onStoreDocument` writes it back verbatim. This may be desired (mirror disk faithfully), but it deserves to be explicit.
- **Source-mode keystroke**: A user typing in source mode produces malformed-mid-typing YAML. Today, Observer B's `writeFrontmatterDualSlot` keeps the per-key cache stable across the unparseable transient. After D8/D26, there is no cache — the panel goes to last-valid, but `onStoreDocument` will happily flush the malformed text to disk if a persistence trigger fires while the YAML is mid-edit (it can — debounce, blur, focus-loss, etc.).
- **Agent writes (`applyAgentMarkdownWrite`)**: D25 says "read FM via `stripFrontmatter(ytext.toString()).frontmatter`". The agent's own input is supposed to be valid (FR-5 attribution, schema gates internally), but if it produces malformed YAML, today's L3 hook reverts it via `FRONTMATTER_VALIDATION_REVERT_ORIGIN`. After D10, no revert.

**Recommendation:** explicitly resolve A3 before locking D10. Two reasonable shapes:
1. **Accept the new threat model.** Reword A3 from "no defense gap" to "the new model accepts that whatever bytes are in the FM region of Y.Text are the truth; defense moves to commit-time L1 in the binding (already there) and read-time graceful degradation in the panel (D21). Disk persists what Y.Text says, even if malformed. This matches the user-stated 'Y.Text is the source of truth' intake direction." That is a coherent position. It just needs to be on the record, with the malformed-disk-YAML round-trip explicitly named as **acceptable**.
2. **Keep one thin defense site.** Add a parse-on-store check in `onStoreDocument` that emits a structured warning when the FM region of Y.Text doesn't parse (does NOT block the write — disk-mirror property preserved). One file, ~20 LOC, keeps the team's debugging signal without re-introducing L3-class infrastructure.

**The current SPEC text needs to land position 1 OR 2 explicitly** — A3 as written is a contradiction the implementation pass will discover and have to resolve under time pressure.

---

## 2) D12 + D13 — full-region replace on drop + accepted concurrent-edit stomp

### Severity: MED — race-window framing is too optimistic

**Spec text:** D13 — *"the race window is brief (drag duration 100-1000ms typical)."*

**The window is wider than that.** It is `dragstart` → `mouseup` → local-`doc.transact` → server-broadcast-of-replaced-region. Under network jitter (say a hot reload of the Hocuspocus connection, a slow WebSocket flush, a transient back-pressure pause), a remote peer's value-edit committed at T+800ms can land in their local Y.Text but not yet have synced to the dragger's client at T+1000ms when the dragger drops. The dragger's commit then replaces the entire region using a stale parsed `Document` AST. On merge, Y.Text last-write-wins on overlapping byte ranges — but the **whole FM region** is the overlap, not just the moved Pair's lines, so every concurrent value edit on any other key inside that window is also overwritten by the dragger's stale AST.

**This is qualitatively different from "brief race window."** It is "every concurrent edit on any property during the entire drag-and-network-flush window is at risk." For a single user, this is invisible. For two users on the same doc, the first time it bites it will look like silent data loss.

**Compounding factor:** D17 (duplicate-name UI) implicitly invites mid-rename states where the user is debating between two duplicate keys. If user A is dragging a row and user B is mid-rename of a duplicate, the drop will commit user A's stale snapshot of B's renamed row.

**Recommendation:**
- Either escalate D13 from "MED likelihood, MED impact" to "MED likelihood, **HIGH** impact" in §14 — silent overwrite of arbitrary concurrent FM edits during an ill-defined window is a trust regression.
- Or commit to the surgical-edit upgrade (§15 Future Work) **before merge**, not as future work. The surgical-edit version (parse-swap-pair-stringify-just-that-line-range) is ~50 LOC of additional logic and removes the entire class of concern.
- At minimum, the spec should commit to a telemetry counter for "FM-region-replace at drag mouseup overlapped a remote edit in the last 2s" so the team can see whether the threat is hypothetical or live. Today's spec has no such counter; if the upgrade is deferred to Future Work, observability is the only way to know if it must be promoted.

---

## 3) D11 — hybrid binding API (patch + rename + reorder)

### Severity: LOW — defensible, but the spec's framing "patch shape doesn't fit reorder" is under-argued

The spec says *"Patch shape doesn't express rename or reorder cleanly; explicit methods match the operation shape."* This is true for the **current** `FrontmatterPatchSchema` (RFC 7396, key→value or key→null). But the patch shape **could** have been extended to ordered operations — e.g. `{ ops: Array<{type: 'set' | 'rename' | 'reorder', ...}> }` — which is a real industry pattern (RFC 6902 JSON Patch).

That said, the explicit-method shape is consistent with `bindConfigDoc`'s sibling pattern, the operation shapes are genuinely different (set/delete vs. position swap), and discoverability is better with named methods than a polymorphic op array. So D11 is fine — but the **rationale** ("doesn't fit cleanly") under-states the choice. The truer rationale is "the patch shape could have been extended to support ordered operations, but explicit methods are more discoverable, mirror `bindConfigDoc`, and don't require designing a new ops vocabulary."

**Recommendation:** rephrase D11's rationale row. No design change. (Helps future readers understand what tradeoff was actually weighed.)

---

## 4) A1 (yaml@2 comment preservation under Pair reorder) — MED → should land in spec

### Severity: HIGH — A1 is a 1-way door that the spec defers to "implementation probe"

**Why this matters.** D26 deletes `composeFrontmatterForStore`, whose explicit purpose in the predecessor spec was "preserve YAML comments + blank lines + scalar styles across `doc-load → no-op-form-edit → doc-save` round-trips" via the legacy-verbatim preference. The new model's ONLY mechanism for preserving comments through a drag-reorder cycle is yaml@2's `Document.toString()` behavior on rearranged `Pair`s.

If A1 is wrong (yaml@2 reattaches comments to wrong keys, or strips them, or reorders blank lines), every drag-reorder operation is silently lossy on the disk YAML. That is **disk-content drift** — the type of bug that doesn't surface until a user notices their carefully-placed `# do not change` comment moved to the wrong key three weeks later, with no rollback mechanism short of git.

The probe is **trivial** (≤30 LOC, the spec acknowledges this). Deferring it to "during implementation" risks discovering a failure exactly when:
- the implementer is mid-PR, has the diffuser-DnD UI already wired up,
- the team is now staring at a "yaml@2 doesn't actually preserve comment placement under reorder" finding,
- the surgical-edit upgrade path (§15 Future Work) becomes the only viable path, and
- the spec's scope balloons mid-implementation under time pressure.

**Recommendation:** run A1's probe **before scope freeze**. ≤30 LOC, ≤30 minutes. Land the result in `evidence/yaml-comment-preservation-probe.md`. If it passes, A1 promotes to HIGH confidence and §10 reads cleanly. If it fails, redirect to surgical-edit (§15 promoted into scope). Either way, the spec is grounded.

---

## 5) A6 (yaml@2 dup-key emission) — MED → same as A1, should land in spec

### Severity: HIGH — A6 is also a 1-way door

D17 (dup-name UI) and D18 (dup-name disk semantics) are coupled: both rest on yaml@2 emitting both `Pair`s when two have the same key. If yaml@2 silently dedupes (last-wins), the spec's STOP_IF clause says: "redirect to refuse-at-commit instead of D17/D18." That is a **fundamental UX shift mid-implementation** — from "surface the conflict, let the user resolve" to "block the commit."

The user's stated value (G3 in §2) — *"Duplicate names are representable, not silently dropped"* — is **not satisfiable** under refuse-at-commit. Refuse-at-commit is "block the commit if a duplicate would result," which is silent-drop's mirror image: same outcome of preventing the conflict-state from existing in the document. The G3 goal needs the storage layer to carry both lines.

**Recommendation:** run A6's probe **before scope freeze**. ≤10 LOC per the spec. If it fails, the spec needs to either (a) accept that G3 is not achievable under yaml@2 and remove G3, or (b) layer a different YAML emitter under the binding (e.g., raw text construction in `frontmatter-region.ts` for the dup-name case). Option (b) is non-trivial and deserves a spec-time decision, not implementation-time.

---

## 6) D20 — read-pathway perf bailout via byte-range string equality

### Severity: HIGH — the assumption "byte-range slice is O(1) on a Y.Text" is wrong

**Verified against yjs source.** `Y.Text.prototype.toString()` (`node_modules/yjs/src/types/YText.js:935`) walks the **entire item linked list** and string-concatenates every live `ContentString`. It is O(n) in the live item count, not O(1). There is no underlying rope structure; the string is materialized fresh on every call.

Therefore the spec's D20 strategy:
> *"snapshot the FM region (`stripFrontmatter(ytext.toString()).frontmatter`) and compare with last value. If unchanged, skip re-parse + skip React state update."*

means: on every body keystroke, we (a) materialize the entire ytext string (O(n) walk, where n is body size — could be 100KB on a long doc), (b) regex-match `FRONTMATTER_RE` on it, (c) string-equality on the FM region prefix.

For a 100KB doc, step (a) alone allocates a 100KB string and walks every Item. The "bailout" is not free — it costs an O(n) walk per fire to determine whether to skip. At 60fps source-mode keystrokes, this is 6 MB/s of string allocation just for the bailout check. On a slow client this is a measurable hit; on a hot loop in a long document it is wasteful pressure on V8 GC.

**Better strategies the spec doesn't consider:**
- **Use the `Y.YTextEvent.delta`** in `ytext.observe(event => …)`. The event carries a delta describing the bytes inserted/deleted at specific positions. If the delta's lowest position is `>= frontmatterByteLength`, the FM region didn't change — skip re-parse without reading the doc. This is O(delta size), not O(doc size).
- **Cache the FM region byte length on every parse**, and on each event check `event.delta` for any operation at a byte position `<= cachedFmLen`. If none, skip. Pure local arithmetic.

**Recommendation:**
- Reword D20's strategy to use the YTextEvent delta. The "byte-range string equality" framing implies an O(1) substring read that does not exist on Y.Text.
- A2's micro-bench is fine for the new strategy — but the bench should compare delta-based bailout vs. naive `ytext.toString()` to demonstrate the asymptotic improvement.

---

## 7) D24 + §13 — test plan adequacy

### Severity: MED — fuzz coverage of malformed-YAML at every entry point is missing

The spec deletes ~7 files of L3 infra and asserts (FR9, D21) that the panel handles malformed YAML by rendering last-valid + banner. But D24's four test layers don't include a **fuzzed-input test specifically for malformed YAML at every entry point**:

- (a) Source-mode keystroke that produces unparseable YAML mid-string.
- (b) File-watcher delivering malformed disk content.
- (c) Agent write (via `applyAgentMarkdownWrite`) supplying malformed YAML in the `frontmatter` field.
- (d) Two clients concurrently editing such that the merged Y.Text is unparseable even though each side's individual edit was valid (CRDT interleaving on overlapping ranges).

Today's test layers cover happy-path round-trip (PBT) + multi-client convergence (integration) + E2E user flows. None of them stress the **malformed-YAML class** that the deleted L3 infra was specifically built to defend.

**Recommendation:** add a fifth layer to D24 — a malformed-YAML fuzz suite that injects unparseable bytes at each of the four entry points and asserts:
- Panel renders last-valid (FR9).
- Disk persists whatever's in Y.Text (acceptable per the new threat model).
- No bridge-invariant violation (FR10).
- No infinite loop / repeated revert / observer storm.

Without this, the spec's "no defense gap" claim is unverified.

---

## 8) The premise itself — "structured editor view over Y.Text region" vs. "PropertyPanel as its own CRDT root"

### Severity: MED — the premise is sound, but the spec under-engages a future-feature class

The user's intake is clear: *"the frontmatter editor is just a fancy WYSIWYG editor flavor on top of the underlying collaborative document text."* That is the architectural premise and the spec follows it cleanly. But the spec doesn't surface what is given up.

**What the new model gives up:**
- **Per-property version history.** A future "show me what changed in `tags` over the last week" feature wants per-key CRDT identity (Y.UndoManager scoped to a single key). With FM-as-Y.Text-region, the only available unit is character ranges; per-property history requires reconstructing Pair byte ranges from the YAML AST at every history point.
- **Per-property comments / suggestions.** A future Google-Docs-style "comment on this property" feature wants stable identity for the property across renames. Y.Text byte-range identity is not stable across renames. The deleted per-key Y.Map gave you that for free (key = stable ID), albeit with the rename-reorder bug the spec is fixing.
- **Per-property awareness.** A "two cursors editing the same property" awareness signal wants per-key bound. Y.Text awareness is doc-wide; scoping it to "the bytes inside this Pair" requires AST → byte-range mapping on every cursor-position update.

**This isn't an argument against the spec** — the user explicitly chose this direction, and the rename-reorder bug is real. But the spec's §3 Non-goals lists "field-level CRDT merge" (NG6) without acknowledging the cluster of features that field-level identity buys. If a future spec wants any of the above, it will have to reconstruct per-property identity by parsing yaml@2's Pair byte ranges at every operation — which is non-trivial and creates a coupling between the binding and the YAML emitter's source-position tracking.

**Recommendation:** add a single sentence to NG6 acknowledging the broader feature class: "Per-property CRDT identity is also surrendered, which forecloses future per-property history, per-property comments, and per-property awareness without rebuilding identity over yaml@2's Pair byte ranges." This is honesty about the trade, not a design change.

---

## 9) FR10 — substrate bridge invariant under FM-only edits

### Severity: MED — the spec's "trivially holds" framing skips a real verification step

The spec claims: *"The bridge invariant continues to hold under all FM-region edit shapes."* The mechanism: serialize(fragment) is body-only (FM is regex-stripped pre-parse), so on an FM-only edit, XmlFragment is unchanged, body is unchanged, and `prependFrontmatter(<new-FM-from-Y.Text>, body) === ytext`.

**The non-trivial part the spec under-examines.** Observer A's `lastSyncedXmlMd` baseline today (server-observers.ts:340, 449, 499, 524, 675, 686, 714) is recomputed on every metaMap deep-change AND every XmlFragment change, by composing `prependFrontmatter(getFrontmatter(doc), body)`. After D8/D9, there is no metaMap deep observer. So the baseline must be refreshed via a different signal when the FM region of Y.Text changes.

**Two failure modes the spec doesn't enumerate:**

(a) **FM-only edit under FORM_WRITE_ORIGIN.** Observer A's callback (`origin guard, line 494-510`) sees a non-paired, non-self origin → sets `metaDirty = true` (in the current code path that the spec deletes). After D9 deletes `metaDirty`, what flag drives Observer A's run? Observer B's `textDirty` will fire (since Y.Text changed), but Observer B's settlement dispatch path runs B's sync, not A's baseline refresh. Observer A's `lastSyncedXmlMd` will go **stale** by the FM region delta. The next time Observer A's path A diff fires (because someone edits XmlFragment), the diff's pre-image will be stale by exactly the FM region — which manifests as bridge-invariant violations or content-loss on the body editor.

(b) **Path A's three-way merge baseline.** `runObserverASync` (line 374) uses `lastSyncedXmlMd` as the diff's pre-image. If a body edit + an FM edit interleave, A's three-way merge sees a baseline that doesn't include the interleaving FM edit, and may compute a body-side conflict that doesn't actually exist.

**Recommendation:** the spec needs an explicit decision row covering "How does Observer A's `lastSyncedXmlMd` baseline refresh after an FM-only edit, given metaMap deep observation is gone?" Two candidate shapes:
- (i) Observer B's callback, on a non-paired non-self Y.Text edit, refreshes Observer A's baseline directly (mirror today's metaMap-deep baseline-refresh into the Y.Text observer path).
- (ii) Observer A grows its own Y.Text observer that's strictly for baseline refresh (no work dispatch).

The spec STOP_IF clause ("Observer A's `lastSyncedXmlMd` baseline becomes stale") catches this in test, but resolving it at SPEC time is cheaper than discovering it at C-matrix integration time. This is a substrate invariant; deserves a §10 row, not just a STOP_IF.

---

## 10) Cross-cutting concerns the spec missed

### Severity: MED for the cluster

**(a) FM region size limits.** Today the per-key Y.Map naturally bounds size (each key is a separate Y entry, GC'd independently). Under the new model, the FM region is a string in Y.Text; a malicious or buggy writer could put a 10MB YAML region in a doc, and every body keystroke now incurs an O(n) walk through that region's items in `ytext.toString()` (per finding #6). The spec has no upper bound on FM region size.

**Recommendation:** add a soft limit (`MAX_FM_REGION_BYTES`, e.g., 64KB) enforced at the binding layer (commit-time L1 gate). Refuse commits that would push the region above this. ≤5 LOC.

**(b) Telemetry attribute cardinality on `recordFrontmatterEditSurface`.** The CLAUDE.md STOP rule on unbounded-cardinality span/metric attributes is explicit. The current `recordFrontmatterEditSurface('form' | 'source-mode' | 'mcp-write' | 'file-watcher')` is bounded (4-enum). The spec preserves this, fine. But Future Work item Q26 (per-op breakdown) hints at adding `op: 'set' | 'rename' | 'reorder' | 'add' | 'delete'` — also bounded. Not a problem today, but worth flagging that any future "include the property name as a label" expansion would violate the cardinality STOP rule.

**No spec change required**, just ensure the implementer doesn't drift here when wiring telemetry.

**(c) Y.Text byte-position drift after concurrent edits while drag is in progress.** This compounds finding #2. Local drag computes a target byte offset based on the current Y.Text snapshot. While the drag is in progress, a remote peer's body edit at byte position 0 (e.g., adding a header) shifts the FM region's byte offsets. On mouseup, the local commit applies a byte-range replacement at the **stale** offsets, which now point into the body, not the FM region. Result: the body gets corrupted with YAML.

The spec assumes the FM region byte range is recomputed at commit time inside the `doc.transact`. That is correct **if** the implementation re-runs `stripFrontmatter(ytext.toString())` inside the transact, which the §9 data-flow diagram does show. So this is a correctness concern that the implementation pattern handles — **but** the spec should add an explicit FR or STOP_IF: "the FM region byte range MUST be recomputed at commit-time, inside the transact, before the byte-range replace; never use a snapshot from drag-start."

**Recommendation:** add this as STOP_IF or as an FR15. ≤1 sentence.

**(d) Idempotency between two PropertyPanel mounts of the same doc.** The spec's §11 cross-cutting note on idempotency says "Y.Text byte-range edits are not idempotent at the CRDT level — applying the same insert twice produces different state. The binding's `doc.transact` wrapping guards against double-commit on a single user gesture (one transact per UI commit)." This is true but incomplete. Consider: two PropertyPanel instances mounted at different points (e.g., a primary editor + a docs-preview iframe) on the same Hocuspocus connection. Both observe the same Y.Text, both render add/rename forms, both commit. Today's per-key Y.Map naturally idempotently merges concurrent `metaMap.set(key, value)` (CRDT LWW per key). Under the new model, two near-simultaneous "add key X with value Y" commits from two panel mounts produce **two** YAML lines with the same key (per A6 and D17/D18). UI surfaces the duplicate, user resolves manually.

This is **arguably correct** — it's exactly what the user wants per G3 (surface conflicts). But it's not what the predecessor's idempotency model gave you (silent merge to one key). The spec's §11 idempotency note doesn't mention this divergence.

**Recommendation:** sharpen the idempotency note. "Two concurrent identical 'add' operations from different clients produce two YAML lines (per G3 + D17), surfaced as a duplicate-name conflict in the UI. This is intentional and inverts the predecessor's silent-merge behavior."

---

## Summary of recommended pre-merge actions

In priority order:

1. **A1 + A6 probes (HIGH).** Run both before scope-freeze. Each is ≤30 LOC. Both are 1-way doors for D26/D17/D18; deferring discovery is structurally bad.
2. **A3 / D10 reframing (HIGH).** Resolve the circularity. Either accept "Y.Text is the truth, no defense" explicitly, or add a thin parse-on-store warning site. Don't ship the spec with A3 as written.
3. **D20 strategy revision (HIGH).** Switch to YTextEvent delta-based bailout. The current "byte-range string equality" framing relies on a Y.Text cost model that is wrong.
4. **Observer A baseline refresh (MED→HIGH).** Add an explicit decision row for how `lastSyncedXmlMd` refreshes on FM-only Y.Text edits after metaMap deep observation is gone.
5. **D13 stomp-window framing (MED).** Either escalate impact, commit the surgical-edit upgrade now, or add a telemetry counter to detect live incidence.
6. **D24 fuzz layer (MED).** Add a malformed-YAML fuzz pass at all four entry points.
7. **FM region byte-range recompute STOP_IF (MED).** One sentence guarding the drag-commit byte-position drift class.
8. **FM region size limit (MED).** ≤5 LOC at binding L1; close the unbounded-region attack surface.
9. **NG6 sentence about per-property identity (LOW).** Honesty about what the architecture forecloses.
10. **D11 rationale rephrase (LOW).** "Patch shape doesn't fit cleanly" → "explicit methods chosen for discoverability over a polymorphic ops-array shape, mirroring `bindConfigDoc`."

Items 1, 2, 3, 4 each independently warrant blocking scope-freeze; the rest are spec-quality polish.
