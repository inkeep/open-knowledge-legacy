---
title: "Bundling a CLI Inside an Electron DMG: Install Patterns, Gotchas, and the VS Code Lineage"
description: "How VS Code, Cursor, Zed, Docker Desktop, Sublime, and Atom ship (or decline to ship) a PATH-installable CLI alongside a desktop app. Covers install mechanisms (symlink vs wrapper vs PATH append), osascript admin prompts, `ELECTRON_RUN_AS_NODE=1`, app-translocation traps, version coupling through symlinks, signing/notarization of inner executables, uninstall hygiene, and cross-platform divergence. Concludes with an Open Knowledge 1P application validating the D52 decision and surfacing five M6 implementation reminders."
createdAt: 2026-04-21
updatedAt: 2026-04-21
subjects:
  - Visual Studio Code
  - Cursor
  - Zed
  - Docker Desktop
  - Sublime Text
  - Atom
  - GitHub Desktop
  - Electron
  - electron-builder
  - Open Knowledge
topics:
  - bundled-CLI install patterns
  - macOS app translocation
  - ELECTRON_RUN_AS_NODE
  - osascript admin prompts
  - /usr/local/bin symlinks
  - signing and notarization of inner executables
  - Electron desktop app CLI-on-PATH
---

# Bundling a CLI Inside an Electron DMG: Install Patterns, Gotchas, and the VS Code Lineage

**Purpose:** The reader is implementing (or deciding whether to implement) a "download the DMG, get the `ok` command on PATH" experience for an Electron desktop app, alongside a CLI that continues to work for `ok mcp`, `ok init`, etc. This report documents how the dominant incumbents do it — the exact mechanism, the admin-prompt surface, the pitfalls — and closes with a 1P section applying findings to Open Knowledge's already-locked D52 decision.

---

## Executive Summary

There is one canonical pattern for bundling a CLI inside an Electron `.app` on macOS, and a small number of variations. It is the **VS Code pattern**, inherited by every VS Code fork (Cursor, Windsurf, Trae), and conceptually echoed by Zed, Atom, and — with UX variants — Docker Desktop. The pattern:

1. **Place a wrapper script inside the `.app` bundle** at `Contents/Resources/<path>/bin/<name>` (e.g., VS Code's `Contents/Resources/app/bin/code`).
2. **Expose a menu/Command Palette action** titled "Shell Command: Install 'name' command in PATH" (or equivalent) that drives an `osascript "do shell script ... with administrator privileges"` prompt.
3. **Create a symlink at `/usr/local/bin/<name>`** pointing at the in-bundle wrapper.
4. **The wrapper uses `ELECTRON_RUN_AS_NODE=1`** to invoke the app's Electron binary in Node-mode, passing the CLI JS entry as argv. No separate Node runtime is shipped.
5. **Version coupling is free**: the symlink target path is static, but the file AT that path is replaced atomically when the app updates. `ok --version` and the desktop app ship as one unit.

This pattern is **~10 years battle-tested** through the Atom (2014) → VS Code (2015+) → Cursor / Windsurf / Trae (2023+) lineage. It is robust, well-understood, and exactly what Open Knowledge's spec D52 (LOCKED 2026-04-17) already adopts.

**Three bugs recur across every implementation** and must be defended against:

- **macOS app translocation silently poisons the symlink** when the app is launched from Downloads, a mounted DMG, or third-party launchers (Alfred, etc.) before being dragged to `/Applications/`. The symlink target captures the temp translocation path, which disappears on reboot. Both [VS Code #209356](https://github.com/microsoft/vscode/issues/209356) and [Zed #5276](https://github.com/zed-industries/zed/issues/5276) document this exact failure. Neither upstream has shipped a runtime guard — Open Knowledge can.
- **Dragging the app to Trash leaves dangling symlinks at `/usr/local/bin/`** because macOS has no uninstall callback. Industry default: do nothing; offer a "Fix Command-Line Tools" prompt on next launch if re-installed.
- **`app.asar.unpacked` inner executables occasionally miss the signing pass** ([electron-builder #3940](https://github.com/electron-userland/electron-builder/issues/3940)). Shell scripts and JS files are unaffected (they're plain text inside the signed bundle); only native `.node` modules are at risk — and OK's existing M2 `asarUnpack` config already handles those cases.

**Divergences worth noting:**

- **Cursor** ships TWO CLIs — a VS Code-inherited `cursor` (opens the app) AND a separately-distributed `cursor-agent` (AI CLI via `curl | bash` → `~/.local/bin`). OK's decision to ship ONE binary `ok` (dispatching to subcommands like `ok mcp`, `ok init`, `ok start`) avoids this user-confusion surface.
- **Docker Desktop** auto-installs on first-launch with a user choice: `/usr/local/bin` (admin prompt) or `$HOME/.docker/bin` (no admin, user modifies PATH). It also aggressively re-creates symlinks on every launch, which has caused repeated kubectl-overwrite complaints. OK's D52 choice to use VS Code's explicit-opt-in menu model with check-before-create avoids this class of bug.
- **GitHub Desktop is not a relevant precedent** — it ships NO CLI at all. `gh` (GitHub CLI) is a separately-distributed product.
- **Sublime** publishes no menu item; users are expected to `ln -s` by hand or append to `PATH` themselves. Below the bar for Open Knowledge's P1 persona (docs author, not terminal-fluent).

**Key Findings:**

- **The VS Code pattern is the single dominant incumbent**, with a continuous 10-year provenance through Atom → VS Code → Cursor → Windsurf → Trae. Fork-stable; zero redesign across descendants.
- **`ELECTRON_RUN_AS_NODE=1` is the enabling technology** — the Electron main binary doubles as the CLI's Node runtime. No second Node install inside the `.app`.
- **`/usr/local/bin/` is the uncontested target** on macOS (not SIP-protected, writable by admin, in default PATH). `/opt/homebrew/bin/` coexists harmlessly on Apple Silicon.
- **`osascript "do shell script ... with administrator privileges"`** is the portable admin-prompt shape; stable across macOS 11–15.
- **App translocation is the critical gotcha**. Runtime detection (`app.getPath('exe')` matches `/AppTranslocation/` or `/private/var/folders/`) is cheap and avoided by no surveyed incumbent. Open Knowledge should ship this guard.
- **Bundled-CLI signing is free under electron-builder's `codesign --deep` pass** for shell scripts and JS files. Only `.node` native modules need individual signing, and OK's existing `app.asar.unpacked` globs cover that.
- **Version coupling is automatic** through the static symlink → replaced-file shape. Zero extra infra; VS Code / Zed / Cursor / Atom all ship this way.
- **npm-distributed CLIs coexist on PATH without conflict** — shell resolution picks whichever appears first in `$PATH`. Both CLIs execute equivalent code; no reconciliation needed.
- **Uninstall is a user-responsibility tradition** across every incumbent. OK can match VS Code (no in-app uninstall) OR ship a symmetric "Uninstall Command-Line Tools" action.

---

## Research Rubric

| # | Dimension | Depth | Priority | Status |
|---|-----------|-------|----------|--------|
| D1 | VS Code `code` command — install mechanism, menu item, wrapper script | Deep | P0 | Covered |
| D2 | Cursor + other VS Code forks — install behavior, divergence from base | Moderate | P1 | Covered |
| D3 | Zed — Rust-native bundled CLI (non-Electron precedent) | Moderate | P1 | Covered |
| D4 | Docker Desktop — first-launch auto-install + $HOME fallback | Deep | P0 | Covered |
| D5 | Sublime (manual), Atom (legacy), GitHub Desktop (no CLI) | Light | P2 | Covered |
| D6 | Install mechanisms: symlink vs wrapper script vs PATH append | Deep | P0 | Covered |
| D7 | Permission model — osascript, /usr/local/bin writability, AuthServices | Deep | P0 | Covered |
| D8 | Versioning/update coupling — does updating the app update the CLI? | Deep | P0 | Covered |
| D9 | Signing/notarization — inner executables, electron-builder gotchas | Deep | P0 | Covered |
| D10 | Uninstall — dangling symlink hygiene | Moderate | P1 | Covered |
| D11 | Cross-platform — Windows installer PATH, Linux package managers | Moderate | P1 | Covered |
| D12 | ~~GitHub Desktop CLI~~ | — | — | **Negative finding** — no CLI ships |
| D13 | 1P: Application to Open Knowledge — reconcile with D52 LOCKED | Light | P1 | Covered |

**Non-goals:**

- Re-opening OK's D52 decision (LOCKED 2026-04-17). This report VALIDATES the decision and surfaces implementation reminders, not alternatives.
- CLI naming (covered in [reports/cli-command-name-ok-okb/REPORT.md](../cli-command-name-ok-okb/REPORT.md) — `ok` as primary bin is LOCKED via D52 + PR #170).
- General Electron packaging, auto-update, CI (covered in [reports/electron-desktop-app-operations-2025/REPORT.md](../electron-desktop-app-operations-2025/REPORT.md)).
- npm/bunx CLI distribution patterns (covered in [reports/mastra-speakeasy-cli-install-recommendations/REPORT.md](../mastra-speakeasy-cli-install-recommendations/REPORT.md)).

**Stance:** D1-D12 are Factual / 3P-only. D13 is explicitly 1P synthesis, kept in a labeled section so a reader doing competitive research for a different product can ignore it.

---

## Detailed Findings

### D1 — VS Code `code` command — the canonical pattern

**Finding:** VS Code ships a bash wrapper at `Contents/Resources/app/bin/code`, and a Command Palette action "Shell Command: Install 'code' command in PATH" that creates a symlink at `/usr/local/bin/code` via `osascript`-driven admin prompt. The wrapper uses `ELECTRON_RUN_AS_NODE=1` to run the CLI JS through Electron's embedded Node runtime. This is THE pattern inherited by every downstream fork.

**Evidence:** [evidence/vscode-pattern.md](evidence/vscode-pattern.md)

**Implications:**
- 10-year-stable mechanism with complete public source (`resources/darwin/bin/code.sh` in [microsoft/vscode](https://github.com/microsoft/vscode)) — implementable with zero research risk.
- One wrapper script, one symlink, one in-app menu entry. Minimal moving parts.
- No separate Node.js runtime shipped — Electron is the runtime.

**Decision triggers (when this matters):**
- If your CLI is already JS/ESM and your Electron build is already ESM-compatible, Shape A (VS Code pattern) has zero extra ship surface.
- If your CLI is Rust / Go / statically-compiled, Shape B (Zed pattern) is the natural choice.
- If your user base won't tolerate an admin prompt, Shape C (PATH append) or Docker's `$HOME/.docker/bin` opt are fallbacks.

### D2 — Cursor + VS Code forks inherit the mechanism unchanged

**Finding:** Cursor exposes the same Command Palette action ("Install 'cursor' command in PATH"), inherited via its VS Code fork base. The symlink mechanism, admin prompt, and `/usr/local/bin/` target are identical. Cursor also ships a SEPARATE AI-agent CLI (`cursor-agent`) via `curl | bash` → `~/.local/bin`, deliberately avoiding the admin prompt for that product.

**Evidence:** [evidence/cursor-and-vscode-forks.md](evidence/cursor-and-vscode-forks.md)

**Implications:**
- The VS Code pattern is FORK-STABLE. Cursor, Windsurf (Codeium), and Trae (ByteDance) all inherited it without redesign — further evidence of its robustness.
- **Watch out for the two-CLI trap.** Cursor's `cursor` vs `cursor-agent` split has caused user confusion (which one opens the IDE? which one runs the AI?). Open Knowledge's single-bin-dispatching-to-subcommands model (`ok`, `ok mcp`, `ok init`) avoids this entirely.

### D3 — Zed (non-Electron) uses a variant: symlink to native Rust binary

**Finding:** Zed bundles a separate Rust binary `cli` at `Contents/MacOS/cli`. The "Install CLI" menu/palette action symlinks `/usr/local/bin/zed` → that binary. The CLI talks to a running Zed instance via IPC. Exhibits the same app-translocation bug as VS Code.

**Evidence:** [evidence/zed-pattern.md](evidence/zed-pattern.md)

**Implications:**
- Shape B (native binary) is viable for compiled languages but requires shipping a second signed binary. Pros: fast startup. Cons: doubled signing/notarization surface; separate IPC maintenance.
- For Open Knowledge, Shape A (VS Code wrapper-script + `ELECTRON_RUN_AS_NODE=1`) is simpler — no second binary, no IPC protocol. The OK CLI is already JS and doesn't need sub-second startup.
- Zed's `cli: install` + `Zed > Install CLI` menu confirms that users expect in-GUI affordances, not manual `ln -s`.

### D4 — Docker Desktop: first-launch auto-install + user-choice fallback

**Finding:** Docker Desktop auto-installs symlinks on first launch via an onboarding dialog, offering two locations: `/usr/local/bin/` (admin prompt) or `$HOME/.docker/bin/` (user PATH setup required, no admin). Aggressively re-creates symlinks on every launch — has caused repeated kubectl-overwrite complaints when users install kubectl via Homebrew.

**Evidence:** [evidence/docker-desktop-pattern.md](evidence/docker-desktop-pattern.md)

**Implications:**
- First-launch auto-install is a valid UX but couples tightly to user consent flow — easy to get wrong.
- The `$HOME/.docker/bin/` opt is a useful fallback precedent for OK if admin-refusal tickets materialize post-M6.
- **Anti-pattern to avoid:** aggressive re-creation on every launch. OK's D52 says "Subsequent menu clicks no-op if both symlinks already exist and point at the current app bundle" — this is the correct conservative choice.

### D5 — Sublime (manual), Atom (legacy), GitHub Desktop (no CLI)

**Finding:**
- **Sublime Text** ships no in-app install action; users manually `ln -s` or append to PATH. Below the bar for non-terminal users.
- **Atom** (Electron, sunset 2022) shipped the exact menu-item + symlink + admin-prompt pattern that VS Code refined. Direct ancestor.
- **GitHub Desktop** ships NO CLI. `gh` (GitHub CLI) is a separate product. The precedent here is the CHOICE: GitHub Desktop's GUI audience doesn't need a bundled CLI.

**Evidence:** [evidence/sublime-atom-github-desktop.md](evidence/sublime-atom-github-desktop.md)

**Implications:**
- Atom → VS Code lineage is the direct pattern ancestor. ~10 years of combined production hardening.
- The GitHub Desktop counterexample demonstrates: shipping a bundled CLI is a choice, not a requirement. Open Knowledge made the opposite choice (bundled CLI via D52) because of the agent-first story (P1 without Node cannot wire MCP otherwise) — and that's the correct call for OK's product scope.

### D6 — Install mechanism matrix: three distinct shapes

**Finding:** Three install shapes exist with different tradeoffs:
- **Shape A (symlink to in-bundle wrapper script)** — VS Code, Cursor, Atom. Uses `ELECTRON_RUN_AS_NODE=1`.
- **Shape B (symlink to in-bundle native binary)** — Zed, Docker Desktop.
- **Shape C (PATH append)** — Sublime. No symlink, no escalation.

**Evidence:** [evidence/install-mechanisms-matrix.md](evidence/install-mechanisms-matrix.md)

**Implications:**
- Shape A is the right default for JS/TS CLIs on Electron. OK's D52 implicitly picks Shape A.
- Shape C is the universally-available fallback (documented by VS Code as a manual alternative) for admin-refusal scenarios.

### D7 — Permission model: osascript is the portable primitive

**Finding:** `osascript -e 'do shell script "..." with administrator privileges'` drives the standard macOS authorization dialog. Stable across macOS 11–15 (Sequoia). No breaking changes announced. `AuthorizationServices.framework` is overkill for one-shot symlink install. `sudo` fails for enterprise-managed Macs. Setuid helper tools are discouraged by Apple.

**Evidence:** [evidence/install-mechanisms-matrix.md](evidence/install-mechanisms-matrix.md) §"Admin prompts via osascript"

**Implications:**
- The implementation primitive is decided and proven. OK's M6 should directly mirror VS Code's osascript invocation.
- Lazy-check writability (`fs.access(target, W_OK)`) before prompting — Docker Desktop does this, skipping the admin prompt when `/usr/local/bin/` is already user-owned.

### D8 — Versioning: automatic via symlink target replacement

**Finding:** When the app updates, the `.app` bundle is replaced atomically. The symlink target path is static; the file AT that path is the new version. `ok --version` and the desktop app ship as one coupled unit. Zero drift risk for app-bundled users.

**Evidence:** [evidence/signing-notarization-and-lifecycle.md](evidence/signing-notarization-and-lifecycle.md) §"Versioning is coupled"

**Implications:**
- No separate CLI update mechanism needed. No `ok update` subcommand for app-bundled users.
- npm-distributed CLIs (`npm i -g @inkeep/open-knowledge`) can drift from the app version — but this is explicit, not a bug. Power users get version pinning; casual users get auto-update via app update.
- Coexistence: PATH resolution picks whichever appears first. Same-logical-CLI, so no correctness risk.

### D9 — Signing and notarization: bundled CLI inherits from outer bundle

**Finding:** Shell scripts (`ok.sh`) and JS files (`cli.mjs`) in `Contents/Resources/` are covered by the outer bundle's code-resource seal and notarization ticket — no individual signing. Only native `.node` binaries need per-file signing, and electron-builder handles those. Known gotcha ([#3940](https://github.com/electron-userland/electron-builder/issues/3940)): `app.asar.unpacked` native binaries occasionally miss the signing pass; explicit `mac.binaries` list is the mitigation. OK's existing M2 asarUnpack globs for `@napi-rs/keyring` + `@parcel/watcher` already handle the relevant cases.

**Evidence:** [evidence/signing-notarization-and-lifecycle.md](evidence/signing-notarization-and-lifecycle.md) §"Signing"

**Implications:**
- **Zero new signing work for M6.** The existing M2 signed-DMG scaffolding + `afterSign` notarization hook cover the bundled CLI transparently.
- No new entitlements needed. The app's existing hardened-runtime entitlements (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`) cover the `ELECTRON_RUN_AS_NODE=1` execution path.

### D10 — Uninstall: dangling symlinks are the industry default

**Finding:** Every surveyed app leaves a dangling `/usr/local/bin/<name>` when the user drags the `.app` to Trash. VS Code, Zed, Atom: no uninstaller. Docker Desktop: has an in-app uninstall but only works if invoked before the app is deleted.

**Evidence:** [evidence/signing-notarization-and-lifecycle.md](evidence/signing-notarization-and-lifecycle.md) §"Uninstall"

**Implications:**
- **Two valid options for M6:**
  1. Match VS Code: no uninstall hook. Document the limitation.
  2. Match Docker Desktop: ship symmetric "Uninstall Command-Line Tools" menu item.
- **Recommended hybrid** (referenced in D52): on app launch, detect broken symlink → offer "Fix Command-Line Tools" silently. Covers the drag-to-Trash-then-reinstall case.

### D11 — Cross-platform: Windows installer PATH + Linux package-manager symlinks

**Finding:** Windows PATH install happens at installer time (NSIS/Squirrel modifies `HKCU\Environment\Path`). Linux `.deb`/`.rpm` postinst creates `/usr/bin/<name>` symlink. Neither platform needs an in-app menu item — the installer handles it. Neither has the macOS translocation bug class.

**Evidence:** [evidence/cross-platform-windows-linux.md](evidence/cross-platform-windows-linux.md)

**Implications:**
- The in-app "Install Command-Line Tools…" menu item is **macOS-only**. Windows and Linux wire PATH at install time.
- M6 implementation should branch on `process.platform === 'darwin'`.
- OK's current scope (M2-M3 macOS-first) means this is a future-release concern; documenting it now avoids surprise when Windows/Linux builds start.

### D13 — 1P: Application to Open Knowledge

**Finding:** OK's D52 decision (LOCKED 2026-04-17) and §8.12 implementation plan align directly with the VS Code pattern. No spec amendment needed. Five implementation-layer reminders surface from the research that are NOT currently in §8.12:

1. **App translocation guard** — detect `/AppTranslocation/` or `/private/var/folders/` in `app.getPath('exe')` at install time; refuse install with a "move to Applications first" dialog.
2. **Bun-specific import audit** in `packages/cli/` — `ELECTRON_RUN_AS_NODE=1` runs under Node, not Bun. Any `bun:*` imports break this path.
3. **Broken-symlink detection + repair offer** on app launch — covers the drag-to-Trash-then-reinstall case.
4. **Document `/opt/homebrew/bin/ok` coexistence** with `/usr/local/bin/ok` for Apple Silicon + Homebrew Node users.
5. **`$HOME/.local/bin` fallback** (future option) — ready-to-document precedent if admin-refusal tickets materialize.

**Evidence:** [evidence/application-to-open-knowledge.md](evidence/application-to-open-knowledge.md)

**Implications:**
- D52 is correctly scoped. No re-litigation needed.
- Five reminders are implementation details, not spec amendments. They should land as M6 PR checklist items or code comments, not as Decision Log entries.
- A proposed wrapper-script shape (adapted from VS Code's `code.sh` for OK's Electron binary name + `cli.mjs` entry) is provided in the evidence file.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **VS Code's TypeScript handler for the "Install 'code' command" action** — `installActions.ts` not located at expected paths via WebFetch. Behavior confirmed via docs + wrapper script + issue discussion + Stack Overflow; the actual TS class implementation was not opened. Impact on this report's conclusions: ZERO — the external behavior is fully characterized. Impact on a future M6 implementer: they could want to line up the error-handling code paths exactly with VS Code's — worth a `gh` CLI `gh search code` or a `git clone && grep` on microsoft/vscode.
- **Apple's "auxiliary executables in .app bundle" canonical signing doc** — WebFetch returned the page title but not content. Covered inductively via electron-builder docs + community posts + OK's existing M2 signing scaffolding behavior. Low risk.
- **electron-updater atomic replacement semantics** — assumed (reasonably) that Squirrel-like in-place updates of the `.app` bundle are atomic and the symlink target resolves correctly across an update. Not empirically verified. One way to verify cheaply: Andrew's M3 auto-update spec in progress — add a "post-update, `ok --version` reports the new version" smoke test.

### Out of scope (per rubric non-goals)

- Re-opening the D52 decision — LOCKED.
- Alternative CLI names — LOCKED via [reports/cli-command-name-ok-okb/REPORT.md](../cli-command-name-ok-okb/REPORT.md).
- General Electron operations (versioning, signing, updates, CI/CD infrastructure) — covered in [reports/electron-desktop-app-operations-2025/REPORT.md](../electron-desktop-app-operations-2025/REPORT.md).
- npm / bunx / Homebrew standalone-CLI distribution — covered in [reports/mastra-speakeasy-cli-install-recommendations/REPORT.md](../mastra-speakeasy-cli-install-recommendations/REPORT.md).

---

## References

### Evidence Files

- [evidence/vscode-pattern.md](evidence/vscode-pattern.md) — canonical VS Code `code` command mechanism, wrapper script source, translocation bug
- [evidence/cursor-and-vscode-forks.md](evidence/cursor-and-vscode-forks.md) — Cursor's two-CLI split (`cursor` vs `cursor-agent`), fork inheritance
- [evidence/zed-pattern.md](evidence/zed-pattern.md) — Zed's native-binary variant, IPC protocol
- [evidence/docker-desktop-pattern.md](evidence/docker-desktop-pattern.md) — first-launch auto-install, `$HOME/.docker/bin` fallback, kubectl overwrite bug
- [evidence/sublime-atom-github-desktop.md](evidence/sublime-atom-github-desktop.md) — manual PATH, legacy Atom pattern, no-CLI counterexample
- [evidence/install-mechanisms-matrix.md](evidence/install-mechanisms-matrix.md) — three install shapes + osascript admin prompts + `ELECTRON_RUN_AS_NODE=1`
- [evidence/signing-notarization-and-lifecycle.md](evidence/signing-notarization-and-lifecycle.md) — deep signing, known gotchas, versioning, uninstall
- [evidence/cross-platform-windows-linux.md](evidence/cross-platform-windows-linux.md) — Windows installer PATH, Linux package-manager patterns
- [evidence/application-to-open-knowledge.md](evidence/application-to-open-knowledge.md) — 1P synthesis applying findings to OK's D52 LOCKED state

### External Sources

- [VS Code `code.sh` wrapper source — microsoft/vscode](https://github.com/microsoft/vscode/blob/main/resources/darwin/bin/code.sh)
- [VS Code setup/mac docs](https://code.visualstudio.com/docs/setup/mac)
- [VS Code CLI reference](https://code.visualstudio.com/docs/configure/command-line)
- [VS Code issue #209356 — translocation symlink bug](https://github.com/microsoft/vscode/issues/209356)
- [VS Code issue #7673 — install without admin](https://github.com/Microsoft/vscode/issues/7673)
- [Zed macOS install docs](https://zed.dev/docs/macos)
- [Zed CLI reference](https://zed.dev/docs/reference/cli)
- [Zed issue #5276 — translocation symlink bug](https://github.com/zed-industries/zed/issues/5276)
- [zed-industries/zed `crates/cli/src/cli.rs`](https://github.com/zed-industries/zed/blob/main/crates/cli/src/cli.rs)
- [Cursor CLI installation docs](https://cursor.com/docs/cli/installation)
- [Homebrew cask cursor-cli](https://formulae.brew.sh/cask/cursor-cli)
- [Docker Desktop Mac permission requirements](https://docs.docker.com/desktop/setup/install/mac-permission-requirements/)
- [Docker issue #6538 — hard-coded symlink paths](https://github.com/docker/for-mac/issues/6538)
- [Docker issue #6328 — kubectl overwrite bug](https://github.com/docker/for-mac/issues/6328)
- [Sublime Text command line docs](https://www.sublimetext.com/docs/command_line.html)
- [Atom Flight Manual — Installing Atom](https://flight-manual.atom-editor.cc/getting-started/sections/installing-atom/)
- [electron-builder common configuration](https://www.electron.build/configuration.html)
- [electron-builder code signing (macOS)](https://www.electron.build/code-signing-mac.html)
- [electron-builder issue #3940 — asar.unpacked signing](https://github.com/electron-userland/electron-builder/issues/3940)
- [GitHub CLI (`gh`) — separate product](https://github.com/cli/cli)

### Related Research (not evidence; navigation aids)

- [reports/cli-command-name-ok-okb/REPORT.md](../cli-command-name-ok-okb/REPORT.md) — naming decision (`ok` vs alternatives), PR #170
- [reports/mastra-speakeasy-cli-install-recommendations/REPORT.md](../mastra-speakeasy-cli-install-recommendations/REPORT.md) — npm/Homebrew CLI distribution UX (different angle, complementary)
- [reports/electron-desktop-app-operations-2025/REPORT.md](../electron-desktop-app-operations-2025/REPORT.md) — Electron operations generally (signing, updates, CI)
- [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md) §8.12 + D52 + M6 — the LOCKED decision this report validates
- [specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md](../../specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md) — parallel CLI-distribution decision record
