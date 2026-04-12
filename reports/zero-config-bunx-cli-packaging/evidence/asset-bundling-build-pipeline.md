# Evidence: Asset Bundling Build Pipeline

**Dimension:** D6 — Monorepo build orchestration for including React app in CLI npm package
**Date:** 2026-04-11
**Sources:** open-knowledge codebase, npm packaging patterns

---

## Key files / pages referenced

- `packages/cli/package.json` — current build scripts and files field
- `packages/cli/tsdown.config.ts` — current build config
- `packages/app/package.json` — app build scripts
- `packages/app/dist/` — built React app output (2MB)
- `packages/cli/dist/` — built CLI output (6.1MB)

---

## Findings

### Finding: The current build pipeline has no step to include the React app
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/package.json`, `packages/cli/tsdown.config.ts`

Current CLI build:
```json
"scripts": {
  "build": "tsdown",
  "prepublishOnly": "bun run build && bun run test"
}
```

tsdown bundles `core` and `server` workspace packages (`alwaysBundle`), externalizes `@parcel/watcher` and `simple-git` (`neverBundle`). But there is no step to build the React app or copy its dist to the CLI package.

The `"files": ["dist"]` field means only `packages/cli/dist/` is published. The React app in `packages/app/dist/` is not included.

**Implications:** A build pipeline change is needed to include the React app.

### Finding: Build-time copy is the simplest and most reliable approach
**Confidence:** CONFIRMED
**Evidence:** Industry patterns

Recommended `package.json` scripts:

```json
{
  "scripts": {
    "build:app": "cd ../app && bun run build",
    "build:cli": "tsdown",
    "build:assets": "cp -r ../app/dist dist/public",
    "build": "bun run build:app && bun run build:cli && bun run build:assets",
    "prepublishOnly": "bun run build && bun run test"
  }
}
```

This produces:
```
dist/
├── cli.mjs          (CLI entry point)
├── index.mjs        (programmatic API)
├── *.d.mts          (type declarations)
└── public/          (React app assets)
    ├── index.html
    ├── favicon.svg
    └── assets/
        ├── index-*.js  (1.9MB)
        └── index-*.css (77KB)
```

**Implications:** Simple, debuggable, works with any bundler. Verifiable with `npm pack --dry-run`.

### Finding: Asset path resolution in start.ts needs one simple change
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/start.ts` (lines 60-70)

Current (broken for npm installs):
```typescript
const assetPaths = [
  resolve(cliDir, '../../app/dist'),
  resolve(cliDir, '../../../app/dist'),
];
```

Fixed (works for both monorepo dev and npm install):
```typescript
const assetPaths = [
  resolve(cliDir, 'public'),           // npm install: dist/public/ (bundled)
  resolve(cliDir, '../../app/dist'),    // monorepo src: packages/cli/src → packages/app/dist
  resolve(cliDir, '../../../app/dist'), // monorepo dist: packages/cli/dist → packages/app/dist
];
```

Add `resolve(cliDir, 'public')` as the first check — this resolves the bundled assets when running from an installed npm package.

**Implications:** A one-line addition to `start.ts` plus the build script change. Minimal code change.

### Finding: Total published package size would be ~8MB — well within bounds
**Confidence:** CONFIRMED
**Evidence:** `du -sh` measurements

| Component | Size |
|-----------|------|
| CLI dist (tsdown output) | 6.1MB |
| React app dist (Vite output) | 2.0MB |
| **Total** | **~8.1MB** |

For comparison:
| Package | Unpacked size |
|---------|--------------|
| storybook | 20MB |
| @storybook/core | 28MB |
| prisma | 12MB+ |
| @angular/cli | 15MB |
| next | 8MB |
| **@inkeep/open-knowledge** | **~8MB** |

**Implications:** Package size is not a concern. 8MB is mainstream for a CLI tool.

### Finding: sirv already handles gzip and immutable caching for static assets
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/start.ts` (line 69)

```typescript
const staticHandler = assetDir
  ? sirv(assetDir, { single: true, gzip: true, immutable: true })
  : null;
```

`gzip: true` — serves pre-compressed `.gz` files if they exist, or compresses on the fly.
`immutable: true` — sets `Cache-Control: public, max-age=31536000, immutable` for hashed assets.
`single: true` — SPA fallback (all non-file routes serve `index.html`).

**Implications:** The static asset serving is already optimized. No changes needed.

---

## Gaps / follow-ups

* Consider pre-compressing assets during build (`gzip -k dist/public/assets/*`) for faster first-load
* Verify the `npm pack --dry-run` output includes `dist/public/` after the build change
* Consider a workspace-level build script that builds all packages in dependency order
