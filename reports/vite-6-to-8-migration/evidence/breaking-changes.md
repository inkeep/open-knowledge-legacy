# Evidence: Breaking Changes Vite 6 → 7 → 8

**Dimension:** D1 — Breaking changes
**Date:** 2026-04-09
**Sources:** Official Vite migration guides, Vite blog

---

## Key sources referenced

- https://v7.vite.dev/guide/migration — Vite 6 → 7 migration guide
- https://vite.dev/guide/migration — Vite 7 → 8 migration guide
- https://vite.dev/blog/announcing-vite8 — Vite 8.0 announcement
- https://vite.dev/changes/ — Breaking changes log

---

## Vite 6 → 7 Breaking Changes

### Finding: Node.js 18 dropped — requires 20.19+ / 22.12+
**Confidence:** CONFIRMED
**Evidence:** Migration guide: "Vite no longer supports Node.js 18, which reached its EOL."

**Impact on project:** None if using Bun. Bun runtime is unaffected. Only matters if `node` is used directly.

### Finding: Default build targets updated significantly
**Confidence:** CONFIRMED
**Evidence:** Chrome 87→107, Edge 88→107, Firefox 78→104, Safari 14→16. New default `'baseline-widely-available'` replaces `'modules'`.

**Impact on project:** The project doesn't set a custom `build.target`, so it uses the default. The new defaults are more modern — smaller output, but drops support for older browsers. For a localhost CLI tool, this is a non-issue.

### Finding: Sass legacy API removed
**Confidence:** CONFIRMED
**Evidence:** "Support for the Sass legacy API is removed."

**Impact on project:** The project uses Tailwind CSS v4 PostCSS, not Sass. **No impact.**

### Finding: splitVendorChunkPlugin removed
**Confidence:** CONFIRMED
**Evidence:** Deprecated in v5.2.7, now removed.

**Impact on project:** Not used. **No impact.**

### Finding: HMR types removed (HMRBroadcaster, HMRBroadcasterClient, etc.)
**Confidence:** CONFIRMED
**Evidence:** `HMRBroadcaster`, `HMRBroadcasterClient`, `ServerHMRChannel`, `HMRChannel` types removed.

**Impact on project:** The Hocuspocus plugin doesn't import these types. **No impact.**

### Finding: Middleware timing changed — some middlewares now apply BEFORE configureServer
**Confidence:** CONFIRMED
**Evidence:** "Some middlewares now apply before `configureServer`/`configurePreviewServer` hooks; remove CORS headers if unintended."

**Impact on project:** The Hocuspocus plugin uses `server.middlewares.use()` inside `configureServer`. If Vite's built-in middlewares (e.g., CORS) now run first, this could affect the API route handling. **Needs verification during upgrade.**

---

## Vite 7 → 8 Breaking Changes

### Finding: Rolldown replaces Rollup + esbuild — the fundamental architecture change
**Confidence:** CONFIRMED
**Evidence:** "Vite 8 ships with Rolldown as its single, unified, Rust-based bundler." Auto-conversion compatibility layer for `rollupOptions` → `rolldownOptions` and `esbuild` → `oxc`.

**Impact on project:** The project has zero `rollupOptions` or `esbuild` config. The compatibility layer handles this silently. **Low risk.**

### Finding: `build.rollupOptions` renamed to `build.rolldownOptions`
**Confidence:** CONFIRMED
**Evidence:** "build.rollupOptions: renamed to build.rolldownOptions."

**Impact on project:** Not used in config. **No impact.**

### Finding: `optimizeDeps.esbuildOptions` deprecated → `optimizeDeps.rolldownOptions`
**Confidence:** CONFIRMED
**Evidence:** "optimizeDeps.esbuildOptions deprecated; migrate to optimizeDeps.rolldownOptions."

**Impact on project:** Not used. **No impact.**

### Finding: `esbuild` config option deprecated → use `oxc` instead
**Confidence:** CONFIRMED
**Evidence:** "esbuild config option deprecated; use oxc instead." Automatic conversion for JSX, define, and related options.

**Impact on project:** Not configured. **No impact.**

### Finding: CJS interop behavior changed — may break imports from CJS packages
**Confidence:** CONFIRMED
**Evidence:** "Default import behavior from CJS modules is now consistent: respects ESM indicators (__esModule), .mjs/.mts extensions, and type: module in package.json. Existing code may break; use deprecated legacy.inconsistentCjsInterop: true temporarily."

**Impact on project:** This is the **highest-risk change**. The project imports from several packages (y-codemirror.next, some CodeMirror packages, @hocuspocus/server) that may have CJS modules. If imports break with `undefined` default exports, the fix is `legacy.inconsistentCjsInterop: true` as a temporary escape hatch.

### Finding: Lightning CSS now default for CSS minification
**Confidence:** CONFIRMED
**Evidence:** "Lightning CSS replaces esbuild for CSS minification by default."

**Impact on project:** The project uses Tailwind v4 PostCSS. Lightning CSS should handle this fine — it's actually better for modern CSS features. **Low risk, likely improvement.**

### Finding: Default browser targets updated again
**Confidence:** CONFIRMED
**Evidence:** Chrome 107→111, Edge 107→111, Firefox 104→114, Safari 16.0→16.4.

**Impact on project:** Minimal — localhost CLI tool. **No impact.**

### Finding: Several Rollup plugin hooks removed
**Confidence:** CONFIRMED
**Evidence:** Removed hooks: `shouldTransformCachedModule`, `resolveImportMeta`, `renderDynamicImport`, `resolveFileUrl`. `parseAst`/`parseAstAsync` deprecated → `parseSync`/`parse`.

**Impact on project:** The Hocuspocus plugin uses only `configureServer` (a Vite-specific hook, not Rollup). **No impact.**

### Finding: `import.meta.hot.accept()` no longer accepts URLs — must pass module IDs
**Confidence:** CONFIRMED
**Evidence:** "import.meta.hot.accept() no longer accepts URLs; must pass module IDs."

**Impact on project:** No `import.meta.hot` usage found in the codebase. **No impact.**

### Finding: Plugin `load` and `transform` hooks must return `{ code, moduleType: 'js' }` for non-JS conversion
**Confidence:** CONFIRMED
**Evidence:** "Plugin load and transform hooks must return { code, moduleType: 'js' } when converting to JavaScript."

**Impact on project:** The Hocuspocus plugin doesn't use `load` or `transform` hooks. **No impact.**

---

## Summary: What Actually Breaks

For this specific project (no rollupOptions, no esbuild config, no Sass, no import.meta.hot, no Rollup plugin hooks), the migration surface is extremely small:

| Change | Risk | Action |
|--------|------|--------|
| CJS interop behavior | **Medium** | Test imports from CJS packages; use `legacy.inconsistentCjsInterop: true` if needed |
| Middleware timing | **Low** | Verify API route handling still works |
| Browser targets | **None** | Localhost tool, doesn't matter |
| Everything else | **None** | Not used in this project |
