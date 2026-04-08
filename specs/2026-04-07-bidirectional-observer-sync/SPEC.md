# SPEC: Bidirectional Observer Sync — Full Collaborative Source Mode

**Status:** Draft
**Created:** 2026-04-07
**Baseline commit:** 9c07f4b
**Implementer:** AI coding agent (Claude Code)
**Location:** `init_spike/` (extends existing spike code)
**Nature:** Foundational architecture. This builds the collaborative source mode that everything else depends on — multi-user editing, agent co-creation, cross-mode sync. The bidirectional observer layer is the bridge between WYSIWYG and source that makes the product work as one cohesive editor, not two disconnected tools. Write it like production code: clean architecture, proper error handling, well-structured modules. The validations are end-to-end integration tests that prove the foundation works.

**Pace:** There is no time pressure. Take as long as needed. The goal is thoroughness and quality, not speed. Every validation should be done methodically and completely — understand what you're building before you build it, read the research reports when you hit uncertainty, and don't move to the next validation until the current one is solid.

---

## 1. Problem Statement (SCR)

**Situation:** The init-spike validated the core editor stack (TipTap + Hocuspocus + Yjs v13). The agent-markdown-writes spike added a three-way merge for source toggle toggle-back and an agent markdown write endpoint. The foundation works: WYSIWYG editing, agent writes, persistence, void nodes, markdown round-trip.

**Complication:** The cross-mode sync matrix has 5 broken cells:

| Gap | What's broken |
|-----|--------------|
| Source ↔ Source (2 tabs) | Two users in source mode see nothing from each other. Independent text buffers. |
| Source → WYSIWYG (live) | Source mode edits don't flow to WYSIWYG tabs until user clicks toggle-back. |
| Source → Disk | Source mode edits are in-memory React state, not persisted until toggle-back. |
| WYSIWYG → Source (usable) | Y.Doc observer replaces entire CodeMirror buffer on every WYSIWYG keystroke, resetting cursor. |
| Disk → Browser | External editor saves (VS Code, Cursor, vim) are not reflected in the browser editor. No file watcher exists. |

**Note on gap decomposition:** 3 of 5 gaps share a single root cause (source mode has no CRDT binding) and are solved by Y.Text + y-codemirror.next + one-way Observer A alone. The 4th gap (live source→WYSIWYG) is the incremental win from bidirectional Observer B. The 5th gap (disk → browser) is independent and addressed by the disk bridge (Section 3.10) using @parcel/watcher. This work validates all three layers: the guaranteed wins (Y.Text binding + Observer A), the stretch validation (bidirectional Observer B with incremental Y.Text writes), and the disk bridge.

The current architecture uses a plain CodeMirror text buffer with no CRDT binding. The three-way merge on toggle-back is a workaround — it reconciles diverged state after the fact rather than preventing divergence.

**Resolution:** Add `Y.Text('source')` to the Y.Doc alongside `Y.XmlFragment('default')`. Bind CodeMirror to Y.Text via y-codemirror.next (collaborative). Run bidirectional observers: XmlFragment→Text (serialize on tree change) and Text→XmlFragment (parse + updateYFragment on text change). Transaction origin guards prevent infinite loops. The toggle simplifies from serialize-on-toggle + three-way merge to show/hide — both editors are always in sync via observers.

---

## 2. Success Criteria

### End-to-End Validation Principle

**Every validation must be tested "for real" — against real files, with real editors, using real browser sessions, and using the AI coding agent itself (Claude Code) as the agent writer.** No mock unit tests as a substitute for integration testing. Server-side unit tests verify CRDT mechanics; they do NOT replace browser-level verification.

Specifically:
- **Real browser sessions** — TipTap and CodeMirror run in actual browser tabs, not jsdom/happy-dom. The observer sync is tested by typing in one tab and watching the other tab update.
- **Real multi-tab testing** — open two real browser tabs to verify cross-mode sync. Tab 1 in WYSIWYG, Tab 2 in source. Type in one, verify the other updates. This is the core validation — if it doesn't work in real browser tabs, it doesn't work.
- **Real WebSocket connections** — Hocuspocus sync over actual WebSocket, not mocked transports. Both tabs connect via the same Hocuspocus server.
- **Real AI agent writes** — use Claude Code itself to run agent-sim.ts and watch the content appear in both editor modes. The implementer IS the agent.
- **Real concurrent editing** — two tabs editing simultaneously, not sequential. Type in both tabs at the same time and verify no content loss or corruption.
- **Shimmer measured empirically** — instrument observer firing count per keystroke. Not "the research says it doesn't shimmer" — measure it.

The validation procedure for each scenario describes the manual steps to execute. Results are observed visually in the browser and verified by inspecting the Y.Doc state. Screenshots and terminal output are valid evidence.

### Primary: The sync matrix fills completely

After this work, the complete sync matrix is green:

```
                    WYSIWYG   Source   Disk   Agent
WYSIWYG     →         ✅        ✅      ✅      ✅
Source      →         ✅        ✅      ✅      ✅
Disk        →         ✅        ✅      —       —
Agent       →         ✅        ✅      ✅      —
```

### Secondary: Shimmer does not occur in practice

The shimmer research (~/reports/yjs-dual-key-shimmer-analysis/) confirmed 3 independent prevention mechanisms via source code analysis. This work proves it empirically:

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

**Y.Doc structure after this work:**

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

**After:** SourceEditor receives the Y.Text instance and binds via y-codemirror.next's `yCollab` extension. CodeMirror becomes a collaborative CRDT editor — two tabs in source mode see each other's keystrokes in real-time.

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

**CRITICAL: Observer A must use incremental writes, not full replacement.** The design challenge (meta/design-challenge.md H1) identified that `ytext.delete(0, length)` followed by `ytext.insert(0, md)` tombstones all Y.Text content, including concurrent source-mode keystrokes from y-codemirror.next. The incremental diff approach (using the `diff` package already in dependencies) applies only the delta — new paragraphs are inserted, deleted paragraphs are removed, unchanged content is retained with its CRDT history intact.

**Diff granularity — hybrid approach (line-level → character-level within changed lines):**

The spec snippet above uses `diffLines` for simplicity. `diffLines` is fast but coarse: a within-line edit (bolding a word, changing a link) replaces the entire line. For a source-mode user with their cursor in that line, the line delete+insert may reset their cursor position — failing T30's "no cursor jump" criterion for same-line cross-mode edits.

The recommended implementation uses a **hybrid approach**:

1. Run `diffLines(currentText, md)` to identify changed line ranges (fast, ~2ms for 1KB)
2. For each changed range, run `diffChars(oldLine, newLine)` to compute character-level deltas within the line
3. Apply character-level deltas to Y.Text — preserves cursor position naturally for within-line edits

The hybrid keeps performance bounded by changed-line length (not full document length) while producing minimal CRDT mutations. Trade-off: ~3-5ms typical vs ~2ms for pure `diffLines`. The cursor preservation benefit outweighs the small performance cost for cross-mode editing.

**Validate during implementation:** Measure cursor preservation in scenario T30 with both `diffLines`-only and the hybrid approach. If `diffLines` is sufficient (cursor doesn't visibly jump), use it. If not, use the hybrid.

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

This is simpler and more natural — the agent writes markdown text, the observer handles the tree update. **Evaluate during implementation:** does this produce the same quality results as the current serialize→splice→parse path? The direct Y.Text insertion preserves CRDT history for the inserted text (each character has its own CRDT ID), while the updateYFragment approach replaces the entire tree.

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

### 3.9 Fix triple backtick bug in jsx-component extension

The `renderMarkdown` function in `jsx-component.ts` hardcodes 3 backticks for the fenced code block delimiter. If the JSX content itself contains triple backticks (e.g., a component that renders a code example), the fence closes prematurely and the void node breaks.

**Fix:** Count the longest consecutive backtick sequence in the JSX content. Use N+1 backticks for the outer fence.

```typescript
// In renderMarkdown:
function fenceFor(content: string): string {
  const maxRun = (content.match(/`+/g) || []).reduce(
    (max, run) => Math.max(max, run.length), 2
  );
  return '`'.repeat(maxRun + 1);
}

// Usage:
const fence = fenceFor(node.attrs.content);
state.write(`${fence}jsx-component\n`);
state.text(node.attrs.content, false);
state.write(`\n${fence}`);
state.closeBlock(node);
```

This is ~5 lines and directly affects content fidelity through the observer cycle (T93 tests this case).

---

### 3.10 Disk bridge — external editor sync via @parcel/watcher

**What it does:** Watches the content directory for external file changes (VS Code, Cursor, vim). When an external editor saves a .md file, the watcher reads the file, parses it, and applies the changes to the Y.Doc via updateYFragment. With bidirectional observers active (Section 3.3), the change then propagates from Y.XmlFragment → Y.Text → CodeMirror automatically.

**New dependency:**

```bash
bun add @parcel/watcher
```

**Architecture:**

```
External editor saves .md file
  → macOS FSEvents (1ms latency)
  → @parcel/watcher C++ debounce (50ms min, 500ms max)
  → JavaScript callback with { path, type: 'create'|'update'|'delete' }
  → Content-hash check: is this our own persistence write? → skip
  → Read file → strip frontmatter → parse markdown → updateYFragment
  → Observer A propagates to Y.Text → CodeMirror updates
```

**Implementation:**

1. **Watcher module** (`src/server/file-watcher.ts`):

```typescript
import { subscribe } from '@parcel/watcher';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Content-hash tracker — populated by persistence layer before disk writes
// TTL cleanup prevents unbounded growth from missed watcher events.
export const writeTracker = new Map<string, { hash: string; timestamp: number }>();
const WRITE_TRACKER_TTL_MS = 10_000;

function evictStaleTrackerEntries() {
  const now = Date.now();
  for (const [path, entry] of writeTracker) {
    if (now - entry.timestamp > WRITE_TRACKER_TTL_MS) {
      writeTracker.delete(path);
    }
  }
}

export async function startWatcher(
  contentDir: string,
  onExternalChange: (docName: string, content: string) => Promise<void>,
) {
  return subscribe(contentDir, async (err, events) => {
    if (err) { console.error('[file-watcher]', err); return; }

    for (const event of events) {
      // Filter to .md files only (no native include option)
      if (!event.path.endsWith('.md')) continue;
      if (event.type === 'delete') continue; // Handle separately

      const content = await readFile(event.path, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');

      // Self-write check (Layer 1)
      const tracked = writeTracker.get(event.path);
      if (tracked && tracked.hash === hash) {
        writeTracker.delete(event.path);
        continue; // Our own persistence write — skip
      }

      const docName = pathToDocName(event.path, contentDir);
      await onExternalChange(docName, content);
    }
  });
}
```

2. **Persistence layer integration** — Before writing to disk, record the content hash:

```typescript
// In persistence.ts onStoreDocument, BEFORE writeFile:
writeTracker.set(filePath, {
  hash: createHash('sha256').update(markdown).digest('hex'),
  timestamp: Date.now(),
});
```

3. **Upgrade Hocuspocus to v4-rc.** The disk bridge needs `skipStoreHooks` to prevent persistence from re-writing files we just loaded from disk. This is a v4 API (`LocalTransactionOrigin.skipStoreHooks`). Verified absent in v3.4.4 (`node_modules/@hocuspocus/server@3.4.4`), present in v4 (`~/.claude/oss-repos/hocuspocus/packages/server/src/types.ts:16-18`).

```bash
bun add @hocuspocus/server@4.0.0-rc.1 @hocuspocus/provider@4.0.0-rc.1
```

Verify after upgrade: existing init_spike functionality still works (V2, V3, V5 validations still pass).

4. **Apply external changes to Y.Doc** — Only for documents already open in Hocuspocus (Strategy C: piggyback on open documents, don't force-load). Apply via CRDT merge — Yjs's conflict resolution handles concurrent browser + external edits correctly:

```typescript
import type { LocalTransactionOrigin } from '@hocuspocus/server';

async function handleExternalChange(docName: string, content: string, filePath: string) {
  // Only sync documents already open in the browser
  if (!hocuspocus.documents.has(docName)) return;

  const document = hocuspocus.documents.get(docName);
  const { frontmatter, body } = stripFrontmatter(content);
  const parsedJson = mdManager.parse(body);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const xmlFragment = document.getXmlFragment('default');

  // Layer 2: skipStoreHooks prevents persistence from re-writing the file
  // we just loaded from disk. Hocuspocus v4 inspects the transaction origin
  // and skips onStoreDocument when skipStoreHooks is true.
  document.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);
    const metaMap = document.getMap('metadata');
    metaMap.set('frontmatter', frontmatter);
  }, {
    source: 'local',
    skipStoreHooks: true,
    context: { origin: 'file-watcher' },
  } satisfies LocalTransactionOrigin);
}
```

**Two-layer feedback prevention:**

- **Layer 1 (content hash):** Watcher callback compares the file content hash against `writeTracker`. Skips if it matches our own persistence write. Handles 4 of 5 race scenarios.
- **Layer 2 (skipStoreHooks):** Watcher-originated transactions tell Hocuspocus to skip `onStoreDocument`. The disk write doesn't propagate back to disk, so the watcher doesn't fire for it. Handles the 5th race scenario (rapid persistence + external write within the 50ms coalescing window).

Together, the two layers eliminate feedback loops regardless of round-trip idempotency.

---

**Hocuspocus v3.4.4 fallback path** *(only if v4-rc proves irreparably broken)*

If the v4-rc upgrade introduces blockers we cannot resolve (provider incompatibility, runtime crashes, broken transitive deps), fall back to v3.4.4 with single-layer feedback prevention:

1. Revert package.json to `@hocuspocus/server@^3.4.0` and `@hocuspocus/provider@^3.4.0`
2. Replace the `LocalTransactionOrigin` object with a string origin: `document.transact(() => {...}, 'file-watcher')`
3. Drop Layer 2 — Layer 1 (content hash) becomes the sole feedback defense
4. **Elevate A3 (round-trip idempotency) to a load-bearing invariant** — every test fixture content pattern must produce identical bytes after parse + serialize. If a pattern doesn't (e.g., tilde fence → backtick fence normalization in S05), the disk bridge can produce a feedback loop for that pattern.
5. Add a test scenario (FW01) verifying idempotency for every content type in the test fixture. Any non-idempotent pattern blocks the disk bridge for that content type.

**Scope of the fallback:** ~30 lines of code change in `file-watcher.ts` and `persistence.ts`, plus the new idempotency test. The architecture is otherwise unchanged. The disk bridge still works for the common case; the failure mode is a small performance cost (one extra disk write + one extra watcher event per non-idempotent edit) rather than data loss or infinite loops.

**Decision criteria for falling back:** v4-rc has a runtime crash that doesn't have a workaround within 1 day of investigation, OR `@hocuspocus/provider@4.0.0-rc.1` is incompatible with a critical transitive dep we can't replace.

4. **Wire into Vite plugin** — Start the watcher in `hocuspocus-plugin.ts` `configureServer()` after Hocuspocus is ready:

```typescript
configureServer(server) {
  // ... existing WebSocket setup ...
  
  // Start file watcher for external editor sync
  startWatcher(CONTENT_DIR, handleExternalChange).then(subscription => {
    server.httpServer?.on('close', () => subscription.unsubscribe());
  });
}
```

**Concurrent edit handling:**

When both a browser user and an external editor modify the same document simultaneously, the disk bridge applies the external change via `updateYFragment`. Yjs's CRDT conflict resolution merges the external change with in-flight browser edits at the structural level — both sets of changes survive, with conflicts resolved by Yjs's deterministic algorithm.

This is the **CRDT-merge strategy** (not a deferral strategy). Differences from a hypothetical "defer" strategy:
- Defer: external change ignored, overwritten by next persistence write. External editor's change lost. Simpler but data-lossy.
- Merge (this design): external change applied via `updateYFragment` alongside browser edits. CRDT handles structural conflicts. More data-preserving, depends on `updateYFragment`'s diff against in-flight Y.Doc state.

**Trade-offs:**
- **Pros:** No data loss for non-overlapping edits. Same code path as toggle-back and Observer B (we already trust `updateYFragment` to merge concurrent edits).
- **Cons:** Quality of the merge depends on `updateYFragment`'s tree diff. For deeply overlapping edits (both editing the same paragraph mid-keystroke), Yjs's deterministic resolution may not match user intent. This is the same R3 risk that the three-way merge module addresses for source toggle.
- **Three-way merge for disk:** The three-way merge module (Section 3.8) could be used here for smarter merging. Future work — needs the snapshot mechanism.

**Test scenario T53 reflects the merge strategy:** "Edit .md file externally while user is typing in WYSIWYG — both edits survive via CRDT merge."

**File events:**

| Event | Action |
|-------|--------|
| `update` | Read file, hash check, parse, updateYFragment |
| `create` | Same as update (new .md file created externally) |
| `delete` | Log warning. Do NOT close the Y.Doc — the user may be editing. The document persists in memory until all connections close. |

**@parcel/watcher on macOS:**
- FSEvents backend, 2-52ms latency from file save to JS callback
- Atomic writes (temp+rename) produce a single clean `update` event
- 50ms debounce coalesces rapid saves (~2 callbacks/second max)
- 1000 files: single FSEvents stream, ~144KB memory, negligible CPU
- No native .md filter — filter in JS callback
- VS Code uses truncate-and-write (not atomic), Cursor inherits this — both produce single `update` events

**Key research reference:** `~/reports/parcel-watcher-crdt-disk-bridge/` — all 9 dimensions traced at source-code level.

---

## 4. Implementation Order

```
Phase 0: Dependency upgrades
  - bun add y-codemirror.next
  - bun add @hocuspocus/server@4.0.0-rc.1 @hocuspocus/provider@4.0.0-rc.1
  - bun add @parcel/watcher
  - Verify init_spike still works after Hocuspocus v4 upgrade:
    * V2: dev server starts, WebSocket connects on /collab
    * V3: agent-sim writes appear in browser
    * V5: persistence writes .md and creates git commits
  - If v4-rc breaks anything, fall back to v3.4.4 per Section 3.10

Phase 1: Infrastructure
  - Fix triple backtick bug in jsx-component renderMarkdown (Section 3.9)
  - Add Y.Text('source') to Y.Doc
  - Wire observers (A and B) with origin guards and incremental writes
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

Phase 5: Disk bridge
  - Install @parcel/watcher
  - Create file-watcher.ts module
  - Wire content-hash tracking into persistence.ts
  - Wire watcher into Vite plugin configureServer
  - Test: edit .md file externally → appears in browser editor
  - Test: feedback loop prevention (no ping-pong)

Phase 6: Validation + RESULTS.md
  - Run all applicable test scenarios
  - Measure shimmer (observer firing count per keystroke)
  - Measure performance (toggle time, serialization latency)
  - Document findings in RESULTS.md
```

---

## 5. Tech Stack

Same as init_spike foundation, with two changes:

**1. New dependency: `y-codemirror.next`** — must be explicitly added. Exists in `node_modules/` as a transitive dependency but is NOT listed as a direct dependency. The V4a evaluation path (Yjs v14) never executed (V7 FAIL → V4b), so y-codemirror.next was never imported.

```bash
bun add y-codemirror.next
```

Verify peer dependencies: requires `yjs@^13.5.6`, `@codemirror/state@^6.0.0`, `@codemirror/view@^6.0.0` — all satisfied by current init_spike deps.

**2. Hocuspocus upgrade: v3.4.4 → v4.0.0-rc.1** — needed for the disk bridge's `skipStoreHooks` API (Section 3.10). v4 is a release candidate, not the `latest` tag, but it's installable and stable enough for our use case.

```bash
bun add @hocuspocus/server@4.0.0-rc.1 @hocuspocus/provider@4.0.0-rc.1
```

**3. New dependency: `@parcel/watcher`** — for the disk bridge file watcher.

```bash
bun add @parcel/watcher
```

**Verify after upgrade:** Existing init_spike validations still pass (V2 Hocuspocus embedding, V3 DirectConnection, V5 persistence). If v4-rc breaks any of these, see the v3.4.4 fallback path documented in Section 3.10.

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
- Disk bridge via @parcel/watcher for external editor interop
- Content-hash feedback loop prevention
- Triple backtick bug fix in jsx-component extension

**Out of scope:**
- ~~Disk bridge~~ — moved in scope (Section 3.10)
- Awareness / cursor presence in source mode — **(Identified)** — y-codemirror.next's yCollab supports awareness parameter, UX design needed
- Per-block code toggle — existing feature, unchanged **(Noted)**
- Prop panel / component editing UI — existing void node UX, unchanged **(Noted)**
- ~~Triple backtick bug~~ — moved in scope (Section 3.9)
- Typed void node registry — per-component extensions (CalloutNode, TabsNode, etc.) with typed attributes and auto-generated prop panels from TypeScript interfaces. TQ27/PQ8. This spec validates existing void nodes survive observers, not that we expand the component set. **(Explored)** — component inventory complete (agents-docs: ~20 components, 846 uses), architecture defined in PROJECT.md PQ8
- Init-spike browser verification gaps — cursor preservation during agent writes (V3 step 5), controlled two-tab sync test (V2), source toggle button click (V4). The End-to-End Validation Principle in this spec should cover these naturally since the same scenarios reappear. **(Identified)** — T30, T20, TS01 cover the same flows
- Changes outside init_spike/ (scope constraint)

*Note: Consumer Matrix, User Journeys, and surface-area maps are omitted as this work has a single consumer (init_spike codebase) and a single user journey (cross-mode collaborative editing). The surface area is fully described in Section 3.*

---

## 7. Test Scenarios

Every scenario must pass before this work is considered complete. Scenarios are tagged P0 (must pass) or P1 (target). All P0 scenarios are validated against real browser sessions, real WebSocket connections, real concurrent editing, and real agent writes per the End-to-End Validation Principle in Section 2.

**Single-user editing (P0):**

| ID | Scenario |
|---|---|
| E01 | Type a paragraph in WYSIWYG → content persists, renders correctly, no console errors |
| E02 | Type a paragraph in source mode → content persists, syntax highlighting works, CRDT-backed via Y.Text |
| E03 | Toggle WYSIWYG → source → WYSIWYG with no edits → content identical before and after, zero diff |
| E04 | Toggle WYSIWYG → source, edit, toggle back → edit appears in WYSIWYG, no content loss |
| E05 | Toggle WYSIWYG → source, edit, toggle back — 10 times in a row → content stable, no progressive drift |

**Multi-tab WYSIWYG collaboration (P0):**

| ID | Scenario |
|---|---|
| W01 | Tab 1 types in WYSIWYG, Tab 2 in WYSIWYG → both see each other's keystrokes in real-time, sub-second latency |
| W02 | Tab 1 types at top of doc, Tab 2 types at bottom — simultaneously → no content interleaving or corruption |
| W03 | Tab 1 bolds a word while Tab 2 italicizes an overlapping range → both marks applied to overlap (Peritext boundary test) |
| W04 | Tab 1 deletes a paragraph while Tab 2 is editing inside it → no crash, graceful resolution, document structurally valid |

**Multi-tab source mode (P0 — primary validation):**

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

**Shimmer validation (P0):**

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

**Fallback validation (P0):**

| ID | Scenario |
|---|---|
| FB01 | Disable Observer B (simulate bidirectional fallback) → re-enable three-way merge on toggle-back → verify three-way merge module still works after Phases 1-3 changes (the three-way-merge.ts module is preserved as a utility) |

**Disk sync (P0):**

| ID | Scenario |
|---|---|
| T50 | Edit in WYSIWYG, wait — .md file on disk reflects changes (existing, re-verify with observers active) |
| T51 | Edit .md file in external editor (vim/echo), save — WYSIWYG editor reflects changes within 2-52ms + parse time |
| T52 | Edit .md file externally while editor is in source mode — source view updates (via observer chain: disk→XmlFragment→Y.Text→CodeMirror) |
| T53 | Edit .md file externally while user is typing in WYSIWYG — both edits survive via CRDT merge. For non-overlapping changes, both present. For overlapping changes (same paragraph), document the merge outcome. |
| T54 | Delete .md file externally while document is open — no crash, editor retains content, warning logged |
| T55 | Create new .md file in content directory externally — not auto-loaded (Strategy C: piggyback only), loads on next browser access |
| T56 | Rapid external saves (~1/sec for 10 sec, simulating Cursor auto-save) — system keeps up, no feedback loops |
| T57 | Edit in WYSIWYG → persistence writes to disk → edit same file externally → external edit appears in editor (self-write correctly skipped, external write processed) |
| T58 | Persistence write and external write within same 50ms coalescing window — document the behavior (Scenario 4 from research: CRDT wins, external change may be lost) |

**Undo/redo (P0):**

| ID | Scenario |
|---|---|
| U01 | User types in source mode, presses Ctrl+Z → only user's edit is undone, observer-synced content in XmlFragment NOT affected |
| U02 | User types in WYSIWYG, presses Ctrl+Z → only user's edit is undone, observer-synced content in Y.Text NOT affected |
| U03 | Agent writes while user is editing → user presses Ctrl+Z → agent's content is NOT undone by user's undo |
| U04 | If UndoManager cannot exclude observer origins → document the failure mode and whether it blocks the implementation |

**Persistence and recovery (P0):**

| ID | Scenario |
|---|---|
| PR01 | Edit → persist → kill server → restart → content still there (full lifecycle across restart) |
| PR02 | Edit → persist → `git log refs/wip/main` shows commit with the changes |
| PR03 | Two users editing → persist → both edits in the .md file after debounce |
| PR04 | Agent writes → persist → .md file includes agent content |
| PR05 | Source mode edit → persist directly (no toggle-back needed, since source writes flow through Observer B to XmlFragment to persistence) — .md file correct |
| PR06 | Server crash during persist (simulate with kill -9) → no partial writes, atomic file writes (temp+rename) prevent corruption, next restart recovers from last good state |

**Edge cases and stress (P1):**

| ID | Scenario |
|---|---|
| EC01 | Toggle source while agent is mid-write → no crash, partial agent content handled gracefully |
| EC02 | Close browser tab while in source mode with unsaved edits → edits persist via CRDT sync (no manual save), other tabs unaffected |
| EC03 | Open same document in 5 tabs simultaneously, all editing → system stable, CRDT handles 5-way concurrent edits |
| EC04 | Network disconnect while editing → reconnect → offline edits sync, no duplicate content |
| EC05 | Agent writes to a document that no browser tab has open → content persists to disk, when a browser opens the document later, content is there |
| EC06 | Two agents writing to the same document simultaneously → both agents' content present, CRDT resolves, no corruption |
| EC07 | Unicode content — emoji, CJK, RTL text — survives all sync paths without encoding issues |
| EC08 | Very long paragraph (10,000 characters, no line breaks) → no truncation, no performance cliff, renders and syncs correctly |
| EC09 | Document with 50+ void nodes → no performance degradation in rendering or sync |

**Performance (P1):**

| ID | Scenario |
|---|---|
| P01 | Observer A serialization latency for test fixture (~1KB) — target: <10ms |
| P02 | Observer A serialization latency for large document (~50KB) — target: <100ms |
| P03 | Toggle time (show/hide) — target: <10ms (no serialization involved) |
| PB01 | Observer B parse + updateYFragment latency for ~1KB — target: <15ms |
| PB02 | Observer B parse + updateYFragment latency for ~50KB — target: <150ms (must stay within 50ms debounce budget for typical edits) |

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
| D7 | Agent markdown write path: evaluate direct Y.Text insertion | INVESTIGATING | MEDIUM | Direct Y.Text insertion is simpler but changes CRDT history semantics. Evaluate during implementation. |
| D8 | Fallback strategy: disable Observer B, re-enable three-way merge, keep Observer A | DIRECTED | HIGH | Graceful degradation if bidirectional fails. One-way observer still delivers 3/4 sync gaps. |
| D9 | Observer module: dedicated file, not inline in TiptapEditor | DIRECTED | HIGH | Separation of concerns. Observers are complex enough to warrant their own module. |
| D10 | Observer A uses incremental Y.Text writes (diff-based), not full replacement | LOCKED | HIGH | Full replacement destroys concurrent source-mode edits. Incremental writes are collaborative. Design challenge H1. |

---

## 10. Assumptions

| # | Assumption | Confidence | Verification | Expiry |
|---|-----------|------------|-------------|--------|
| A1 | y-codemirror.next@0.3.5 is compatible with yjs@13.6.30 | HIGH | Check peer deps during Phase 1 | Phase 1 |
| A6 | Hocuspocus v4.0.0-rc.1 is stable enough for our use case (DirectConnection, persistence hooks, WebSocket sync) | MEDIUM | Phase 1: install v4-rc, run existing init_spike validations (V2/V3/V5). If broken, fall back per Section 3.10. | Phase 1 |
| A2 | Observer debounce at 50ms is responsive enough for live cross-mode editing | MEDIUM | Empirical test during Phase 5 | Phase 5 |
| A3 | Void nodes (jsx-component fenced code blocks) round-trip idempotently through the observer cycle | HIGH | V1b proved this for single round-trip; observer cycle is repeated round-trips | Phase 5 |
| A4 | y-codemirror.next's undoManager works correctly alongside our custom observers | MEDIUM | Not tested — may need to configure undoManager origins to exclude observer writes | Phase 2 |
| A5 | Y.Text('source') contains the full markdown document including frontmatter, not just body content | LOCKED | Observer A's `prependFrontmatter()` writes the full document to Y.Text. Observer B's `stripFrontmatter()` separates them on read. This is load-bearing — if Y.Text ever contains body-only, frontmatter would be lost. | n/a |

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
| OQ3 | ~~How should Observer B handle frontmatter?~~ **RESOLVED** | Technical | P0 | Observer B strips frontmatter via stripFrontmatter() before parsing markdown body. Updates Y.Map('metadata') with the frontmatter in the same transaction. Implemented in Section 3.3 Observer B code. |
| OQ4 | How to configure UndoManager tracked origins to exclude observer writes? Does y-codemirror.next expose this? Does y-prosemirror's undoManager also need configuration for Observer B writes? | Technical | P0 | Resolves during Phase 2. If unresolvable, add to STOP_IF. |
| OQ5 | Observer registration race on initial document load: what if HocuspocusProvider syncs before the observer is registered (Y.Text never gets initial content), or observer fires before document loads (writes empty content to Y.Text)? | Technical | P0 | Need to register observer after provider.on('synced') fires. Resolves during Phase 1. |

---

## 13. Agent Constraints

**SCOPE:** Only files within `init_spike/`. Core files to modify: `src/App.tsx`, `src/editor/TiptapEditor.tsx`, `src/editor/SourceEditor.tsx`, `src/editor/extensions/jsx-component.ts`, `src/server/persistence.ts` (content-hash tracking), `src/server/hocuspocus-plugin.ts` (watcher setup + agent write path). New files: observer module, `src/server/file-watcher.ts`. Test files in `src/server/` (extend or new).

**EXCLUDE:** Do not touch files outside init_spike/.

**STOP_IF:**
- Shimmer cascades beyond 2 observer cycles for any content pattern — document the pattern, fall back to one-way observer
- y-codemirror.next binding causes Y.Doc corruption or state inconsistency
- Either UndoManager (y-codemirror.next OR y-prosemirror) cannot exclude observer origins AND undo reverts observer-synced content (user's undo desynchronizes the views) — document the failure, evaluate whether one-way fallback resolves it

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
| `~/reports/parcel-watcher-crdt-disk-bridge/` | Disk bridge implementation details — @parcel/watcher internals, feedback loop prevention, concurrent edit scenarios, all 9 dimensions traced at source code level |
| `init_spike/RESULTS.md` | Current sync matrix, V1b convergence data, V4b toggle architecture |
