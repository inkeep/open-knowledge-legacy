# Evidence: VS Code `code` command — the canonical bundled-CLI pattern

**Dimension:** D1, D6, D7, D8 (VS Code as reference implementation for Electron bundled-CLI install)
**Date:** 2026-04-21
**Sources:** VS Code docs, `microsoft/vscode` source (`resources/darwin/bin/code.sh`), GitHub issues #7673, #209356, #213909

---

## Key files / pages referenced

- [VS Code setup/mac docs](https://code.visualstudio.com/docs/setup/mac) — menu item text, manual PATH alternative
- [VS Code CLI docs](https://code.visualstudio.com/docs/configure/command-line) — subcommands, flags
- [microsoft/vscode `resources/darwin/bin/code.sh`](https://github.com/microsoft/vscode/blob/main/resources/darwin/bin/code.sh) — the actual wrapper script installed at `/usr/local/bin/code`
- [Issue #7673 — Install 'code' command in PATH when not Administrator](https://github.com/Microsoft/vscode/issues/7673) — feature request history
- [Issue #209356 — Incorrect symlink on `code` command under macOS App Translocation](https://github.com/microsoft/vscode/issues/209356) — translocation bug
- [Issue #213909 — VS Code in Downloads blocks auto-updates](https://github.com/microsoft/vscode/issues/213909) — dup of #209356

---

## Findings

### Finding: VS Code exposes a Command Palette entry that installs a shell-script wrapper at `/usr/local/bin/code`

**Confidence:** CONFIRMED
**Evidence:** VS Code docs + code.sh source

Menu/command text (verbatim from docs):

> "Shell Command: Install 'code' command in PATH"

Accessed via Command Palette (`Cmd+Shift+P`). Symlink/copy placed at `/usr/local/bin/code` pointing at `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`.

**Implications:** The install action is user-triggered, not automatic on first launch. This is the pattern the OK Electron spec §8.12 (D52) already cites as its model.

---

### Finding: Admin privileges are requested via `osascript "do shell script with administrator privileges"`

**Confidence:** CONFIRMED
**Evidence:** VS Code dialog text + Stack Overflow + issue discussion

Dialog copy shown to user on invocation (verbatim):

> "Code will now prompt with 'osascript' for Administrator privileges to install the shell command."

`osascript` invokes AppleScript; `do shell script "..." with administrator privileges` drives the standard macOS authorization prompt (username + password or Touch ID). This is not `AuthorizationServices.framework` — it is a shell-out to AppleScript. Open Knowledge already plans to match this UX per D52.

**Implications:** The admin prompt surface is well-understood and widely imitated. Failure modes are also well-understood — if the user clicks Cancel, the install aborts with a non-fatal error; the menu item may be re-invoked.

---

### Finding: The installed artifact is a bash wrapper script, not a true symlink to a binary

**Confidence:** CONFIRMED
**Evidence:** `resources/darwin/bin/code.sh` — full script quoted below

```bash
#!/usr/bin/env bash

# when run in remote terminal, use the remote cli
if [ -n "$VSCODE_IPC_HOOK_CLI" ]; then
  REMOTE_CLI="$(which -a '@@APPNAME@@' | grep /remote-cli/)"
  if [ -n "$REMOTE_CLI" ]; then
    "$REMOTE_CLI" "$@"
    exit $?
  fi
fi

function app_realpath() {
  SOURCE=$1
  while [ -h "$SOURCE" ]; do
    DIR=$(dirname "$SOURCE")
    SOURCE=$(readlink "$SOURCE")
    [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE
  done
  SOURCE_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
  echo "${SOURCE_DIR%%${SOURCE_DIR#*.app}}"
}

APP_PATH="$(app_realpath "${BASH_SOURCE[0]}")"
if [ -z "$APP_PATH" ]; then
  echo "Unable to determine app path from symlink : ${BASH_SOURCE[0]}"
  exit 1
fi

CONTENTS="$APP_PATH/Contents"
ELECTRON="$CONTENTS/MacOS/@@NAME@@"
CLI="$CONTENTS/Resources/app/out/cli.js"

export VSCODE_NODE_OPTIONS=$NODE_OPTIONS
export VSCODE_NODE_REPL_EXTERNAL_MODULE=$NODE_REPL_EXTERNAL_MODULE
unset NODE_OPTIONS
unset NODE_REPL_EXTERNAL_MODULE

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
```

**Key mechanisms:**

1. **App discovery via `app_realpath`**: the wrapper's `BASH_SOURCE[0]` walks symlinks to find the `.app` bundle. `/usr/local/bin/code` is a symlink pointing INTO the app bundle at `Contents/Resources/app/bin/code`; the wrapper resolves the symlink chain to locate `Contents/`.
2. **`ELECTRON_RUN_AS_NODE=1`**: the Electron main binary (`$APP_PATH/Contents/MacOS/Electron`) is invoked in Node-mode, executing `$APP_PATH/Contents/Resources/app/out/cli.js`. No separate Node.js binary is bundled — Electron's embedded Node runtime IS the CLI runtime.
3. **`NODE_OPTIONS` sanitization**: the wrapper unsets `NODE_OPTIONS` before invoking (avoids user env corrupting the CLI) and re-exports as `VSCODE_NODE_OPTIONS` for the JS layer to optionally honor.
4. **Remote delegation**: when `VSCODE_IPC_HOOK_CLI` is set (user is in a VS Code remote SSH terminal), the wrapper delegates to `/usr/bin/.../remote-cli/code` so the CLI runs against the remote VS Code, not the local one.
5. **All args pass through**: `"$@"` preserves quoting and spacing.

**Implications for OK:**
- The symlink at `/usr/local/bin/code` is really a symlink into `Contents/Resources/app/bin/code.sh` (renamed `code` on install). The wrapper-script-IN-bundle pattern keeps the wrapper's logic versioned with the app.
- `ELECTRON_RUN_AS_NODE=1` is the critical incantation — an Electron app CAN serve as its own CLI runtime without bundling a separate Node.js.
- Open Knowledge already builds `packages/cli/dist/cli.mjs` as a standalone ESM CLI entry. The equivalent `ok` wrapper could either (a) follow the VS Code pattern and point `ELECTRON_RUN_AS_NODE=1 Electron cli.mjs` or (b) ship a Bun compiled binary and symlink to it directly. The VS Code pattern avoids shipping two runtimes; the Bun-compiled pattern avoids the wrapper script but doubles the binary footprint.

---

### Finding: The fatal flaw — macOS App Translocation silently corrupts the symlink

**Confidence:** CONFIRMED (bug confirmed by VS Code and Zed; closed as dup / not-planned)
**Evidence:** VS Code issue [#209356](https://github.com/microsoft/vscode/issues/209356), Zed issue [#5276](https://github.com/zed-industries/zed/issues/5276)

When the user launches an Electron/native app from outside `/Applications/` (Downloads, Homebrew Cask's staged dir, a mounted DMG), macOS silently copies the `.app` to a random temp directory and runs from there. This is **Gatekeeper Path Randomization** a.k.a. **App Translocation**. The randomized path looks like:

```
/private/var/folders/lp/053qjqyj1cg5gx_23kr9fphc0000gn/T/AppTranslocation/EB60641D-B689-46D7-853D-7875F0B9FFCA/d/Zed.app/...
```

If the "Install CLI" action runs while the app is translocated, the created symlink points at the temp path. On app quit or reboot, the temp dir vanishes and `/usr/local/bin/code` becomes a broken symlink with no warning.

VS Code's position: closed as duplicate of [#213909](https://github.com/microsoft/vscode/issues/213909), which was closed as "Not Planned" — the team considers "user should drag to /Applications first" the correct answer. No runtime detection or auto-move offered.

**Implications for OK:**
- **MUST guard** the "Install Command-Line Tools" action against translocation. Detect via `app.getPath('exe')` containing `/AppTranslocation/` or `/private/var/folders/`; refuse to install with a clear error message pointing the user at the canonical fix (drag to Applications).
- Optional: offer an auto-move-to-/Applications affordance (Ollama does this; VS Code declined to).
- This is NOT mentioned in OK Electron spec §8.12 D52 — it's a gotcha to add to the implementation checklist for M6.

---

### Finding: Manual PATH fallback is documented

**Confidence:** CONFIRMED
**Evidence:** VS Code docs

For users who cannot or will not run the admin-prompt install, the docs publish a manual alternative — append to `~/.zshrc` or `~/.bash_profile`:

```bash
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
```

This adds the in-bundle `bin/` directory to PATH. Works without admin. Does not survive an app move or rename.

**Implications:** OK can document the equivalent (`export PATH="$PATH:/Applications/Open Knowledge.app/Contents/Resources/cli/bin"` or similar) as the "no-sudo" escape hatch. Also useful for Homebrew Cask installs that put the app in `/opt/homebrew-cask/Caskroom/...`.

---

## Gaps / follow-ups

- **Windows PATH install**: VS Code installer on Windows auto-adds to PATH at install time (documented but not yet verified in source). MSI installers use `[Environment]::SetEnvironmentVariable` or registry `HKCU\Environment\Path` appends. Open Knowledge would need similar logic in its NSIS/Squirrel installer for M4+.
- **Linux**: VS Code's `.deb` / `.rpm` install a `/usr/bin/code` symlink via package postinst. Equivalent on AppImage: the launcher documents a manual `ln -s`.
- **VS Code source for the install action itself**: could not locate `installActions.ts` at expected paths via WebFetch (returned 404). Confirmed behavior via docs + issue comments + script source; not via the TypeScript handler. This is the one gap — the exact TS class that drives `osascript` is not in this evidence file.
