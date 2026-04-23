# Evidence: D1a — Native N-API modules in Electron utilityProcess (general status)

**Dimension:** D1a (P0) — Beyond keyring: loading native N-API modules in utilityProcess
**Date:** 2026-04-17
**Sources:** electron/electron, WiseLibs/better-sqlite3, napi-rs docs, Electron docs

---

## Key files / pages referenced

- [Electron utilityProcess API docs](https://www.electronjs.org/docs/latest/api/utility-process) — current API reference
- [Electron "Native Node Modules" tutorial](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — ABI considerations
- [electron/electron issue #43513](https://github.com/electron/electron/issues/43513) — better-sqlite3 in worker_thread fails in production
- [electron/electron issue #42978](https://github.com/electron/electron/issues/42978) — utilityProcess.fork exits immediately in packaged app
- [electron/electron issue #40031](https://github.com/electron/electron/issues/40031) — ESM in utilityProcess feature request
- [NAPI-RS Native Modules docs](https://napi.rs/docs/deep-dive/native-module) — dlopen model
- [electron/forge issue #3169](https://github.com/electron/forge/issues/3169) — WebpackPlugin + utilityProcess build support

---

## Findings

### Finding 1: utilityProcess is an Electron-specific primitive built on Chromium's `utility` child process, running Node.js

**Confidence:** CONFIRMED
**Evidence:** [Electron utility-process API docs](https://www.electronjs.org/docs/latest/api/utility-process)

Key characteristics from the official API reference:
- Introduced in Electron 22 (April 2023).
- Child process runs a Node.js runtime identical to the main process's embedded Node, with some restrictions.
- Documented restriction: "Configuring `stdin` to any property other than `ignore` is not supported and will result in an error."
- `stdio` supports configuring stdout and stderr only.
- Inherits Node.js module resolution and `require()` semantics (documented behavior).

**Implications:**
- Native module loading inside utilityProcess uses the same `process.dlopen` code path as the main process.
- No separate "utility process native module whitelist" or extra capability check.

---

### Finding 2: Electron's official tutorial frames native-module compatibility as an ABI concern, not a process-type concern

**Confidence:** CONFIRMED
**Evidence:** [Native Node Modules tutorial](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

Electron's guidance pivots entirely around:
1. Matching the module's ABI to Electron's embedded Node ABI (solved by rebuild OR by using N-API prebuilds that are ABI-stable).
2. Using `electron-rebuild` for node-gyp based modules.
3. Preferring `prebuild` / `prebuild-install` for prebuilt binaries when available.

The tutorial makes no distinction between main process, renderer process, or utility process — the constraint is ABI, which is identical across all three.

N-API (Node-API) modules are explicitly called out as the recommended path because they carry an ABI guarantee across Node versions (and by extension, across all Electron versions embedding a compatible Node).

**Implications:**
- N-API 3 (which `@napi-rs/keyring` 1.2.0 uses) is ABI-stable; loading in any Node-hosting Electron process (main or utility) is symmetric.

---

### Finding 3: production issues with native modules in utilityProcess-adjacent surfaces exist but are packaging problems, not ABI/runtime problems

**Confidence:** CONFIRMED
**Evidence:** Issue survey from GitHub

- [electron#43513](https://github.com/electron/electron/issues/43513): `better-sqlite3` fails in `worker_thread` in production with `Error: Cannot find module 'better-sqlite3'`. The error is a module-resolution failure ("Cannot find module") — not a native-binding load failure. Root cause class: bundler/webpack externals + asar packaging, not Electron's process-type behavior.
- [electron#42978](https://github.com/electron/electron/issues/42978): `utilityProcess.fork()` exits immediately in packaged app. Closed. Also closed via the ready-event fix in [PR #46380](https://github.com/electron/electron/pull/46380).
- [electron/forge#3169](https://github.com/electron/forge/issues/3169): feature request for WebpackPlugin to compile utilityProcess entry code — indicates build-tool surface area still maturing for utility entrypoints.

**Implications:**
- The class of failures to design around is:
  1. Module not asar-unpacked (native binary inside app.asar → fails to dlopen).
  2. Module tree-shaken out by bundler (webpack/esbuild treat native dependencies as externals but don't copy them).
  3. Build tool (forge/webpack/vite) doesn't know to package the utility entrypoint alongside its deps.
- None of these are intrinsic to utilityProcess itself — they are the same packaging problems that affect main-process native modules.

---

### Finding 4: N-API's ABI abstraction makes utilityProcess native-module loading functionally identical to main-process

**Confidence:** INFERRED (from architectural evidence)
**Evidence:**
- [N-API design doc](https://napi.rs/docs/deep-dive/native-module): "compiled Node.js addons are DLL files (`.node` extension) loaded via `process.dlopen()`"
- Both main and utility process in Electron host a Node.js runtime; `process.dlopen` is a Node-level primitive, not an Electron-level one.
- N-API compatibility reports in practice: [dceddia/electron-napi-rs](https://github.com/dceddia/electron-napi-rs) demonstrates napi-rs + Electron main process working; no architectural reason for utility process to behave differently given identical Node embedding.

Note: Inference is strong but not CONFIRMED by a specific public test report of `@napi-rs/*` in `utilityProcess.fork()` in a signed+notarized build. The current research pass did not locate such a report.

**Implications:**
- For consumers: verify with a smoke test on each target platform in a packaged build. The risk is low, but no public confirmation of production-proven status exists for this specific combination.

---

### Finding 5: utilityProcess + ESM has been a partial gap; CJS is safer for native-module-loading utility entrypoints

**Confidence:** CONFIRMED
**Evidence:** [electron/electron#40031](https://github.com/electron/electron/issues/40031) — feature request for ESM (.mjs) support in utilityProcess.fork. ESM support in utilityProcess was added progressively in Electron 28+, but early versions had sharp edges around `require('./native.node')` inside ESM modules.

**Implications:**
- Utility entrypoints that load native modules should use CJS unless tested against specific Electron version for ESM parity.
- For a clean path: entry script is CJS (`.cjs`) or set to `type: 'commonjs'`, which can dynamically import ESM code after boot.

---

## Negative searches

- Searched GitHub issues for `"utilityProcess" "@napi-rs"` → 0 hits on electron/electron, 0 hits on napi-rs/napi-rs (as of 2026-04-17).
- Searched GitHub issues for `"utilityProcess" "native module"` → ~12 results, all about webpack bundling or asar path, none about native loading failing inside utilityProcess itself.
- Searched for public Electron apps that document utilityProcess + native-module architecture → no specific case study found; pattern appears used in VS Code remote server, Slack, Discord but not publicly documented.

## Gaps / follow-ups

- Strong public evidence of `@napi-rs/keyring` specifically in `utilityProcess.fork()` is absent. Consumers should plan a smoke-test matrix: {macOS Intel, macOS Apple Silicon, Windows x64, Linux x64} × packaged-signed-notarized build.
- No OSS Electron app publicly confirms utilityProcess + keychain architecture.
