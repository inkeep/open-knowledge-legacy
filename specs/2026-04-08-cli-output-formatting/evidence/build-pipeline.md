---
name: CLI build pipeline analysis
description: tsdown config, tsconfig, and what changes are needed for Ink/JSX support — verified working
type: evidence
sources:
  - packages/cli/tsdown.config.ts
  - packages/cli/tsconfig.json
  - packages/cli/package.json
  - tsdown v0.21.7 source (Rolldown v1.0.0-rc.12)
  - Verified via end-to-end build test
---

## Current build setup

### tsdown.config.ts
- Entry points: `cli` (src/cli.ts) and `index` (src/index.ts)
- Format: ESM, output .js/.d.ts
- Workspace packages bundled: `@inkeep/open-knowledge-core`, `@inkeep/open-knowledge-server`
- Native addons externalized: `@parcel/watcher`, `simple-git`

### tsconfig.json
- Target: ES2022, Module: ES2022
- `verbatimModuleSyntax: true`
- **No JSX config currently**

### package.json
- Node >= 22 engine requirement (matches Ink v7)
- Build: `tsdown` command

## Verified: Ink v7 + tsdown is fully compatible

**End-to-end tested:** Ink v7 TSX app built and ran with tsdown v0.21.7.

### Only required change: tsconfig.json
```json
"jsx": "react-jsx"
```

That's it. No tsdown.config.ts changes needed for JSX support.

### yoga-layout: NOT a native addon
yoga-layout v3.2.1 uses **base64-inlined WASM** (not native .node bindings). The WASM is embedded as a JS string in `dist/binaries/yoga-wasm-base64-esm.js` (~120KB). Bundles correctly with tsdown.

**Recommendation:** Leave ink/react as external `dependencies` (npm default behavior). They resolve at runtime from node_modules. No need to add to neverBundle.

### verbatimModuleSyntax compatibility
`verbatimModuleSyntax: true` + `jsx: "react-jsx"` = **fully compatible**. The automatic JSX runtime injects `import { jsx } from 'react/jsx-runtime'` — no manual `import React` needed. No conflict.

### File extensions
TSX source files need `.tsx` extension. Rolldown resolves `.tsx` by default.

### Biome
Supports JSX/TSX natively. No config changes needed.

### Bundle size consideration
- If ink + react + yoga bundled inline: ~1.34MB total output
- If ink/react left as external dependencies (recommended): minimal size impact on CLI bundle
