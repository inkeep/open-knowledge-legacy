# Evidence: OQ-05 — macOS Entitlements for Native Modules

**Dimension:** Does `@parcel/watcher`'s native N-API addon require `com.apple.security.cs.disable-library-validation` under hardened runtime? What's the complete entitlements set for an Electron 41 app that ships native modules and forks utilityProcess?
**Date:** 2026-04-11
**Sources:**
- electron-builder default entitlements template (https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/entitlements.mac.plist)
- electron-builder issue #3940 — origin of disable-library-validation default (https://github.com/electron-userland/electron-builder/issues/3940)
- LM Studio bug tracker #1494 — concrete dlopen error from missing entitlement (https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1494)
- Eclectic Light: notarization & hardened runtime (https://eclecticlight.co/2021/01/07/notarization-the-hardened-runtime/)
- Apple developer docs: hardened runtime (https://developer.apple.com/documentation/security/hardened-runtime — JS-rendered, summary via search results)
- Kilian Valkhof: notarizing your Electron application (https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/)
- Local inspection: `node_modules/.bun/@parcel+watcher-darwin-arm64@2.5.6/node_modules/@parcel/watcher-darwin-arm64/`

---

## Key files / pages referenced

- `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/.bun/@parcel+watcher-darwin-arm64@2.5.6/node_modules/@parcel/watcher-darwin-arm64/watcher.node` — actual prebuilt N-API binary that needs to dlopen
- electron-builder default entitlements template (URL above)
- Apple's six hardened-runtime opt-out entitlements: `allow-jit`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, `disable-library-validation`, `disable-executable-page-protection`, `debugger`

---

## Findings

### Finding: Hardened runtime + library validation rejects native `.node` addons signed by a different team than the host process
**Confidence:** CONFIRMED
**Evidence:** https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1494

> "Error: dlopen(/path/to/node_modules/@lancedb/lancedb-darwin-arm64/lancedb.darwin-arm64.node, 0x0001): tried: '...lancedb.darwin-arm64.node' (code signature not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs) { code: 'ERR_DLOPEN_FAILED'}"

The error is precise: when hardened runtime is enabled and `disable-library-validation` is **not** set, macOS refuses to dlopen any `.node` binary whose Team ID doesn't match the host process's Team ID. Prebuilt native modules from npm (like `@parcel/watcher`'s `watcher.node`) are not signed by the app developer's team — they're either ad-hoc signed or signed by the package author's team — so they fail this check.

The issue confirms this is "standard practice for Electron apps that support third-party plugins with native code (VS Code, Cursor, Obsidian, etc. all include this entitlement)."

**Implications:** `@parcel/watcher`'s `watcher.node` (which Open Knowledge ships in production) WILL trigger this error on Electron 41 with hardened runtime unless `com.apple.security.cs.disable-library-validation` is set in the entitlements file.

---

### Finding: electron-builder's default entitlements.mac.plist already includes `disable-library-validation`
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/entitlements.mac.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
 <dict>
  <!-- https://github.com/electron/electron-notarize#prerequisites -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <!-- https://github.com/electron-userland/electron-builder/issues/3940 -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
 </dict>
</plist>
```

The three default keys are:
1. `com.apple.security.cs.allow-jit` — required for V8 JIT compilation in the renderer
2. `com.apple.security.cs.allow-unsigned-executable-memory` — required for V8 W^X memory regions
3. `com.apple.security.cs.disable-library-validation` — required for loading prebuilt native `.node` modules

**Implications:** If Open Knowledge does not override electron-builder's default entitlements, the resulting build will already include the entitlements needed for `@parcel/watcher` to work. The risk is the team setting a custom `entitlements` plist path that omits these — in that case, builds would succeed and notarize, but `@parcel/watcher` would fail at runtime with a `dlopen` error.

---

### Finding: There is no narrower alternative to `disable-library-validation` for prebuilt npm native modules
**Confidence:** CONFIRMED
**Evidence:**

(a) Apple's six opt-out entitlements per https://eclecticlight.co/2021/01/07/notarization-the-hardened-runtime/:
- `allow-jit` — JIT codegen (does NOT relax library validation)
- `allow-unsigned-executable-memory` — W^X memory (does NOT relax library validation)
- `allow-dyld-environment-variables` — DYLD env vars (does NOT relax library validation)
- `disable-library-validation` — THIS one
- `disable-executable-page-protection` — page protection (does NOT relax library validation)
- `debugger` — debugger attach (does NOT relax library validation)

Only `disable-library-validation` relaxes the team-ID matching check on dlopen.

(b) There is no per-binary library-validation exception entitlement. The check is process-wide.

(c) The narrower alternative — re-signing the `.node` binary with the app team's identity during the electron-builder packaging step — is technically possible but is not the default and is not what electron-builder does. It would require a custom `afterSign` hook that re-signs every `.node` file under `app.asar.unpacked/` with `codesign --sign "$IDENTITY" --force`. This works but adds packaging complexity for no security benefit (the addon is bundled inside a notarized app; an attacker who can swap the addon can also swap the entitlements plist). The mainstream approach is to set the entitlement.

**Implications:** `disable-library-validation` is the only practical entitlement for shipping prebuilt native modules. Re-signing every `.node` is theoretically possible but adds maintenance burden with no real security gain.

---

### Finding: `allow-jit` and `allow-unsigned-executable-memory` are required by Electron's V8 in the renderer
**Confidence:** CONFIRMED (electron-builder default + electron-notarize prerequisites)
**Evidence:** electron-builder's default template (above) cites https://github.com/electron/electron-notarize#prerequisites as the reason these are enabled by default. V8's JIT compiler writes executable code to memory pages at runtime; without `allow-jit`, V8 would crash on first JS execution under hardened runtime.

**Implications:** These two are non-negotiable for any Electron app, with or without native modules.

---

### Finding: utilityProcess on macOS does NOT require any extra entitlements beyond what the main app has
**Confidence:** INFERRED (from Electron architecture; not explicitly stated in Electron docs)
**Evidence:** `utilityProcess.fork()` spawns a child process that inherits the parent's code-signing identity and entitlements via the same Mach-O binary (Electron's `Helper` binaries). Each helper has its own entitlements file, and electron-builder signs them all with the same entitlement set as the main app by default (via `entitlementsInherit`).

The Electron 41 release notes mention a `disclaim` option added to `utilityProcess` for macOS — this is a TCC (Transparency, Consent, Control) feature that lets the parent disclaim TCC permissions for the child, NOT a code-signing or entitlements feature. Using `disclaim: false` (the default) means the child inherits the parent's TCC grants for filesystem/full-disk access, which is what Open Knowledge wants.

**Implications:** The same `entitlements.mac.plist` is used for the main app and inherited by all helper processes (including the utilityProcess that runs Hocuspocus). No extra entitlements file or per-helper config is needed.

---

### Finding: File system access to user-chosen folders works without additional entitlements outside the Mac App Store sandbox
**Confidence:** CONFIRMED (App Sandbox is opt-in via `com.apple.security.app-sandbox`; without it, the app has full POSIX file access subject to TCC user prompts)
**Evidence:** The Mac App Store sandbox model uses `com.apple.security.app-sandbox` and a separate set of entitlements (`com.apple.security.files.user-selected.read-write`, `com.apple.security.files.bookmarks.app-scope`). The Open Knowledge spec explicitly excludes Mac App Store distribution (NG2 in SPEC.md: "MAS sandbox is incompatible with `@parcel/watcher` recursive watching..."). For direct DMG distribution, the app does NOT enable `app-sandbox`, so it has full POSIX file access subject to macOS TCC user prompts at runtime (Documents folder, Downloads folder, etc.).

**Implications:** No `app-sandbox` key, no `files.user-selected.*` keys. The user is prompted by macOS the first time the app reads a Documents-folder file, and the grant is remembered.

---

### Finding: Network entitlements are not required outside the App Store sandbox
**Confidence:** CONFIRMED (`com.apple.security.network.client` and `com.apple.security.network.server` are sandbox-only entitlements)
**Evidence:** These entitlements are only enforced when `com.apple.security.app-sandbox` is set. For direct-distribution apps (no sandbox), all network access is allowed by default. The Hocuspocus server in the utilityProcess can listen on `localhost:<random-port>` without any entitlement.

**Implications:** No network entitlements needed.

---

### Finding: Notarization succeeds with the recommended entitlements set
**Confidence:** CONFIRMED (electron-builder default IS this set, and thousands of notarized Electron apps ship it)
**Evidence:** electron-builder's default template has been the production standard since 2019 (see issue #3940). Apple's notarization service accepts `disable-library-validation`, `allow-jit`, and `allow-unsigned-executable-memory` — these are explicitly designed as opt-outs for legitimate use cases like JIT runtimes and plugin-supporting apps.

**Implications:** No notarization friction from this entitlements set.

---

## Recommended entitlements.mac.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- V8 JIT requires writable+executable memory pages -->
  <!-- https://github.com/electron/electron-notarize#prerequisites -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- V8 also writes JIT code via mmap; required alongside allow-jit -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>

  <!-- Required to dlopen prebuilt native modules (.node files from npm)   -->
  <!-- whose code signature has a different Team ID than the host process. -->
  <!-- Specifically required for @parcel/watcher's watcher.node binary.    -->
  <!-- https://github.com/electron-userland/electron-builder/issues/3940   -->
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

**Justifications:**
- `allow-jit` — V8 JIT in the renderer would crash without this. Required by every Electron app.
- `allow-unsigned-executable-memory` — V8 writes JIT code via `mmap` with PROT_WRITE | PROT_EXEC. Required alongside `allow-jit` to satisfy hardened runtime.
- `disable-library-validation` — Required to dlopen `@parcel/watcher`'s prebuilt `watcher.node` (and any future npm-prebuilt native module). Without this, the server utilityProcess crashes immediately on `import('@parcel/watcher')` with `ERR_DLOPEN_FAILED`.

This file should be referenced in `electron-builder.yml` (or `package.json`'s `build` block) as both `mac.entitlements` and `mac.entitlementsInherit` to ensure helper processes inherit the same set:

```yaml
mac:
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  hardenedRuntime: true
  gatekeeperAssess: false  # set false; gate via notarization instead
```

**Note:** This is also exactly what electron-builder's default template ships, so if Open Knowledge omits the `mac.entitlements` key entirely, electron-builder will use this set automatically. Explicitly committing the file to the repo is recommended to make the dependency on these entitlements visible during code review.

---

## Negative searches

- Searched for "per-binary library validation exception entitlement" — NOT FOUND. The check is process-wide.
- Searched for `@parcel/watcher` + macOS entitlements + signing issues — NOT FOUND for direct project issues. The dlopen failure mode is generic to all native npm modules; `@parcel/watcher` is not specially flagged.
- Searched for narrower alternatives to `disable-library-validation` for prebuilt N-API modules — NOT FOUND. The mainstream alternatives are (a) re-sign every .node file in afterSign, or (b) build native modules from source as part of the app build with the app team's identity. Both are heavier than (c) setting the entitlement.

---

## Gaps / follow-ups

- The exact `entitlementsInherit` semantics in electron-builder when the helper binary path differs by Electron version: minor risk, but worth a build-time test.
- Confirming the Electron 41 helper architecture (separate Renderer Helper, GPU Helper, Plugin Helper, Utility Helper binaries) all sign with `entitlementsInherit`. This should be the default electron-builder behavior, but we should verify by running `codesign -d --entitlements - "Open Knowledge.app/Contents/Frameworks/Open Knowledge Helper (Renderer).app"` on a built artifact during implementation.
