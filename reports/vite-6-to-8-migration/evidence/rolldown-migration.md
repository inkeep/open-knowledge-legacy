# Evidence: Rolldown Migration

**Dimension:** D2 — Rolldown migration implications
**Date:** 2026-04-09
**Sources:** Vite 8 blog, migration guide, Rolldown docs

---

## Key sources referenced

- https://vite.dev/blog/announcing-vite8 — Vite 8.0 announcement
- https://vite.dev/guide/migration — Vite 7→8 migration guide
- https://vite.dev/blog/announcing-vite8-beta — Vite 8 beta details
- https://rolldown.rs/ — Rolldown documentation

---

## Findings

### Finding: Rolldown replaces both Rollup (prod bundler) AND esbuild (dev transforms + dep optimizer)
**Confidence:** CONFIRMED
**Evidence:** "Vite 8 ships with Rolldown as its single, unified, Rust-based bundler." Oxc (also Rust) replaces esbuild for JavaScript transforms and minification. Lightning CSS replaces esbuild for CSS minification.

Architecture change:
```
Vite 6:  dev: esbuild (transforms) + native ESM    prod: Rollup (bundle) + esbuild (minify)
Vite 8:  dev: Oxc (transforms) + Rolldown (bundle)  prod: Rolldown (bundle) + Oxc (minify)
```

**Impact on project:** Dev and prod now use the same bundler — eliminates dev/prod inconsistency issues.

### Finding: Compatibility layer auto-converts rollupOptions → rolldownOptions and esbuild → oxc
**Confidence:** CONFIRMED
**Evidence:** "A compatibility layer auto-converts existing esbuild and rollupOptions configuration to their Rolldown and Oxc equivalents, so many projects will work without any config changes." Auto-converted options include: minify, treeShaking, define, loader, preserveSymlinks, resolveExtensions, mainFields, conditions, keepNames, platform, plugins.

**Impact on project:** The project has zero rollupOptions and zero esbuild config. **Nothing to convert.**

### Finding: `build.rollupOptions` is renamed to `build.rolldownOptions` (deprecated, not removed)
**Confidence:** CONFIRMED
**Evidence:** Migration guide: "build.rollupOptions: renamed to build.rolldownOptions. worker.rollupOptions: renamed to worker.rolldownOptions."

**Impact on project:** Not used. **No action needed.**

### Finding: CommonJS interop is the most likely source of breakage
**Confidence:** CONFIRMED
**Evidence:** Rolldown handles CJS differently from the old Rollup + @rollup/plugin-commonjs combination. "Default import behavior from CJS modules is now consistent: respects ESM indicators." Three common issues: (1) default imports from CJS packages returning undefined, (2) named imports failing, (3) re-exports changing behavior.

Escape hatch: `legacy.inconsistentCjsInterop: true`

**Impact on project:** The project imports from several packages that may have CJS modules:
- `ws` (WebSocket library) — CJS
- `diff` — CJS
- Some `@codemirror/*` packages — mixed ESM/CJS
- `y-codemirror.next` — ESM
- `yjs` — ESM
- `@hocuspocus/*` — ESM
- `@tiptap/*` — ESM

Most critical dependencies are ESM. CJS risk is concentrated in `ws` and `diff`. **Test thoroughly.**

### Finding: Object form of `output.manualChunks` removed, function form deprecated
**Confidence:** CONFIRMED
**Evidence:** "Object form of output.manualChunks removed. Function form deprecated in favor of Rolldown's codeSplitting option."

**Impact on project:** Not used. **No impact.**

### Finding: Output format changes — 'system' and 'amd' no longer supported
**Confidence:** CONFIRMED
**Evidence:** "build.rollupOptions.output.format: 'system' and 'amd' are no longer supported."

**Impact on project:** Default format is 'es'. **No impact.**

### Finding: Performance — 10-30x faster production builds
**Confidence:** CONFIRMED
**Evidence:** Linear: 46s→6s, Ramp: 57% reduction, Beehiiv: 64% reduction, Mercedes-Benz.io: 38% reduction. Dev server: 3x faster startup, 40% faster full reloads.

**Impact on project:** Meaningful improvement for `vite build` step in CI and for dev experience.

---

## Summary

For this project (zero rollupOptions, zero esbuild config, ESM-first dependencies), Rolldown migration risk is **low**. The only concern is CJS interop for `ws` and `diff` packages.
