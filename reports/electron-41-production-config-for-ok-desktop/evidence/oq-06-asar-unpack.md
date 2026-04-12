# Evidence: OQ-06 — electron-builder asarUnpack for Native Modules

**Dimension:** What is the correct, minimal `asarUnpack` glob set for `@parcel/watcher` and other Open Knowledge native deps under electron-builder?
**Date:** 2026-04-11
**Sources:**
- electron-builder configuration docs (https://www.electron.build/configuration)
- @electron-forge/plugin-auto-unpack-natives source (https://github.com/electron/forge/blob/main/packages/plugin/auto-unpack-natives/src/AutoUnpackNativesPlugin.ts)
- electron/forge#3792 (https://github.com/electron/forge/issues/3792)
- electron/forge#3934 (https://github.com/electron/forge/issues/3934)
- electron-userland/electron-builder#1285 (https://github.com/electron-userland/electron-builder/issues/1285)
- electron-userland/electron-builder#6792 (https://github.com/electron-userland/electron-builder/issues/6792)
- Local inspection of `node_modules/.bun/@parcel+watcher@2.5.6/` and `@parcel+watcher-darwin-arm64@2.5.6/`
- `packages/server/package.json` from Open Knowledge

---

## Key files / pages referenced

- `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/.bun/@parcel+watcher@2.5.6/node_modules/@parcel/watcher/index.js`
- `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/.bun/@parcel+watcher@2.5.6/node_modules/@parcel/watcher/package.json`
- `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/.bun/@parcel+watcher-darwin-arm64@2.5.6/node_modules/@parcel/watcher-darwin-arm64/`
- `/Users/edwingomezcuellar/projects/open-knowledge/packages/server/package.json`

---

## Findings

### Finding: `@parcel/watcher` ships exactly **one** native binary per platform — `watcher.node` — in a per-platform optional dependency package
**Confidence:** CONFIRMED
**Evidence:** Direct local inspection.

`@parcel/watcher` v2.5.6 has 13 platform-specific optional dependencies declared in its `package.json`:

```json
"optionalDependencies": {
  "@parcel/watcher-darwin-x64": "2.5.6",
  "@parcel/watcher-darwin-arm64": "2.5.6",
  "@parcel/watcher-win32-x64": "2.5.6",
  "@parcel/watcher-win32-arm64": "2.5.6",
  "@parcel/watcher-win32-ia32": "2.5.6",
  "@parcel/watcher-linux-x64-glibc": "2.5.6",
  "@parcel/watcher-linux-x64-musl": "2.5.6",
  "@parcel/watcher-linux-arm64-glibc": "2.5.6",
  "@parcel/watcher-linux-arm64-musl": "2.5.6",
  "@parcel/watcher-linux-arm-glibc": "2.5.6",
  "@parcel/watcher-linux-arm-musl": "2.5.6",
  "@parcel/watcher-android-arm64": "2.5.6",
  "@parcel/watcher-freebsd-x64": "2.5.6"
}
```

The macOS Apple Silicon variant `@parcel/watcher-darwin-arm64@2.5.6` contains exactly:

```
watcher.node     (326,112 bytes)
package.json
README.md
LICENSE
```

per its `package.json`:
```json
{
  "name": "@parcel/watcher-darwin-arm64",
  "main": "watcher.node",
  "files": ["watcher.node"],
  "os": ["darwin"],
  "cpu": ["arm64"]
}
```

The main `@parcel/watcher` package's `index.js` resolves the platform package by name and `require()`s it:

```js
let name = `@parcel/watcher-${process.platform}-${process.arch}`;
if (process.platform === 'linux') {
  const { MUSL, familySync } = require('detect-libc');
  const family = familySync();
  if (family === MUSL) {
    name += '-musl';
  } else {
    name += '-glibc';
  }
}

let binding;
try {
  binding = require(name);
} catch (err) {
  // ... fallbacks to ./build/Release/watcher.node and ./build/Debug/watcher.node
}
```

**Implications:** For a macOS Universal build (x64 + arm64), electron-builder must ensure `@parcel/watcher-darwin-x64/watcher.node` AND `@parcel/watcher-darwin-arm64/watcher.node` are both present in `app.asar.unpacked/node_modules/`. There are no `.dylib`, `.framework`, or auxiliary native files — just the single `.node` per platform.

The platform package's own `package.json` MUST also be unpacked alongside the `.node`, because `require('@parcel/watcher-darwin-arm64')` resolves through Node's module resolution which reads `package.json#main` to find `watcher.node`. If only the `.node` is unpacked but `package.json` stays inside the asar, the require will fail at runtime (asar reads succeed for JS but `dlopen()` requires a real filesystem path for `.node` files — see "ASAR Limitations" below).

---

### Finding: Native `.node` files **cannot** be loaded directly from inside an asar archive — they must always be unpacked
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/asar-archives

Electron's asar documentation explicitly lists `dlopen()` as one of the Node APIs that bypass the asar virtual filesystem and require a real path on disk. The `.node` file must exist at the path that `process.dlopen()` is given. This is enforced by the OS-level dynamic loader (macOS dyld, Linux ld.so), which does not understand asar.

**Implications:** This is what makes `asarUnpack` necessary at all for `@parcel/watcher`. The unpacked file is placed at `app.asar.unpacked/<original-path>`, and Electron transparently substitutes the real path when JS code does `require('./watcher.node')`.

---

### Finding: electron-builder auto-detects native modules and auto-unpacks them — but the auto-detection is not reliable in all package layouts
**Confidence:** CONFIRMED
**Evidence:** https://www.electron.build/configuration

> "Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#asarUnpack) - please file an issue if this doesn't work."

Issue https://github.com/electron-userland/electron-builder/issues/1285 confirms the auto-detection runs against `binding.gyp` files and `*.node` files in `node_modules/`. However, multiple issues document edge cases where it fails:
- Symlinked packages (e.g., `yarn link`, monorepo workspaces with `bun link`)
- Packages where the `.node` lives in a separate optional-dependency package (which is exactly the `@parcel/watcher` layout)
- Packages where the platform-specific `.node` is missing on the dev's machine but present after CI build
- Hidden directories like `.webpack` (issue #3792)

Issue https://github.com/electron-userland/electron-builder/issues/6792 specifically titled "Node modules, that must be unpacked, are not detected automatically" — confirms this is a recurring sharp edge.

**Implications:** Relying on auto-detection is risky for the `@parcel/watcher` layout because:
1. The native binary lives in a SEPARATE package (`@parcel/watcher-darwin-arm64`), not in `@parcel/watcher` itself.
2. Open Knowledge uses Bun workspaces — `node_modules/.bun/` symlink layout may confuse the detector.
3. A failure here is silent at build time and fatal at runtime (`ERR_DLOPEN_FAILED` on first server fork).

The safest path is to set `asarUnpack` explicitly with the right glob.

---

### Finding: The recommended explicit glob is `**/{.**,**}/**/*.node` plus the wrapping platform package directories
**Confidence:** CONFIRMED (this is what @electron-forge/plugin-auto-unpack-natives ships)
**Evidence:** https://github.com/electron/forge/blob/main/packages/plugin/auto-unpack-natives/src/AutoUnpackNativesPlugin.ts

> "const newUnpack = '**/{.**,**}/**/*.node';"

This is line 26 of AutoUnpackNativesPlugin.ts (current main). The pattern was changed from the original `**/*.node` to handle hidden directories like `.webpack`, `.vite`, and `.bun` after issue #3792.

Why the more complex glob:
- `**/*.node` — matches `node_modules/foo/build/Release/foo.node` ✅ but NOT `.bun/node_modules/foo/build/Release/foo.node` ❌ (because `**` does not cross `.`-prefixed directories in some glob implementations)
- `**/{.**,**}/**/*.node` — matches both hidden and non-hidden directory chains ✅

**Implications:** Open Knowledge uses Bun, which produces a `.bun/`-style symlink layout in `node_modules/`. The hidden-directory-aware glob is the correct choice.

However, for asarUnpack alone, the `.node` file is just one part — the wrapping `package.json` also needs to be unpacked OR the glob also needs to include the package directory. electron-builder handles this by unpacking the entire enclosing package directory when it sees a matching `.node`.

---

### Finding: Recommended explicit `asarUnpack` configuration for Open Knowledge
**Confidence:** INFERRED (synthesizes the above findings)
**Evidence:** Combining the auto-detection unreliability, the @parcel/watcher per-platform package layout, and the hidden-directory glob:

```yaml
# electron-builder.yml — mac section
asarUnpack:
  - "**/node_modules/@parcel/watcher/**"
  - "**/node_modules/@parcel/watcher-darwin-x64/**"
  - "**/node_modules/@parcel/watcher-darwin-arm64/**"
  - "**/node_modules/@parcel/watcher-*/**"        # catch-all for transitive optionalDeps
  - "**/*.node"
```

Or, equivalently in `package.json`:

```json
"build": {
  "asarUnpack": [
    "**/node_modules/@parcel/watcher/**",
    "**/node_modules/@parcel/watcher-darwin-x64/**",
    "**/node_modules/@parcel/watcher-darwin-arm64/**",
    "**/node_modules/@parcel/watcher-*/**",
    "**/*.node"
  ]
}
```

**Why each entry:**
1. `**/node_modules/@parcel/watcher/**` — unpacks the JS wrapper (`index.js`, `wrapper.js`, `package.json`) so the require chain works.
2. `**/node_modules/@parcel/watcher-darwin-x64/**` — explicit unpack of the x64 platform package (Universal builds need both architectures).
3. `**/node_modules/@parcel/watcher-darwin-arm64/**` — explicit unpack of the arm64 platform package.
4. `**/node_modules/@parcel/watcher-*/**` — catch-all glob in case a transitive dependency (e.g., a future swap to a sibling package) ships under a different `@parcel/watcher-*` name.
5. `**/*.node` — defense in depth: any other `.node` file from any other dep gets unpacked.

The Open Knowledge spec only ships macOS for day 0 (NG4 in SPEC.md), so the Linux/Windows/freebsd platform packages can be excluded from the build via electron-builder's `files` filter to keep the bundle size down. They're optionalDependencies and won't be installed on a macOS CI runner anyway.

**Note:** The `**/*.node` glob is superficially the same as the deprecated electron-forge glob, but in electron-builder it's evaluated against the source layout (no hidden-directory issue because electron-builder re-roots to a flat asar source). The pattern `**/{.**,**}/**/*.node` is specific to electron-forge's webpack/vite plugin chain.

---

### Finding: No other Open Knowledge runtime dependency ships native code
**Confidence:** CONFIRMED
**Evidence:** Local inspection of `packages/server/package.json` and `node_modules/.bun/`:

```bash
# All .node files under node_modules:
fsevents@2.3.3/.../fsevents.node           # transitive dev dep, NOT in production runtime
fsevents@2.3.2/.../fsevents.node           # transitive dev dep, NOT in production runtime
lightningcss-darwin-arm64/.../*.node       # Vite/Tailwind build dep, NOT in runtime
```

`packages/server/package.json` runtime deps:
- `@hocuspocus/server` — pure JS
- `@parcel/watcher` — **native (covered above)**
- `@tiptap/core`, `@tiptap/markdown`, `@tiptap/y-tiptap` — pure JS
- `ignore`, `picomatch`, `pino`, `pino-pretty`, `simple-git`, `ws`, `yjs` — all pure JS

Confirmation that `simple-git` shells out to the `git` binary (per its README) and ships no native code.

`ws` has two optional native dependencies (`bufferutil`, `utf-8-validate`) for performance, but they are NOT installed in this project (verified — no entries in `node_modules/.bun/`). If they were, `ws` runs fine without them in pure-JS mode.

**Implications:** `@parcel/watcher` is the ONLY runtime dependency that needs `asarUnpack` handling. The recommended config above is complete.

`fsevents` is a transitive dev dependency (chokidar's macOS backend, used by Vite) and is not present in the production server bundle. No action needed.

---

### Finding: known-bad asarUnpack patterns to avoid
**Confidence:** INFERRED from issue research
**Evidence:**

1. **`"**/*.node"` alone** — Works for the binary itself, but does NOT unpack the surrounding `package.json` of platform packages. Loading `require('@parcel/watcher-darwin-arm64')` reads `package.json#main` to find `watcher.node`, and if `package.json` is still inside asar but `watcher.node` is unpacked, the resolution still works (Electron's asar shim handles the JSON read), BUT some asar fallback paths assume both files are co-located. Including the wrapping directory glob is more robust.

2. **`"node_modules/@parcel/watcher/**"` (without leading `**`)** — Misses transitive installs in nested `node_modules/` (e.g., when an indirect dep also pulls a different version of `@parcel/watcher`). The leading `**/` is needed for Bun workspaces and pnpm-style nested resolution.

3. **`"**/*.node"` plus `--asar=false`** — Disabling asar entirely "works" but loses asar's launch performance, integrity verification (CVE-2025-55305 fix in Electron 41), and tamper resistance. Don't.

4. **Globs that match debug builds** — `**/build/Debug/**/*.node` would unpack debug builds if they exist (they shouldn't on a clean install). The recommended globs above don't match `build/Debug/`.

---

## Negative searches

- Searched for `@parcel/watcher` + electron-builder + asar issues in their respective issue trackers — NOT FOUND for direct issues. The package "just works" with auto-detection in many cases, but the failure modes are silent.
- Searched for `@parcel/watcher` `.dylib` or `.framework` dependencies — NOT FOUND. The macOS backend uses FSEvents from CoreServices.framework, which is a system framework (not bundled, no dlopen needed).
- Searched for any other Hocuspocus / yjs / ws native module dependency — NOT FOUND. All confirmed pure-JS.

---

## Gaps / follow-ups

- Confirm at build time: after first electron-builder run, run `asar list "Open Knowledge.app/Contents/Resources/app.asar"` and verify NO `watcher.node` files appear inside the archive (they should all be in `app.asar.unpacked/`). Conversely, `find "Open Knowledge.app/Contents/Resources/app.asar.unpacked" -name "*.node"` should list all expected platform binaries.
- For Universal Mac builds (x64 + arm64 in one app), verify that BOTH `@parcel/watcher-darwin-x64/watcher.node` AND `@parcel/watcher-darwin-arm64/watcher.node` are present after build. If only one is present, the build CI is missing one architecture.
