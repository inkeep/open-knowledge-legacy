# Open Knowledge — Foundation

## Commands

```bash
bun run dev          # Start Vite dev server + Hocuspocus (http://localhost:5173)
bun run check:fast   # Typecheck + lint (~5s) — run after every change
bun run check        # Full gate: typecheck + lint + build
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

## Key files

- `vite.config.ts` — Vite + Hocuspocus plugin (V2)
- `src/App.tsx` — Main app with source toggle state, Y.Doc observer for live agent writes in source mode (V4, A1)
- `src/editor/TiptapEditor.tsx` — WYSIWYG editor with Hocuspocus collab (V1, V3, V6)
- `src/editor/SourceEditor.tsx` — CodeMirror 6 source view (V4)
- `src/editor/three-way-merge.ts` — Three-way merge for source toggle-back: preserves agent writes in untouched paragraphs (A2)
- `src/editor/extensions/frontmatter.ts` — Frontmatter strip/prepend (V1)
- `src/editor/extensions/jsx-component.ts` — Void node extension, priority 60 (V6)
- `src/editor/extensions/JsxComponentView.tsx` — React node view renderer (V6)
- `src/editor/Callout.tsx` — Sample React component for void node (V6)
- `src/server/hocuspocus-plugin.ts` — Embedded Hocuspocus + DirectConnection APIs: `/api/agent-write` (raw) and `/api/agent-write-md` (markdown) (V2, V3, A1)
- `src/server/agent-sim.ts` — CLI tool to simulate agent writes: `--markdown` flag for unified write path (V3, A1)
- `src/server/persistence.ts` — CRDT → markdown → git pipeline (V5)
- `content/test-fixture.md` — Test markdown file with all content patterns

## Research references

If you hit a wall, check these reports for context:
- `../../reports/source-toggle-architecture/` — source toggle options
- `../../reports/peritext-on-yjs-feasibility/` — Yjs v14 delta protocol
- `../../reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fix recipes
- `../../reports/crdt-mcp-filesystem-bridge/` — file watcher + persistence
- `../../specs/2026-04-07-init-spike/SPEC.md` — this spec (section 5b has implementation notes)
