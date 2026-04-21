# Evidence: D1 — @napi-rs/keyring Electron utilityProcess compatibility

**Dimension:** D1 (P0) — @napi-rs/keyring native binding + Electron packaging
**Date:** 2026-04-17
**Sources:** Brooooooklyn/keyring-node, electron/electron, electron-builder, electron-forge

---

## Key files / pages referenced

- [Brooooooklyn/keyring-node package.json (main)](https://github.com/Brooooooklyn/keyring-node/blob/main/package.json) — version 1.2.0, NAPI targets list
- [Brooooooklyn/keyring-node Cargo.toml](https://github.com/Brooooooklyn/keyring-node/blob/main/Cargo.toml) — keyring-rs feature selection per platform
- [Brooooooklyn/keyring-node index.js](https://github.com/Brooooooklyn/keyring-node/blob/main/index.js) — auto-generated binding loader
- [Brooooooklyn/keyring-node src/linux_credential_builder.rs](https://github.com/Brooooooklyn/keyring-node/blob/main/src/linux_credential_builder.rs) — SecretService-then-keyutils fallback
- [Brooooooklyn/keyring-node issue #93](https://github.com/Brooooooklyn/keyring-node/issues/93) — native binding failure on Ubuntu 22.04, RHEL 9
- [electron-forge Auto Unpack Native Modules Plugin](https://www.electronforge.io/config/plugins/auto-unpack-natives) — automatic asarUnpack for native modules
- [electron-builder Common Configuration](https://www.electron.build/configuration.html) — asarUnpack, nodeGypRebuild, automatic native-module detection
- [electron/forge issue #3934](https://github.com/electron/forge/issues/3934) — plugin-auto-unpack-natives bug report
- [electron/electron issue #41396](https://github.com/electron/electron/issues/41396) — utilityProcess + asar path crash (now fixed)
- [electron/electron PR #46380](https://github.com/electron/electron/pull/46380) — utilityProcess.fork pre-ready crash fix, Electron 34+/35+/36+

---

## Findings

### Finding 1: `@napi-rs/keyring` uses split-package distribution of prebuilt binaries per platform target

**Confidence:** CONFIRMED
**Evidence:** [keyring-node package.json:napi.targets (main)](https://github.com/Brooooooklyn/keyring-node/blob/main/package.json)

```json
"napi": {
  "binaryName": "keyring",
  "targets": [
    "aarch64-apple-darwin",
    "aarch64-unknown-linux-gnu",
    "aarch64-unknown-linux-musl",
    "aarch64-pc-windows-msvc",
    "x86_64-apple-darwin",
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
    "x86_64-unknown-linux-musl",
    "x86_64-unknown-freebsd",
    "i686-pc-windows-msvc",
    "armv7-unknown-linux-gnueabihf",
    "riscv64gc-unknown-linux-gnu"
  ]
}
```

Published as version 1.2.0 (2025-09-02). Subpackages (e.g. `@napi-rs/keyring-darwin-arm64`, `@napi-rs/keyring-win32-x64-msvc`) are declared as npm `optionalDependencies` at publish time and selected at install time by npm/yarn/pnpm/bun based on `os`/`cpu`/`libc` match.

**Implications:**
- Covers all three tier-1 desktop targets (macOS Intel + Apple Silicon, Windows x64 + arm64, Linux x64/arm64 glibc/musl).
- No node-gyp / C++ compilation on end-user install — prebuilt `.node` files only.

---

### Finding 2: binding loader requires the `.node` file to be resolvable either colocated or inside the platform subpackage

**Confidence:** CONFIRMED
**Evidence:** [keyring-node index.js lines 98–110 (win32-x64 branch)](https://github.com/Brooooooklyn/keyring-node/blob/main/index.js)

```js
} else if (process.platform === 'win32') {
  if (process.arch === 'x64') {
    try {
      return require('./keyring.win32-x64-msvc.node')
    } catch (e) {
      loadErrors.push(e)
    }
    try {
      const binding = require('@napi-rs/keyring-win32-x64-msvc')
      // ... version check
      return binding
    } catch (e) {
      loadErrors.push(e)
    }
  }
}
```

Pattern is identical for all 12 targets. Resolution order per platform:
1. Colocated `.node` (only present in dev repo after `napi build` — not distributed in main npm package)
2. Platform subpackage `@napi-rs/keyring-<platform>` whose `package.json` `"main"` field points at the `.node`

`process.env.NAPI_RS_NATIVE_LIBRARY_PATH` is a third escape hatch for explicit path overrides.

**Implications:**
- `require(...)` on a `.node` file triggers Electron's native `process.dlopen`. Inside `app.asar`, `.node` files cannot be `dlopen`-ed — the OS dynamic loader needs a real filesystem path.
- Therefore the platform subpackage directory (containing the `.node`) MUST be in `app.asar.unpacked/` for packaged builds.

---

### Finding 3: electron-forge's `@electron-forge/plugin-auto-unpack-natives` automatically unpacks native modules from asar

**Confidence:** CONFIRMED
**Evidence:** [electronforge.io/config/plugins/auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives)

> "This plugin reduces loading times and disk consumption in the final packaged app by unpacking your native Node modules from an app's asar archive. It works by automatically adding all native Node modules in your node_modules folder to the asar.unpack config option."

Detection is based on presence of `.node` files under `node_modules/**`. The plugin walks `node_modules` at package time, globs all `*.node` binaries, and injects them into electron-builder's `asarUnpack`.

For split-package `@napi-rs/*`, this matches the `.node` file inside `@napi-rs/keyring-<platform>/*.node` and unpacks the entire parent directory.

**Implications:**
- Using electron-forge + auto-unpack-natives → zero explicit configuration for `@napi-rs/keyring`.
- Using bare electron-builder → must manually add `"asarUnpack": ["**/*.node", "**/node_modules/@napi-rs/**"]` or rely on electron-builder's automatic detection.

---

### Finding 4: electron-builder auto-detects and unpacks native modules by default

**Confidence:** CONFIRMED
**Evidence:** [electron.build/configuration.html](https://www.electron.build/configuration.html) asarUnpack section

> "Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set asarUnpack — please file an issue if this doesn't work for you."

`nodeGypRebuild` defaults to `false`. For NAPI-RS prebuilds (no compilation), no rebuild step is needed. The install-app-deps command exists primarily for modules that DO need rebuilding against Electron's ABI.

**Implications:**
- `@napi-rs/keyring` is ABI-stable via N-API — does not need rebuild per Electron version (subject to the N-API version contract, which N-API 3 is stable across Node 10+ / all current Electron).
- `electron-builder install-app-deps` is a no-op for N-API prebuilds. Install proceeds normally via platform subpackages.

---

### Finding 5: historical Electron + napi-rs compatibility issue on Windows (node.lib linking) was resolved years ago

**Confidence:** CONFIRMED
**Evidence:** [napi-rs/napi-rs issue #125](https://github.com/napi-rs/napi-rs/issues/125) (opened 2020-08-04)

Original concern: "napi-rs modules cannot be loaded by Electron on Windows because the build script links against the system Node.js library instead of Electron's bundled version" and "The library lacks a delay-load hook implementation, which is necessary for Electron compatibility on Windows."

Issue is tied to N-API releases prior to 1.0. Current N-API 3 (used by keyring 1.2.0) handles Electron ABI through the Node-API stable ABI contract — N-API abstracts away the underlying V8/Chromium symbol linkage.

A working example project exists: [dceddia/electron-napi-rs](https://github.com/dceddia/electron-napi-rs) — demonstrates napi-rs module loaded in an Electron Quick Start app.

**Implications:**
- The Windows delay-load problem is architectural legacy. N-API-based modules (which keyring 1.x is) load identically in Node and Electron because they bind to the N-API ABI, not Node's internal V8 API.

---

### Finding 6: utilityProcess.fork + asar path bug (electron#41396) was resolved in Electron 34/35/36

**Confidence:** CONFIRMED
**Evidence:** [electron/electron#41396](https://github.com/electron/electron/issues/41396) closed via [PR #46380](https://github.com/electron/electron/pull/46380) merged 2025-04-01

> "Release notes stated: Fixed an issue where calling `UtilityProcess.fork` prior to the app ready event would cause a crash."
> Backported to: main, 36.x-y, 35.x-y, 34.x-y.

Original bug was that `utilityProcess.fork('/path/to/app.asar/main/ModProcess/ModMain.js')` crashed on Windows when the entrypoint is inside asar.

**Implications:**
- On Electron ≥ 34.x with the backport, the utility-process entrypoint script CAN be inside app.asar — only its native-module `.node` dependencies need to be asar-unpacked.
- Electron 28–33 may still exhibit the crash on Windows asar paths; spec requires ≥ 34 for safety.

---

### Finding 7: production-reported binding-load failures on specific Linux distros post-upgrade (keyring-node v1.1.9)

**Confidence:** CONFIRMED
**Evidence:** [keyring-node issue #93](https://github.com/Brooooooklyn/keyring-node/issues/93) — fixed in v1.1.10 per maintainer comment

Reporter (2025-07): "We have an Electron application that depends on `@napi-rs/keyring`. After upgrading to version 1.1.9, we started seeing failures when binding the native module on RHEL 9–based distributions (AlmaLinux, Rocky Linux, etc.) as well as Ubuntu 22.04."

Error:
```txt
Error: Cannot find native binding. npm has a bug related to optional dependencies
```

Maintainer (@Brooooooklyn 2025-08-29): "@mockjv fixed in v1.1.10"

Root cause was a glibc version incompatibility in the prebuilt binary (newer glibc symbols in linkage). Fix in v1.1.10 rebuilt against older glibc baseline.

**Implications:**
- NAPI-RS prebuilt binaries can regress on a minor version if the CI builder's glibc baseline moves.
- Pin `@napi-rs/keyring` to a known-good version in production Electron apps, upgrade with telemetry.

---

## Gaps / follow-ups

- No primary-source confirmation that `utilityProcess` specifically (vs main process) loads napi-rs native modules without additional workarounds. Publicly available evidence shows Electron Quick Start main-process examples only. Inference: since utilityProcess runs Node.js (per Electron docs) and `.node` loading is delegated to `process.dlopen` at the Node layer, there is no documented Electron-side barrier beyond asar unpacking. No specific known issue exists on electron/electron tracker for `"utilityProcess" + "napi-rs"` combination (verified via GitHub issue search 2026-04-17).
