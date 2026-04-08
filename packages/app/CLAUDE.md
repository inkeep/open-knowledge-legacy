# open-knowledge-app

React editor frontend — TipTap WYSIWYG + CodeMirror source mode with real-time CRDT collaboration.

## Commands

```bash
bun run dev        # Start Vite dev server + Hocuspocus (http://localhost:5173)
bun run test       # Unit + integration tests (excludes Playwright E2E)
bun run test:e2e   # Playwright browser E2E tests
bun run check:fast # Typecheck + lint
bun run check      # Full gate: typecheck + lint + test + build
bun run build      # TypeScript check + Vite production build
```

## Architecture

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds here via y-codemirror.next
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution side-channel

Observer A: XmlFragment → Text (incremental diff-based writes, origin: 'sync-from-tree')
Observer B: Text → XmlFragment (parse + updateYFragment, origin: 'sync-from-text')
```

### Presence & Awareness

- Human cursors via CollaborationCursor (WYSIWYG) + yCollab (Source)
- Agent activity flash via Y.Map('activity') → CSS @keyframes
- Per-origin undo via server-side UndoManager
- PresenceBar watches awareness.on('change')

### Dev Mode

The Vite plugin (`src/server/hocuspocus-plugin.ts`) imports from `@inkeep/open-knowledge-server` to create a Hocuspocus instance with persistence, agent sessions, and API endpoints — all running in the same process as Vite.

## Key Files

**Editors:**
- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider, flash plugin
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next
- `src/editor/observers.ts` — Bidirectional observer sync (Observer A + B)
- `src/editor/three-way-merge.ts` — Three-way merge for source mode toggle-back
- `src/editor/extensions/jsx-component.ts` — Extends core JsxComponent with React NodeView
- `src/editor/extensions/shared.ts` — App-specific sharedExtensions (core + React NodeView)

**Presence:**
- `src/presence/identity.ts` — useIdentity hook (types/utils from @inkeep/open-knowledge-core)
- `src/presence/PresenceBar.tsx` — Presence bar component
- `src/presence/AgentUndoButton.tsx` — Undo agent edit button

**Server (dev only):**
- `src/server/hocuspocus-plugin.ts` — Vite plugin using @inkeep/open-knowledge-server
- `src/server/agent-sim.ts` — CLI tool to simulate agent writes
