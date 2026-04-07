# Next Phase: Full Cross-Mode Sync Explorations

**Status:** Seed — to be deepened before implementation
**Context:** The init-spike validated the core stack (TipTap + Hocuspocus + Yjs v13 + CodeMirror). The agent-markdown-writes spike solved the R3 clobber problem with three-way merge. What remains is the set of sync gaps documented in the cross-mode sync matrix (RESULTS.md).

**Goal:** Spike each viable approach to full bidirectional sync. Each exploration produces a PASS/FAIL with evidence — not production code. The value is in learning what actually works vs what the research predicted.

---

## The Gaps (from the sync matrix)

These are the scenarios that don't work today:

1. **Source ↔ Source (2 tabs)** — Two users in source mode see nothing from each other. Independent text buffers.
2. **Source → WYSIWYG (live)** — Source mode edits don't flow to WYSIWYG tabs until toggle-back.
3. **Disk → CRDT** — External editor changes (VS Code, Cursor) are invisible to the system.
4. **Source → Disk** — Source mode edits are in-memory only, not persisted until toggle-back.
5. **WYSIWYG → Source (usable)** — The mechanism exists but replaces the entire CodeMirror buffer, resetting cursor position. Technically works, practically unusable.

---

## Exploration 1: Option B Revisited — Dual Keys with Observer Sync

**The idea:** Two Y.Types in the same Y.Doc — `Y.XmlFragment` for TipTap, `Y.Text` for CodeMirror. Observers on each trigger bidirectional conversion. Both views are collaborative.

**Why it was originally dismissed:** The "shimmer" problem — each conversion normalizes formatting, triggering the other observer, cascading into spurious edits. The research report cited 6 normalization patterns as evidence.

**Why it's worth revisiting now:** Our V1b validation showed zero semantic loss and convergence after exactly one cycle with ~80 LOC of fixes. If the round-trip is stable after the first normalization, the shimmer may dampen immediately rather than cascade. The original assessment was made before we had round-trip fidelity data.

**What to build:**
- Add a `Y.Text('source')` to the Y.Doc alongside the existing `Y.XmlFragment('default')`
- Bind CodeMirror to `Y.Text` via `y-codemirror.next` (already a dependency)
- Write an observer on `Y.XmlFragment` that serializes → writes to `Y.Text`
- Write an observer on `Y.Text` that parses → writes to `Y.XmlFragment` via `updateYFragment`
- Transaction origin guards to prevent infinite loops (`origin === 'sync-from-tree'` / `origin === 'sync-from-text'`)

**What to measure:**
- Does the shimmer actually happen? How many observer cycles fire per keystroke?
- Does it dampen (converge after 1-2 cycles) or diverge?
- What's the latency? If each keystroke triggers serialize + parse + updateYFragment, is it noticeable at typing speed?
- Do the V1b fixes (frontmatter, images, task lists) survive the continuous round-trip?

**Gotchas to watch for:**
- The observer will fire on the initial sync when the document loads — need to suppress this or it'll create a double-write on connect
- `updateYFragment` is diff-based but still walks the entire document tree. At high keystroke frequency this could create GC pressure
- CodeMirror's `y-codemirror.next` binding may fight with manual `Y.Text` writes from the observer — need to check if the binding uses transaction origins that could conflict
- Void nodes (jsxComponent) store raw JSX as a string attribute. The Y.XmlFragment → markdown → Y.Text path serializes this correctly, but the Y.Text → markdown → Y.XmlFragment path needs the jsx-component parseMarkdown handler to reconstruct the atom node. If the code block priority issue resurfaces (StarterKit's codeBlock claiming the token first), void nodes will break silently
- The three-way merge we built becomes unnecessary if Option B works — both editors are always synced, there's no snapshot/toggle-back cycle. But it serves as a fallback if Option B is abandoned

**If it works:** Source mode becomes collaborative. Agent writes visible in both views. The serialize-on-toggle architecture can be removed entirely. This would close gaps 1, 2, and 5 from the list above.

**If it doesn't work:** Document exactly which normalization pattern causes the shimmer and whether it's fixable with targeted markdown fixes (like V1b). The data is valuable even if the approach is abandoned.

---

## Exploration 2: Disk ↔ CRDT Bridge (File Watcher)

**The idea:** `@parcel/watcher` monitors the content directory. External file changes (VS Code, Cursor, vim) are detected, parsed to markdown, and applied to the Y.Doc via `updateYFragment`. This creates the missing disk → CRDT path.

**What to build:**
- Install `@parcel/watcher`
- Create a watcher module that subscribes to content directory changes
- On file change: read file → parse markdown → `updateYFragment` into Y.Doc
- On CRDT persist (existing `onStoreDocument`): write file → record content hash
- Feedback loop prevention: compare content hash of the file we just read against the hash of the file we last wrote. If they match, it's our own write — skip.

**What to measure:**
- Latency from file save in VS Code to content appearing in the browser editor
- Does the feedback loop prevention actually prevent loops? (Run the watcher + persistence simultaneously and type in the editor — verify no ping-pong)
- What happens when Cursor auto-saves rapidly (every keystroke)? Does the watcher + updateYFragment keep up?

**Gotchas to watch for:**
- `@parcel/watcher` on macOS coalesces events over 25-50ms. Multiple rapid saves may arrive as a single event — content-hash comparison is essential, timestamp-based tracking is insufficient
- The file watcher → `updateYFragment` path is the same as toggle-back. If the three-way merge is active, the watcher writes could interact with source mode editing. Need to decide: does the watcher pause while source mode is active? Or does it feed into the source view too?
- Frontmatter handling: the watcher needs to strip frontmatter before parsing (same as `onLoadDocument`) and cache it. If the user edits frontmatter in VS Code, the cache needs to update
- File deletion: what happens if the user deletes a .md file while the document is open in the editor? The watcher needs to handle this gracefully
- Encoding: the watcher should verify UTF-8 encoding. Binary files or non-UTF-8 content in the watched directory could cause parse failures
- The `updateYFragment` call from the watcher should use a distinct transaction origin so other components (persistence, source mode observer) can distinguish watcher-originated changes from user edits

**If it works:** VS Code/Cursor edits appear in the browser editor in real-time. This is the Cursor interop story — developers can use their preferred editor alongside the web UI. Closes gaps 3 and 4 from the list.

**Relationship to Exploration 1:** Independent. The disk bridge writes to Y.XmlFragment via `updateYFragment`. If Option B is also active, the observer would propagate the change to Y.Text → CodeMirror. If Option B is not active, the change shows up in WYSIWYG only (current behavior).

---

## Exploration 3: Y.Text-Canonical with ProseMirror Binding (Option C / Automerge Model)

**The idea:** Flip the canonical representation. Instead of Y.XmlFragment (tree) as source of truth with serialization to markdown, use Y.Text (flat text with formatting attributes) as source of truth. Build a custom Y.Text → ProseMirror binding. Both CodeMirror and ProseMirror see the same underlying data.

**Why this is interesting:** This is how Automerge does it (Peritext model). It's architecturally the cleanest solution — one CRDT, two views, no serialization between them. It's also what the broader CRDT ecosystem is converging on.

**Why it's the hardest:** No Y.Text → ProseMirror binding exists. The closest prior art:
- `automerge-prosemirror` (3,272 lines) — maps Automerge's flat text + spans to ProseMirror's tree
- `y-quill` (363 lines) — maps Y.Text to Quill, including block-level formatting via newline attributes (the Quill/Delta model)
- `@blocksuite/inline` (AFFiNE) — binds Y.Text for inline formatting within blocks, but only inline — block structure is handled separately

**What to build (if exploring):**
- Define a Y.Text encoding for block structure (probably newline-delimited with block-type attributes, like y-quill)
- Build a mapping layer: Y.Text deltas → ProseMirror transactions
- Build the reverse: ProseMirror transactions → Y.Text operations
- Handle void nodes: how does a jsx-component atom node look in Y.Text? Probably a special character (like Unicode Object Replacement Character U+FFFC) with attributes

**Gotchas to watch for:**
- This is a multi-week effort, not a quick spike. The binding alone is probably 1,000-3,000 lines based on the automerge-prosemirror precedent
- Hocuspocus and the persistence layer currently assume Y.XmlFragment. Switching canonical type changes the server-side serialization path
- The existing `@tiptap/extension-collaboration` assumes y-prosemirror's Y.XmlFragment binding. Would need to be bypassed or replaced
- TipTap's collaboration cursor extension also assumes XmlFragment. Cursor presence would need to be re-implemented for Y.Text
- Block-level structure in Y.Text is an encoding decision with no single right answer. y-quill uses newline + attributes. Automerge uses a different approach. The choice affects everything downstream

**If it works:** Every sync gap closes. Both editors share one CRDT. Disk sync writes/reads markdown (which is already flat text). Source mode is just "show me the Y.Text content" — zero serialization. Agent writes go to Y.Text directly. This is the ideal architecture.

**If the effort is too high:** The learning about Y.Text block encoding and the ProseMirror mapping challenges informs whether to wait for Yjs v14 to mature or consider migrating to Automerge (which already has this solved).

---

## Exploration 4: Constrained Observer Sync (One-Way Live + Merge on Toggle-Back)

**The idea:** A lighter version of Option B. Instead of bidirectional observers (which cause shimmer), use a one-way observer: Y.XmlFragment → Y.Text (tree→text) runs continuously, but Y.Text → Y.XmlFragment (text→tree) only runs on explicit toggle-back (using the three-way merge we already built).

**Why this might be the sweet spot:** 
- Source mode becomes a live-updating view of the CRDT (agent writes and WYSIWYG tab edits appear in real-time)
- Source mode edits still use the toggle-back merge path (proven to work)
- No shimmer risk — the text→tree direction never fires automatically
- CodeMirror binds to Y.Text via `y-codemirror.next`, so source mode IS collaborative (two users in source mode see each other's keystrokes via Y.Text CRDT sync)

**What to build:**
- Same as Option B but only the XmlFragment → Text observer (one direction)
- Bind CodeMirror to Y.Text via `y-codemirror.next`
- On toggle-back: read Y.Text content (not React state), apply via three-way merge to Y.XmlFragment
- The one-way observer keeps Y.Text updated with WYSIWYG changes, so source mode always shows current content

**Gotchas to watch for:**
- Y.Text edits (from source mode users) and Y.XmlFragment edits (from WYSIWYG users) diverge until toggle-back. The three-way merge needs to handle this divergence. The snapshot for three-way merge should be the Y.Text content at the moment source mode was entered, not the Y.XmlFragment serialization
- If two users are in source mode, they collaborate via Y.Text. But their combined edits still need to merge back to Y.XmlFragment on toggle-back. Who triggers the merge? The last person to toggle back? Both independently?
- The one-way observer (XmlFragment → Text) fires on every WYSIWYG keystroke. If a source mode user is typing simultaneously, their Y.Text edits get overwritten by the observer. Need to either pause the observer when source mode is active, or make the observer append-only (only add content, never modify existing Y.Text content)
- Performance: serializing the entire Y.XmlFragment to markdown on every WYSIWYG keystroke may be expensive for large documents. Could throttle/debounce the observer

**If it works:** Closes gaps 1 (collaborative source mode via Y.Text), 2 (WYSIWYG→source live via observer), and 5 (usable WYSIWYG→source via Y.Text binding instead of buffer replacement). Keeps the proven three-way merge for the text→tree direction. Lower risk than full Option B.

---

## Suggested Order

1. **Exploration 4 (constrained observer)** — lowest risk, reuses everything we built, highest chance of working. If this works, it might be good enough and we skip the riskier options.
2. **Exploration 1 (full Option B)** — test whether shimmer is real. The V1b convergence data suggests it might not be. High signal regardless of outcome.
3. **Exploration 2 (disk bridge)** — independent of the source toggle work, can run in parallel. Unlocks Cursor interop.
4. **Exploration 3 (Y.Text canonical)** — only if 1-2 fail and we need to fundamentally rethink the architecture. Or if we want to evaluate an Automerge migration path.

---

## What Success Looks Like

The dream state is a sync matrix where everything is "Yes":

```
                    WYSIWYG   Source   Disk   Agent
WYSIWYG     →         ✅        ✅      ✅      ✅
Source      →         ✅        ✅      ✅      ✅
Disk        →         ✅        ✅      —       —
Agent       →         ✅        ✅      ✅      —
```

We're currently at:

```
                    WYSIWYG   Source   Disk   Agent
WYSIWYG     →         ✅        ⚠️      ✅      ✅
Source      →         ⏸️        ❌      ❌      ✅
Disk        →         ❌        ❌      —       —
Agent       →         ✅        ✅      ✅      —

✅ = works    ⚠️ = works but bad UX    ⏸️ = on toggle-back only    ❌ = no
```

Each exploration closes specific cells. Exploration 4 alone would get us to:

```
                    WYSIWYG   Source   Disk   Agent
WYSIWYG     →         ✅        ✅      ✅      ✅
Source      →         ⏸️        ✅      ❌      ✅
Disk        →         ❌        ❌      —       —
Agent       →         ✅        ✅      ✅      —
```

Adding Exploration 2 (disk bridge) would close the disk column entirely.
