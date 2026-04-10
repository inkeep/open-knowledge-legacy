# Evidence: CLI Distribution & Package Weight

**Dimension:** D4 — CLI distribution and package weight
**Date:** 2026-04-08
**Sources:** npm registry, Next.js docs, package size measurements

---

## Key sources referenced

- npm pack --dry-run measurements (local)
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output — Output modes
- https://nextjs.org/docs/app/guides/self-hosting — Self-hosting guide
- https://www.npmjs.com/package/next — npm package page

---

## Findings

### Finding: `next` package is 154.4 MB unpacked (8,065 files) vs Vite at ~2.2 MB
**Confidence:** CONFIRMED
**Evidence:** `npm pack next@16 --dry-run` output:

```
npm notice unpacked size: 154.4 MB
npm notice total files: 8065
```

Vite 6: ~2.2 MB package, ~37.2 MB with all dependencies.

**Implications:** The `next` package alone is ~70x larger than Vite. For a CLI tool distributed via `npx`, this means dramatically longer install times on first run. With transitive dependencies (react-dom, @swc/*, turbopack binaries), total install could exceed 200-300 MB.

### Finding: `output: 'standalone'` reduces deployment size to ~50-85 MB but doesn't help npm install
**Confidence:** CONFIRMED
**Evidence:** Next.js standalone mode "automatically creates a standalone folder that copies only the necessary files for a production deployment including select files in node_modules." Community reports indicate standalone output is 50-85 MB depending on the app. However, standalone doesn't trace custom server files.

**Implications:** Standalone helps for Docker/server deployments but is irrelevant for the `npx` distribution model where all dependencies must be installed.

### Finding: `output: 'export'` produces static files but requires `next` as a build-time dependency
**Confidence:** CONFIRMED
**Evidence:** Static export produces HTML/JS/CSS in an `out/` directory. The files can be served by any HTTP server. However, `next` must still be in the dependency tree for `next build`.

**Implications:** Even if Next.js is only used at build time, the 154 MB package must be installed. For a pre-built CLI package where `dist/` assets are committed, this could be avoided — but that's the current Vite pattern already.

### Finding: No known npm CLI tools embed Next.js as their UI server
**Confidence:** INFERRED
**Evidence:** Searched for CLI tools that use Next.js. `create-next-app` scaffolds projects but doesn't serve a UI. Storybook uses its own Webpack/Vite setup. No examples found of a CLI tool that runs `next start` as its primary function.

**Implications:** This is an uncharted pattern. The npm distribution model (CLI tool that starts a server) is not what Next.js is designed for.

### Finding: Cold start for `next start` is ~436ms vs ~138ms for a plain HTTP server (measured)
**Confidence:** CONFIRMED
**Evidence:** D4 agent measured on same machine:

| Server | Time to first 200 response |
|--------|---------------------------|
| `next start` (full) | ~436ms |
| `node server.js` (standalone) | ~209ms |
| Plain Node.js `http.createServer` | ~138ms |
| Bun `Bun.serve()` | ~15ms |

**Implications:** `next start` adds ~300ms over a plain HTTP server. For `output: 'export'` + sirv (current pattern), cold start is unchanged.

### Finding: Total `node_modules` size — 317 MB (Next.js) vs 39 MB (Vite) (measured)
**Confidence:** CONFIRMED
**Evidence:** D4 agent measured fresh installs:

| Stack | node_modules size | Package count |
|-------|------------------|---------------|
| next + react + react-dom | 317 MB | 22 packages |
| vite + react + react-dom | 39 MB | 18 packages |

**Implications:** 8.1x total dependency weight difference. The bulk is SWC binaries, Turbopack, and the server runtime.

### Finding: Build-with-Next.js-serve-without pattern is viable but negates the switch
**Confidence:** INFERRED
**Evidence:** If the app is built with `next build && next export`, the output is static HTML/JS/CSS. These can be served by the existing Hocuspocus standalone server. But this means Next.js is only a build tool, not a runtime — and Vite already fills that role with less overhead.

**Implications:** The only pattern that works for CLI distribution reduces Next.js to a build tool, which doesn't justify the dependency weight increase.

---

## Gaps / follow-ups

* Exact `npx` install time comparison with and without `next` in dependency tree
* Whether `next` could be a devDependency-only (build time) while the published package ships pre-built assets
