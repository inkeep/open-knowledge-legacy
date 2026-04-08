# Open Knowledge — Foundation

## Commands

```bash
bun run dev          # Start Vite dev server + Hocuspocus (http://localhost:5173)
bun run test         # Unit + integration tests (excludes Playwright E2E)
bun run test:e2e     # Playwright browser E2E tests (starts dev server automatically)
bun run check:fast   # Typecheck + lint (~5s) — run after every change
bun run check        # Full gate: typecheck + lint + test + build
bun run format       # Auto-fix formatting via Biome
bun run build        # TypeScript check + Vite production build
```

### Agent simulator (requires dev server running)

Simulates agent writes with full presence UX: agent appears in presence bar, writes flash, undo works.

```bash
bun run src/server/agent-sim.ts                      # Single Y.Text write (with awareness + activity)
bun run src/server/agent-sim.ts --rapid 5            # 5 writes, 100ms apart (tests flash debounce)
bun run src/server/agent-sim.ts --markdown           # Single markdown write (unified path)
bun run src/server/agent-sim.ts --markdown --rapid 5 # 5 markdown writes, 100ms apart
```

## Verification

Before declaring any validation complete: `bun run check:fast`
Before declaring all work done: `bun run check`

## Quality

- This is foundational code — write it like it will be built upon.
- Proper TypeScript types, no `any` without justification.
- Clean module boundaries (editor/, server/, v7-test/).
- Biome formatting enforced — run `bun run format` if lint fails.
- Take your time. Thoroughness matters more than speed.

## Research

When you hit uncertainty or want to understand how others solve something:
- Use web search to look up API details, patterns, and prior art.
- Check `~/.claude/oss-repos/` for local copies of key repos (yjs, y-prosemirror, tiptap, hocuspocus, y-codemirror.next, etc.) — read source code directly.
- Use `/eng:research` skill for deeper investigation when warranted.
- The research reports in `../../reports/` have deep analysis — read them when the spec references them.

## Architecture

The editor uses bidirectional CRDT observer sync between WYSIWYG and source mode:

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
├── Y.Text('source')          ← CodeMirror binds here via y-codemirror.next
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution side-channel

Observer A: XmlFragment → Text (incremental diff-based writes, origin: 'sync-from-tree')
Observer B: Text → XmlFragment (parse + updateYFragment, origin: 'sync-from-text')
```

Both modes are always in sync. Toggle is show/hide — no serialization or merge needed.

### Presence & awareness

Human and agent collaboration is visible in real-time via the Yjs awareness protocol:

- **Human cursors** — CollaborationCursor (WYSIWYG) + yCollab awareness (Source)
- **Agent activity flash** — Y.Map('activity') triggers CSS `@keyframes` animation on affected regions
- **Per-origin undo** — server-side UndoManager tracks `'agent-write'` origin, exposed via HTTP
- **Presence bar** — React component watching `awareness.on('change')`

Agent writes use `dc.document.transact(fn, 'agent-write')` (not `conn.transact()` which hardcodes origin). Agent UndoManager is server-side because HocuspocusProvider overwrites remote transaction origins.

```
Agent write flow:
  HTTP POST → getAgentSession() → set awareness('editing')
  → dc.document.transact(fn, 'agent-write')
    → Y.Text mutation + Y.Map('activity') entry (same transaction)
  → set awareness('idle')
  → Observer B propagates to XmlFragment → browser flash plugin triggers
```

### API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/agent-write` | Agent write via Y.Text (simple text append) |
| POST | `/api/agent-write-md` | Agent markdown write via Y.Text (Observer B propagates) |
| POST | `/api/agent-undo` | Undo last agent edit (server-side UndoManager) |
| POST | `/api/agent-redo` | Redo last undone agent edit |
| GET | `/api/agent-undo-status` | Check canUndo/canRedo without side effects |
| POST | `/api/test-reset` | Reset document + close agent sessions (E2E test isolation) |

## Key files

**App & layout:**
- `src/App.tsx` — Main app, presence bar + toolbar + mode toggle + agent undo button
- `vite.config.ts` — Vite + Hocuspocus plugin

**Editors:**
- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider singleton, CollaborationCursor, awareness state init, flash plugin
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next CRDT binding + awareness + flash
- `src/editor/observers.ts` — Bidirectional observer module (Observer A + B with origin guards, debounce, error handling)
- `src/editor/three-way-merge.ts` — Three-way merge utility (kept for future disk bridge use)
- `src/editor/extensions/frontmatter.ts` — Frontmatter strip/prepend
- `src/editor/extensions/jsx-component.ts` — Void node extension with dynamic backtick fencing (priority 60)
- `src/editor/extensions/JsxComponentView.tsx` — React node view renderer

**Presence & awareness:**
- `src/presence/identity.ts` — Identity system (useIdentity hook, getIdentity, AwarenessState types, random name/color generation)
- `src/presence/PresenceBar.tsx` — Presence bar component showing all connected participants
- `src/presence/AgentUndoButton.tsx` — Undo agent edit button with useAgentUndo hook
- `src/presence/use-presence.ts` — usePresence hook (watches awareness.on('change'))
- `src/editor/plugins/agent-flash-wysiwyg.ts` — ProseMirror plugin: flash on agent write (direct DOM)
- `src/editor/plugins/agent-flash-source.ts` — CodeMirror extension: flash on agent write (StateEffect/StateField)
- `src/editor/plugins/flash-shared.ts` — Shared flash constants and utilities

**Server:**
- `src/server/hocuspocus-plugin.ts` — Embedded Hocuspocus v4 + DirectConnection APIs + agent sessions + UndoManager + disk bridge
- `src/server/agent-sim.ts` — CLI tool to simulate agent writes (awareness + activity + undo demo)
- `src/server/persistence.ts` — CRDT → markdown → disk → git pipeline
- `src/server/file-watcher.ts` — Disk bridge: @parcel/watcher for external editor sync

**Design system (copied from ~/agents):**
- `src/lib/utils.ts` — cn() utility (clsx + tailwind-merge)
- `src/components/ui/button.tsx` — Button component (CVA variants)
- `src/components/ui/badge.tsx` — Badge component (CVA variants)
- `src/components/ui/tooltip.tsx` — Tooltip component (Radix)
- `src/components/icons/claude.tsx` — Claude sparkle icon
- `src/globals.css` — Tailwind v4 @theme tokens + agent-flash keyframe

**Tests:**
- `src/presence/identity.test.ts` — Identity system unit tests (11 tests)
- `src/editor/observers.test.ts` — Observer + agent-write origin + undo tests (100 tests total)
- `tests/e2e/sync.spec.ts` — Playwright E2E browser tests
- `tests/e2e/qa-scenarios.spec.ts` — Playwright QA scenarios

## Research references

If you hit a wall, check these reports for context:
- `../../reports/source-toggle-architecture/` — source toggle options
- `../../reports/peritext-on-yjs-feasibility/` — Yjs v14 delta protocol
- `../../reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fix recipes
- `../../reports/crdt-mcp-filesystem-bridge/` — file watcher + persistence
- `../../reports/yjs-dual-key-shimmer-analysis/` — shimmer prevention analysis
- `../../reports/parcel-watcher-crdt-disk-bridge/` — @parcel/watcher for disk bridge
- `../../specs/2026-04-07-bidirectional-observer-sync/SPEC.md` — bidirectional observer sync spec
- `../../specs/2026-04-08-presence-awareness-ux/SPEC.md` — presence & awareness UX spec (S5 v0)
