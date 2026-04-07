# Open Knowledge — Init Spike

Foundational bootstrapping of the core editor + CRDT + persistence stack. This spike validates 7 load-bearing architectural assumptions end-to-end before building the full product.

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) >= 1.3.11

```bash
cd init_spike
bun install
bun run dev        # Starts Vite dev server + embedded Hocuspocus on http://localhost:5173
```

Open `http://localhost:5173` in a browser. The editor loads `content/test-fixture.md` via Hocuspocus and renders it in TipTap. Open a second tab to see real-time collaboration.

## Architecture

```
Browser (React 19 + Vite 6)
  |
  |-- TiptapEditor (WYSIWYG, @tiptap v3 + y-prosemirror via @tiptap/extension-collaboration)
  |-- SourceEditor (CodeMirror 6, markdown syntax highlighting)
  |-- Source toggle (App.tsx manages serialize-on-toggle between editors)
  |
  |-- WebSocket (/collab) ─────────────────────────────────┐
                                                           v
                                              Hocuspocus v3.4 (embedded in Vite)
                                                |
                                                |-- Y.Doc (Yjs v13 CRDT)
                                                |-- DirectConnection API (POST /api/agent-write)
                                                |-- Persistence extension:
                                                      Layer 1: Y.Doc -> markdown -> disk (2s debounce)
                                                      Layer 2: disk -> git refs/wip/main (30s debounce)
```

**Key architectural decisions:**
- Hocuspocus embeds in Vite's dev server via `configureServer()` hook with a standalone `ws.WebSocketServer` (no conflict with Vite HMR)
- Source toggle uses serialize-on-toggle (V4b): WYSIWYG serializes to markdown for CodeMirror, CodeMirror content applies back via `updateYFragment()` (diff-based, preserves collaboration state)
- Yjs v14 dual-view was investigated (V7) and found not viable -- v14 beta lacks the unified YType needed
- Void nodes (JSX components) use `atom: true` TipTap nodes with `ReactNodeViewRenderer`, round-tripping as fenced code blocks with `jsx-component` info string
- Git persistence uses plumbing commands (`write-tree`, `commit-tree`, `update-ref`) to write to `refs/wip/main` without checkout

## File Structure

```
init_spike/
  content/
    test-fixture.md              # Test markdown file with all content patterns
  src/
    App.tsx                      # Main app: source toggle state management
    main.tsx                     # React root
    editor/
      TiptapEditor.tsx           # WYSIWYG editor with Hocuspocus collaboration
      SourceEditor.tsx           # CodeMirror 6 source view
      Callout.tsx                # Sample React component for void node rendering
      extensions/
        frontmatter.ts           # YAML frontmatter strip/prepend for round-trip
        jsx-component.ts         # TipTap void node extension (atom, priority 60)
        JsxComponentView.tsx     # React node view renderer for JSX components
    server/
      hocuspocus-plugin.ts       # Vite plugin: Hocuspocus + DirectConnection API
      persistence.ts             # CRDT -> markdown -> git pipeline
      agent-sim.ts               # CLI tool to simulate agent writes
    v1a-roundtrip-test.ts        # Raw markdown round-trip measurement
    v1b-roundtrip-test.ts        # Round-trip measurement with fixes applied
    v7-test/                     # Isolated Yjs v14 investigation (separate deps)
  vite.config.ts                 # Vite + React + Hocuspocus plugin
  biome.jsonc                    # Biome formatter + linter config
  tsconfig.json                  # TypeScript strict mode
```

## Commands

```bash
bun run dev          # Start Vite dev server + Hocuspocus (http://localhost:5173)
bun run build        # TypeScript check + Vite production build
bun run check:fast   # Typecheck + lint (~5s)
bun run check        # Full quality gate: typecheck + lint + build
bun run format       # Auto-fix formatting via Biome
```

**Agent simulator (requires dev server running):**

```bash
bun run src/server/agent-sim.ts            # Single DirectConnection write
bun run src/server/agent-sim.ts --rapid 5  # 5 writes, 100ms apart
```

## Validation Results

7 validations tested the load-bearing architectural assumptions. See [RESULTS.md](./RESULTS.md) for full evidence.

| Validation | Result | Summary |
|-----------|--------|---------|
| V7: Yjs v14 delta protocol | FAIL | Unified YType not available; y-prosemirror v2 doesn't exist |
| V2: Hocuspocus in Vite | PASS | Embeds via standalone WebSocketServer, no HMR conflict |
| V1a: Markdown round-trip (raw) | Ground truth | 3 semantic losses: frontmatter, images, task checkboxes |
| V1b: Markdown round-trip (fixed) | PASS | Zero semantic loss after ~80 LOC fixes. Convergence confirmed. |
| V3: DirectConnection writes | PASS | Agent writes via HTTP API appear in editor in real-time |
| V4: Source toggle (V4b) | PASS | Serialize-on-toggle via `updateYFragment` preserves collaboration |
| V5: Git auto-persistence | PASS | Three-tier pipeline: CRDT -> markdown -> git plumbing |
| V6: Void node preview | PASS | React component renders in editor, survives markdown round-trip |

**Bottom line:** V7 FAIL confirms V4b (serialize-on-toggle) is the path forward. The remaining 6 validations prove the foundation works. The stack is ready to build on.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Bun | 1.3.11 |
| Build | Vite | 6.x |
| UI | React | 19.x |
| WYSIWYG editor | TipTap | 3.x (v3 API) |
| Source editor | CodeMirror | 6.x |
| CRDT | Yjs | 13.6.x |
| Collaboration server | Hocuspocus | 3.4.x |
| Markdown | @tiptap/markdown | 3.x |
| Git | simple-git | 3.x |
| Linter/formatter | Biome | 2.4.x |
