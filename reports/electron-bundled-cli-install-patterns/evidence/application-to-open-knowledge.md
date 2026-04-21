# Evidence: Application to Open Knowledge — reconciling findings with D52

**Dimension:** D13 (1P synthesis — applying findings to OK's D52 LOCKED decision)
**Date:** 2026-04-21
**Sources:** [specs/2026-04-11-electron-desktop-app/SPEC.md §8.12, D52, M6](../../../specs/2026-04-11-electron-desktop-app/SPEC.md), [specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md](../../../specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md), [reports/cli-command-name-ok-okb/REPORT.md](../../cli-command-name-ok-okb/REPORT.md)

**Stance:** This is a 1P (first-party) evidence file applying the 3P (third-party) findings from the other evidence files to OK's shipped and planned state. Kept separate so a reader evaluating the 3P landscape doesn't have to inherit the OK-specific conclusions.

---

## Where OK stands today

From [specs/2026-04-11-electron-desktop-app/SPEC.md §8.12 + D52](../../../specs/2026-04-11-electron-desktop-app/SPEC.md) (LOCKED 2026-04-17, revised 2026-04-20):

- **Menu surface**: `File → "Install Command-Line Tools…"` (matches VS Code's Command Palette text).
- **Target paths**: TWO symlinks at `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge`, both pointing at the bundled CLI inside `app.asar.unpacked/cli/`.
- **Admin prompt**: first click triggers macOS admin prompt. Subsequent clicks no-op if already installed.
- **Upstream inheritance**: `packages/cli/package.json` on main already ships `"bin": { "open-knowledge": "./dist/cli.mjs", "ok": "./dist/cli.mjs" }`. The bundled CLI inherits both bins automatically.
- **MCP config write preference**: when OK Electron writes `.mcp.json` entries on behalf of the user, it uses `{"command": "/usr/local/bin/ok", "args": ["mcp"]}` instead of `{"command": "npx", ...}` — load-bearing for P1 (no Node installed).
- **Status**: M2 (signed DMG scaffolding) shipped via PR #245 (commit 48266868). M6 (MCP first-launch wiring + CLI-on-PATH) is next in the milestone sequence, blocked only by M2 DOD + PR #166 auth/sync substrate (both on hand).

## Where OK differs from the 3P pattern

### Two-symlink install (vs. one)

VS Code ships ONE symlink (`/usr/local/bin/code`). Zed: one (`zed`). Cursor: one (`cursor`).

OK ships TWO (`ok` + `open-knowledge`). This is unusual in the peer set but directly motivated by backward compatibility: pre-existing `.mcp.json` entries in the wild written against `open-knowledge` need to continue resolving. Atom's precedent (`atom` + `apm`) confirms the pattern is architecturally valid — two symlinks pointing at the same (or different) targets is not problematic.

**No change recommended.** D52's choice is deliberate and justified by [reports/cli-command-name-ok-okb/REPORT.md](../../cli-command-name-ok-okb/REPORT.md).

### `app.asar.unpacked/cli/` vs. `Contents/Resources/app/bin/` (VS Code)

VS Code places the CLI wrapper script at `Contents/Resources/app/bin/code` (NOT inside an asar archive). OK spec §8.9 places the bundled CLI at `Contents/Resources/app.asar.unpacked/cli/`.

This divergence matters because:

1. **asar unpacking** means the CLI files ARE inside an "unpacked" subtree (extracted from the archive at build time, living on disk). Signing flow is the same as `Contents/Resources/` — the unpacked files are enumerated by `codesign --deep`.
2. **VS Code's `app.asar`** contains all the compiled JS; the `bin/` directory is in `Resources/app/` (sibling, not nested). OK's topology puts CLI inside `app.asar.unpacked/` because OK's packages/cli/dist/ bundle is already produced at build time and electron-builder's default behavior puts it there.
3. **Functional equivalent**: both patterns result in signed plain-text files inside the signed .app bundle. No security implication.

**Recommendation**: confirm during M6 implementation that the symlink target path matches the actual placement. The spec currently says "app.asar.unpacked/cli/" — the wrapper script inside should be the install target:

```
/usr/local/bin/ok → /Applications/Open Knowledge.app/Contents/Resources/app.asar.unpacked/cli/bin/ok.sh
```

Make `bin/ok.sh` a dedicated shim that exists specifically to be the symlink target (VS Code pattern). Its content: same as VS Code's `code.sh`, adapted for OK's Electron binary name + CLI entry point.

### Wrapper script content for OK

Adapting VS Code's `code.sh` for OK (replace `@@NAME@@` with OK's binary name, `@@APPNAME@@` with the published product name):

```bash
#!/usr/bin/env bash

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
ELECTRON="$CONTENTS/MacOS/Open Knowledge"
CLI="$CONTENTS/Resources/app.asar.unpacked/cli/dist/cli.mjs"

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
```

Simpler than VS Code's — no remote-IPC case (OK has no SSH remote story), no `NODE_OPTIONS` sanitization (can add if user reports env bleed).

### Gotchas specific to OK

1. **App translocation guard (missing from D52)** — before creating the symlink, detect `/AppTranslocation/` or `/private/var/folders/` in `app.getPath('exe')` and refuse with a clear dialog ("Please move Open Knowledge to your Applications folder first"). Without this guard, fresh-DMG users who double-click-to-run without dragging will end up with a broken symlink pointing to a temp dir that disappears on reboot. VS Code closed the bug as "drag to Applications is the answer" but we can ship the guard cheaply and avoid the support ticket.

2. **Bun-in-CLI audit (risk for Electron-Node-mode execution)** — if any of OK's CLI code or its transitive deps imports from `bun:*` built-ins (bun:sqlite, bun:test, Bun shell), the wrapper's `ELECTRON_RUN_AS_NODE=1` path breaks because Electron's embedded Node has no `bun:*` modules. Audit `packages/cli/` for Bun-specific imports before M6 lands. Known-good: Commander v14, js-yaml, @napi-rs/keyring (Node-native), Zod. Known-risk: any code that assumes Bun runtime APIs. A quick `grep -rn "bun:" packages/cli/src/` audit before M6 answers this in 10 seconds.

3. **Homebrew Cask + /opt/homebrew PATH conflict** — on Apple Silicon with Homebrew, `/opt/homebrew/bin` tends to precede `/usr/local/bin` in user PATH. A user who also has `npm i -g @inkeep/open-knowledge` via Apple-Silicon Homebrew Node would have `/opt/homebrew/bin/ok` AND `/usr/local/bin/ok` — `/opt/homebrew/bin/ok` (npm-installed) wins. This is not a bug — both CLIs execute equivalent code — but the user sees the npm version's `--version`, not the Electron-bundled version's. Documentation should mention this. D52's "shell resolves to whichever appears first" posture handles it.

4. **Uninstall / drag-to-Trash story** — spec D52 mentions `Uninstall flow removes both symlinks` but the user dragging the `.app` to Trash bypasses that flow entirely. M6 should include: on app launch, check if `/usr/local/bin/ok` exists and points at a non-existent bundle (broken symlink); if so, offer "Fix Command-Line Tools" silently or on user opt-in. This rescues users who re-installed OK after previously deleting it.

5. **`$HOME/.local/bin` fallback (not required, but cheap)** — for users on locked-down enterprise Macs where `/usr/local/bin/` admin prompt is denied, a fallback to `$HOME/.local/bin/` (no admin, user updates PATH) matches Docker Desktop's pattern and Cursor's `curl | bash` pattern. NOT required for M6, but worth noting in the spec as a follow-up option if admin-refusal tickets materialize.

---

## Implications summary

**D52 is correctly scoped.** The decision and §8.12 implementation plan align with the dominant industry pattern (VS Code). The pattern is 10+ years battle-tested through Atom → VS Code → Cursor → Windsurf → Trae lineage.

**M6 checklist additions (not spec amendments, just implementation reminders):**

1. ✋ App translocation guard in the install handler.
2. ✋ Bun-specific import audit in `packages/cli/`.
3. ✋ Broken-symlink detection + repair offer on launch.
4. 📝 Document the `/opt/homebrew/bin/ok` coexistence in `packages/desktop/README.md`.
5. 📝 Document `$HOME/.local/bin` fallback (future option).

**No spec amendment needed.** All five are implementation-layer concerns discoverable from this research; none invalidate D52 or §8.12.
