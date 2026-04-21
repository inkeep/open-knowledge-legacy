# Evidence: M6 implementation design — concrete wrapper script, menu item, guards, smoke test

**Dimension:** D16 (M6 design spike — pre-code, no source changes to `packages/desktop/`)
**Date:** 2026-04-21
**Stance:** 1P design artifact, per user-confirmed scope ("design doc only, keep in research PR").
**Method:** read-only inspection of `packages/desktop/src/main/{menu.ts, index.ts}` and `packages/desktop/electron-builder.yml` to ground the design in actual conventions; no source modified.

---

## Files read (for grounding, not modified)

- [`packages/desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) — `MenuDeps` + `buildMenuTemplate` — the current File menu layout where the new item lands.
- [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) — existing `extraResources` (currently ships only `../cli/dist/public` as the React bundle), `asarUnpack` (already covers `@napi-rs/keyring` + `simple-git`), `afterPack` + `afterSign` hooks.
- [`packages/cli/package.json`](../../../packages/cli/package.json) — `bin` map, `engines.node: ">=22"`, confirmed Node-compatible.

---

## 1. Wrapper script — `packages/desktop/resources/cli/bin/ok.sh`

**Placement rationale.** `packages/desktop/resources/` is the source-of-truth for build-time artifacts that ship as `extraResources`. Inside the packed `.app`, the script lands at `Contents/Resources/cli/bin/ok.sh` and `/usr/local/bin/ok` symlinks to that path.

**Script content** (adapted from [VS Code's `code.sh`](https://github.com/microsoft/vscode/blob/main/resources/darwin/bin/code.sh), minus the remote-SSH delegation that OK doesn't have):

```bash
#!/usr/bin/env bash

# Copyright (c) Inkeep
# Wrapper script installed at /usr/local/bin/ok (symlink into the
# Open Knowledge.app bundle). Re-uses the bundled Electron runtime as
# a Node host via ELECTRON_RUN_AS_NODE=1 — no separate Node install
# required on the user machine. Derived from VS Code's code.sh
# (github.com/microsoft/vscode/blob/main/resources/darwin/bin/code.sh).

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
  echo "Unable to determine app path from symlink: ${BASH_SOURCE[0]}" >&2
  exit 1
fi

CONTENTS="$APP_PATH/Contents"
ELECTRON="$CONTENTS/MacOS/Open Knowledge"
CLI="$CONTENTS/Resources/cli/dist/cli.mjs"

# Sanitize NODE_OPTIONS the user may have set for their own projects —
# they would otherwise be inherited into the Electron-as-Node process
# and can crash with "--require of ESM". Re-export under a scoped name
# so the CLI can opt to honor them explicitly (VS Code pattern).
export OK_NODE_OPTIONS=$NODE_OPTIONS
unset NODE_OPTIONS

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
```

Make it executable via `chmod +x` committed in-tree (git mode 0755). No additional signing — the script is plain text inside the signed `.app` bundle, covered by the bundle's code-resource seal.

---

## 2. electron-builder wiring — amend `packages/desktop/electron-builder.yml`

**Today** the file ships only the React bundle:

```yaml
extraResources:
  - from: "../cli/dist/public"
    to: "app"
    filter: ["**/*"]
```

**M6 change** — add the CLI dist AND the wrapper script:

```yaml
extraResources:
  - from: "../cli/dist/public"
    to: "app"
    filter: ["**/*"]
  # NEW for M6: ship the CLI bundle (cli.mjs + its deps) inside
  # Contents/Resources/cli/. See packages/desktop/resources/cli/bin/ok.sh
  # for the wrapper that invokes it via ELECTRON_RUN_AS_NODE=1.
  - from: "../cli/dist"
    to: "cli/dist"
    filter:
      - "**/*"
      - "!public/**"   # already copied above under `app/`
      - "!**/*.map"
  - from: "resources/cli/bin/ok.sh"
    to: "cli/bin/ok.sh"
```

Signing behavior: the existing `hardenedRuntime: true` + `entitlements: build/entitlements.mac.plist` apply to the Electron main binary (already satisfies `ELECTRON_RUN_AS_NODE=1` use case — the entitlements include `com.apple.security.cs.allow-jit` etc.). The wrapper script and `cli.mjs` are plain text, covered transitively by the bundle's code-resource seal + notarization ticket. **No entitlement changes needed.**

---

## 3. Menu item — amend `packages/desktop/src/main/menu.ts`

Current File submenu (abridged):

```ts
{
  label: 'File',
  submenu: [
    { label: 'New Project…', accelerator: 'CmdOrCtrl+Shift+N', click: () => deps.openNavigator() },
    { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: async () => { /* ... */ } },
    { type: 'separator' },
    { label: 'Open Recent', submenu: recentSubmenu },
    { type: 'separator' },
    isMac ? { role: 'close' } : { role: 'quit' },
  ],
}
```

**M6 addition** — insert between "Open Recent" and the trailing close/quit (macOS-only, matches VS Code's placement under File):

```ts
// Only show on darwin — Windows + Linux wire PATH at installer time,
// not in-app. See evidence/cross-platform-windows-linux.md.
...(isMac
  ? ([
      { type: 'separator' as const },
      {
        label: deps.cliInstallStatus === 'installed'
          ? "Uninstall Command-Line Tools"
          : "Install Command-Line Tools…",
        click: () => void deps.toggleCliInstall(),
      },
    ] satisfies MenuItemConstructorOptions[])
  : []),
```

And extend `MenuDeps`:

```ts
export interface MenuDeps {
  // ...existing deps...
  /** Whether `/usr/local/bin/ok` currently symlinks to this .app. Computed
   *  lazily at menu-build time; rebuild the menu after toggle completes to
   *  flip the label. */
  cliInstallStatus: 'installed' | 'not-installed' | 'broken';
  /** Install or uninstall, depending on current status. Must handle
   *  translocation check (refuse install if app is translocated), admin
   *  prompt (osascript), and collision detection (see below). */
  toggleCliInstall(): Promise<void>;
}
```

Menu rebuild is already done on recent-projects change (see `menu.ts:19-22`); hook `toggleCliInstall`'s completion to the same `installApplicationMenu(deps)` re-call.

---

## 4. New file — `packages/desktop/src/main/cli-install.ts`

The install logic. Heavily commented; the shape is intentionally derivative of VS Code's handler.

```ts
/**
 * CLI-on-PATH install action for D52 / M6.
 *
 * Flow:
 *   1. Translocation guard — if the app is running from a randomized
 *      /AppTranslocation/ path (user double-clicked from a DMG mount
 *      or Downloads before dragging to /Applications), refuse with a
 *      clear dialog. VS Code #209356 / Zed #5276 are the same bug we
 *      decline to ship.
 *   2. Collision guard — if /usr/local/bin/ok exists and is not our
 *      symlink, prompt before overwriting (npm-installed ok shim is
 *      the main concern).
 *   3. Admin prompt — osascript "do shell script ... with
 *      administrator privileges" creates /usr/local/bin/ok AND
 *      /usr/local/bin/open-knowledge, both symlinked at the same
 *      target path inside the .app bundle.
 *   4. Idempotent — clicking the menu item again when already
 *      installed is a no-op (status indicator flips to "Uninstall").
 */

import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const SYMLINK_PATHS = ['/usr/local/bin/ok', '/usr/local/bin/open-knowledge'] as const;

/**
 * Detect macOS App Translocation.
 *
 * When the user launches the .app from a non-canonical location
 * (Downloads, DMG mount, Alfred / Raycast hot-launcher), Gatekeeper
 * copies the bundle to a path like
 *   /private/var/folders/.../AppTranslocation/<UUID>/d/Open Knowledge.app/
 * and runs it from there. If we symlink INTO that path, the symlink
 * breaks on next app launch (temp dir is gone).
 */
export function isTranslocated(executablePath: string = app.getPath('exe')): boolean {
  return (
    executablePath.includes('/AppTranslocation/') ||
    executablePath.startsWith('/private/var/folders/')
  );
}

/**
 * Resolve the target path inside the .app bundle that both symlinks
 * should point at. The .app bundle is everything above `Contents/`.
 */
export function wrapperPathInBundle(executablePath: string = app.getPath('exe')): string {
  // executablePath looks like: /Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge
  const bundleRoot = executablePath.replace(/\/Contents\/MacOS\/.*$/, '');
  return join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh');
}

export type CliInstallStatus = 'installed' | 'not-installed' | 'broken';

/**
 * Compute the current install status. Checked at menu build time;
 * the result decides whether the menu item reads "Install…" or
 * "Uninstall". `broken` = symlink exists but points at a missing
 * or foreign target (dangling from a prior install, OR user dragged
 * the .app to Trash then re-installed a different version).
 */
export async function getInstallStatus(): Promise<CliInstallStatus> {
  const target = wrapperPathInBundle();
  let anyInstalled = false;
  for (const p of SYMLINK_PATHS) {
    try {
      const linkTarget = await fs.readlink(p);
      if (linkTarget === target) {
        anyInstalled = true;
      } else {
        // Wrong target (stale / npm shim / foreign): report broken.
        return 'broken';
      }
    } catch (err: unknown) {
      // ENOENT = not installed at this path; any other error = broken.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return 'broken';
    }
  }
  return anyInstalled ? 'installed' : 'not-installed';
}

/**
 * Run a shell command with administrator privileges via osascript.
 * Matches VS Code's approach — surfaces the standard macOS admin
 * dialog (password or Touch ID). Non-zero exit = user cancelled.
 */
function runAsAdmin(shellCmd: string, promptCopy: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // osascript argument escaping: the shell script goes in double
    // quotes; AppleScript string escapes for embedded double quotes
    // are `\"`. The prompt copy is the string macOS shows above the
    // password field.
    const appleScript = `do shell script "${shellCmd.replace(/"/g, '\\"')}" with prompt "${promptCopy.replace(/"/g, '\\"')}" with administrator privileges`;
    const child = spawn('osascript', ['-e', appleScript]);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`osascript exited with code ${code}`));
    });
    child.on('error', (err) => reject(err));
  });
}

export async function installCli(): Promise<void> {
  if (isTranslocated()) {
    await dialog.showMessageBox({
      type: 'warning',
      message: 'Please move Open Knowledge to your Applications folder first.',
      detail:
        "Open Knowledge is running from a temporary location. Command-Line Tools can only be installed when the app is in /Applications. Move the app using Finder and try again.",
      buttons: ['OK'],
    });
    return;
  }

  const target = wrapperPathInBundle();
  // Verify target exists before offering to install — catches the
  // "extraResources didn't ship the wrapper" build regression early.
  try {
    await fs.access(target);
  } catch {
    await dialog.showMessageBox({
      type: 'error',
      message: 'Command-Line Tools wrapper is missing from this build.',
      detail: `Expected: ${target}`,
      buttons: ['OK'],
    });
    return;
  }

  // Collision check: are any of the SYMLINK_PATHS already occupied by
  // something NOT our symlink? Prompt before stomping.
  for (const p of SYMLINK_PATHS) {
    try {
      const existing = await fs.readlink(p);
      if (existing !== target) {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          message: `Another ${p} already exists.`,
          detail: `The existing file points at: ${existing}\n\nReplace it with the Open Knowledge bundled CLI?`,
          buttons: ['Cancel', 'Replace'],
          cancelId: 0,
          defaultId: 0,
        });
        if (response === 0) return;
      }
    } catch {
      // Not a symlink (either doesn't exist or is a plain file).
      // If it's a plain file, readlink throws EINVAL — we should
      // still prompt in that case; stat to check.
      try {
        const s = await fs.lstat(p);
        if (!s.isSymbolicLink()) {
          const { response } = await dialog.showMessageBox({
            type: 'question',
            message: `A non-symlink file exists at ${p}.`,
            detail: 'This is likely an npm-installed ok binary. Replace it with the bundled CLI?',
            buttons: ['Cancel', 'Replace'],
            cancelId: 0,
            defaultId: 0,
          });
          if (response === 0) return;
        }
      } catch {
        // ENOENT — nothing there, safe to install.
      }
    }
  }

  // Build the command. mkdir -p first so a fresh macOS without
  // Homebrew still has /usr/local/bin/; rm -f handles the replace
  // case (symlink OR plain file).
  const cmd =
    `mkdir -p /usr/local/bin && ` +
    SYMLINK_PATHS.map((p) => `rm -f '${p}' && ln -s '${target}' '${p}'`).join(' && ');

  try {
    await runAsAdmin(cmd, 'Open Knowledge needs permission to install the Command-Line Tools.');
  } catch {
    // Admin prompt cancelled or failed. Offer manual alternative.
    await dialog.showMessageBox({
      type: 'info',
      message: 'Installation cancelled.',
      detail:
        `You can install manually by adding this to your ~/.zprofile:\n\n` +
        `  export PATH="$PATH:${target.replace(/\/bin\/ok\.sh$/, '/bin')}"\n\n` +
        `Then restart your terminal.`,
      buttons: ['OK'],
    });
    return;
  }

  await dialog.showMessageBox({
    type: 'info',
    message: 'Command-Line Tools installed.',
    detail: 'Open a new terminal window and run `ok --version` to verify. Both `ok` and `open-knowledge` are available.',
    buttons: ['OK'],
  });
}

export async function uninstallCli(): Promise<void> {
  const target = wrapperPathInBundle();
  // Only remove symlinks we own — never touch foreign files.
  const toRemove: string[] = [];
  for (const p of SYMLINK_PATHS) {
    try {
      const linkTarget = await fs.readlink(p);
      if (linkTarget === target) toRemove.push(p);
    } catch {
      // Not our symlink (or doesn't exist) — skip.
    }
  }
  if (toRemove.length === 0) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Command-Line Tools are not installed.',
      buttons: ['OK'],
    });
    return;
  }
  const cmd = toRemove.map((p) => `rm -f '${p}'`).join(' && ');
  try {
    await runAsAdmin(cmd, 'Open Knowledge needs permission to remove the Command-Line Tools.');
  } catch {
    return; // user cancelled; no-op
  }
  await dialog.showMessageBox({
    type: 'info',
    message: 'Command-Line Tools removed.',
    buttons: ['OK'],
  });
}
```

**Tests to colocate** at `packages/desktop/src/main/cli-install.test.ts` (pure-function layer only; Electron runtime bits need integration tests):

```ts
import { describe, expect, test } from 'bun:test';
import { isTranslocated, wrapperPathInBundle } from './cli-install.ts';

describe('isTranslocated', () => {
  test('detects /AppTranslocation/ prefix', () => {
    expect(
      isTranslocated('/private/var/folders/lp/abc/T/AppTranslocation/UUID/d/Open Knowledge.app/Contents/MacOS/Open Knowledge'),
    ).toBe(true);
  });
  test('detects /private/var/folders without AppTranslocation token', () => {
    expect(isTranslocated('/private/var/folders/lp/xyz/Open Knowledge.app/Contents/MacOS/Open Knowledge')).toBe(true);
  });
  test('passes canonical /Applications install', () => {
    expect(isTranslocated('/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge')).toBe(false);
  });
  test('passes user-Applications install', () => {
    expect(isTranslocated('/Users/andrew/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge')).toBe(false);
  });
});

describe('wrapperPathInBundle', () => {
  test('resolves the wrapper path relative to the bundle root', () => {
    expect(wrapperPathInBundle('/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge')).toBe(
      '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh',
    );
  });
});
```

The `runAsAdmin`, `installCli`, `uninstallCli` functions need an Electron runtime to fully exercise — those flow through the signed-DMG smoke test (below), not unit tests.

---

## 5. Launch-time broken-symlink repair (optional, strongly recommended)

When OK starts (in `packages/desktop/src/main/index.ts` `app.whenReady()` handler), call `getInstallStatus()` and if result is `'broken'`:

```ts
// In app.whenReady().then(async () => { ... }):
const status = await getInstallStatus();
if (status === 'broken') {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: 'Command-Line Tools are broken.',
    detail:
      `The /usr/local/bin/ok symlink points to a location that no longer exists. ` +
      `This usually means Open Knowledge was deleted and reinstalled. ` +
      `Repair the symlink to point at this installation?`,
    buttons: ['Skip', 'Repair…'],
    cancelId: 0,
    defaultId: 1,
  });
  if (response === 1) await installCli(); // re-invokes the install flow
}
```

Covers the drag-to-Trash-then-reinstall case. One-time per session — don't re-prompt if user dismissed.

---

## 6. Smoke test procedure

### 6a. Dev-mode (no DMG needed)

Can run in `bun run --filter=@inkeep/open-knowledge-desktop dev`. Confirms menu wiring + translocation guard logic.

1. `bun run --filter=@inkeep/open-knowledge-desktop dev` launches the app in dev mode.
2. File menu shows "Install Command-Line Tools…" (status: `not-installed`).
3. Click it. Expected outcome depends on dev-mode bundle shape:
   - **If `extraResources` packaged**: should complete the osascript flow.
   - **If dev mode doesn't pack `extraResources`** (electron-vite dev convention): the "wrapper missing from this build" dialog fires. Good — proves the guard works without actually touching `/usr/local/bin/`.
4. `isTranslocated` unit tests pass under `bun test packages/desktop/src/main/cli-install.test.ts`.

### 6b. Unsigned-build smoke (no Apple Developer Program required)

1. `bun run --cwd packages/desktop build:mac:unsigned` produces an unsigned DMG.
2. Mount the DMG, drag `Open Knowledge.app` to `/Applications/`.
3. First launch: Gatekeeper prompt (right-click → Open) because unsigned. Allow.
4. File menu → "Install Command-Line Tools…"
5. macOS admin dialog appears. Enter password.
6. In a NEW terminal: `which -a ok` → `/usr/local/bin/ok`. `ok --version` → prints the OK CLI version. `ok mcp` → starts the MCP stdio server (Ctrl-C to stop).
7. File menu now reads "Uninstall Command-Line Tools".
8. Click. Admin prompt. Verify `/usr/local/bin/ok` gone, `/usr/local/bin/open-knowledge` gone.
9. Repeat step 4 to reinstall; then drag the .app to Trash; reopen the app (will relaunch if still in dock). Expected: "Command-Line Tools are broken — repair?" dialog on next launch.

### 6c. Translocation smoke

Cannot easily trigger from the signed build workflow (requires launching directly from DMG mount without dragging). Dev-mode alternative:

1. Mock `app.getPath('exe')` in a unit-test harness or temporarily inject via dev DevTools:
   ```ts
   // DevTools Console:
   const { app } = require('electron');
   app.getPath = (k) => k === 'exe'
     ? '/private/var/folders/lp/abc/T/AppTranslocation/UUID/d/Open Knowledge.app/Contents/MacOS/Open Knowledge'
     : originalGetPath(k);
   ```
2. Trigger "Install Command-Line Tools…".
3. Expected: translocation warning dialog, NO osascript invocation.

### 6d. Signed-DMG end-to-end (requires Apple Developer Program)

Blocked on same pre-req as M2 DOD (Apple certs). When Apple certs are on hand:

1. CI pipeline produces signed+notarized DMG.
2. Download on a fresh Mac.
3. Run steps 6b.2 through 6b.9 — no Gatekeeper warning this time.

---

## 7. File-level change inventory (for the eventual implementation PR)

**New files:**
- `packages/desktop/resources/cli/bin/ok.sh` (executable)
- `packages/desktop/src/main/cli-install.ts`
- `packages/desktop/src/main/cli-install.test.ts`

**Modified files:**
- `packages/desktop/electron-builder.yml` — add 2 entries under `extraResources`.
- `packages/desktop/src/main/menu.ts` — add menu item + extend `MenuDeps`.
- `packages/desktop/src/main/index.ts` — wire `MenuDeps.cliInstallStatus` + `toggleCliInstall()` at menu build time; optionally add launch-time broken-symlink repair.

**Documentation:**
- `packages/desktop/README.md` — add "Command-Line Tools" subsection covering the install action, translocation gotcha, coexistence with `npm i -g @inkeep/open-knowledge`, and `which -a ok` diagnostic command.

**Rough LOC estimate:** ~400 lines net total:

| File | New / Modified | Lines |
|---|---|---|
| `packages/desktop/src/main/cli-install.ts` | new | ~250 (code + JSDoc) |
| `packages/desktop/src/main/cli-install.test.ts` | new | ~60 (pure-function unit tests) |
| `packages/desktop/resources/cli/bin/ok.sh` | new | ~30 |
| `packages/desktop/src/main/menu.ts` | modified | ~20 (conditional File-menu entry + `MenuDeps` extension) |
| `packages/desktop/src/main/index.ts` | modified | ~25 (menu-deps wiring + optional launch-time broken-symlink repair) |
| `packages/desktop/electron-builder.yml` | modified | ~10 (two new `extraResources` entries) |
| `packages/desktop/README.md` | modified | ~40 (Command-Line Tools section — install / uninstall / coexistence / troubleshoot) |
| **Total** | | **~435** |

One well-scoped PR, not a multi-week effort. The doc addition (`README.md`) carries the Medium-severity "document the coexistence" reminders from D13 and D15 in one place.

---

## 8. Why this design is incremental, not speculative

Every element of this design maps directly to an identified pattern from the 3P evidence files OR an explicit spec requirement:

| Design element | Source |
|---|---|
| `ELECTRON_RUN_AS_NODE=1` wrapper script | [VS Code `code.sh`](https://github.com/microsoft/vscode/blob/main/resources/darwin/bin/code.sh) |
| `osascript "do shell script ... with administrator privileges"` | VS Code's implementation (evidence/vscode-pattern.md) |
| Two symlinks (`ok` + `open-knowledge`) | OK spec D52 + Atom precedent (`atom` + `apm`) |
| Translocation guard | Evidence: VS Code #209356 + Zed #5276 — nobody has shipped a guard |
| Collision prompt instead of overwrite | Evidence: Docker Desktop's silent-overwrite anti-pattern |
| Broken-symlink repair on launch | Evidence: drag-to-Trash is the universal uninstall UX |
| `$HOME/.local/bin` fallback in cancel path (via PATH append dialog) | Evidence: Cursor + Docker-Desktop $HOME precedent |
| Tests as pure functions on stable deps | existing convention in `packages/desktop/src/main/*.test.ts` |

No novel primitives; every choice is a derivation from evidence.

---

## Gaps / follow-ups

- **Bun-test integration pattern for Electron APIs**: the design assumes `cli-install.ts` test file follows the existing `menu.ts` / `state-store.ts` pattern where Electron runtime APIs are injected via deps and unit-tested as pure functions. A future implementer should verify the `dialog.showMessageBox` + `spawn('osascript')` mocking boundaries match the established test harness.
- **Dialog copy localization**: strings are hard-coded English here. OK desktop doesn't currently ship i18n; match prevailing pattern (hard-coded until i18n lands).
- **Menu accelerator**: VS Code doesn't give "Install 'code' command in PATH" a keyboard shortcut; Atom didn't either. Default: no accelerator for M6.
