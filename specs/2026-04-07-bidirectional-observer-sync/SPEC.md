# SPEC: Bidirectional Observer Sync — Full Collaborative Source Mode

**Status:** Draft
**Created:** 2026-04-07
**Baseline commit:** 9c07f4b
**Implementer:** AI coding agent (Claude Code)
**Location:** `init_spike/` (extends existing spike code)
**Nature:** Derisking spike. Validate that bidirectional observers between Y.XmlFragment and Y.Text enable full collaborative source mode with no shimmer, acceptable performance, and correct void node handling. Simplify the toggle path from serialize-on-toggle + three-way merge to show/hide.

**Pace:** Thoroughness over speed. The research says shimmer doesn't occur — this spike proves it under real editing conditions. Every validation must be tested with real content, real editors, real concurrent editing.

---

## 1. Problem Statement (SCR)

**Situation:** The init-spike validated the core editor stack (TipTap + Hocuspocus + Yjs v13). The agent-markdown-writes spike added a three-way merge for source toggle toggle-back and an agent markdown write endpoint. The foundation works: WYSIWYG editing, agent writes, persistence, void nodes, markdown round-trip.

**Complication:** The cross-mode sync matrix has 4 broken cells:

| Gap | What's broken |
|-----|--------------|
| Source ↔ Source (2 tabs) | Two users in source mode see nothing from each other. Independent text buffers. |
| Source → WYSIWYG (live) | Source mode edits don't flow to WYSIWYG tabs until user clicks toggle-back. |
| Source → Disk | Source mode edits are in-memory React state, not persisted until toggle-back. |
| WYSIWYG → Source (usable) | Y.Doc observer replaces entire CodeMirror buffer on every WYSIWYG keystroke, resetting cursor. |

**Note on gap decomposition:** 3 of 4 gaps share a single root cause (source mode has no CRDT binding) and are solved by Y.Text + y-codemirror.next + one-way Observer A alone. The 4th gap (live source→WYSIWYG) is the incremental win from bidirectional Observer B. The spike validates both layers: the guaranteed wins (Y.Text binding + Observer A) and the stretch validation (bidirectional Observer B with incremental Y.Text writes).

The current architecture uses a plain CodeMirror text buffer with no CRDT binding. The three-way merge on toggle-back is a workaround — it reconciles diverged state after the fact rather than preventing divergence.

**Resolution:** Add `Y.Text('source')` to the Y.Doc alongside `Y.XmlFragment('default')`. Bind CodeMirror to Y.Text via y-codemirror.next (collaborative). Run bidirectional observers: XmlFragment→Text (serialize on tree change) and Text→XmlFragment (parse + updateYFragment on text change). Transaction origin guards prevent infinite loops. The toggle simplifies from serialize-on-toggle + three-way merge to show/hide — both editors are always in sync via observers.

---

## 2. Success Criteria

### Primary: The sync matrix fills completely

After this spike, every CRDT-mediated cell in the sync matrix is green:

```
                    WYSIWYG   Source   Agent
WYSIWYG     →         ✅        ✅       ✅
Source      →         ✅        ✅       ✅
Agent       →         ✅        ✅       ✅
```

(Disk sync is Exploration 3 — not in scope here.)

### Secondary: Shimmer does not occur in practice

The shimmer research (~/reports/yjs-dual-key-shimmer-analysis/) confirmed 3 independent prevention mechanisms via source code analysis. This spike proves it empirically:

- **PASS:** A single keystroke in either editor produces at most 2 observer firings before dampening. No visible content flickering. No cursor jumps from observer-induced changes.
- **FAIL:** Observer firings cascade beyond 2 cycles, or visible content changes appear that the user didn't type. Document the exact content pattern that causes it.

### Tertiary: Toggle simplification

The toggle path changes from "serialize + snapshot + three-way merge" to "show/hide." Specifically:

- `getMarkdown()` call on toggle-to-source: removed (Y.Text already has current content)
- `snapshotMarkdown` state: removed
- `applyThreeWayMerge()` on toggle-back: removed
- `onContentChange` observer: removed (y-codemirror.next binding handles it natively)
- Three-way merge module: kept as utility (for disk bridge, Exploration 3) but not called from toggle path

---

## 3. What to Build

### 3.1 Add Y.Text to Y.Doc

**Y.Doc structure after this spike:**

```
Y.Doc
├── Y.XmlFragment('default')      ← TipTap binds here (unchanged)
├── Y.Text('source')              ← NEW — CodeMirror binds here via y-codemirror.next
└── Y.Map('metadata')             ← frontmatter cache (unchanged)
```

Both types are keys in the same Y.Doc. Hocuspocus syncs, persists, and broadcasts the entire Y.Doc — both types travel together automatically (confirmed by research: Doc.js:204-210, Document.ts:221-231).

**Where to create:** In the HocuspocusProvider singleton (TiptapEditor.tsx). The Y.Text is accessed via `provider.document.getText('source')`.

### 3.2 Bind CodeMirror to Y.Text via y-codemirror.next

**Current SourceEditor.tsx:** Creates a plain CodeMirror with `content` prop (React state) and `onChange` callback. No CRDT binding. Content is pushed in from App.tsx state.

**After this spike:** SourceEditor receives the Y.Text instance and binds via y-codemirror.next's `yCollab` extension. CodeMirror becomes a collaborative CRDT editor — two tabs in source mode see each other's keystrokes in real-time.

**y-codemirror.next binding pattern (from research report):**

```typescript
import { yCollab } from 'y-codemirror.next';

// In SourceEditor:
const ytext = provider.document.getText('source');
const extensions = [
  markdown(),
  yCollab(ytext, /* awareness */, { /* undoManager */ }),
  // ... other CM extensions
];
```

**Key constraint from research:** y-codemirror.next uses the `YSyncConfig` object instance as its transaction origin (not a string). It filters via strict reference equality (`tr.origin !== this.conf`). Any external write to Y.Text with a different origin is treated as a "remote" change and applied to CodeMirror correctly.

**SourceEditor props change:**

```typescript
// Before:
interface SourceEditorProps {
  content: string;
  onChange: (value: string) => void;
}

// After:
interface SourceEditorProps {
  ytext: Y.Text;
  provider: HocuspocusProvider;  // for awareness (cursor presence)
}
```

The `content`/`onChange` pattern is removed entirely — CodeMirror reads from and writes to Y.Text directly via the CRDT binding.

### 3.3 Bidirectional observers with transaction origin guards

**Observer A: XmlFragment → Text (tree changes → update Y.Text)**

Fires when TipTap/WYSIWYG content changes (user typing, agent writes via DirectConnection). Serializes Y.XmlFragment to markdown and writes to Y.Text.

```typescript
const ORIGIN_TREE_TO_TEXT = 'sync-from-tree';

xmlFragment.observeDeep((_events, transaction) => {
  // Skip changes that came FROM Y.Text (prevents loop)
  if (transaction.origin === ORIGIN_TEXT_TO_TREE) return;

  // Serialize current tree to markdown
  const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
  const body = mdManager.serialize(json);
  const md = prependFrontmatter(frontmatterRef.current, body);

  // INCREMENTAL write to Y.Text — NOT full replacement.
  // Full replacement (delete all + insert all) would tombstone concurrent
  // source-mode edits from y-codemirror.next. Instead, diff the current
  // Y.Text content against the serialized markdown and apply only the delta.
  // This makes Observer A's writes collaborative: concurrent source-mode
  // keystrokes are preserved as long as they don't overlap with the
  // tree-originated changes.
  const currentText = ytext.toString();
  if (currentText !== md) {
    const changes = diffLines(currentText, md);
    doc.transact(() => {
      let offset = 0;
      for (const change of changes) {
        if (change.removed) {
          ytext.delete(offset, change.value.length);
        } else if (change.added) {
          ytext.insert(offset, change.value);
          offset += change.value.length;
        } else {
          offset += change.value.length;
        }
      }
    }, ORIGIN_TREE_TO_TEXT);
  }
});
```

**CRITICAL: Observer A must use incremental writes, not full replacement.** The design challenge (meta/design-challenge.md H1) identified that `ytext.delete(0, length)` followed by `ytext.insert(0, md)` tombstones all Y.Text content, including concurrent source-mode keystrokes from y-codemirror.next. The incremental diff approach (using the `diff` package already in dependencies) applies only the delta — new paragraphs are inserted, deleted paragraphs are removed, unchanged content is retained with its CRDT history intact. This makes Observer A's writes collaborative: a WYSIWYG edit in Tab 1 produces a targeted Y.Text mutation that doesn't destroy Tab 2's source-mode keystrokes in unrelated paragraphs.

**Observer B: Text → XmlFragment (source changes → update Y.XmlFragment)**

Fires when CodeMirror/source content changes (user typing in source mode, or collaborative edits from another source-mode tab). Parses Y.Text as markdown and applies to Y.XmlFragment via updateYFragment.

```typescript
const ORIGIN_TEXT_TO_TREE = 'sync-from-text';

ytext.observe((_event, transaction) => {
  // Skip changes that came FROM Y.XmlFragment (prevents loop)
  if (transaction.origin === ORIGIN_TREE_TO_TEXT) return;

  // Also skip changes from y-codemirror.next's own internal sync
  // (these are already in Y.Text — no need to round-trip)
  // y-codemirror.next uses its YSyncConfig instance as origin
  // We need to check if this is a local CM edit vs remote sync
  
  const md = ytext.toString();
  const { frontmatter, body } = stripFrontmatter(md);

  // Parse and apply to tree
  const parsedJson = mdManager.parse(body);
  const pmNode = schema.nodeFromJSON(parsedJson);

  doc.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, xmlFragment, pmNode, meta);
    // Update frontmatter in metadata map
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', frontmatter);
  }, ORIGIN_TEXT_TO_TREE);
});
```

**Shimmer prevention (3 independent mechanisms, confirmed by research):**

1. **Transaction origin guards:** Each observer checks `transaction.origin` and skips changes from the other direction. Loop impossible.
2. **No-op delta detection:** If the round-trip is idempotent (confirmed by V1b), the re-serialized content equals the current content. Yjs does not fire observers for transactions that create/delete zero Items.
3. **Mutex guard:** y-prosemirror uses `lib0/mutex` to prevent synchronous re-entry.

**Debounce:** Apply 50ms debounce to both observers as a performance optimization. Does not affect CRDT ordering (debounce operates above the CRDT layer).

### 3.4 Simplify toggle to show/hide

**Current toggle-to-source flow (App.tsx:57-71):**
1. Call `editor.getMarkdown()` → serialize XmlFragment
2. Store `sourceContent` in React state
3. Store `snapshotMarkdown` for three-way merge
4. Mount SourceEditor with content

**After: toggle-to-source:**
1. Show SourceEditor (Y.Text already has current content from Observer A)
2. That's it.

**Current toggle-back flow (App.tsx:30-56):**
1. Unsubscribe Y.Doc observer
2. Call `applyThreeWayMerge(snapshotMarkdown, sourceContent)`
3. Handle errors, log conflicts
4. Hide SourceEditor

**After: toggle-back:**
1. Hide SourceEditor (Y.XmlFragment already has current content from Observer B)
2. That's it.

**State removed from App.tsx:**
- `sourceContent` — CodeMirror reads Y.Text directly
- `snapshotMarkdown` — no snapshot needed (no merge needed)
- `toggleError` — parse errors are handled by Observer B, not the toggle
- `onContentChange` observer subscription — y-codemirror.next binding handles sync
- `unsubscribeRef` — no manual observer management

**App.tsx becomes:**

```typescript
export function App() {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const editorRef = useRef<TiptapEditorHandle | null>(null);

  return (
    <div>
      <h1>Open Knowledge</h1>
      <button onClick={() => setIsSourceMode(!isSourceMode)}>
        {isSourceMode ? 'WYSIWYG' : 'Source'}
      </button>

      {isSourceMode && <SourceEditor ytext={...} provider={...} />}
      <div style={{ display: isSourceMode ? 'none' : 'block' }}>
        <TiptapEditor ref={editorRef} />
      </div>
    </div>
  );
}
```

**TiptapEditorHandle interface simplification:**

```typescript
// Before:
export interface TiptapEditorHandle {
  getMarkdown(): string;
  applyThreeWayMerge(snap: string, userEdited: string): ThreeWayMergeResult;
  onContentChange(callback: (md: string) => void): () => void;
}

// After:
export interface TiptapEditorHandle {
  getMarkdown(): string;              // kept for persistence/agent use
  getYText(): Y.Text;                 // NEW — for SourceEditor
  getProvider(): HocuspocusProvider;   // NEW — for SourceEditor awareness
}
```

### 3.5 Observer lifecycle and initialization

**When do observers start?** On app mount, after the HocuspocusProvider syncs. Observer A (tree→text) must run the initial sync to populate Y.Text from Y.XmlFragment content.

**Initial sync:** When the document first loads (via persistence.ts `onLoadDocument`), Y.XmlFragment is populated from the .md file. Observer A fires, populating Y.Text. If the document is new (empty), both types start empty.

**Observer error handling:** If Observer B's markdown parse fails (user typed invalid markdown in source mode), log the error but do NOT crash or disable the observer. The invalid state lives in Y.Text; Y.XmlFragment keeps its last valid state. When the user fixes the markdown, the next observer firing succeeds and syncs.

**Expected UX during active source typing:** While a source-mode user is actively typing, the WYSIWYG view may show stale content until the markdown becomes parseable. This is expected behavior, not a bug. Markdown is frequently invalid mid-keystroke (partial heading, incomplete code fence, unclosed emphasis). The 50ms debounce helps — it waits for a typing pause — but brief staleness during fast typing is inherent to the parse-based Observer B approach.

**Where observers live:** In the TiptapEditor component (or a dedicated module), registered after the HocuspocusProvider connects. They persist for the lifetime of the app — not tied to source mode toggle.

### 3.6 Agent write path changes

**POST /api/agent-write (raw Y.XmlElement):** No change. Agent writes to Y.XmlFragment → Observer A fires → Y.Text updates → CodeMirror shows the change.

**POST /api/agent-write-md (markdown):** Simplify. Currently serializes current Y.XmlFragment to markdown, splices agent content, re-parses, applies via updateYFragment. With bidirectional observers, the agent could write directly to Y.Text instead:

```typescript
// Before: serialize → splice → parse → updateYFragment (to XmlFragment)
// After:  just insert text into Y.Text → Observer B syncs to XmlFragment
doc.transact(() => {
  const currentLength = ytext.length;
  ytext.insert(currentLength, `\n\n${agentMarkdown}`);
}, 'agent-write');
```

This is simpler and more natural — the agent writes markdown text, the observer handles the tree update. **Evaluate during the spike:** does this produce the same quality results as the current serialize→splice→parse path? The direct Y.Text insertion preserves CRDT history for the inserted text (each character has its own CRDT ID), while the updateYFragment approach replaces the entire tree.

### 3.7 Persistence layer impact

**No changes required.** The persistence layer (persistence.ts) reads from Y.XmlFragment via `onStoreDocument`. Observer B keeps Y.XmlFragment in sync with Y.Text, so persistence continues to work as before. The persistence layer is unaware of Y.Text's existence.

**Source mode edits now persist automatically:** User edits in source → Y.Text changes → Observer B updates Y.XmlFragment → Hocuspocus debounce fires `onStoreDocument` → .md file written → git commit scheduled. No toggle-back required for persistence.

### 3.8 Three-way merge disposition

**Removed from toggle path.** The toggle is show/hide — no merge needed.

**Kept as utility module.** `three-way-merge.ts` stays in the codebase for:
- **Disk bridge (Exploration 3):** External file changes need to merge with current Y.Doc state. That IS a snapshot→diff→merge problem.
- **Fallback:** If bidirectional observers prove unreliable for a specific content pattern, the three-way merge can be re-enabled as a safety net.

**Tests updated:** The existing three-way merge tests in `agent-flow.test.ts` continue to pass (the module still works). New tests verify the observer sync path.

---

## 4. Implementation Order

```
Phase 1: Infrastructure
  - Add Y.Text('source') to Y.Doc
  - Wire observers (A and B) with origin guards
  - Debounce (50ms)
  - Observer error handling
  - Initial sync on document load

Phase 2: SourceEditor binding
  - Replace plain CodeMirror with y-codemirror.next binding
  - Remove content/onChange props
  - Pass Y.Text + provider

Phase 3: Toggle simplification
  - Remove serialize-on-toggle from App.tsx
  - Remove snapshotMarkdown, sourceContent, toggleError state
  - Remove applyThreeWayMerge from toggle path
  - Remove onContentChange observer
  - Simplify TiptapEditorHandle interface

Phase 4: Agent write simplification
  - Evaluate direct Y.Text insertion vs current serialize→splice→parse path
  - Update agent-sim.ts if write path changes

Phase 5: Validation + RESULTS.md
  - Run all applicable test scenarios
  - Measure shimmer (observer firing count per keystroke)
  - Measure performance (toggle time, serialization latency)
  - Document findings in RESULTS.md
```

---

## 5. Tech Stack

Same as init-spike. **New dependency required:** `y-codemirror.next` must be explicitly added to `package.json` — it exists in `node_modules/` as a transitive dependency but is NOT listed as a direct dependency. The V4a evaluation path (Yjs v14) never executed (V7 FAIL → V4b), so y-codemirror.next was never imported.

```bash
bun add y-codemirror.next
```

**Verify during Phase 1:** `y-codemirror.next` peer dependencies are compatible with `yjs@^13.6.30` and `@codemirror/state@^6.0.0` (research report confirms: requires `yjs@^13.5.6`, `@codemirror/state@^6.0.0`, `@codemirror/view@^6.0.0` — all satisfied).

---

## 6. Scope Boundaries

**In scope:**
- Y.Text added to Y.Doc
- Bidirectional observers with origin guards
- y-codemirror.next binding for SourceEditor
- Toggle simplification (show/hide)
- Agent write path evaluation
- Shimmer validation (empirical)
- Performance measurement
- All applicable test scenarios from the universal test matrix
- Void node (jsx-component) fidelity through observer cycle

**Out of scope:**
- Disk bridge / file watcher (@parcel/watcher) — Exploration 3, separate spike **(Explored)** — heavily researched in ~/reports/parcel-watcher-crdt-disk-bridge/, has own spec slot, ready to promote
- Awareness / cursor presence in source mode — **(Identified)** — y-codemirror.next's yCollab supports awareness parameter, UX design needed
- Per-block code toggle — existing feature, unchanged **(Noted)**
- Prop panel / component editing UI — existing void node UX, unchanged **(Noted)**
- Changes outside init_spike/ (scope constraint)

*Note: This is a derisking spike, not a full feature spec. Consumer Matrix, User Journeys, and surface-area maps are omitted as the spike has a single consumer (init_spike codebase) and a single user journey (cross-mode collaborative editing).*

---

## 7. Test Scenarios

### From the universal test matrix (specs/next-sync-explorations.md)

**Multi-tab source mode (P0 — these are the primary validation):**

| ID | Scenario |
|---|---|
| T20 | Tab 1 in source, Tab 2 in source — Tab 1 types, Tab 2 sees it |
| T21 | Tab 1 and Tab 2 both in source, typing in different paragraphs — both edits present |
| T22 | Tab 1 and Tab 2 both in source, editing the SAME line — document the CRDT merge behavior |
| T23 | Tab 1 in source toggles back to WYSIWYG — Tab 2 still in source, unaffected |

**Cross-mode sync (P0):**

| ID | Scenario |
|---|---|
| T30 | Tab 1 in WYSIWYG types — paragraph appears in Tab 2's source view. No cursor jump in Tab 2. |
| T31 | Tab 1 in source types — paragraph appears in Tab 2's WYSIWYG. Live, not on toggle-back. |
| T32 | Tab 1 in WYSIWYG types rapidly (~60 WPM), Tab 2 in source watching — source view keeps up |
| T33 | Tab 1 in WYSIWYG, Tab 2 in source editing — simultaneous, non-conflicting → both survive |

**Agent writes (P0):**

| ID | Scenario |
|---|---|
| T40 | Agent writes while editor in WYSIWYG — paragraph appears immediately |
| T41 | Agent writes while editor in source — paragraph appears in source view |
| T44 | User typing in WYSIWYG while agent writes simultaneously — both present, no jank |
| T45 | User typing in source while agent writes simultaneously — non-conflicting → both present |
| T47 | Agent writes while two tabs open (one WYSIWYG, one source) — appears in both |

**Shimmer validation (P0 — spike-specific):**

| ID | Scenario |
|---|---|
| S01 | Type a character in WYSIWYG → count observer firings. Must be ≤2 before dampening. |
| S02 | Type a character in source mode → count observer firings. Must be ≤2. |
| S03 | Paste a large block (test fixture) in WYSIWYG → observer fires, Y.Text updates, no cascading. |
| S04 | Paste markdown in source mode → observer fires, Y.XmlFragment updates, no cascading. |
| S05 | Type tilde code fence (~~~) in source → observer normalizes to backtick (```) → dampens in ≤2 cycles. |
| S06 | Rapid typing in WYSIWYG (hold a key) → source view stays in sync, no accumulation of stale updates. |

**Content fidelity (P0):**

| ID | Scenario |
|---|---|
| T60 | Frontmatter survives observer cycle (XmlFragment→Text→XmlFragment) |
| T61 | Void node (jsx-component) survives observer cycle — fenced code block with exact JSX string |
| T62 | GFM table survives observer cycle |
| T63 | Nested lists survive observer cycle |
| T64 | Fenced code block with language tag survives observer cycle |
| T65 | Links, images, bold, italic, inline code survive observer cycle |

**Component editing UX through observers (P0):**

| ID | Scenario |
|---|---|
| T100 | Slash command inserts Callout → observer propagates to Y.Text → source tab sees fenced code block |
| T101 | Prop panel edit → observer preserves the change in Y.Text |
| T104 | 5 consecutive void nodes — observer serialization fidelity |
| T105 | Agent writes a component via markdown endpoint → renders as preview in WYSIWYG, visible in source |
| T106 | Component with multiline children through observer cycle |
| T107 | Delete a void node in WYSIWYG → observer removes from Y.Text |

**MDX content fidelity (P1):**

| ID | Scenario |
|---|---|
| T90 | Simple void node (`<Callout>`) survives observer cycle |
| T91 | Void node with expression props survives observer cycle |
| T93 | Void node with closing ``` inside JSX — backtick fence handling |
| T97 | Agent writes a void node → renders in WYSIWYG, visible in source |
| T99 | Void node content edited in source mode → re-renders on toggle to WYSIWYG |

**Toggle simplification (P0):**

| ID | Scenario |
|---|---|
| TS01 | Toggle to source → CodeMirror shows current content (from Y.Text, not serialized on demand) |
| TS02 | Toggle back to WYSIWYG → TipTap shows current content (already synced via Observer B) |
| TS03 | Toggle 10 times rapidly → no state corruption, no stale content |
| TS04 | Toggle while agent is writing → no crash, content consistent after toggle |

**Undo/redo (P0):**

| ID | Scenario |
|---|---|
| U01 | User types in source mode, presses Ctrl+Z → only user's edit is undone, observer-synced content in XmlFragment NOT affected |
| U02 | User types in WYSIWYG, presses Ctrl+Z → only user's edit is undone, observer-synced content in Y.Text NOT affected |
| U03 | Agent writes while user is editing → user presses Ctrl+Z → agent's content is NOT undone by user's undo |
| U04 | If UndoManager cannot exclude observer origins → document the failure mode and whether it blocks the spike |

**Performance (P1):**

| ID | Scenario |
|---|---|
| P01 | Observer serialization latency for test fixture (~1KB) — target: <10ms |
| P02 | Observer serialization latency for large document (~50KB) — target: <100ms |
| P03 | Toggle time (show/hide) — target: <10ms (no serialization involved) |

---

## 8. Fallback

If bidirectional observers fail (shimmer occurs for a content pattern, or performance is unacceptable):

1. **Disable Observer B (Text→XmlFragment).** Source mode becomes collaborative (via Y.Text + y-codemirror.next) but edits only flow to Y.XmlFragment on explicit toggle-back.
2. **Re-enable three-way merge on toggle-back.** The module still exists. The toggle-back path reverts to snapshot + diff + merge.
3. **Keep Observer A (XmlFragment→Text).** WYSIWYG changes and agent writes still flow to source mode in real-time.

This fallback gives us collaborative source mode + live WYSIWYG→source sync, but not live source→WYSIWYG sync. It's strictly better than what we have today (plain text buffer with no CRDT).

---

## 9. Decision Log

| # | Decision | Resolution | Confidence | Evidence |
|---|----------|-----------|------------|----------|
| D1 | Y.Text key name: 'source' | DIRECTED | HIGH | Descriptive, doesn't collide with 'default' (XmlFragment) |
| D2 | Bidirectional observers, not one-way | DIRECTED | HIGH | Shimmer analysis confirms safety (~/reports/yjs-dual-key-shimmer-analysis/). Bidirectional eliminates toggle serialize/merge complexity. |
| D3 | 50ms debounce on both observers | DIRECTED | MEDIUM | Research recommends 200-500ms for one-way. Bidirectional needs tighter sync for live cross-mode editing. 50ms balances responsiveness vs CPU. Verify empirically. |
| D4 | Observer origin as string, not symbol | DIRECTED | HIGH | Yjs transaction origins are compared by identity. Strings work for our guards since we control both sides. y-codemirror.next uses object reference (YSyncConfig instance) — no collision with our string origins. |
| D5 | Three-way merge removed from toggle path, kept as module | DIRECTED | HIGH | Toggle is show/hide — no merge needed. Module useful for disk bridge (Exploration 3). |
| D6 | SourceEditor receives Y.Text + provider, not content string | LOCKED | HIGH | y-codemirror.next requires Y.Text binding. React state intermediary is eliminated. |
| D7 | Agent markdown write path: evaluate direct Y.Text insertion | INVESTIGATING | MEDIUM | Direct Y.Text insertion is simpler but changes CRDT history semantics. Spike will evaluate. |
| D8 | Fallback strategy: disable Observer B, re-enable three-way merge, keep Observer A | DIRECTED | HIGH | Graceful degradation if bidirectional fails. One-way observer still delivers 3/4 sync gaps. |
| D9 | Observer module: dedicated file, not inline in TiptapEditor | DIRECTED | HIGH | Separation of concerns. Observers are complex enough to warrant their own module. |
| D10 | Observer A uses incremental Y.Text writes (diff-based), not full replacement | LOCKED | HIGH | Full replacement destroys concurrent source-mode edits. Incremental writes are collaborative. Design challenge H1. |

---

## 10. Assumptions

| # | Assumption | Confidence | Verification | Expiry |
|---|-----------|------------|-------------|--------|
| A1 | y-codemirror.next@0.3.5 is compatible with yjs@13.6.30 | HIGH | Check peer deps during Phase 1 | Phase 1 |
| A2 | Observer debounce at 50ms is responsive enough for live cross-mode editing | MEDIUM | Empirical test during Phase 5 | Phase 5 |
| A3 | Void nodes (jsx-component fenced code blocks) round-trip idempotently through the observer cycle | HIGH | V1b proved this for single round-trip; observer cycle is repeated round-trips | Phase 5 |
| A4 | y-codemirror.next's undoManager works correctly alongside our custom observers | MEDIUM | Not tested — may need to configure undoManager origins to exclude observer writes | Phase 2 |

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Observer B parse error on invalid markdown (user mid-typing in source) | HIGH | LOW | Observer logs error, Y.XmlFragment keeps last valid state. User sees the error in WYSIWYG only after fixing markdown in source. |
| R2 | Observer performance degrades on large documents (50KB+) | MEDIUM | MEDIUM | Debounce. If still too slow, debounce increases or observers become incremental (only re-serialize changed subtree). |
| R3 | y-codemirror.next's internal sync conflicts with Observer A's Y.Text writes | LOW | HIGH | Research confirms this doesn't happen (different origins, correct dispatch). But if it does, Observer A needs to be paused when source mode is active (fallback to one-way). |
| R4 | Undo/redo behavior breaks — user undoes their edit but also undoes an observer write | MEDIUM | MEDIUM | Configure undoManager's tracked origins to exclude observer origins. Undo only tracks user-initiated changes. |

---

## 12. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Does y-codemirror.next's yCollab extension handle undo correctly when external writes (from observers) modify Y.Text? | Technical | P0 | Resolves during Phase 2 |
| OQ2 | Should Observer B parse the full markdown on every Y.Text change, or can it diff and apply incrementally? | Technical | P1 | Start with full parse. Optimize if P02 performance target missed. |
| OQ3 | How should Observer B handle frontmatter? Y.Text includes frontmatter as text. Observer B needs to strip it before parsing. | Technical | P0 | Use existing stripFrontmatter utility. Update Y.Map('metadata') in the same transaction. |
| OQ4 | How to configure UndoManager tracked origins to exclude observer writes? Does y-codemirror.next expose this? Does y-prosemirror's undoManager also need configuration for Observer B writes? | Technical | P0 | Resolves during Phase 2. If unresolvable, add to STOP_IF. |
| OQ5 | Observer registration race on initial document load: what if HocuspocusProvider syncs before the observer is registered (Y.Text never gets initial content), or observer fires before document loads (writes empty content to Y.Text)? | Technical | P0 | Need to register observer after provider.on('synced') fires. Resolves during Phase 1. |

---

## 13. Agent Constraints

**SCOPE:** Only files within `init_spike/`. Core files to modify: `src/App.tsx`, `src/editor/TiptapEditor.tsx`, `src/editor/SourceEditor.tsx`. New file for observer module. Test files in `src/server/agent-flow.test.ts` (extend or new file).

**EXCLUDE:** Do not modify persistence.ts (persistence is unaware of Y.Text). Do not modify hocuspocus-plugin.ts unless agent write path changes (D7). Do not touch files outside init_spike/.

**STOP_IF:**
- Shimmer cascades beyond 2 observer cycles for any content pattern — document the pattern, fall back to one-way observer
- y-codemirror.next binding causes Y.Doc corruption or state inconsistency
- UndoManager cannot exclude observer origins AND undo reverts observer-synced content (user's undo desynchronizes the views) — document the failure, evaluate whether one-way fallback resolves it

**ASK_FIRST:**
- Before changing the agent markdown write endpoint path (D7 — this affects agent API contract)
- Before adding any package not already in package.json

---

## 14. Key Research References

| Report | Relevance |
|--------|-----------|
| `~/reports/yjs-constrained-observer-sync/` | Observer mechanics, y-codemirror.next binding internals, transaction origins, toggle-back protocol |
| `~/reports/yjs-dual-key-shimmer-analysis/` | Shimmer prevention proof (3 mechanisms), round-trip idempotency, cascade analysis |
| `~/reports/mdx-cross-mode-sync-implications/` | Void node handling through observers, MDX construct coverage, comparison matrix |
| `~/reports/parcel-watcher-crdt-disk-bridge/` | Future: disk bridge uses three-way merge module we're keeping |
| `init_spike/RESULTS.md` | Current sync matrix, V1b convergence data, V4b toggle architecture |
| `specs/next-sync-explorations.md` | Decision record, test matrix (103+ scenarios), execution plan |
