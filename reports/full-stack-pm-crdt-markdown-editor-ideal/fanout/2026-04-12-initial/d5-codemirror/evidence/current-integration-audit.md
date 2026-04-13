# Current CodeMirror Integration Audit

## Source: packages/app/src/editor/SourceEditor.tsx, observers.ts, plugins/

### SourceEditor.tsx

React component accepting `ytext: Y.Text` and `HocuspocusProvider`.

**Extensions configured:**
- `basicSetup` — standard CM6 setup (gutter, folding, search)
- `markdown()` — **no config** → `commonmarkLanguage` (strict CommonMark, no GFM!)
- `yCollab(ytext, provider.awareness)` — Yjs binding (default UndoManager)
- `EditorView.lineWrapping` — text wrapping
- `createAgentFlashSourceExtension()` — agent edit flash
- `createWikiLinkSourceExtension()` — wiki-link highlighting/navigation/completion
- Theme compartment — light/dark via `@uiw/codemirror-theme-basic`

### Bidirectional Sync (observers.ts)

**Observer A (XmlFragment → Y.Text):**
- Origin: `'sync-from-tree'`
- Debounced 50ms
- `diffLinesFast()` for incremental delta
- Skips remote (non-local) transactions; refreshes baseline only

**Observer B (Y.Text → XmlFragment):**
- Origin: `'sync-from-text'`
- Debounced 50ms
- `mdManager.parse()` + `updateYFragment()`
- Deferred 300ms while user types in WYSIWYG
- Early-exit if tree already matches

### Custom Extensions

**Agent Flash** (`plugins/agent-flash-source.ts`):
- StateField + StateEffect pattern
- Line-level decorations with CSS animation
- Observes Y.Map('activity')

**Wiki Links** (`plugins/wiki-link-source.ts`):
- Regex-based ViewPlugin decorations (`/\[\[[^\]]*?\]\]/g`)
- NOT a Lezer parser extension — wiki-links are not in syntax tree
- Ctrl/Cmd+Click navigation to `#/{page}?anchor={slug}`
- Completion source via markdown language data (`/api/pages`, `/api/page-headings`)
- Fuzzy matching via `fuzzysort`

### Dependencies (from package.json)

| Package | Version |
|---|---|
| @codemirror/lang-markdown | ^6.5.0 |
| @codemirror/state | ^6.6.0 |
| @codemirror/view | ^6.41.0 |
| @codemirror/autocomplete | ^6.20.1 |
| codemirror | ^6.0.2 |
| y-codemirror.next | ^0.3.5 |
| @uiw/codemirror-theme-basic | ^4.25.9 |
| yjs | ^13.6.30 |

### Identified Gaps

1. **No GFM highlighting** — `markdown()` called without `base: markdownLanguage`
2. **No frontmatter highlighting** — `---` blocks not recognized
3. **No MDX/JSX highlighting** — no extension available
4. **Wiki-links are decoration-only** — not in syntax tree, so no fold/indent/tree queries
