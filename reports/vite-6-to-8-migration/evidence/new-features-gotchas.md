# Evidence: New Features & Migration Gotchas

**Dimension:** D5 — HMR changes; D6 — New features; D7 — Gotchas
**Date:** 2026-04-09
**Sources:** Vite 8 blog, community reports, GitHub issues

---

## Key sources referenced

- https://vite.dev/blog/announcing-vite8 — Vite 8.0 announcement
- https://vite.dev/blog/announcing-vite7 — Vite 7.0 announcement
- https://vite.dev/guide/api-environment-frameworks — Environment API
- https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/142 — esbuild deprecation warning

---

## D5: HMR & Dev Server Changes

### Finding: HMR protocol and WebSocket path are unchanged
**Confidence:** INFERRED
**Evidence:** No migration guide mentions HMR protocol changes. The `/__vite_hmr` WebSocket path is not mentioned as changed. The Hocuspocus plugin's `prependListener('upgrade')` with URL check for `/collab` should continue to correctly distinguish Hocuspocus traffic from HMR traffic.

**Impact on project:** **Safe.** The WebSocket upgrade interception pattern is unaffected.

### Finding: Dev server now uses Rolldown for dependency optimization instead of esbuild
**Confidence:** CONFIRMED
**Evidence:** "Rolldown replaces esbuild for dependency optimization." This means pre-bundling of `node_modules` uses Rolldown.

**Impact on project:** Should be transparent. May be faster. Pre-bundled deps might have slightly different output characteristics, which could surface as CJS interop issues (see D2).

### Finding: Module-level state behavior in HMR is unchanged
**Confidence:** INFERRED
**Evidence:** No migration guide mentions changes to how module-level variables survive or don't survive HMR. The Hocuspocus plugin's `let activeWatcher: AsyncSubscription | null = null` pattern should continue to work — module-level state is re-evaluated on HMR, and the plugin handles this with the unsubscribe-before-subscribe pattern.

**Impact on project:** **Safe** — the existing pattern accounts for HMR module re-evaluation.

---

## D6: New Features Worth Adopting

### Finding: TypeScript path alias support via `resolve.tsconfigPaths`
**Confidence:** CONFIRMED
**Evidence:** Vite 8 announcement: "TypeScript path alias support (via resolve.tsconfigPaths)."

**Impact on project:** The project currently uses manual `resolve.alias` in `vite.config.ts`:
```ts
resolve: { alias: { '@': path.resolve(__dirname, './src') } }
```
This could be replaced with `resolve: { tsconfigPaths: true }` to auto-read from `tsconfig.json`. Removes config duplication.

### Finding: Browser console forwarding to dev server terminal
**Confidence:** CONFIRMED
**Evidence:** Vite 8 announcement: "Browser console forwarding to the dev server terminal."

**Impact on project:** Useful for debugging the editor — `console.log` from the browser appears in the terminal where `vite` runs. No code changes needed.

### Finding: Integrated devtools for debugging and analysis
**Confidence:** CONFIRMED
**Evidence:** Vite 8 ships with built-in devtools.

**Impact on project:** Free upgrade — helpful for understanding module graph, build performance.

### Finding: Decorator metadata support without external plugins
**Confidence:** CONFIRMED
**Evidence:** Vite 8 announcement lists decorator metadata support.

**Impact on project:** Not currently using decorators. **No immediate value.**

### Finding: Install size increased ~15 MB (Lightning CSS + Rolldown binary)
**Confidence:** CONFIRMED
**Evidence:** "Vite 8 is approximately 15 MB larger than Vite 7, primarily from lightningcss (~10 MB) and Rolldown binary (~5 MB)."

**Impact on project:** Vite is a devDependency. 15 MB increase is negligible for dev tooling. Does not affect the published CLI package.

---

## D7: Migration Gotchas

### Finding: Three issues account for most migration headaches
**Confidence:** CONFIRMED
**Evidence:** Community reports and Vite 8 blog: "CommonJS interop changes, manualChunks deprecation, and esbuild transform failures."

**Impact on project:** CJS interop is the relevant one. manualChunks not used. esbuild transforms replaced by Oxc (no custom esbuild config).

### Finding: Third-party plugins using `esbuild` option trigger deprecation warnings
**Confidence:** CONFIRMED
**Evidence:** GitHub issue (vite-plugin-node-polyfills #142): "esbuild option was specified by plugin. This option is deprecated, please use oxc instead."

**Impact on project:** The project uses only `@vitejs/plugin-react` and the custom `hocuspocusPlugin`. Neither uses the `esbuild` option. **No warnings expected.**

### Finding: Recommended two-step migration for complex projects
**Confidence:** CONFIRMED
**Evidence:** Vite team recommends: (1) migrate to `rolldown-vite` package on Vite 7 to isolate Rolldown issues, then (2) upgrade to Vite 8. "This isolates bundler-specific issues from other changes."

**Impact on project:** Given the clean config (no rollupOptions, no esbuild config), the two-step approach is unnecessary. A direct Vite 6→8 jump should work.

### Finding: `resolve.alias[].customResolver` removed — use `resolveId` plugin hook
**Confidence:** CONFIRMED
**Evidence:** Vite 8 migration: "resolve.alias[].customResolver removed; use custom plugin with resolveId hook instead."

**Impact on project:** The project's alias uses a simple string path, not `customResolver`. **No impact.**

---

## Summary: Features to Actively Adopt

| Feature | Action | Effort |
|---------|--------|--------|
| `resolve.tsconfigPaths: true` | Replace manual alias with tsconfig-based resolution | 2 lines |
| Browser console forwarding | Free — just upgrade | 0 |
| Built-in devtools | Free — just upgrade | 0 |
| Faster builds (10-30x) | Free — just upgrade | 0 |
| Lightning CSS for minification | Free — default change | 0 |
