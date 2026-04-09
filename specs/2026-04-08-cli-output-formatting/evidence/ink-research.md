---
name: Ink library research
description: Ink v7 capabilities, size, Bun compat, startup overhead, NO_COLOR handling
type: evidence
sources:
  - npm registry (ink@7.0.0)
  - github.com/vadimdemedes/ink
  - github.com/vadimdemedes/ink/issues (Bun)
---

## Ink v7.0.0 (released 2026-04-08)

### Size & Dependencies
- **Unpacked size:** 533KB (own code)
- **Total install:** 17 MB, 38 packages
- **Key deps:** react-reconciler v0.33.0, yoga-layout ~3.2.1 (WASM), chalk v5.6.2, ws, es-toolkit, ansi-escapes, cli-cursor
- **Peer dep:** react >= 19.2.0
- **Engines:** Node >= 22

### How it works
Custom React reconciler targeting the terminal. React component tree → Yoga Flexbox layout → ANSI string output. Treats terminal as a render target like React DOM treats the browser.

### Built-in components
- `<Box>` — Flexbox container (padding, margin, border, flexDirection, alignItems, justifyContent)
- `<Text>` — Styled text (color, backgroundColor, bold, italic, underline, strikethrough, dimColor, inverse)
- `<Newline>`, `<Spacer>`, `<Static>` (render-once), `<Transform>`

### Hooks
useInput, usePaste, useApp, useStdin, useStdout, useStderr, useBoxMetrics, useWindowSize, useFocus, useFocusManager, useCursor, useAnimation

### Colors
Uses chalk internally. Supports named colors, hex (#005cc5), RGB (rgb(232, 131, 136)) via `<Text color="...">` and `backgroundColor`.

### NO_COLOR support
Yes, via chalk. Verified: `NO_COLOR=1` → Ink strips all ANSI codes. `FORCE_COLOR` overrides `NO_COLOR`. No developer-side handling needed.

### Bun compatibility
- Works: `bun add ink react` installs cleanly, basic JSX works, tsdown bundling works
- NOT officially supported (GitHub issue #636 closed "not planned")
- Historical issues: cursor disappearing on macOS (#864), Bun 1.2 compat (#696, resolved)
- tsdown bundles Ink to ~0.5KB entry (yoga-layout must be externalized — WASM native bindings)

### Startup overhead (benchmarked)
- Plain Node script: ~35ms
- Ink app (bundled with tsdown): **232ms on Node, 118ms on Bun**
- Delta: ~200ms Node, ~100ms Bun for React + Yoga initialization

### Community ecosystem
ink-spinner (v5), ink-table (v3.1), ink-select-input (v6.2), ink-text-input (v6.0). Modest but covers common patterns.
