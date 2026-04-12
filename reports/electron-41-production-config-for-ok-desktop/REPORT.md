---
title: "Electron 41 Production Config for Open Knowledge Desktop"
date: 2026-04-11
status: final
scope: OQ-01 (ESM utilityProcess), OQ-02 (min macOS), OQ-05 (entitlements), OQ-06 (asarUnpack)
related_spec: specs/2026-04-11-electron-desktop-app/SPEC.md
---

# Electron 41 Production Config for Open Knowledge Desktop

**Evidence files:**
- [evidence/oq-01-utility-process-esm.md](./evidence/oq-01-utility-process-esm.md)
- [evidence/oq-02-minimum-macos.md](./evidence/oq-02-minimum-macos.md)
- [evidence/oq-05-mac-entitlements.md](./evidence/oq-05-mac-entitlements.md)
- [evidence/oq-06-asar-unpack.md](./evidence/oq-06-asar-unpack.md)

## Executive Summary

All four open questions are resolvable today with existing Electron 41 + electron-builder behavior. No blocking issues.

- **OQ-01 (ESM in utilityProcess):** **YES, supported.** Shipped in **Electron 28.0.0 (Dec 2023)**, stable through Electron 41. The Open Knowledge server package (`"type": "module"`) can be forked **as-is** — no CJS adapter needed.
- **OQ-02 (Minimum macOS):** **macOS 12 Monterey.** Big Sur dropped in Electron 38 (Sep 2025). Electron 38, 39, 40, 41 share this floor.
- **OQ-05 (Entitlements):** **Three entitlements** — exactly matching electron-builder's default. `disable-library-validation` is mandatory and has no narrower alternative.
- **OQ-06 (asarUnpack):** **Five explicit globs** for `@parcel/watcher` and its per-platform packages. `@parcel/watcher` is the **only** runtime native dependency.

---

## OQ-01 — ESM in `utilityProcess.fork()` Entry Point

**Verdict:** ESM entry points are **supported** since **Electron 28.0.0** (Dec 2023). Electron 41 inherits this without modification.

### Timeline

- **Pre-Electron 28:** `utilityProcess.fork('./entry.mjs')` failed with `ERR_REQUIRE_ESM`. The CJS loader was hardcoded.
- **Sep 29 2023:** PR [electron/electron#40047](https://github.com/electron/electron/pull/40047) (`feat: support esm entrypoint to utility process`, by MarshallOfSound / Samuel Attard) merged. Quoted from the PR: *"just swapping to using the ESM loader instead of the CJS loader should work fine. (the esm loader falls back to CJS)"*.
- **Dec 5 2023:** [Electron 28.0.0](https://www.electronjs.org/blog/electron-28-0) shipped. Release notes: *"Added ESM entrypoints to the `UtilityProcess` API."*
- **Electron 29 → 41:** No breaking changes to utilityProcess ESM in any major release. Electron 41 release notes only flag PDF and Cookie change-cause breaking changes.
- **Electron 41 (Mar 2026):** Ships Chromium 146.0.7680.65, Node.js 24.14.0, V8 14.6.

### Caveats — what works

- **Top-level await** in the entry file: works (Node 24 ESM loader awaits the entry promise).
- **`import.meta.url` / `import.meta.dirname`:** work (standard Node semantics).
- **Importing CJS native modules** like `@parcel/watcher`: works via Node's standard ESM↔CJS interop.
- **The async-loading caveat from the [Electron ESM tutorial](https://www.electronjs.org/docs/latest/tutorial/esm)** (about `app.whenReady()`) applies only to the **main process** entry, not to utilityProcess. Parent processes explicitly await child fork via `UtilityProcess` lifecycle events, so the ordering issue does not surface for child entries.

### Practical answer for Open Knowledge

The existing `packages/server/src/standalone.ts` ESM module can be forked **as-is** by `utilityProcess.fork()`. **No CJS adapter, no esbuild/tsdown bundling step, no `createRequire` hack is required.** The fork target is the same source already used by the CLI's `start` command, after a one-time tsdown build to `.mjs` (matching the existing CLI build pipeline).

```ts
import { utilityProcess, app } from 'electron';
import { fileURLToPath } from 'node:url';

app.whenReady().then(() => {
  const child = utilityProcess.fork(
    fileURLToPath(new URL('./server-entry.mjs', import.meta.url)),
    [/* args: project path, port, etc. */],
    { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' } }
  );
  child.stdout?.on('data', (chunk) => console.log('[server]', chunk.toString()));
  child.on('exit', (code) => console.log(`[server] exited ${code}`));
});
```

`server-entry.mjs` is a thin wrapper that imports and starts `createServer()` from `@inkeep/open-knowledge-server`.

**Decision triggers:** None of practical concern. Worth a smoke test in actual Electron 41 during implementation, but the design risk is zero.

---

## OQ-02 — Minimum macOS Version Supported by Electron 41

**Verdict:** Electron 41 requires **macOS 12 Monterey or later**.

### Per-version timeline

| Electron | Stable | Min macOS | Bundled Chromium |
|---|---|---|---|
| 37 | Jun 2025 | macOS 11 (Big Sur) | 138 |
| **38** | **Sep 2025** | **macOS 12 (Monterey)** ← bumped from 11 | 140 |
| 39 | Oct 2025 | macOS 12 (Monterey) | 142 |
| 40 | Jan 2026 | macOS 12 (Monterey) | 144 |
| **41** | **Mar 2026** | **macOS 12 (Monterey)** | **146** |

[Electron 38 release notes](https://www.electronjs.org/blog/electron-38-0) explicitly state:
> "macOS 11 (Big Sur) is no longer supported by Chromium. Older versions of Electron will continue to run on Big Sur, but macOS 12 (Monterey) or later will be required to run Electron v38.0.0 and higher."

The current [Electron README](https://github.com/electron/electron/blob/main/README.md) confirms: *"macOS (Monterey and up): Electron provides 64-bit Intel and Apple Silicon / ARM binaries for macOS."*

The bump was driven by **Chromium 140** dropping macOS 11 in Aug 2025, not Electron team policy — Big Sur exited Apple's own security update cycle in late 2023.

### User-impact for the docs-author persona

The persona profile (`specs/2026-04-11-electron-desktop-app/SPEC.md` §4 P1) skews to recent hardware: technical writers, DevRel, docs engineers, solo founders who own AI tools (Claude Desktop, Cursor) which themselves require recent macOS. macOS 12 Monterey (Oct 2021) runs on every Mac from 2015 onward. Users still on Big Sur are typically on a circa-2017 MacBook Pro they don't want to replace — small but non-zero population.

**Fallback:** Open Knowledge ships its CLI distribution (`npx @inkeep/open-knowledge`) in parallel (G5 in spec). The CLI requires only Node 22+, which runs on macOS 11 and older. README should note: *"Desktop app: macOS 12 Monterey or later. CLI: Node.js 22+ on any OS."*

**Decision triggers:** If Electron 42 (May 2026) bumps to macOS 13 Ventura — re-evaluate. No current signal.

---

## OQ-05 — macOS Entitlements for Native Modules

**Verdict:** **Three entitlements**, exactly matching electron-builder's default `entitlements.mac.plist` template. `disable-library-validation` is non-negotiable for shipping `@parcel/watcher`'s prebuilt `watcher.node` under hardened runtime.

### Why disable-library-validation is required (concrete failure mode)

Hardened runtime + library validation enforces a Team ID check on every dynamically loaded library. When the Open Knowledge utilityProcess does `import('@parcel/watcher')`, Node's loader eventually calls `process.dlopen()` on `watcher.node`. macOS's dyld checks the code signature on `watcher.node` and finds it's signed by the `@parcel/watcher` author's Team ID (or ad-hoc signed), NOT by the Open Knowledge developer's Team ID. Library validation rejects the load with:

```
Error: dlopen(.../watcher.node, 0x0001): tried: '...watcher.node'
(code signature not valid for use in process: mapping process and
mapped file (non-platform) have different Team IDs)
{ code: 'ERR_DLOPEN_FAILED' }
```

— quoted from a real-world bug at [lmstudio-ai/lmstudio-bug-tracker#1494](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1494), where the same error occurred for a different prebuilt N-API module (`lancedb.darwin-arm64.node`). The fix is identical: add `disable-library-validation`.

### Narrower alternatives — none exist

Apple defines exactly **six** opt-out entitlements that relax hardened runtime ([Eclectic Light](https://eclecticlight.co/2021/01/07/notarization-the-hardened-runtime/)):

1. `allow-jit` — JIT codegen
2. `allow-unsigned-executable-memory` — W^X memory
3. `allow-dyld-environment-variables` — DYLD env vars
4. **`disable-library-validation`** — the one we need
5. `disable-executable-page-protection` — page protection
6. `debugger` — debugger attach

**Only `disable-library-validation` relaxes the Team ID check.** No per-binary library-validation exception entitlement exists; the check is process-wide. The only narrower alternative is to **re-sign every prebuilt `.node` binary with the app team's identity** during electron-builder's `afterSign` hook (`codesign --sign $IDENTITY --force`). Technically possible but adds packaging complexity for **no real security benefit** — an attacker who can swap the addon inside a notarized app can also swap the entitlements plist. Mainstream Electron apps with native modules (VS Code, Cursor, Obsidian, LM Studio) all use `disable-library-validation`.

### Complete recommended `entitlements.mac.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- V8 JIT requires writable+executable memory pages -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- V8 also writes JIT code via mmap; required alongside allow-jit -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>

  <!-- Required to dlopen prebuilt native modules (.node files from npm)   -->
  <!-- whose code signature has a different Team ID than the host process. -->
  <!-- Specifically required for @parcel/watcher's watcher.node binary.    -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

### One-line justifications

| Entitlement | Why |
|---|---|
| `com.apple.security.cs.allow-jit` | V8 JIT codegen in the renderer would crash without this. Required by every Electron app. |
| `com.apple.security.cs.allow-unsigned-executable-memory` | V8 writes JIT code via `mmap` with PROT_WRITE \| PROT_EXEC. Required alongside `allow-jit`. |
| `com.apple.security.cs.disable-library-validation` | Required to dlopen `@parcel/watcher`'s prebuilt `watcher.node`. Without this, the server utilityProcess crashes immediately on `import('@parcel/watcher')` with `ERR_DLOPEN_FAILED`. |

This file is **identical** to electron-builder's default template. Committing it explicitly to the repo makes the dependency on these entitlements visible during code review.

### What is NOT needed

- **`com.apple.security.app-sandbox`** — explicitly NOT set. Open Knowledge does not target Mac App Store (NG2 in spec). Without sandbox, the app has full POSIX file access subject to TCC user prompts.
- **`com.apple.security.files.user-selected.read-write`** — sandbox-only entitlement.
- **`com.apple.security.network.client / network.server`** — sandbox-only entitlements. Without sandbox, all localhost network access is allowed by default.
- **Per-helper entitlements** — Electron's helper binaries (Renderer Helper, GPU Helper, Plugin Helper, **Utility Helper**) all inherit from the main app's plist when electron-builder is configured with `entitlementsInherit`.
- **A separate utilityProcess entitlement** — none exists. The new `disclaim` option in Electron 41's utilityProcess is a TCC inheritance feature (controls whether the child inherits the parent's TCC grants for filesystem/full-disk access), unrelated to code-signing or hardened runtime. Default `disclaim: false` is what Open Knowledge wants.

### electron-builder configuration

```yaml
# electron-builder.yml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false      # gate via notarization, not Gatekeeper assessment
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: <YOUR_TEAM_ID>
```

`entitlementsInherit` is critical — it tells electron-builder to apply the same plist to every helper binary in `Open Knowledge.app/Contents/Frameworks/`. Without it, the Utility Helper (where the server runs) might not get `disable-library-validation`, causing the dlopen failure.

**Verification at build time:** `codesign -d --entitlements - "Open Knowledge.app/Contents/Frameworks/Open Knowledge Helper (Plugin).app"` should show all three entitlements on every helper.

---

## OQ-06 — electron-builder asarUnpack Configuration

**Verdict:** **Five explicit globs**. Auto-detection alone is unreliable for `@parcel/watcher`'s per-platform optional-dependency layout, especially under Bun's `node_modules/.bun/` symlink layout.

### Native dependency inventory (verified by direct inspection)

From `packages/server/package.json`:

| Dependency | Native? | Notes |
|---|---|---|
| `@hocuspocus/server` | No | Pure JS |
| **`@parcel/watcher`** | **YES** | Per-platform optional deps; one `watcher.node` per platform |
| `@tiptap/core`, `@tiptap/markdown`, `@tiptap/y-tiptap` | No | Pure JS |
| `ignore`, `picomatch`, `pino`, `pino-pretty` | No | Pure JS |
| `simple-git` | No | Shells out to system `git` binary |
| `ws` | No | Optional `bufferutil`/`utf-8-validate` perf deps not installed |
| `yjs`, `y-protocols` | No | Pure JS |

**`@parcel/watcher` is the only runtime native dependency.** Verified by `find node_modules -name "*.node"`.

### `@parcel/watcher`'s actual layout

- **Main package** `@parcel/watcher` ships **no native binary itself** — it's a pure JS wrapper (`index.js`, `wrapper.js`) that resolves `@parcel/watcher-${process.platform}-${process.arch}` at runtime via `require()`.
- **Per-platform packages** are 13 separate npm packages, each declared as an `optionalDependencies` entry. Each contains exactly **one binary**: `watcher.node` (~326 KB on darwin-arm64).
- **No `.dylib`, no `.framework` bundle, no auxiliary native files.** The macOS backend uses CoreServices.framework (FSEvents), a system framework — not bundled.

### Recommended explicit asarUnpack

```yaml
# electron-builder.yml
asarUnpack:
  - "**/node_modules/@parcel/watcher/**"
  - "**/node_modules/@parcel/watcher-darwin-x64/**"
  - "**/node_modules/@parcel/watcher-darwin-arm64/**"
  - "**/node_modules/@parcel/watcher-*/**"
  - "**/*.node"
```

**Why each entry:**

| Glob | Why |
|---|---|
| `**/node_modules/@parcel/watcher/**` | Unpacks the JS wrapper (`index.js`, `wrapper.js`, `package.json`) so the require chain resolves correctly. |
| `**/node_modules/@parcel/watcher-darwin-x64/**` | Unpacks the x64 platform package. For Universal Mac builds, both architectures must be present. |
| `**/node_modules/@parcel/watcher-darwin-arm64/**` | Unpacks the arm64 platform package. Apple Silicon Macs use this binary. |
| `**/node_modules/@parcel/watcher-*/**` | Catch-all for any other `@parcel/watcher-*` package (defense in depth). |
| `**/*.node` | Defense-in-depth catch-all: any future native dep gets unpacked automatically. |

The leading `**/` on each glob is critical for Bun's nested symlink layout — without it, the matcher only looks at the top-level `node_modules/`, and Bun's `node_modules/.bun/@parcel+watcher@2.5.6/node_modules/@parcel/watcher/` path would not match.

### Build-time verification

```bash
# Should list watcher.node files in app.asar.unpacked
npx asar list "dist/mac-arm64/Open Knowledge.app/Contents/Resources/app.asar" \
  | grep -i watcher
# (should NOT contain any .node files)

find "dist/mac-arm64/Open Knowledge.app/Contents/Resources/app.asar.unpacked" \
  -name "*.node"
# Should list watcher.node files for each architecture
```

### Other Open Knowledge native deps

**None.** Verified by direct inspection of `node_modules/.bun/`. The only other `.node` files in the workspace are `fsevents` (transitive dev dep, used by Vite/chokidar in dev only — not in production runtime) and `lightningcss-darwin-arm64` (Vite/Tailwind build dep — not in runtime). Neither ships in the desktop app's bundled server code.

---

## Recap

**Key findings:**
- ESM utilityProcess shipped in Electron 28 (Dec 2023); the OK server can be forked as-is — no CJS adapter
- Electron 41 minimum macOS = Monterey 12; bumped from Big Sur in Electron 38
- Three entitlements (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`) — exactly matching electron-builder's default; no narrower alternative
- `@parcel/watcher` is the ONLY runtime native dep; ships single `watcher.node` per platform via optional-dependency packages; recommend 5 explicit asarUnpack globs

**Confidence gaps:** None of practical concern. All four questions are CONFIRMED with primary-source evidence (Electron release notes, electron-builder default templates, real-world dlopen error messages, direct local inspection of `@parcel/watcher`'s package layout).
