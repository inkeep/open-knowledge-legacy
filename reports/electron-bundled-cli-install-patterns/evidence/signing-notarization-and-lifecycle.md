# Evidence: Signing, notarization, versioning, uninstall — the full lifecycle

**Dimension:** D8 (versioning/update coupling), D9 (signing/notarization), D10 (uninstall)
**Date:** 2026-04-21
**Sources:** [electron-builder code-signing docs](https://www.electron.build/code-signing-mac.html), [electron-builder #3940](https://github.com/electron-userland/electron-builder/issues/3940), [#6025](https://github.com/electron-userland/electron-builder/issues/6025), Apple notarization docs

---

## Findings

### Finding: The bundled CLI inherits the app's Developer ID signature via deep signing — no separate signing needed

**Confidence:** INFERRED (strong — follows from Apple's nested-signing model; confirmed by behavior observed in VS Code and Cursor DMGs)
**Evidence:** electron-builder docs + Apple Code Signing Guide

electron-builder runs `codesign --deep` (via `electron-osx-sign`) across the entire `.app` bundle during the packaging step. Every file inside `Contents/Resources/` that has executable bits OR a recognized binary Mach-O header gets signed with the same Developer ID certificate that signs the main app binary.

For OK's bundled CLI:

- **`ok.sh` (wrapper script)**: shell scripts don't require a Mach-O signature. Trust flows from the containing bundle's signature + notarization — the script is in `Contents/Resources/cli/bin/ok.sh` which is part of the signed bundle (content hash covered by the bundle's code-resource seal).
- **`cli.mjs` (ESM JavaScript)**: same — text file, trust from bundle seal.
- **Electron runtime**: already signed as the main app binary.
- **Native Node modules** in `app.asar.unpacked/`: these ARE Mach-O .node files and DO need per-file signatures. electron-builder signs them via the same code-signing pass.

**Implications:**

- **The D52 plan needs no additional signing work** for the CLI — as long as `ok.sh` and `cli.mjs` are in `extraResources`, they're covered by the outer bundle signature. This matches VS Code's shape: the `code` script and `cli.js` are plain text inside a signed `.app`; only the Electron binary and .node files are individually signed.
- electron-builder's `afterSign` hook (where OK already runs electron-notarize per M2 spec) runs AFTER all inner signing completes. The notarization ticket attaches to the bundle; the tool validates the whole tree recursively.

---

### Finding: Known electron-builder gotcha — `app.asar.unpacked` binaries occasionally miss signing

**Confidence:** CONFIRMED
**Evidence:** [electron-userland/electron-builder#3940](https://github.com/electron-userland/electron-builder/issues/3940) (open; affects OSX 10.14.5+), [#6025](https://github.com/electron-userland/electron-builder/issues/6025) (notarized but cannot open)

Reported failure mode: binaries placed in `app.asar.unpacked/` are enumerated by the signing pass in most configurations, but specific edge cases (symlinks to binaries, binaries discovered after initial glob expansion, binaries added by postinstall scripts) can be skipped. Symptom on end-user Mac: "app is damaged" or "cannot be verified" Gatekeeper dialog despite signed + notarized status, because Gatekeeper's kext scan hits an unsigned inner binary.

Mitigation patterns used in the wild:

1. **Explicit `mac.binaries` list** in electron-builder config — force-sign a named list of files.
2. **Custom `afterSign` hook** that re-runs `codesign --force` on a known-good list before notarization.
3. **`electron-builder`'s `signIgnore`** — exclude files that shouldn't be signed (usually none in practice).

For OK: the bundled `cli.mjs` + `ok.sh` are plain text in `extraResources`, NOT `app.asar.unpacked/`. They sidestep this bug entirely. The bug class affects `@napi-rs/keyring` and `@parcel/watcher` (OK server-side native deps) but those are server-package concerns covered by OK's existing M2 asarUnpack config.

**Implications:**

- No new risk introduced by the bundled CLI pattern per se. The existing M2 asarUnpack globs handle the native-dep cases.
- Post-M6 CI step to add: `codesign -vvv --verify --deep /Applications/Open\ Knowledge.app/Contents/Resources/cli/dist/cli.mjs` should succeed (well, shell scripts don't individually verify — but the bundle-level verify should cover it).

---

### Finding: Versioning is coupled through the symlink — updating the app updates the CLI atomically

**Confidence:** CONFIRMED (by symlink-target semantics)
**Evidence:** Pattern universal across VS Code / Zed / Cursor / Atom

When the user updates the desktop app (via electron-updater or a fresh DMG install), the old `.app` bundle is replaced. The `/usr/local/bin/ok` symlink still points at `/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh` — the symlink target is static, but the file AT that target is now the new version.

Net effect: `ok --version` and `ok mcp` and the desktop app all ship as one atomic unit. No separate CLI update step. No version skew possible.

**Implications:**

- **This is the key selling point of the bundled-CLI pattern**: version coupling is free. The alternative (separate `npm i -g @inkeep/open-knowledge`) can drift.
- For users who ALSO have `@inkeep/open-knowledge` installed via npm, they have TWO on-disk copies that may diverge. Shell PATH resolution picks whichever `$PATH` entry comes first. This is not a bug — it's explicit: power users with npm can pin a version; casual users get the app-coupled version automatically.
- OK's D52 explicit stance aligns with this: "The Electron-installed symlinks and the npm-installed binaries can coexist on PATH — shell resolves to whichever appears first in `$PATH` entries. No collision; all paths execute the same logical CLI."

---

### Finding: Uninstall is user-responsibility — dangling symlinks are the industry default

**Confidence:** CONFIRMED
**Evidence:** VS Code, Cursor, Atom, Docker Desktop all leave `/usr/local/bin/<name>` dangling if the .app is dragged to Trash

When the user drags the `.app` to Trash, macOS does NOT call back into the app to clean up. The symlink at `/usr/local/bin/ok` persists and becomes broken (readlink succeeds, invoking the symlink fails with "No such file or directory").

Observed mitigations across the ecosystem:

- **VS Code**: no uninstaller; user is expected to manually `rm /usr/local/bin/code` if desired.
- **Docker Desktop**: ships a "Troubleshoot > Uninstall" in-app flow that DOES remove symlinks, but only if triggered from inside the app before it's deleted. Dragging to Trash first leaves orphans.
- **Zed**: same as VS Code — no cleanup.
- **Atom**: same; now defunct.

**Implications for OK:**

Two options for M6:

1. **Match VS Code** (simplest): no uninstall hook. User who drags `Open Knowledge.app` to Trash has a dangling `/usr/local/bin/ok`. Document this as a known limitation. Next run of the app detects + offers to re-install. **Recommended.**
2. **Match Docker Desktop**: ship "Uninstall Command-Line Tools" menu item (reverses "Install Command-Line Tools…"). Extra code; still doesn't cover the drag-to-Trash case.

Combined approach: ship both a re-install prompt on app launch (detect broken symlink → offer to fix) AND the symmetric uninstall menu item. This matches VS Code + adds the opposite direction of the install action. OK's spec D52 already mentions:

> "Uninstall flow removes both symlinks."

That aligns with option 2 above — implementation detail for M6.

---

### Finding: Signing and the wrapper-script model interact cleanly — no hardened-runtime entitlement needed for text files

**Confidence:** CONFIRMED (derived from macOS hardened runtime spec)

The hardened runtime (required for notarization) applies to code-signed executables only. A bash script in `Contents/Resources/cli/bin/ok.sh` is:

- Content-hashed into the bundle's `_CodeSignature/CodeResources`
- NOT independently signed
- NOT subject to hardened-runtime entitlements

When the wrapper runs, macOS dyld does NOT apply hardened-runtime restrictions to bash itself (`/bin/bash` is a system binary). The wrapper invokes the Electron binary with `ELECTRON_RUN_AS_NODE=1`, at which point hardened-runtime DOES apply — but the Electron binary already has the required entitlements configured at bundle-level (per OK M2 spec):

- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`
- `com.apple.security.cs.disable-library-validation`

These entitlements (already on OK's main app) cover the CLI-via-`ELECTRON_RUN_AS_NODE` use case. No new entitlements needed for M6.

**Implications:**

- Entitlement inventory is stable between M2 (signed DMG) and M6 (CLI-on-PATH). No separate `.entitlements.cli.plist` file needed.
- If OK ever switched to Shape B (separate native binary via `bun build --compile`), a separate signing pass + separate entitlement file WOULD be needed (different hardened-runtime posture, different notarization scope). Shape A avoids this entirely.

---

## Gaps / follow-ups

- **Homebrew Cask for OK** (future, per OK spec CLI-distribution NG-for-now): if OK ships via Homebrew Cask, the `.app` lands in `/Applications/` normally but may be hard-linked or path-hashed by Cask. Need to test that the bundled-CLI "Install Command-Line Tools…" action still finds the bundle via `app.getPath('exe')` correctly when invoked from a Cask install. Low risk — VS Code's Cask install works.
- **Upgrading across DMG installs vs electron-updater**: electron-updater mutates the `.app` in-place (Squirrel-like). Does this mutate the `Contents/Resources/cli/` subtree atomically? Would a partial update ever leave the symlink pointing at an inconsistent CLI state? Assumed safe (the whole `.app` is moved atomically), but not verified.
