# Open Knowledge — Foundation

## Commands

```bash
bun run dev          # Start Vite dev server + Hocuspocus (http://localhost:5173)
bun run check:fast   # Typecheck + lint (~5s) — run after every change
bun run check        # Full gate: typecheck + lint + build
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
- `src/editor/TiptapEditor.tsx` — WYSIWYG editor (V1, V3, V6)
- `src/editor/SourceEditor.tsx` — CodeMirror source view (V4)
- `src/server/hocuspocus-plugin.ts` — Embedded Hocuspocus (V2)
- `src/server/agent-sim.ts` — DirectConnection write simulator (V3)
- `src/server/persistence.ts` — onStoreDocument + git pipeline (V5)
- `content/test-fixture.md` — Test markdown file

## Research references

If you hit a wall, check these reports for context:
- `../../reports/source-toggle-architecture/` — source toggle options
- `../../reports/peritext-on-yjs-feasibility/` — Yjs v14 delta protocol
- `../../reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fix recipes
- `../../reports/crdt-mcp-filesystem-bridge/` — file watcher + persistence
- `../../specs/2026-04-07-init-spike/SPEC.md` — this spec (section 5b has implementation notes)
