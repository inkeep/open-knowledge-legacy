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

## Exploration 5: Automerge — Alternative CRDT Stack with Native Dual-View

**The idea:** Replace Yjs with Automerge. Automerge 2.2 implements the Peritext model — flat text + formatting annotations. The dual-view problem is solved at the data layer. Both ProseMirror and CodeMirror are views over the same flat text CRDT. No serialization between editors. No shimmer. No toggle-back merge.

**Why this is interesting:** It's the only approach where dual-view is architecturally native rather than bolted on. A ProseMirror binding already exists (`automerge-prosemirror`, 3,272 lines). The broader CRDT ecosystem is converging on this model. If we're going to be on Automerge eventually, better to know now before we build more on Yjs.

**What to evaluate:**
- Stand up TipTap (via the ProseMirror binding) + CodeMirror on Automerge in an isolated spike directory
- Can the ProseMirror binding handle our extensions — void nodes (jsxComponent atom), tables, task lists, frontmatter?
- Does Automerge have a sync server equivalent to Hocuspocus? (`automerge-repo` with network adapters, but does it have persistence hooks, document lifecycle, DirectConnection-equivalent for agent writes?)
- What's agent write ergonomics? Hocuspocus DirectConnection is clean (`conn.transact(doc => ...)`). What's the Automerge equivalent?
- Performance: Automerge has historically been slower than Yjs for large documents. Has this improved?

**Gotchas to watch for:**
- `automerge-prosemirror` may not be actively maintained or compatible with TipTap v3's expectations. Check last commit date, open issues, ProseMirror version compatibility
- Automerge's sync protocol is different from Yjs/Hocuspocus. The entire server layer (Vite plugin, WebSocket handling, persistence hooks) would need to be rebuilt
- Our git persistence pipeline uses `yXmlFragmentToProsemirrorJSON` → `MarkdownManager.serialize()`. On Automerge, the serialization path is different — flat text is closer to markdown already, but block structure (headings, code blocks, lists) needs a mapping
- TipTap's `@tiptap/extension-collaboration` is deeply coupled to Yjs — it imports `@tiptap/y-tiptap` which IS y-prosemirror. Switching to Automerge means bypassing TipTap's collaboration extension entirely and using raw ProseMirror plugins
- Cursor/presence: Hocuspocus uses Yjs awareness protocol. Automerge has its own ephemeral messaging. The presence UX would need to be re-implemented
- The migration cost isn't just code — it's ecosystem. Hocuspocus, y-prosemirror, y-codemirror.next, all the Yjs tooling goes away. Evaluate whether Automerge's ecosystem has equivalents

**If it works:** Every sync gap closes natively. No serialization step between editors. No three-way merge. No observer shimmer. Agent writes flow to both views through the CRDT. The architecture is fundamentally simpler.

**If it doesn't work (or the migration cost is too high):** The data about what broke informs whether to wait for Automerge's ecosystem to mature or commit to the Yjs approach long-term. Even a failed spike clarifies the build-vs-wait decision.

---

## Exploration 6: Loro — Alternative CRDT Stack with Native Branching

**The idea:** Replace Yjs with Loro. Like Automerge, Loro implements the Peritext model (flat text + annotations = native dual-view). Unlike Automerge, Loro has native fork/merge — branching is a first-class CRDT operation, not bolted on via git.

**Why this is interesting:** Our draft architecture (PROJECT.md TQ14) uses git branches + Hocuspocus document naming (`{branch}/{filepath}`) as a workaround for CRDT-level branching. Loro would make `fork()` and `merge()` native CRDT operations. A user creating a draft is literally forking the CRDT. Merging a draft back is a CRDT merge with proper conflict resolution — not `git merge --squash` on serialized text files. This is architecturally cleaner for the long-term product (drafts, proposals, experiments as branches).

**What to evaluate:**
- Same dual-view evaluation as Automerge: TipTap + CodeMirror on the same Loro document
- Fork/merge: create a draft (fork), edit it, merge back. Does the CRDT merge produce sensible results? How does it compare to git merge on the serialized markdown?
- Does a ProseMirror binding exist? (Less likely than Automerge — Loro's ecosystem is younger)
- Sync server: does Loro have a Hocuspocus equivalent? Or would we build one?
- Performance: Loro claims to be faster than both Yjs and Automerge. Verify with our document sizes.

**Gotchas to watch for:**
- Loro's ecosystem is significantly younger than both Yjs and Automerge. There may not be a ProseMirror binding — building one is a multi-week effort (see Exploration 3 estimates)
- The Peritext implementation in Loro may have different edge cases than Automerge's. The Peritext paper describes boundary semantics (should bold expand when you type at the end of a bold word?) that each implementation handles differently
- Fork/merge on CRDTs is conceptually different from git branching. Git merge operates on serialized text (line-level diff). CRDT merge operates on operations (character-level interleaving). The research report (TQ13) specifically warns: "Yjs interleaves characters on diverged docs — garbled." Loro claims to handle this better, but verify with real editing scenarios, not just the docs
- If we're the first to build a serious product on Loro, we're also the first to find the bugs. Evaluate community size, maintainer responsiveness, issue resolution velocity
- The Yjs → Loro discussion on discuss.yjs.dev (Nov 2025, cited in the research) has community perspective on the trade-offs

**If it works:** Dual-view + native branching. Architecturally the most complete solution. Drafts, proposals, experiments are CRDT forks — no git workaround needed.

**If the ecosystem is too immature:** Revisit in 6-12 months. Loro is moving fast. The spike data tells us exactly what's missing and when to re-evaluate.

---

## Suggested Order

**Phase A — Improve the Yjs architecture (low risk, incremental):**
1. **Exploration 4 (constrained observer)** — lowest risk, reuses everything we built, highest chance of working
2. **Exploration 1 (shimmer test)** — cheap experiment on top of #1, turn on reverse observer and measure
3. **Exploration 2 (disk bridge)** — independent, can run in parallel with 1-2, unlocks Cursor interop

**Phase B — Evaluate alternative stacks (higher risk, higher ceiling):**
4. **Exploration 5 (Automerge)** — mature Peritext implementation, existing ProseMirror binding, evaluate migration cost
5. **Exploration 6 (Loro)** — Peritext + native branching, younger ecosystem, evaluate readiness

**Phase C — Only if needed:**
6. **Exploration 3 (Y.Text canonical)** — rebuild the binding layer within Yjs. Only worth it if Phase A fails AND Phase B shows the migration cost is too high

The results of Phase A directly inform whether Phase B is worth pursuing. If the constrained observer + shimmer test give us full collaborative sync on Yjs, the migration cost of switching stacks needs to be justified by something beyond dual-view (e.g., Loro's native branching for the draft architecture).

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

Explorations 5 or 6 (Automerge/Loro) would get us to the full matrix — every cell green — but at the cost of a stack migration:

```
                    WYSIWYG   Source   Disk   Agent
WYSIWYG     →         ✅        ✅      ✅      ✅
Source      →         ✅        ✅      ✅      ✅
Disk        →         ✅        ✅      —       —
Agent       →         ✅        ✅      ✅      —
```

---

## Universal Test Scenarios

These scenarios apply to every exploration regardless of stack or approach. Any spike that claims to solve a sync gap must pass the relevant scenarios. Organized by the interaction being tested, not by implementation approach.

### Single-user editing

| ID | Scenario | What to verify |
|---|---|---|
| T01 | Type a paragraph in WYSIWYG | Content persists, renders correctly, no console errors |
| T02 | Type a paragraph in source mode | Content persists in the text buffer, syntax highlighting works |
| T03 | Toggle WYSIWYG → source → WYSIWYG with no edits | Content identical before and after. Zero diff. |
| T04 | Toggle WYSIWYG → source, edit, toggle back | Edit appears in WYSIWYG. No content loss. |
| T05 | Toggle WYSIWYG → source, edit, toggle back — 10 times in a row | Content stable after 10 cycles. No progressive drift or accumulation of formatting artifacts. |
| T06 | Measure toggle time on test fixture (~1KB) | Wall-clock ms. Target: <100ms. |
| T07 | Measure toggle time on large document (~50KB) | Wall-clock ms. Target: <500ms. Stress test for serialization-based approaches. |

### Multi-tab WYSIWYG collaboration

| ID | Scenario | What to verify |
|---|---|---|
| T10 | Tab 1 types in WYSIWYG, Tab 2 in WYSIWYG | Both see each other's keystrokes in real-time. Sub-second latency. |
| T11 | Tab 1 types at top of doc, Tab 2 types at bottom — simultaneously | No content interleaving or corruption. Both edits in correct positions. |
| T12 | Tab 1 bolds a word while Tab 2 italicizes an overlapping range | Formatting resolves correctly (both marks applied to overlap). This is the Peritext boundary test — document how each stack handles it. |
| T13 | Tab 1 deletes a paragraph while Tab 2 is editing inside it | No crash. Graceful resolution — either the delete wins or the edit wins, but the document is structurally valid. |

### Multi-tab source mode collaboration

| ID | Scenario | What to verify |
|---|---|---|
| T20 | Tab 1 in source, Tab 2 in source — Tab 1 types | Tab 2 sees Tab 1's keystrokes in real-time (or doesn't — document the behavior). |
| T21 | Tab 1 and Tab 2 both in source, both typing in different paragraphs | Both edits present. No clobber. |
| T22 | Tab 1 and Tab 2 both in source, both editing the SAME line | Conflict resolution: characters interleave (CRDT behavior) or last-write-wins? Document the behavior. |
| T23 | Tab 1 in source, Tab 2 in source — Tab 1 toggles back to WYSIWYG | Tab 1 sees merged content. Tab 2 still in source, unaffected. Tab 2's subsequent edits don't conflict with Tab 1's WYSIWYG state. |

### Cross-mode sync (WYSIWYG ↔ source)

| ID | Scenario | What to verify |
|---|---|---|
| T30 | Tab 1 in WYSIWYG, Tab 2 in source — Tab 1 types a new paragraph | Paragraph appears in Tab 2's source view. Measure latency. Does Tab 2's cursor jump? |
| T31 | Tab 1 in source, Tab 2 in WYSIWYG — Tab 1 types a new paragraph | If live sync: paragraph appears in Tab 2. If toggle-back only: paragraph appears after Tab 1 toggles. Document which. |
| T32 | Tab 1 in WYSIWYG types rapidly, Tab 2 in source watching | Source view keeps up with WYSIWYG typing at normal speed (~60 WPM). No visible lag or "catching up" artifacts. |
| T33 | Tab 1 in WYSIWYG, Tab 2 in source editing — simultaneous | Non-conflicting edits (different paragraphs): both survive. Conflicting edits (same paragraph): document the resolution. |

### Agent writes

| ID | Scenario | What to verify |
|---|---|---|
| T40 | Agent writes a paragraph while editor in WYSIWYG mode | Paragraph appears in editor immediately. No page reload. |
| T41 | Agent writes a paragraph while editor in source mode | Paragraph appears in source view (or doesn't — document behavior). |
| T42 | Agent writes 5 paragraphs rapidly (100ms apart) while in WYSIWYG | All 5 appear. No crashes, no state corruption. |
| T43 | Agent writes 5 paragraphs rapidly while in source mode | All 5 appear in source view (or document what happens). |
| T44 | User typing in WYSIWYG while agent writes simultaneously | Both edits present. Cursor position preserved for the user. No jank. |
| T45 | User typing in source while agent writes simultaneously — non-conflicting | User's edits preserved. Agent's paragraph present. No clobber on toggle-back (or if no toggle-back needed, verify live). |
| T46 | User typing in source while agent writes simultaneously — conflicting (same paragraph) | Document the resolution. User's version preserved? Agent's? Merged? Corrupted? |
| T47 | Agent writes while two tabs are open (one WYSIWYG, one source) | Agent's write appears in both views. |

### Disk sync

| ID | Scenario | What to verify |
|---|---|---|
| T50 | Edit in WYSIWYG, wait — .md file on disk reflects changes | Measure latency from keystroke to file update. |
| T51 | Edit .md file in VS Code/vim, save — WYSIWYG editor reflects changes | Measure latency. Does it work at all? |
| T52 | Edit .md file externally while editor is in source mode | Source view updates (or doesn't). Document behavior. |
| T53 | Edit .md file externally while user is typing in WYSIWYG | No clobber. External edit and user edit both present. |
| T54 | Delete .md file externally while document is open in editor | No crash. Graceful behavior — editor retains content? Shows error? |
| T55 | Create a new .md file in the content directory externally | System detects new file (or doesn't). Can it be opened in the editor? |
| T56 | Rapid external saves (simulate Cursor auto-save, ~1 save/sec for 10 sec) | System keeps up. No feedback loops (file watcher → CRDT → persistence → file write → file watcher → ...). |
| T57 | Edit in WYSIWYG, persistence writes to disk, then edit same file in VS Code | Both edits present after sync. No silent overwrite of either. |

### Content fidelity

| ID | Scenario | What to verify |
|---|---|---|
| T60 | Frontmatter survives all sync paths | `---\ntitle: X\ntags: [a,b]\n---` preserved through WYSIWYG, source, disk, toggle, agent write. |
| T61 | Void node (jsx-component) survives all sync paths | `<Callout>` block preserved as fenced code block through every path. Renders as React component in WYSIWYG. |
| T62 | GFM table survives all sync paths | Column alignment, cell content preserved. Cosmetic normalization (padding) is acceptable. |
| T63 | Nested lists survive all sync paths | 2-level nesting, mixed ordered/unordered. Structure preserved. |
| T64 | Fenced code block with language tag survives all sync paths | ````typescript` preserved, content unmodified. |
| T65 | Links, images, bold, italic, inline code survive all sync paths | Standard inline formatting round-trips cleanly. |
| T66 | Empty document — all operations work | Create, edit, toggle, agent write, persist — all work on an empty doc without null/undefined errors. |
| T67 | Large document (~50KB, ~100 paragraphs) — all operations work | No performance degradation, no timeout, no truncation. |

### Persistence and recovery

| ID | Scenario | What to verify |
|---|---|---|
| T70 | Edit → persist → kill server → restart → content still there | Full lifecycle. Document survives server restart. |
| T71 | Edit → persist → git log shows commit on refs/wip/main | Git pipeline produces real commits. |
| T72 | Two users editing → persist → both edits in the .md file | Concurrent edits merge correctly in persistence output. |
| T73 | Agent writes → persist → .md file includes agent content | Agent content flows through full persistence pipeline. |
| T74 | Source mode edit → toggle back → persist → .md file correct | Source edits reach disk via CRDT → persistence. |
| T75 | Server crash during persist (simulate with kill -9) | No partial writes. Atomic file writes (temp + rename) prevent corruption. Next restart recovers from last good state. |

### Edge cases and stress

| ID | Scenario | What to verify |
|---|---|---|
| T80 | Toggle source while agent is mid-write | No crash. Partial agent content handled gracefully. |
| T81 | Close browser tab while in source mode with unsaved edits | Edits lost (expected) or prompted to save? Document behavior. |
| T82 | Open same document in 5 tabs simultaneously, all editing | System remains stable. CRDT handles 5-way concurrent edits. |
| T83 | Network disconnect while editing → reconnect | Offline edits sync on reconnect. No duplicate content. |
| T84 | Agent writes to a document that no browser tab has open | DirectConnection creates/loads the document. Content persists to disk. When a browser tab opens the document later, content is there. |
| T85 | Two agents writing to the same document simultaneously | Both agents' content present. CRDT resolves. No corruption. |
| T86 | Edit document A, switch to document B, switch back to A | Document A content preserved. No cross-document state leakage. |
| T87 | Unicode content — emoji, CJK, RTL text | Survives all sync paths without encoding issues. |
| T88 | Very long paragraph (10,000 characters, no line breaks) | No truncation, no performance cliff, renders and syncs correctly. |
| T89 | Document with 50+ void nodes | No performance degradation in rendering or sync. |
