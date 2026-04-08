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

```bash
bun run src/server/agent-sim.ts                      # Single raw Y.XmlElement write
bun run src/server/agent-sim.ts --rapid 5            # 5 raw writes, 100ms apart
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
└── Y.Map('metadata')         ← frontmatter cache

Observer A: XmlFragment → Text (incremental diff-based writes, origin: 'sync-from-tree')
Observer B: Text → XmlFragment (parse + updateYFragment, origin: 'sync-from-text')
```

Both modes are always in sync. Toggle is show/hide — no serialization or merge needed.

## Key files

- `vite.config.ts` — Vite + Hocuspocus plugin
- `src/App.tsx` — Main app, source toggle (show/hide)
- `src/editor/TiptapEditor.tsx` — WYSIWYG editor, HocuspocusProvider singleton, observer setup
- `src/editor/SourceEditor.tsx` — CodeMirror 6 with y-codemirror.next CRDT binding
- `src/editor/observers.ts` — Bidirectional observer module (Observer A + B with origin guards, debounce, error handling)
- `src/editor/three-way-merge.ts` — Three-way merge utility (kept for future disk bridge use, not in toggle path)
- `src/editor/extensions/frontmatter.ts` — Frontmatter strip/prepend
- `src/editor/extensions/jsx-component.ts` — Void node extension with dynamic backtick fencing (priority 60)
- `src/editor/extensions/JsxComponentView.tsx` — React node view renderer
- `src/editor/Callout.tsx` — Sample React component for void node
- `src/server/hocuspocus-plugin.ts` — Embedded Hocuspocus v4 + DirectConnection APIs + disk bridge wiring
- `src/server/agent-sim.ts` — CLI tool to simulate agent writes
- `src/server/persistence.ts` — CRDT → markdown → disk → git pipeline (with writeTracker for disk bridge)
- `src/server/file-watcher.ts` — Disk bridge: @parcel/watcher for external editor sync
- `content/test-fixture.md` — Test markdown file with all content patterns
- `tests/e2e/sync.spec.ts` — Playwright E2E browser tests (12 tests)
- `tests/e2e/qa-scenarios.spec.ts` — Playwright QA scenarios (11 tests)

## Research references

If you hit a wall, check these reports for context:
- `../../reports/source-toggle-architecture/` — source toggle options
- `../../reports/peritext-on-yjs-feasibility/` — Yjs v14 delta protocol
- `../../reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fix recipes
- `../../reports/crdt-mcp-filesystem-bridge/` — file watcher + persistence
- `../../reports/yjs-dual-key-shimmer-analysis/` — shimmer prevention analysis
- `../../reports/parcel-watcher-crdt-disk-bridge/` — @parcel/watcher for disk bridge
- `../../specs/2026-04-07-bidirectional-observer-sync/SPEC.md` — bidirectional observer sync spec
