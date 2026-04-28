# Evidence: VS Code lineage — VS Code, Cursor, Windsurf

**Dimension:** The VS Code lineage. VS Code is the canonical pattern; Cursor (Anysphere) and Windsurf (Codeium/Exafunction) are derivative forks that inherit it with small divergences.
**Date:** 2026-04-24
**Sources:** github.com/microsoft/vscode (OSS), Homebrew cask sources, public docs, issue trackers.

---

## Key files / pages referenced

- [`microsoft/vscode` `nativeHostMainService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/native/electron-main/nativeHostMainService.ts) — function `getShellCommandLink` and `installShellCommand` (line numbers drift across versions; cite by function name)
- [`microsoft/vscode` `resources/darwin/bin/code.sh`](https://raw.githubusercontent.com/microsoft/vscode/main/resources/darwin/bin/code.sh)
- [`microsoft/vscode` `product.json`](https://raw.githubusercontent.com/microsoft/vscode/main/product.json) — `applicationName`, `dataFolderName`, `darwinBundleIdentifier`
- [VS Code Settings Sync docs](https://code.visualstudio.com/docs/configure/settings-sync) — cross-build auto-disable behavior
- [GH microsoft/vscode#310090](https://github.com/microsoft/vscode/issues/310090) — CLI version mismatch (2026-04-15, milestone 1.117.0)
- [GH microsoft/vscode#209356](https://github.com/microsoft/vscode/issues/209356) — app-translocation symlink poisoning
- [GH microsoft/vscode#46754](https://github.com/microsoft/vscode/issues/46754) — Settings Sync behavior between Stable/Insiders
- Homebrew casks (accessed 2026-04-24): [`visual-studio-code`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/v/visual-studio-code.rb), [`visual-studio-code@insiders`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/v/visual-studio-code%40insiders.rb), [`cursor`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/c/cursor.rb), [`cursor-cli`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/c/cursor-cli.rb), [`windsurf`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/w/windsurf.rb)
- [Cursor CLI installation docs](https://cursor.com/docs/cli/installation)
- [Cursor forum #39993 — `cursor` installer overrides `code` on Windows](https://forum.cursor.com/t/installing-cursor-shell-command-overrides-code-as-well/39993)
- [Windsurf getting-started docs](https://docs.windsurf.com/windsurf/getting-started)

---

## Findings

### Finding D1 — VS Code install surfaces

**Confidence:** CONFIRMED
**Evidence:** [Homebrew cask `visual-studio-code`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/v/visual-studio-code.rb); `code.sh`; `product.json`.

- **DMG / ZIP direct download** ships `Visual Studio Code.app` with `Contents/Resources/app/bin/code` (shim script) and `Contents/Resources/app/out/cli.js` (Node.js CLI entry).
- **Homebrew cask `visual-studio-code`** — `binary "#{appdir}/Visual Studio Code.app/Contents/Resources/app/bin/code"` creates `/usr/local/bin/code` → bundle shim. A second `binary` stanza ships `code-tunnel` for the remote-tunnels CLI — **two binaries per single install**.
- **"Shell Command: Install 'code' command in PATH"** — Command Palette entry inside the app. Implementation at `nativeHostMainService.ts` — functions `getShellCommandLink()` and `installShellCommand()`. Target is hardcoded: `source = /usr/local/bin/${productService.applicationName}`; `target = resolve(appRoot, 'bin', 'code')`.
- **VS Code Insiders** — entirely separate bundle. `Visual Studio Code - Insiders.app`, `applicationName: code-insiders`, data dir `~/.vscode-insiders`, bundle id `com.microsoft.VSCodeInsiders`. Homebrew cask `visual-studio-code@insiders` installs `binary ".../bin/code", target: "code-insiders"` — **renames the internal `code` shim to `code-insiders` at brew-link time**.
- **Standalone `code` CLI** — separate binary released via `update.code.visualstudio.com/.../cli/...`, independent release cadence.

### Finding D2 — No runtime cross-install coordination in VS Code; namespacing at build time is the answer

**Confidence:** CONFIRMED
**Evidence:** `nativeHostMainService.ts` `installShellCommand()`; negative search via `gh api search/code -q installShellCommand repo:microsoft/vscode` (no lockfile/PID/IPC hits).

`installShellCommand` performs exactly one check before writing:

```ts
const { symbolicLink } = await SymlinkSupport.stat(source);
if (symbolicLink && !symbolicLink.dangling) {
    const linkTargetRealPath = await Promises.realpath(source);
    if (target === linkTargetRealPath) { return; }
}
// fall through to osascript-elevated `ln -sf '${target}' '${source}'`
```

The `-sf` flag **forces replacement** of any existing symlink, including one installed by another VS Code build, another fork, or another tool entirely. **No lockfile, no PID file, no version handshake, no prompt-before-overwrite.**

`VSCODE_IPC_HOOK_CLI` is an environment variable whose value is a per-window Unix-socket path. It enables the CLI to attach to an already-running window — not cross-install coordination.

**The cross-install coordination is pushed to build time**: different builds (Stable / Insiders / Exploration) have different `applicationName`/`dataFolderName`/`darwinBundleIdentifier` values in their `product.json`, so they don't share state dirs and don't fight over the same PATH entry. **Coexistence is solved by namespacing, not by runtime logic.**

### Finding D3 — VS Code's three documented version-drift surfaces

**Confidence:** CONFIRMED
**Evidence:** Docs + issue threads.

1. **Settings Sync between Stable ↔ Insiders.** Docs state: *"Since Insiders builds are newer than Stable builds, syncing them can sometimes lead to data incompatibility. In such cases, Settings sync will be disabled automatically on stable to prevent data inconsistencies."* Auto-disable on the older end, not reconcile. ([code.visualstudio.com/docs/configure/settings-sync](https://code.visualstudio.com/docs/configure/settings-sync))

2. **GUI ↔ standalone CLI version mismatch** ([microsoft/vscode#310090](https://github.com/microsoft/vscode/issues/310090), opened 2026-04-15): a 1.116.0 GUI against a 1.115.0 CLI produces a blocking error with no workaround except downgrading the app. Milestone 1.117.0. **No cross-version reconciliation** shipped at time of writing.

3. **GUI ↔ Remote Tunnels server mismatch** ([vscode-remote-release#8582](https://github.com/microsoft/vscode-remote-release/issues/8582)) — Windows VS Code 1.78.2 connecting to AlmaLinux 9.2 running `code-tunnel` service v1.2.0 fails with "client refused, version mismatch". Note: this is Remote Tunnels (standalone `code-tunnel` CLI), not Remote-SSH — a third tunnels-related CLI collision surface.

### Finding D4 — VS Code launch precedence + cross-install collision on Windows

**Confidence:** CONFIRMED
**Evidence:** [Cursor forum #39993](https://forum.cursor.com/t/installing-cursor-shell-command-overrides-code-as-well/39993).

Standard shell-PATH order wins. `which code` resolves the first match. VS Code writes to `/usr/local/bin/code` unconditionally with `ln -sf`; any later-installed tool overrides until the user next runs "Install 'code' command in PATH."

On Windows the same pattern produces visible bugs: Cursor installs `code.cmd` into `%LOCALAPPDATA%\Programs\cursor\resources\app\bin` and registers that dir on the **system** PATH, which precedes the **user** PATH where VS Code's CLI lives. `code` then launches Cursor instead of VS Code.

**Translocation failure** ([microsoft/vscode#209356](https://github.com/microsoft/vscode/issues/209356)): if the DMG is launched from a mounted volume or Downloads, macOS moves the app to a randomized `/private/var/folders/.../AppTranslocation/<UUID>/...` path. `code.sh`'s `app_realpath()` resolves to that temp path, and the persisted `/usr/local/bin/code` symlink dangles on next reboot.

### Finding D5 — VS Code self-update is per-build via Squirrel.Mac; CLI-in-bundle updates atomically

**Confidence:** CONFIRMED
**Evidence:** Homebrew cask `uninstall launchctl:` stanza references `com.microsoft.VSCode.ShipIt` and `com.microsoft.VSCodeInsiders.ShipIt` (separate launchd agents per channel).

Squirrel-Mac updates the `.app` bundle in place. Because `/usr/local/bin/code` points at `appRoot/bin/code` inside the bundle, the shim is **implicitly** updated on next GUI update. CLI is not a separately-versioned artifact in this case — it's always whatever lives inside the current `.app`.

The standalone `code` CLI has an **independent release cadence**, which is the direct cause of #310090.

### Finding D6 — VS Code state dirs: per-build, not per-install

**Confidence:** CONFIRMED for OSS + Insiders; INFERRED for Stable
**Evidence:** `product.json` (OSS row CONFIRMED on main); Stable/Insiders values inferred from observable paths and cask metadata.

| Build | `applicationName` | `dataFolderName` | `darwinBundleIdentifier` |
|---|---|---|---|
| OSS | `code-oss` | `.vscode-oss` | `com.visualstudio.code.oss` |
| Stable | `code` | `.vscode` | `com.microsoft.VSCode` |
| Insiders | `code-insiders` | `.vscode-insiders` | `com.microsoft.VSCodeInsiders` |

**No schema-version markers on the top-level directory.** Features (workspace storage, profiles, extensions) version their own subdirs. Two installs of the same build sharing one user account will collide on these paths — no multi-install namespace.

### Finding D7 — VS Code messaging: PATH-level distinction via Insiders naming; no coexistence docs

**Confidence:** CONFIRMED
**Evidence:** Docs read-through.

`code` and `code-insiders` are the canonical PATH-level distinction. "Install 'code' command in PATH" is the single supported install mechanism on macOS. **No documented guidance on "what if I already have another `code` on PATH."**

---

## Cursor-specific findings (fork)

### Finding Cursor D1 — Two separate CLI channels

**Confidence:** CONFIRMED
**Evidence:** Homebrew casks `cursor` (v3.2.10) and `cursor-cli` (v2026.04.17-787b533).

- **Cursor.app** via DMG / brew cask `cursor`. Brew install writes `binary "#{appdir}/Cursor.app/Contents/Resources/app/bin/code", target: "cursor"` — the internal shim is literally still named `code` (inherited from the fork); brew renames it to `cursor` at link time. In-app "Install 'cursor' command in PATH" uses the same `nativeHostMainService.installShellCommand` code path with `applicationName: cursor`.
- **`cursor-cli` (via brew cask or curl installer)** — **separately versioned** command-line agent (`cursor-agent` binary), installs to `~/.local/bin/cursor-agent`. `cask "cursor-cli"` is `version "2026.04.17-787b533"` — an entirely different scheme from the desktop's `3.2.10`.

Packaging: **ToDesktop-wrapped Electron** (bundle IDs `com.todesktop.*` in the zap stanza). Anysphere outsourced Squirrel/autoupdate to ToDesktop rather than wiring VS Code's native updater.

### Finding Cursor D2 — No coordination between `cursor` desktop and `cursor-agent` CLI

**Confidence:** CONFIRMED
**Evidence:** Negative search on cursor.com docs for "lockfile", "coordinate", "version handshake", "pid". Not found.

The two are distinct packages with no handshake. Forum threads show user confusion about the relationship. A [gist documenting `cursor-agent` env-var delegation](https://gist.github.com/johnlindquist/9a90c5f1aedef0477c60d0de4171da3f) reports an unintended side effect where `cursor-agent` checks an env var and delegates to the `cursor` command.

### Finding Cursor D4 — Windows `code.cmd` collision with VS Code

**Confidence:** CONFIRMED
**Evidence:** [Cursor forum #39993](https://forum.cursor.com/t/installing-cursor-shell-command-overrides-code-as-well/39993) — unresolved.

Cursor's Windows installer writes `code.cmd` and `cursor.cmd` into `%LOCALAPPDATA%\Programs\cursor\resources\app\bin` and registers that dir on **system** PATH — ahead of **user** PATH where VS Code lives. `code` then launches Cursor. **No Anysphere response** on the thread. macOS equivalent does not reproduce because brew cask `cursor` does not auto-install `code`.

### Finding Cursor D6 — Three separate Cursor state dirs

**Confidence:** CONFIRMED
**Evidence:** Brew cask `zap` stanzas.

- `~/.cursor/` — extensions, settings, `.cursor.json`
- `~/Library/Application Support/Cursor/` — workspace state, logs
- `~/.config/cursor-agent/` — `cursor-cli` state (zap stanza of `cursor-cli.rb`)

Three locations within one "Cursor" ecosystem. Separate from VS Code's `~/.vscode` / `~/Library/Application Support/Code` — no sharing, no migration.

---

## Windsurf-specific findings (fork)

### Finding Windsurf D1 — Fork renamed the internal shim

**Confidence:** CONFIRMED
**Evidence:** Homebrew cask `windsurf` v2.0.67: `binary "#{appdir}/Windsurf.app/Contents/Resources/app/bin/windsurf"`.

Unlike Cursor (which left the internal shim named `code` and lets brew rename it), Windsurf's fork renamed the shim in the bundle itself to `bin/windsurf`. No first-party `windsurf-cli` exists ([github.com/staronelabs/windsurf-cli](https://github.com/staronelabs/windsurf-cli) is community).

### Finding Windsurf D6 — State dir inconsistency

**Confidence:** UNCERTAIN
**Evidence:** Brew cask `zap` trashes `~/.windsurf` and `~/Library/Application Support/Windsurf`. Docs' uninstall guidance points at `~/.codeium/windsurf`.

Two candidate dirs (`~/.windsurf` vs `~/.codeium/windsurf`) — could not resolve from docs + cask which is authoritative. Suggests layered history or duplicate persistence.

### Finding Windsurf D3 — Settings Sync inherited but inactive

**Confidence:** CONFIRMED
**Evidence:** Getting-started docs state that Windsurf supports import-only from VS Code/Cursor at onboarding; no ongoing sync.

Settings Sync service points at Microsoft's endpoint which does not accept non-Microsoft builds. Users migrate in once; there is no cross-editor sync after that.

---

## Negative searches (for NOT FOUND)

- **VS Code lockfile / IPC for cross-install coordination:** Searched `microsoft/vscode` main branch for `lockfile`, `lock-file`, `pid file`, `cross-install`, `version handshake`. Found only `VSCODE_IPC_HOOK_CLI` (per-window, not cross-install) and the standard `installShellCommand` ln -sf path.
- **Cursor version handshake between app and `cursor-agent`:** Searched cursor.com docs and public materials. Not found.
- **Windsurf cross-install coordination:** Searched docs.windsurf.com. Not found.

---

## Gaps / follow-ups

- **Whether VS Code's standalone CLI ever reads a version-stamp file** before presenting the #310090 mismatch — did not inspect the standalone CLI binary source (not in `microsoft/vscode` main tree).
- **`cursor-agent` env-var delegation** ([linked gist](https://gist.github.com/johnlindquist/9a90c5f1aedef0477c60d0de4171da3f)) — closed-source; unclear if intentional.
- **Windsurf `~/.windsurf` vs `~/.codeium/windsurf`** — needs live-install inspection.
- **Windows 4-way PATH precedence matrix** (VS Code Stable / VS Code Insiders / Cursor / Windsurf) — only partially documented in the Cursor forum thread.
