# Evidence: Plugin API & React Plugin Compatibility

**Dimension:** D3 — Plugin API surface; D4 — @vitejs/plugin-react
**Date:** 2026-04-09
**Sources:** Vite Plugin API docs, @vitejs/plugin-react releases, npm registry

---

## Key sources referenced

- https://vite.dev/guide/api-plugin — Vite Plugin API docs
- https://github.com/vitejs/vite-plugin-react/releases — Plugin releases
- https://www.npmjs.com/package/@vitejs/plugin-react — npm package

---

## D3: Plugin API Surface

### Finding: `configureServer` hook is unchanged in Vite 8
**Confidence:** CONFIRMED
**Evidence:** Vite Plugin API docs show `configureServer` with the same signature. It still receives a `ViteDevServer` object with `middlewares` (connect instance), `httpServer` (Node.js http.Server), and `watcher`.

The Hocuspocus plugin uses:
- `server.httpServer?.prependListener('upgrade', ...)` — standard Node.js API on the HTTP server
- `server.middlewares.use(...)` — connect middleware API

Neither of these are Vite-specific APIs being changed. They are standard Node.js/connect patterns that Vite exposes.

**Impact on project:** The core Hocuspocus plugin integration is **safe**. The `configureServer` → `httpServer` → `prependListener` chain is unaffected.

### Finding: Middleware timing changed in Vite 7 — some built-in middlewares now run before `configureServer`
**Confidence:** CONFIRMED
**Evidence:** Vite 7 migration guide: "Some middlewares now apply before configureServer/configurePreviewServer hooks."

**Impact on project:** The Hocuspocus plugin adds API route middleware via `server.middlewares.use()` inside `configureServer`. If Vite's CORS or other built-in middlewares now run first, they could interfere with `/api/*` requests. **Needs testing** — but likely a non-issue since the API routes don't conflict with Vite's built-in middleware paths.

### Finding: Several Rollup-specific plugin hooks were removed in Vite 8
**Confidence:** CONFIRMED
**Evidence:** Removed: `shouldTransformCachedModule`, `resolveImportMeta`, `renderDynamicImport`, `resolveFileUrl`.

**Impact on project:** The Hocuspocus plugin uses only `configureServer` (Vite-specific, not Rollup). **No impact.**

### Finding: `load`/`transform` hooks now require `moduleType: 'js'` when converting to JS
**Confidence:** CONFIRMED
**Evidence:** "Plugin load and transform hooks must return { code, moduleType: 'js' } when converting to JavaScript."

**Impact on project:** Hocuspocus plugin doesn't use these hooks. **No impact.**

---

## D4: @vitejs/plugin-react Compatibility

### Finding: v4.7.0 does NOT support Vite 8 — must upgrade to v5.2.0+ or v6.x
**Confidence:** CONFIRMED
**Evidence:** npm registry peer dependencies:
- `@vitejs/plugin-react@4.7.0` → `vite: ^4.2.0 || ^5.0.0 || ^6.0.0` (no Vite 7 or 8)
- `@vitejs/plugin-react@5.2.0` → `vite: ^4.2.0 || ... || ^8.0.0` (supports Vite 8)
- `@vitejs/plugin-react@6.0.1` → `vite: ^8.0.0` (Vite 8 only)

**Impact on project:** Must upgrade `@vitejs/plugin-react`. Two options:
1. `^5.2.0` — supports both Vite 6 and 8 (can upgrade incrementally)
2. `^6.0.1` — Vite 8 only, removes Babel, uses Oxc for React Refresh

### Finding: v6 removes Babel — Oxc handles React Refresh transforms
**Confidence:** CONFIRMED
**Evidence:** Release notes: "Vite 8+ can handle React Refresh Transform by Oxc and doesn't need Babel for it. To reduce the installation size, babel is no longer a dependency." If Babel is needed, use `@rolldown/plugin-babel` alongside.

**Impact on project:** The project doesn't use Babel plugins (no custom Babel config). v6 should work fine. Smaller install footprint is a bonus for the CLI distribution story.

### Finding: v6 adds optional React Compiler support
**Confidence:** CONFIRMED
**Evidence:** v6.0.1 peer dependencies include optional `babel-plugin-react-compiler: ^1.0.0`.

**Impact on project:** React Compiler is optional. Can be adopted later for performance optimization but not required.

---

## Recommendation

Upgrade path for this project:
```
@vitejs/plugin-react: ^4.7.0 → ^6.0.1  (jump to latest, skip v5)
```

v6 is the cleanest target since the project doesn't use Babel. The only reason to use v5 would be if you need an incremental upgrade path (v5 supports both Vite 6 and 8).
