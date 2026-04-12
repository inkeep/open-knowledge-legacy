# Evidence: Native Addon Portability

**Dimension:** D5 — @parcel/watcher platform binaries and bunx/npx compatibility
**Date:** 2026-04-11
**Sources:** npm registry, [bun issue #19282](https://github.com/oven-sh/bun/issues/19282), @parcel/watcher source

---

## Key files / pages referenced

- `packages/cli/tsdown.config.ts` — `neverBundle: ['@parcel/watcher']`
- `packages/server/src/file-watcher.ts` — direct `@parcel/watcher` import
- [@parcel/watcher on npm](https://www.npmjs.com/package/@parcel/watcher)
- [bun issue #19282](https://github.com/oven-sh/bun/issues/19282) — bunx fails with @parcel/watcher

---

## Findings

### Finding: @parcel/watcher uses platform-specific optionalDependencies (napi triples pattern)
**Confidence:** CONFIRMED
**Evidence:** npm registry, @parcel/watcher package.json

13 platform packages in optionalDependencies:
- `@parcel/watcher-darwin-arm64` (320KB), `@parcel/watcher-darwin-x64` (324KB)
- `@parcel/watcher-linux-x64-glibc` (513KB), `-musl` (501KB)
- `@parcel/watcher-win32-x64` (513KB), `-arm64` (546KB)
- Main package: 129KB (JS wrapper)
- Total per-install: ~450-650KB (one platform binary + main)

Runtime resolution: tries `require('@parcel/watcher-${platform}-${arch}')`, falls back to local build, then throws "No prebuild or local build found."

**Implications:** Each user installs only their platform's binary. Total size is minimal.

### Finding: bunx has a documented failure mode with @parcel/watcher
**Confidence:** CONFIRMED
**Evidence:** [oven-sh/bun#19282](https://github.com/oven-sh/bun/issues/19282)

`bunx @tailwindcss/cli` fails with "No prebuild or local build of @parcel/watcher found" because the bunx ephemeral install context does not properly resolve platform-specific optionalDependencies in all cases.

This is the same `@parcel/watcher` package that open-knowledge depends on. Users running `bunx @inkeep/open-knowledge` could hit this exact issue.

**Implications:** This is a real risk for the zero-config story. A fallback is essential.

### Finding: chokidar v4 is the recommended fallback — pure JS, zero native deps, 185KB
**Confidence:** CONFIRMED
**Evidence:** chokidar changelog, npm registry

chokidar v4 (Sep 2024) removed the fsevents native dependency entirely. chokidar v5 (Nov 2025) is ESM-only, requires Node.js >= 20.

- Total size: ~185KB (chokidar 149KB + readdirp 36KB)
- Uses `fs.watch` (kernel events) by default
- Falls back to `fs.watchFile` (polling) when needed
- 3x smaller than @parcel/watcher + platform binary

**Implications:** chokidar v4/v5 is the ideal fallback. It works everywhere without native binaries.

### Finding: Tiered fallback pattern is the recommended approach
**Confidence:** CONFIRMED
**Evidence:** Industry patterns (Vite, Nx, Eleventy)

```typescript
async function createWatcher(dir, callback) {
  try {
    const { subscribe } = await import('@parcel/watcher');
    return subscribe(dir, callback);
  } catch {
    console.warn('[watcher] @parcel/watcher unavailable, falling back to chokidar');
    const { watch } = await import('chokidar');
    return watch(dir, { ignoreInitial: true });
  }
}
```

Move `@parcel/watcher` to `optionalDependencies`, add `chokidar` v4/v5 to `dependencies`. @parcel/watcher for performance when available, chokidar as the guaranteed fallback.

**Implications:** This eliminates the native addon portability risk entirely while preserving @parcel/watcher's performance when it works.

### Finding: Other tools handle this similarly
**Confidence:** CONFIRMED
**Evidence:** Vite source, Nx docs, Tailwind v4 issues

| Tool | Watcher | Fallback |
|------|---------|----------|
| Vite | chokidar v3 | Built-in: `usePolling` option |
| Next.js (webpack) | watchpack (chokidar) | Polling fallback |
| Next.js (Turbopack) | Rust native | WASM fallback, `--webpack` flag |
| Tailwind v4 | @parcel/watcher | **No fallback** — hits bun#19282 |
| Nx | @parcel/watcher | **No fallback** — troubleshooting docs |
| **Recommendation** | @parcel/watcher | chokidar v4/v5 |

Tailwind v4 and Nx both suffer from the no-fallback approach. Don't repeat their mistake.

---

## Gaps / follow-ups

* Test the tiered fallback pattern with the existing DiskEvent system
* Measure performance difference between @parcel/watcher and chokidar for a typical KB directory (100-1000 files)
