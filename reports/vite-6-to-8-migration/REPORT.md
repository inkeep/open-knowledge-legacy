---
title: "Vite 6 → 8 Migration Guide for a TipTap + Hocuspocus CRDT Editor"
description: "Concrete migration analysis from Vite 6 to Vite 8 (Rolldown) for @inkeep/open-knowledge — a Bun monorepo with a custom Hocuspocus Vite plugin, TipTap, CodeMirror, and Tailwind v4. Covers breaking changes, Rolldown implications, plugin API stability, React plugin upgrade, HMR behavior, new features, and a step-by-step upgrade recipe."
createdAt: 2026-04-09
updatedAt: 2026-04-09
subjects:
  - Vite 8
  - Vite 7
  - Rolldown
  - Oxc
  - "@vitejs/plugin-react"
  - Lightning CSS
topics:
  - framework migration
  - bundler architecture
  - developer tooling upgrade
---

# Vite 6 → 8 Migration Guide for a TipTap + Hocuspocus CRDT Editor

**Purpose:** Identify exactly what breaks, what needs updating, and what improvements to adopt when upgrading `packages/app` from Vite 6.4.2 to Vite 8.

---

## Executive Summary

**This is a clean upgrade.** The project's minimal Vite config (no `rollupOptions`, no `esbuild` config, no Babel plugins, ESM-first dependencies) means most of Vite 8's breaking changes don't apply. The upgrade delivers 10-30x faster production builds and 3x faster dev server startup with minimal migration effort.

**Required changes (3 items):**
1. Bump `vite` from `^6.4.2` to `^8.0.0`
2. Bump `@vitejs/plugin-react` from `^4.7.0` to `^6.0.1` (v4 doesn't support Vite 8; v6 drops Babel, uses Oxc)
3. Test CJS imports — `ws` and `diff` packages are CJS and may need `legacy.inconsistentCjsInterop: true` if default imports break

**Nothing else changes.** The Hocuspocus plugin's `configureServer` / `httpServer.prependListener('upgrade')` / `server.middlewares.use()` pattern is unaffected. The HMR WebSocket path is unchanged. The module-level watcher pattern survives.

**Worth adopting:**
- `resolve: { tsconfigPaths: true }` — replaces manual `@` alias with tsconfig-based resolution (2-line change)
- Browser console forwarding — free, logs from browser appear in terminal
- Built-in devtools — free, module graph visualization

**Key Findings:**
- **Hocuspocus plugin is safe.** `configureServer`, `httpServer`, `middlewares` APIs are unchanged in Vite 8.
- **`@vitejs/plugin-react` must jump to v6.** v4.7 doesn't support Vite 7 or 8. v6 removes Babel (not used), uses Oxc for React Refresh.
- **CJS interop is the only real risk.** Rolldown handles CJS differently. Two project deps (`ws`, `diff`) are CJS. Test thoroughly.
- **Performance is the main payoff.** 10-30x faster prod builds, 3x faster dev startup, unified dev/prod pipeline.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| D1 | Breaking changes Vite 6 → 7 → 8 | P0 | Deep | Covered |
| D2 | Rolldown migration implications | P0 | Deep | Covered |
| D3 | Plugin API surface (`configureServer`, WebSocket, middleware) | P0 | Deep | Covered |
| D4 | `@vitejs/plugin-react` compatibility | P0 | Moderate | Covered |
| D5 | HMR / dev server changes | P0 | Moderate | Covered |
| D6 | New features worth adopting | P1 | Moderate | Covered |
| D7 | Migration gotchas | P1 | Moderate | Covered |

**Stance:** Conclusions — actionable migration recipe.

---

## Detailed Findings

### D1: Breaking Changes Vite 6 → 7 → 8

**Finding:** Most breaking changes don't apply to this project. The migration surface is CJS interop, middleware timing, and browser target defaults.

**Evidence:** [evidence/breaking-changes.md](evidence/breaking-changes.md)

The upgrade spans two major versions. Here's the complete breaking change audit filtered for this project:

**Vite 6 → 7:**

| Change | Applies? | Action |
|--------|----------|--------|
| Node.js 18 dropped (requires 20.19+) | No — uses Bun | None |
| Default browser targets updated (Chrome 87→107, etc.) | Harmless | None (localhost tool) |
| Sass legacy API removed | No — uses Tailwind PostCSS | None |
| `splitVendorChunkPlugin` removed | Not used | None |
| HMR types removed (HMRBroadcaster, etc.) | Not imported | None |
| Middleware timing — some built-ins run before `configureServer` | **Maybe** | Test API route handling |

**Vite 7 → 8:**

| Change | Applies? | Action |
|--------|----------|--------|
| Rolldown replaces Rollup + esbuild | Yes (transparent) | None — no config to convert |
| `build.rollupOptions` → `build.rolldownOptions` | Not used | None |
| `optimizeDeps.esbuildOptions` deprecated | Not used | None |
| `esbuild` config → `oxc` | Not configured | None |
| **CJS interop behavior changed** | **Yes** | **Test imports from `ws`, `diff`** |
| Lightning CSS default for CSS minification | Yes (improvement) | None |
| Browser targets updated again | Harmless | None |
| Rollup plugin hooks removed | Not used | None |
| `import.meta.hot.accept()` URL → ID | Not used | None |
| `resolve.alias[].customResolver` removed | Not used (string alias only) | None |

**Tailwind v4 + Lightning CSS caveat:** Lightning CSS (now default for CSS minification) has a [known issue](https://github.com/tailwindlabs/tailwindcss/issues/19792) where it transpiles `light-dark()` CSS functions, potentially breaking dark mode styling in Tailwind v4. If dark mode behaves incorrectly after upgrade, set `build.cssMinify: 'esbuild'` as a temporary revert.

**Decision trigger:** If `ws` or `diff` imports break with `undefined` default exports after upgrade, add `legacy: { inconsistentCjsInterop: true }` to `vite.config.ts` as a temporary workaround.

---

### D2: Rolldown Migration

**Finding:** Zero config to migrate. The project has no `rollupOptions`, no `esbuild` config, and ESM-first dependencies. Rolldown's compatibility layer handles everything silently.

**Evidence:** [evidence/rolldown-migration.md](evidence/rolldown-migration.md)

The architecture change is significant under the hood:

```
Vite 6:  dev → esbuild (transforms) + native ESM     prod → Rollup + esbuild (minify)
Vite 8:  dev → Oxc (transforms) + Rolldown             prod → Rolldown + Oxc (minify)
```

For this project, this is entirely transparent because:
- No `build.rollupOptions` to convert
- No `esbuild` transform config
- No `optimizeDeps.esbuildOptions`
- No `manualChunks`
- No custom output formats

The only Rolldown-specific risk is CJS interop (covered in D1). The project's key dependencies are ESM: `yjs`, `@tiptap/*`, `@hocuspocus/*`, `y-codemirror.next`, `@codemirror/*`. CJS risk is limited to `ws` and `diff`.

**Performance payoff:** 10-30x faster prod builds (verified by [Linear](https://www.theregister.com/2026/03/16/vite_8_rolldown/): 46s→6s), 3x faster dev startup, 40% faster full reloads.

---

### D3: Plugin API Surface (Hocuspocus Plugin)

**Finding:** The Hocuspocus plugin's three integration points (`configureServer`, `httpServer.prependListener`, `server.middlewares.use`) are all unchanged in Vite 8. Zero modifications needed.

**Evidence:** [evidence/plugin-api-react-plugin.md](evidence/plugin-api-react-plugin.md)

The plugin uses:

```typescript
// 1. configureServer hook — UNCHANGED in Vite 8
configureServer(server) {
  // 2. httpServer.prependListener — standard Node.js API, not Vite-specific
  server.httpServer?.prependListener('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/collab')) { ... }
  });

  // 3. server.middlewares.use — connect API, not Vite-specific
  server.middlewares.use(async (req, res, next) => {
    if (url?.startsWith('/api/')) { ... }
  });
}
```

All three are stable APIs:
- `configureServer` — Vite-specific hook, same signature since Vite 2
- `httpServer` — standard Node.js `http.Server` instance
- `middlewares` — standard `connect` instance

The removed Rollup hooks (`shouldTransformCachedModule`, `resolveImportMeta`, `renderDynamicImport`, `resolveFileUrl`) are not used by the Hocuspocus plugin.

**One caveat:** Vite 7 changed middleware timing — some built-in middlewares now run before `configureServer`. If Vite's built-in CORS or static-file middleware intercepts `/api/*` requests before the Hocuspocus middleware, API routes could break. This is low-probability but should be verified during testing.

---

### D4: `@vitejs/plugin-react` Compatibility

**Finding:** Must upgrade from v4.7.0 to v6.0.1. v4 doesn't support Vite 7+. v6 drops Babel (unused by this project) and uses Oxc for React Refresh.

**Evidence:** [evidence/plugin-api-react-plugin.md](evidence/plugin-api-react-plugin.md)

Version compatibility matrix:

| Plugin version | Vite support | Babel | Notes |
|---------------|-------------|-------|-------|
| 4.7.0 (current) | 4, 5, 6 | Included | No Vite 7/8 |
| 5.2.0 | 4, 5, 6, 7, 8 | Included | Bridge version |
| **6.0.1 (target)** | **8 only** | **Removed** | Oxc for React Refresh |

**Recommended:** Jump directly to `^6.0.1`. The project doesn't use Babel plugins, so losing built-in Babel has zero impact. If Babel is ever needed, `@rolldown/plugin-babel` can be added separately.

v6 also adds optional React Compiler support (`babel-plugin-react-compiler@^1.0.0` as an optional peer dep). Not required now, but available for future adoption.

---

### D5: HMR & Dev Server Changes

**Finding:** HMR protocol, WebSocket path, and module-level state behavior are unchanged. The Hocuspocus plugin's HMR-surviving watcher pattern is safe.

**Evidence:** [evidence/new-features-gotchas.md](evidence/new-features-gotchas.md)

The HMR WebSocket path (`/__vite_hmr` or similar) is not mentioned as changed in any migration guide. The Hocuspocus plugin's `prependListener('upgrade')` with URL check for `/collab` correctly distinguishes collaboration traffic from HMR traffic — this pattern continues to work.

The module-level `activeWatcher` pattern:
```typescript
let activeWatcher: AsyncSubscription | null = null;
// Inside configureServer:
if (activeWatcher) {
  await activeWatcher.unsubscribe();
  activeWatcher = null;
}
activeWatcher = await startWatcher(CONTENT_DIR, handleExternalChange);
```

This works because HMR re-evaluates the module, resetting `activeWatcher` to `null` at the declaration. The plugin handles this explicitly by unsubscribing the previous watcher. No behavior change in Vite 8.

The dev dependency optimizer now uses Rolldown instead of esbuild. Pre-bundled deps may have slightly different output, but this is transparent to the application code.

---

### D6: New Features Worth Adopting

**Finding:** Three features are worth actively adopting. Others are free improvements that come with the upgrade.

**Evidence:** [evidence/new-features-gotchas.md](evidence/new-features-gotchas.md)

**Adopt now:**

1. **`resolve.tsconfigPaths: true`** — Replace the manual alias:
   ```diff
   - resolve: {
   -   alias: {
   -     '@': path.resolve(__dirname, './src'),
   -   },
   - },
   + resolve: {
   +   tsconfigPaths: true,
   + },
   ```
   This reads path aliases from `tsconfig.json`, eliminating duplication. Requires `paths` in tsconfig (already present if using `@/` imports).

2. **Browser console forwarding** — `console.log` from the browser appears in the terminal where `vite` runs. Useful for debugging the editor without opening browser DevTools. **Free — no config needed.**

3. **Built-in devtools** — Module graph visualization and build analysis. **Free — no config needed.**

**Free improvements (no action):**
- 10-30x faster prod builds via Rolldown
- 3x faster dev server startup
- 40% faster full page reloads
- 10x fewer network requests in dev
- Unified dev/prod pipeline (no more dev/prod inconsistencies)
- Lightning CSS for CSS minification (better modern CSS support, relevant for Tailwind v4)

**Not relevant now:**
- Decorator metadata support — not using decorators
- WebAssembly SSR — not applicable
- Environment API — designed for frameworks, not end-user apps

---

### D7: Migration Gotchas

**Finding:** Community reports three main issues; only CJS interop applies to this project. The recommended two-step migration is unnecessary for a clean config.

**Evidence:** [evidence/new-features-gotchas.md](evidence/new-features-gotchas.md)

**Three common migration issues (community-reported):**
1. **CJS interop changes** — ✅ Applies (see D1, D2)
2. **`manualChunks` deprecation** — ❌ Not used
3. **esbuild transform failures** — ❌ No esbuild config

**Two-step migration (recommended by Vite team for complex projects):**
1. Migrate to `rolldown-vite` package on Vite 7
2. Then upgrade to Vite 8

**For this project:** The two-step approach is unnecessary. The config is so clean (zero rollupOptions, zero esbuild, zero Babel) that a direct Vite 6→8 jump is safe.

**Third-party plugin warnings:** Plugins that set the `esbuild` option trigger deprecation warnings. The project uses only `@vitejs/plugin-react` (upgrading to v6, which uses `oxc`) and the custom Hocuspocus plugin (doesn't use `esbuild`). **No warnings expected.**

---

## Upgrade Recipe

```bash
# 1. Bump versions in packages/app/package.json
cd packages/app
# In devDependencies:
#   "vite": "^6.4.2"  →  "^8.0.0"
#   "@vitejs/plugin-react": "^4.7.0"  →  "^6.0.1"

# 2. Install
bun install

# 3. Optional: simplify vite.config.ts alias
# Replace resolve.alias with resolve.tsconfigPaths (if tsconfig has paths)

# 4. Test dev server
bun run dev
# Verify:
#   - Editor loads (TipTap + CodeMirror)
#   - WebSocket connects on /collab (Hocuspocus)
#   - API routes work (/api/agent-write, etc.)
#   - HMR works (edit a component, verify hot reload)
#   - File watcher works (edit a .md in content/)

# 5. Test production build
bun run build
# Verify build completes without errors

# 6. If CJS import errors occur:
# Add to vite.config.ts:
#   legacy: { inconsistentCjsInterop: true }
# Then investigate specific packages and file upstream issues
```

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Exact CJS package audit:** Which specific imports from `ws` and `diff` might break was not tested empirically. The risk is identified but not measured.
- **Middleware timing edge case:** Whether Vite 7's middleware timing change affects `/api/*` route handling was not tested.

### Out of Scope (per Rubric)
- Vite internals deep-dive
- Rolldown plugin authoring
- Comparison with other bundlers

---

## References

### Evidence Files
- [evidence/breaking-changes.md](evidence/breaking-changes.md) — Complete breaking change audit for Vite 6→7→8
- [evidence/rolldown-migration.md](evidence/rolldown-migration.md) — Rolldown architecture change and CJS interop risk
- [evidence/plugin-api-react-plugin.md](evidence/plugin-api-react-plugin.md) — Plugin API stability + React plugin upgrade path
- [evidence/new-features-gotchas.md](evidence/new-features-gotchas.md) — HMR, new features, community gotchas

### External Sources
- [Vite 6→7 Migration Guide](https://v7.vite.dev/guide/migration) — Official breaking changes
- [Vite 7→8 Migration Guide](https://vite.dev/guide/migration) — Official breaking changes + Rolldown
- [Vite 8.0 Announcement](https://vite.dev/blog/announcing-vite8) — Architecture, performance, compatibility layer
- [Vite 8 Beta Announcement](https://vite.dev/blog/announcing-vite8-beta) — Rolldown details
- [Vite Breaking Changes Log](https://vite.dev/changes/) — Cross-version changelog
- [@vitejs/plugin-react Releases](https://github.com/vitejs/vite-plugin-react/releases) — Version history
- [Vite Plugin API](https://vite.dev/guide/api-plugin) — `configureServer` documentation

### Related Research
- [nextjs-16-vite-replacement-feasibility/](../nextjs-16-vite-replacement-feasibility/) — Contains Vite 8 + Rolldown landscape analysis in follow-up section F1
