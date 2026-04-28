---
title: Desktop packaging first-boot failure
description: Packaged macOS .app crashes on launch with ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING because workspace TS deps (@inkeep/open-knowledge-server, @inkeep/open-knowledge-core) export .ts sources and Node refuses to strip types under node_modules. Emit .mjs via tsdown + conditional exports so dev keeps resolving to .ts and packaging resolves to built output.
tags: [spec, desktop, electron, packaging, typescript, type-stripping, workspace-deps]
status: Draft — 2026-04-24
---

# Desktop packaging first-boot failure — Spec

**Status:** Draft — ready for implementation
**Owner:** Andrew Mikofalvy
**Last updated:** 2026-04-24
**Baseline commit:** `557af04b`
**Discovered via:** Manual smoke of the first-ever CI-produced unsigned DMG (run 24909708953), on 2026-04-24. App window opens, immediately shows "A JavaScript error occurred in the main process".

---

## 1) Problem statement

**Situation.** `bun run build:mac:unsigned` produces a working DMG. The .app launches; the main process forks the utility process; the utility immediately crashes.

**Error (exact text, captured from the packaged app on macOS 26.3):**

```
Uncaught Exception:
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
unsupported for files under node_modules, for
"file:///Applications/Open%20Knowledge.app/Contents/Resources/app.asar/node_modules/@inkeep/open-knowledge-server/src/index.ts"
    at stripTypeScriptModuleTypes (node:internal/modules/typescript:183:11)
    ...
```

**Root cause.** Three facts compose into the crash:

1. `@inkeep/open-knowledge-server/package.json` and `@inkeep/open-knowledge-core/package.json` both declare `exports["."].default: "./src/index.ts"`. No build step; the TS source IS the published entry point across the workspace.
2. `packages/desktop/electron.vite.config.ts` uses `externalizeDepsPlugin()` in the main-process section, which externalizes every entry in `dependencies`. `@inkeep/open-knowledge-server` is a runtime `dependencies` entry, so the compiled `out/main/index.js` retains `import '@inkeep/open-knowledge-server'` and Node resolves it at runtime.
3. Node 22.6+ (and Electron 41's embedded Node) strips TypeScript types natively via `--experimental-strip-types`. **But that policy hard-excludes paths under `node_modules/`** — see `node:internal/modules/typescript:183`. The rationale upstream: third-party packages should ship compiled JS; only first-party source is eligible for strip-types.

**Why the bug was never caught before this ticket.** Dev mode (`bun run dev`, `electron-vite dev`, `cd packages/app && bun run dev`) runs under bun's workspace symlink layout: `node_modules/@inkeep/open-knowledge-server` is a symlink to `packages/server`. When Node resolves the import and reads the exports map, the resolved real path is `packages/server/src/index.ts` — **not** under `node_modules`. Node's strip-types policy applies to the realpath, so it succeeds.

`electron-builder`, when packaging, copies workspace deps as **real files** into `app.asar/node_modules/@inkeep/open-knowledge-*/src/*.ts`. At that point the realpath IS under node_modules, and the strip-types guard rejects it.

**Impact.** No packaged macOS build of the desktop app has ever successfully booted. Every M1–M6 milestone's DOD was validated against either `bun run dev` (renderer + utility-process under Vite with runtime transpilation) or — for the two specs that required a packed `.app` — against `electron-builder --dir` for layout inspection, never an actual launch. The signed-release chain in `desktop-release.yml` would hit the same crash at first real use.

---

## 2) Goals

- **G1.** Unsigned arm64 `.dmg` built by `desktop-build.yml` boots on a clean macOS machine, reaches the Navigator window, and the utility process stays alive past its first tick.
- **G2.** Same as G1 for a locally-built `.dmg` (so maintainers can iterate without CI round-trips).
- **G3.** Dev workflow preserved: `cd packages/app && bun run dev`, `bun run check`, every unit + integration + fidelity test still resolves `@inkeep/open-knowledge-server` and `@inkeep/open-knowledge-core` imports without requiring pre-built `dist/` artifacts for maintainer ergonomics.
- **G4.** The fix composes cleanly with the universal-DMG work (M2 FU-1 keyring SHA-parity) — nothing here blocks or complicates that effort.
- **G5.** `bun run check` stays green; `bun run check:full:parallel` stays green.

## 3) Non-goals

- **[NOT NOW] NG1.** Fix universal (arm64 + x64) DMG merge. Tracked as M2 FU-1 — `@napi-rs/keyring-darwin-x64` is not installed by `bun install` on an arm64 macOS runner, so `@electron/universal.makeUniversalApp` rejects the SHA-identical arm64 keyring binary in both slices. Independent of type-stripping; own spec when we pick it up. *Revisit after this spec ships; M2 FU-1 blocks signed GitHub releases via `desktop-release.yml`.*
- **[NOT NOW] NG2.** Build `@inkeep/open-knowledge-app` (renderer) to pre-compiled output. The renderer is served via Vite's build pipeline into `packages/cli/dist/public/` + `packages/desktop/out/renderer/` — its `.ts` never lands under `node_modules/` at runtime, because the renderer bundle is self-contained. Only the **main/utility** process has the problem.
- **[NEVER] NG3.** Drop `.ts` as the workspace-internal source format. The repo's entire dev loop + test matrix (incl. turbo's `^build` invariant) presumes `.ts` sources under `packages/*/src/`. The fix is to emit `.mjs` in addition, not to migrate the repo off TS.
- **[NEVER] NG4.** Disable `--experimental-strip-types` in the packaged Electron runtime. The strip-types policy is a hard-coded Node guarantee; bypassing it would require patching Electron's embedded Node binary. Out of scope.
- **[NEVER] NG5.** Inline `@inkeep/open-knowledge-server` into `out/main/index.js` via `externalizeDepsPlugin({ exclude })`. Server's dependency closure includes `simple-git` (spawns a `git` subprocess), `chokidar` (native `@parcel/watcher`), `pino` (worker threads), `busboy` (streaming parser). Inlining JS while leaving native bindings under asarUnpack introduces a dual-resolution path that surfaces as `Cannot find module` errors at runtime. Three-day rabbit hole avoided by emitting `.mjs` instead.

---

## 4) Personas / consumers

1. **P1 — Anyone launching the packaged desktop app.** Today: app crashes at first tick with an unhandled exception dialog. Zero-to-success rate on a packaged DMG: 0%.
2. **P2 — Maintainers iterating on desktop features.** Dev mode works; packaged mode doesn't. Gap masks latent issues in anything that only manifests under `app.asar/node_modules/` realpath resolution — e.g., `simple-git`'s shadow repo initialization against a read-only asar parent, `@parcel/watcher`'s asarUnpack handling. After this spec, the loop is "edit → `bun run build:mac:unsigned` → `xattr -cr` + launch" with a working DMG.
3. **P3 — CI.** `desktop-release.yml` would attempt the same packaging + publish flow on every Version Packages release. Without this fix, a published DMG would reach customers and crash on install.

---

## 5) Options considered

### Option A — Emit `.mjs` via `tsdown`, use conditional exports (LOCKED)

Add `tsdown` build step to `packages/server` and `packages/core`, mirroring the pattern already used by `packages/cli/tsdown.config.ts`. Emit `dist/index.mjs` + `dist/index.d.mts`. Update `exports` to:

```json
"exports": {
  ".": {
    "development": "./src/index.ts",
    "types": "./src/index.ts",
    "default": "./dist/index.mjs"
  }
}
```

**Resolution matrix:**

| Consumer | Tool | Conditions applied | Resolves to |
|---|---|---|---|
| `cd packages/app && bun run dev` | Vite dev server | `development`, `import` | `src/index.ts` ✓ (bun strips types at realpath) |
| `electron-vite dev` (renderer + main) | Vite dev | `development`, `import` | `src/index.ts` ✓ |
| `bun test` in any package | Bun runtime | `bun`, `import` | `src/index.ts` (via `development` added in test scripts, see §7) |
| `bun run build` (turbo) | Vite/tsdown prod build | `import` | `dist/index.mjs` ✓ |
| Packaged `.app` main process | Electron's Node 22+ | `import` | `dist/index.mjs` ✓ — no `.ts` under node_modules |

**Trade-offs:**
- ✓ Fixes the bug.
- ✓ Preserves dev ergonomics (no "build before test" penalty for maintainers).
- ✓ Adds ~200 ms per package to `bun run build` on cold turbo cache; negligible on warm.
- ✓ Pattern already established by `@inkeep/open-knowledge` (CLI) — same `tsdown` + `neverBundle: ['@parcel/watcher', 'simple-git']` config template.
- ✗ Slight complexity: the `development` condition must be explicitly added to any runtime whose default resolver does not include it (Node CLI, Electron's main process). Mitigations in §7.

### Option B — Inline workspace deps into `out/main/index.js` (rejected)

Set `externalizeDepsPlugin({ exclude: [/^@inkeep\//] })`. Vite bundles `@inkeep/open-knowledge-server`'s source inline.

**Trade-offs:**
- ✓ No changes to workspace package structure.
- ✗ Pulls ~60 transitive deps (remark, mdast, tiptap, chokidar, simple-git, pino, busboy, ws, yjs) inline. Bundle grows from 503 KB → multi-MB.
- ✗ `simple-git` spawns a `git` subprocess — works inlined but fragile.
- ✗ `pino` uses worker threads that expect to `require.resolve` their own files — broken under inlining.
- ✗ Every new workspace runtime dep added later risks the same "inlining broke X" forensic loop. Not a stable pattern.

### Option C — Conditional exports with Node `--conditions=development` at runtime (rejected)

Same exports shape as Option A, but rely on passing `--conditions=development` via `NODE_OPTIONS` or `execArgv` in dev.

**Trade-offs:**
- ✗ Vite's dev-mode resolver already applies `development` — no additional flag needed for the renderer or build path. The only consumer that needs the flag is Node at packaged runtime, and there we DON'T want the `development` condition to apply (we want it to resolve to `dist/`). Backwards from the problem we're solving.
- ✗ Rejected in favor of A.

### Option D — Relocate `.ts` source outside `node_modules` in the asar at package time (rejected)

Custom `afterPack.mjs` logic that walks `app.asar/node_modules/@inkeep/*/src/` and moves it to `app.asar/src-hoisted/`, rewriting exports.

**Trade-offs:**
- ✗ Fights electron-builder's normal layout.
- ✗ Fragile against transitive imports (file A imports file B via relative path).
- ✗ Still has to update the `exports` map anyway — at which point you've done 80% of Option A with no `.mjs` output.
- ✗ Unrecoverable debug experience (source maps point into a directory shape that doesn't match the repo).

## 6) Decision (LOCKED)

**D1 — Option A.** Add `tsdown` builds to `packages/server` and `packages/core`; emit `dist/index.mjs`; use conditional exports with `development`/`types`/`default` ordering.

**D2 — No new `source` condition.** Use the well-known `development` condition (supported natively by Vite, rollup-commonjs, esbuild, Metro). Adding a custom condition adds a maintenance burden with no upside.

**D3 — Include the secondary `--publish never` fix for `build:mac` / `build:mac:unsigned`.** This spec's PR bundles the one-line script change in `packages/desktop/package.json`. Rationale: without it, `desktop-build.yml` fails at CI artifact cleanup when electron-builder v26's CI auto-publish path triggers without `GH_TOKEN`. Unrelated root cause but entangled with "does the packaging workflow actually work?" — including it is cheaper than a follow-up PR.

**D4 — Keep `@inkeep/open-knowledge-core`'s `./shadow-repo-layout` subpath export.** Same conditional pattern applied to both subpath exports.

**D5 — Disable `EnableCookieEncryption` fuse.** The Electron cookie-encryption fuse (set in `packages/desktop/scripts/target-fuses.mjs`) triggers a macOS Keychain access prompt at first launch (Electron's Network Service eagerly opens the cookie SQLite store, which calls `safeStorage` → `Security.framework`). Audit of the packaged `Cookies` SQLite database found exactly one cookie: `localhost / sidebar_state=true|false` set by shadcn's `<SidebarProvider>` (`packages/app/src/components/ui/sidebar.tsx:83`) for sidebar open/closed UX state. The cookie has `is_secure: 0` (set from a `file://` page), and Chromium's cookie-encryption code path gates on `is_secure: 1` — meaning the fuse-on path was a no-op for every cookie we actually write while still triggering a Keychain prompt every launch (every rebuild in the unsigned dev loop, since ad-hoc signatures don't persist Keychain ACLs). Net: prompt-for-nothing. Disabling the fuse removes the prompt with zero security delta against current cookie contents. Re-enable when a feature actually stores a secret in a cookie (e.g., adding a webview to a third-party service that issues auth cookies).

**D6 — Fix renderer asset path resolution: `base: './'` in app vite config.** The packaged renderer fails to load any hashed JS/CSS chunk because `packages/app/dist/index.html` references assets as `/assets/foo.js` (Vite's default `base: '/'`). Under HTTP (`ok ui`'s server), the browser resolves `/assets/foo.js` against the server origin → loads correctly. Under `file://` (Electron's `loadFile`), `/assets/foo.js` resolves to the filesystem root, not the .app bundle, and every chunk 404s. Set `base: './'` in `packages/app/vite.config.ts` so the built `index.html` references assets as `./assets/foo.js` — works identically under both transports. No regression for `ok ui` (relative paths resolve against the page URL the same way absolute paths do, when the server serves at root). Confirmed empirically: with `base: './'`, the packaged Navigator + Editor windows render content; with `base: '/'`, the renderer mounts `<div id="root">` and never hydrates.

**D7 — Promote `y-protocols` to a direct runtime dep of `packages/server`.** `@tiptap/y-tiptap` declares `y-protocols` as a peer dependency. Under bun's workspace, `y-protocols` lives at the repo-root `node_modules/` (hoisted via `@hocuspocus/server`'s regular dep). electron-builder's bun-mode walker (`note: bun does not support any CLI for dependency tree extraction, utilizing file traversal collector instead`) does not follow peer deps — only regular `dependencies`. Result: the packaged asar gets `@tiptap/y-tiptap/dist/y-tiptap.js` but no `node_modules/y-protocols/`. At runtime the utility process crashes with `ERR_MODULE_NOT_FOUND` resolving `'y-protocols'`. Fix: add `y-protocols: ^1.0.7` to `packages/server/package.json`'s `dependencies` so the walker pulls it into the bundle. Functionally a no-op for dev (already resolved via hoist), strictly load-bearing for packaged.

**D8 — Narrow `electron-builder.yml` target to `arch: [arm64]`.** Universal DMG (arm64+x64 merge via `@electron/universal.makeUniversalApp`) fails on bun-installed projects: bun installs only the host-arch native binding for `optionalDependencies` (e.g., `@napi-rs/keyring-darwin-arm64`), and the universal merger rejects SHA-identical native binaries in both slices. Tracked as NG1; arm64-only is the smallest viable target until that lands. Intel Mac users are temporarily unsupported. Restoring universal is a `electron-builder.yml` revert + the `@napi-rs/keyring-darwin-x64` install fix per NG1's eventual spec.

## 7) Implementation plan

### 7.1 `packages/server`

1. Add `tsdown.config.ts`:
   ```ts
   import { defineConfig } from 'tsdown';
   export default defineConfig({
     entry: { index: 'src/index.ts' },
     unbundle: false,
     format: 'esm',
     dts: true,
     clean: true,
     deps: {
       neverBundle: ['@parcel/watcher', 'simple-git'],
     },
   });
   ```
   (No `minify: true` — server package is private; debuggability > bundle size.)

2. Add `build` script to `package.json`:
   ```json
   "build": "tsdown"
   ```

3. Update `exports`:
   ```json
   "exports": {
     ".": {
       "development": "./src/index.ts",
       "types": "./src/index.ts",
       "default": "./dist/index.mjs"
     }
   }
   ```

4. Add `files` to `package.json`: `["dist", "src"]` (keep `src` for dev resolution via symlinks).

### 7.2 `packages/core`

Same three changes as 7.1, applied to `packages/core`. Two subpath exports: `.` and `./shadow-repo-layout`. `tsdown` entry:
```ts
entry: { index: 'src/index.ts', 'shadow-repo-layout': 'src/shadow-repo-layout.ts' }
```

### 7.3 turbo graph

No turbo.json changes needed. `build:desktop` already depends on `^build` → every upstream workspace package with a `build` script runs first. Adding `build` to server + core automatically wires them in.

### 7.4 `packages/desktop/package.json`

Two script edits (bundle D3's `--publish never`):
```diff
- "build:mac": "bun run build:desktop && electron-builder --mac",
- "build:mac:unsigned": "bun run build:desktop && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac -c.mac.identity=null",
+ "build:mac": "bun run build:desktop && electron-builder --mac --publish never",
+ "build:mac:unsigned": "bun run build:desktop && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac --publish never -c.mac.identity=null",
```

`desktop-release.yml` uses its own `electron-builder --mac --publish always` invocation, unaffected.

### 7.5 Electron-builder asar content

No change to `electron-builder.yml`. The `files: ["out/**/*", "!**/*.map"]` rule already excludes workspace source from the desktop's asar. Workspace deps are pulled in by electron-builder's node_modules walker — it reads `packages/server/package.json`, sees `exports` → `dist/index.mjs` + `src/index.ts`, and the `files: ["dist", "src"]` entry (§7.1 step 4) tells it to ship both. In the packaged asar, Node resolves to `dist/` because `default` wins. Dev still works because the in-tree package has `src/` symlinked.

### 7.6 Dev-mode condition propagation — safety check

Vite (both the renderer and electron-vite's main-process build) applies `development` during `vite dev`. Bun's test runner applies its own conditions (`bun`, `node`, `default`) but NOT `development` by default. Verify via probe:

```bash
cd packages/server && bun test --conditions=development
```

If bun test picks up `.mjs` by default (because `development` isn't applied), add the flag to `test` scripts in affected packages, or gate via `bunfig.toml`. Detail resolved during §7.7 iteration.

### 7.7 Iteration loop

Local build: `cd packages/desktop && bun run build:mac:unsigned` (arm64-only on arm64 Macs; universal would hit M2 FU-1 and fail per NG1).

Faster iteration path: `cd packages/desktop && bun run build:dir` (skips DMG wrapping, produces `.app` directly under `dist-desktop/mac-arm64/Open Knowledge.app`; ~2-3 min vs ~5 min for DMG).

Launch test: `xattr -cr "dist-desktop/mac-arm64/Open Knowledge.app" && open "dist-desktop/mac-arm64/Open Knowledge.app"`.

Observe: navigator window reaches? Utility process stays alive? Any follow-up crashes? Document in `evidence/iteration-log.md` under this spec's dir.

## 8) Acceptance criteria

- **AC1.** Unsigned arm64 `.dmg` built locally via `bun run build:mac:unsigned` boots on macOS 26 (Apple Silicon), renders the Navigator window, and the utility process ping-pongs at least one IPC round-trip with the main process without crashing.
- **AC2.** Same as AC1 for a `.dmg` produced by `desktop-build.yml` on the same commit.
- **AC3.** `bun run check` passes (lint + typecheck + test + test:integration + test:conversion + test:fidelity). No regressions.
- **AC4.** `cd packages/app && bun run dev` still starts cleanly and serves at `http://localhost:5173`. No "cannot resolve `@inkeep/open-knowledge-server`" errors.
- **AC5.** `bun test` in each of `packages/server`, `packages/core`, `packages/cli`, `packages/app`, `packages/desktop` runs to green.
- **AC6.** `desktop-build.yml` run against the merge commit reaches `success`, uploads the unsigned arm64 DMG artifact, and the DMG passes AC2 on a manually-tested Mac.
- **AC7.** Absent Apple creds, `desktop-release.yml` still fails at the "Detect signing mode" step per AC5 of M3. (No regression — unsigned releases remain forbidden.)
- **AC8.** Packaged renderer's `index.html` references hashed assets via relative paths (`./assets/foo.js`, not `/assets/foo.js`). Verifiable via `head -30 dist-desktop/mac-arm64/Open\ Knowledge.app/Contents/Resources/app/index.html`. Confirms D6 took.
- **AC9.** Packaged app does NOT trigger a macOS Keychain access prompt at first launch. Verifiable: launch from Finder on a Mac that has never run Open Knowledge → Navigator (or last-opened editor) appears with no system password dialog interposed. Confirms D5 took.
- **AC10.** Packaged utility process imports `y-protocols` successfully. Verifiable: launch app → check stderr for absence of `ERR_MODULE_NOT_FOUND: 'y-protocols'`. Confirms D7 took.

## 9) Risks + mitigations

- **R1.** Some dev runtime loses `development` condition and tries to load `dist/index.mjs` before it exists. *Mitigation:* §7.6 probe + add the flag where needed. Observable via a hard crash in dev on first run — easy to catch in §7.7.
- **R2.** `tsdown`'s `dts: true` mode handles type imports from `packages/core` across workspace boundaries differently than `tsc`. *Mitigation:* CLI already uses the same setup and ships types — if we see type divergence, mirror CLI's config exactly.
- **R3.** `pino`'s worker-thread resolution breaks under the new layout. *Mitigation:* `neverBundle: ['pino']` addition — but first verify this isn't a problem. Server currently works in dev where pino loads normally, and pino is in server's deps (externalized by tsdown by default), so the concern is whether the packaged app can resolve pino's worker files. Empirical — §7.7 loop catches it.
- **R4 (ACTUALIZED).** Follow-up crashes past the type-stripping one. *Materialized into 3 separate fixes* — see `evidence/iteration-log.md`:
  - **Iteration 2** — `ERR_MODULE_NOT_FOUND: 'y-protocols'` (peer dep not in asar). Fixed via D7.
  - **Iteration 3** — renderer `/assets/*` 404 under `file://` (Vite's default `base: '/'` incompatible with `loadFile`). Fixed via D6.
  - **Iteration 4** — `Yjs was already imported. This breaks constructor checks` (stderr warning, not blocking). Hypothesis: `@hocuspocus/server` ships both ESM (`hocuspocus-server.esm.js`) and CJS (`hocuspocus-server.cjs`) entries; if any consumer in the asar resolves via `require()` while another resolves via `import`, Node's module cache treats the two as distinct modules. Deferred to a follow-up — the warning does not block a working renderer in practice. Listed in §10 OQ4.

- **R5 (NEW).** Stale state from prior installs masks regression detection. The desktop app's electron-store `state.json` persists `lastOpenedProject` across installs/uninstalls — if a prior broken install opened a project, the next launch goes straight into Editor mode (with broken state) instead of showing Navigator (the cleaner first-run UX). *Mitigation:* during testing, clear `~/Library/Application Support/@inkeep/open-knowledge-desktop/state.json`. *Real fix:* out of scope here; track as a separate "clean-slate first run" UX spec.

## 10) Open questions

- **OQ1.** Does bun's test runner apply the `development` condition by default, or do we need `bunfig.toml` / script-flag work? Resolves during §7.6.
- **OQ2.** Does the `development` condition interact with `knip`'s dead-code detection? Unlikely, but knip reads exports to walk the module graph. Verify no new unused-export false positives after the exports change.
- **OQ3.** Should `packages/core`'s secondary export `./shadow-repo-layout` use the same three-branch conditional, or a simpler two-branch `{types, default}`? Primary export uses three (dev-friendly); no strong reason the subpath should differ. Default to mirroring for consistency. *Resolved during implementation: mirrored.*

- **OQ4.** Yjs double-import warning (`Yjs was already imported. This breaks constructor checks`) — does it actually break anything in the packaged app, or is it benign noise? `@hocuspocus/server` ships both `dist/hocuspocus-server.esm.js` and `dist/hocuspocus-server.cjs`. If any path resolves CJS while another resolves ESM, Node's module cache duplicates yjs. Investigate during a follow-up: trace which consumer triggers the second yjs import, and whether constructor checks (`doc instanceof Y.Doc`) actually fail in the packaged binary. If they fail, force-resolve `@hocuspocus/server` via its ESM entry, OR add yjs to a server-side dedupe list. If they don't fail, downgrade to a deferred-noise note.

- **OQ5.** `bun run script-with-&&` ships stale workspace state to electron-builder on CI but NOT locally. Reproducible: combined `bun run build:mac:unsigned` (script: `bun run build:desktop && electron-builder ...`) on `macos-26` runners produces an asar containing the pre-fix workspace package.json without `dist/`. Same commands as separate workflow steps produce a correct asar. Local macOS runs the same combined script and produces a correct asar. Workaround in this PR: split the steps in `desktop-build.yml`. Root cause hypotheses: (a) bun caches workspace symlink state when entering its `run` wrapper and the cache survives the `&&` boundary; (b) electron-builder's bun-mode walker reads from a snapshot taken before turbo's build outputs land; (c) version skew between local bun and the runner's bun. Worth a focused investigation when bandwidth permits — file upstream issue at oven-sh/bun if reproducible outside this monorepo. **Iteration 6 evidence:** [`evidence/iteration-log.md`](evidence/iteration-log.md#iteration-6).
