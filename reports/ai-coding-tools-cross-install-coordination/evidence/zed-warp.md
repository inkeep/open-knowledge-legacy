# Evidence: Zed + Warp

**Dimension:** Non-VS-Code-lineage AI tools. Zed is a Rust-native editor; Warp is a Rust-native terminal with AI. Both deliberately break from the Electron default and use different coordination patterns than the VS Code lineage.
**Date:** 2026-04-24
**Sources:** github.com/zed-industries/zed (OSS, cloned locally to `/tmp/zed`), Warp docs, Homebrew cask sources.

---

## Key files / pages referenced

- Zed — `crates/cli/src/main.rs` (1433 LOC) — CLI entry, bundle discovery, channel dispatch
- Zed — `crates/install_cli/src/install_cli_binary.rs` L19-62 — in-app CLI-install action
- Zed — `crates/paths/src/paths.rs` L103-130, L223, L287, L329, L370, L380, L388, L402, L414 — state dir layout
- Zed — `crates/release_channel/src/lib.rs` L184-209 — channel bundle identifiers
- Zed — `crates/auto_update/src/auto_update.rs` — in-process auto-updater
- [Zed docs — Installation](https://zed.dev/docs/installation), [macOS](https://zed.dev/docs/macos), [CLI reference](https://zed.dev/docs/reference/cli)
- [Zed FAQ — collaboration channel parity](https://zed.dev/faq)
- Homebrew casks: [`zed`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/z/zed.rb), [`zed@preview`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/z/zed%40preview.rb), [`warp`](https://github.com/Homebrew/homebrew-cask/blob/master/Casks/w/warp.rb)
- [Warp — Installation & setup](https://docs.warp.dev/getting-started/installation-and-setup)
- [Warp — Settings sync](https://docs.warp.dev/terminal/more-features/settings-sync)
- [Warp — CLI reference (`oz`) + `warp-cli` deprecation](https://docs.warp.dev/reference/cli/cli)
- [Warp Homebrew tap](https://github.com/warpdotdev/homebrew-warp)

---

## Findings — Zed

### Finding Zed-D1 — Four-channel DMG distribution, single state dir

**Confidence:** CONFIRMED
**Evidence:** [zed.dev/download](https://zed.dev/download); `/tmp/zed/crates/release_channel/src/lib.rs:184-209`.

Four channels: Stable (`Zed.app`, `dev.zed.Zed`), Preview (`Zed Preview.app`, `dev.zed.Zed-Preview`), Nightly, Dev. Each is a separate `.app` with a distinct bundle identifier. Install paths: direct DMG, Homebrew cask (`zed` and `zed@preview`), Linux `install.sh`.

### Finding Zed-D2 — Bundle-relative CLI discovery, no cross-install coordination

**Confidence:** CONFIRMED
**Evidence:** `/tmp/zed/crates/cli/src/main.rs:1252-1262` (`locate_bundle()`).

The `zed` CLI binary is a separate Rust crate (`crates/cli/`, 1433 LOC) that ships inside each app bundle at `Zed.app/Contents/MacOS/cli`. The CLI locates its owning `.app` by canonicalizing `current_exe()` and walking parent dirs until it hits a `.app` suffix. **"Coordination" is implicit** — every `zed` symlink points to exactly one `.app`, and that `.app` is what gets launched.

Channel dispatch via CLI-arg prefix (`main.rs:474-482`, `spawn_channel_cli()` L1408-1432): `zed --preview ...` intercepts the first arg, matches against `ReleaseChannel::from_str`, calls `osascript -e 'POSIX path of (path to application "Zed Preview")'` to locate the target `.app`, then execs `$APP/Contents/MacOS/cli` with the remaining args. **Launch-time redirect**, not persistent coordination state.

No lock files, no IPC handshake, no shared registry searched.

### Finding Zed-D3a — CLI↔app version skew is structurally impossible per symlink

**Confidence:** CONFIRMED
**Evidence:** `locate_bundle()` canonicalizes path → CLI runs `$APP/Contents/MacOS/cli`.

Because the CLI finds its app via bundle-relative discovery, the CLI binary and the app binary it launches are **always from the same bundle**. They update atomically when the DMG replaces the bundle. **No version-skew is possible for a given symlink target.**

### Finding Zed-D3b — Multi-channel SHARED state dir on macOS, no schema marker

**Confidence:** CONFIRMED (shared dir) / UNCERTAIN (schema-drift consequences)
**Evidence:** `/tmp/zed/crates/paths/src/paths.rs` — `data_dir()` returns `~/Library/Application Support/Zed` by default (absent a `CUSTOM_DATA_DIR` override); `config_dir()` returns `~/.config/zed`; Homebrew zed@preview cask's `zap trash:` list confirms `~/Library/Application Support/Zed` (no Preview suffix).

Stable, Preview, Nightly all read/write the **same** settings, extensions, database, and prompts on macOS. Caches/Logs/Preferences ARE channel-suffixed via bundle identifier (e.g. `Library/Caches/dev.zed.Zed-Preview`), but the authoritative data dir is not.

**No schema-version probe** found in `paths.rs` or the `db/` crate. UNCERTAIN whether schema drift between channels causes silent corruption.

### Finding Zed-D3c — Collaboration requires channel parity (server-enforced)

**Confidence:** CONFIRMED
**Evidence:** [Zed FAQ](https://zed.dev/faq) — *"collaboration between channels isn't supported"*.

Users on Preview cannot collaborate with users on Stable. Enforcement is server-side, not local.

### Finding Zed-D4 — Symlink race between brew cask and in-app installer

**Confidence:** CONFIRMED
**Evidence:** `/tmp/zed/crates/install_cli/src/install_cli_binary.rs:21,31-60`; Homebrew `zed.rb` and `zed@preview.rb`.

Two install paths write to `/usr/local/bin/zed`:
- Homebrew's `binary "#{appdir}/Zed.app/Contents/MacOS/cli", target: "zed"`.
- The in-app `cli: install` Command Palette action that writes `/usr/local/bin/zed` directly (L21); calls `smol::fs::remove_file` then `symlink()`, falling back to `osascript ... with administrator privileges` if unprivileged write fails (L31-60).

**Last writer wins.** Homebrew's preview cask uses `target: "zed-preview"` — deliberately disambiguated — but Zed's in-app CLI installer **hardcodes `zed` with no channel suffix**, so running `cli: install` from a Preview app replaces the Stable symlink silently.

### Finding Zed-D5 — App auto-update carries CLI atomically via bundle-relative symlink

**Confidence:** CONFIRMED
**Evidence:** `crates/auto_update/src/auto_update.rs` (1250+ LOC); symlink invariant from D3a.

The in-process auto-updater polls for updates and replaces the app in place. Because the `/usr/local/bin/zed` symlink points into the bundle and the CLI lives inside the bundle, **updating the app transparently updates the CLI** — no separate refresh step.

`auto_updates true` in the Homebrew casks disables brew's update management — casks delegate to the app's own updater.

### Finding Zed-D6 — State dirs (shared across channels on macOS)

**Confidence:** CONFIRMED
**Evidence:** `paths.rs`.

- `~/Library/Application Support/Zed/` — db, extensions, languages, debug_adapters, prompts, embeddings, copilot, remote_servers.
- `~/.config/zed/` — user `settings.json`, `keymap.json`.
- `~/.local/state/Zed/` — state.
- `~/Library/Logs/Zed/`, `~/Library/Caches/Zed/`.

No schema-version marker file. Same dirs across channels — no multi-install namespace at the data layer.

### Finding Zed-D7 — Vendor messaging

**Confidence:** CONFIRMED

Docs present DMG and Homebrew as equivalent options with no guidance on mixing approaches; the `cli: install` palette action is the canonical CLI-on-PATH path ([zed.dev/docs/reference/cli](https://zed.dev/docs/reference/cli)).

---

## Findings — Warp

### Finding Warp-D1 — Desktop app + bundled Oz CLI + standalone Oz CLI

**Confidence:** CONFIRMED (app + bundled CLI) / UNCERTAIN (standalone formula internals)
**Evidence:** [Warp installation docs](https://docs.warp.dev/getting-started/installation-and-setup); Homebrew `warp.rb` cask; [warpdotdev/homebrew-warp](https://github.com/warpdotdev/homebrew-warp) tap.

- **Desktop app** via DMG and `brew install --cask warp`. **No `binary` stanza** in the cask — brew-installing the app does NOT put a CLI on PATH.
- **Bundled Oz CLI** — ships inside the `.app`; user invokes `Install Warp CLI Command` from the Command Palette, which installs to `/usr/local/bin` (admin creds required).
- **Standalone Oz CLI** — Homebrew tap `warpdotdev/warp`, formulae `warp-cli` and `warp-cli@preview` for headless / CI.
- **Deprecation in progress:** `warp-cli` is being replaced by `oz`. Docs state *"warp-cli is deprecated and has been replaced by oz. If you have warp-cli installed, it will auto-update to oz."*

Raw formula files 404 against `main` branch (`curl` 2026-04-24), so formula internals (install target, stanza, conflicts) are UNCERTAIN.

### Finding Warp-D2 — Cloud is the coordination plane

**Confidence:** CONFIRMED
**Evidence:** [Warp Settings Sync docs](https://docs.warp.dev/terminal/more-features/settings-sync).

Warp has an account-server Settings Sync: themes, features, privacy, AI settings sync across devices from a logged-in Warp account. Local and remote Warp installs are coordinated primarily through the account, not through local filesystem state. Oz authenticates via `oz login` or `WARP_API_KEY` and talks to Warp cloud — not to the local desktop process.

Locally, state dirs are **bundle-ID suffixed** per channel (`~/Library/Application Support/dev.warp.Warp-Stable/`, analogous for `-Preview` and `-Canary`), so multiple Warp channels coexist with isolated local state — a different choice from Zed's shared-state pattern.

No filesystem lock-file / IPC handshake surfaced between the desktop app and the Oz CLI (negative search on docs).

### Finding Warp-D3 — Version drift is cloud-reconciled

**Confidence:** CONFIRMED (cloud-reconciled config) / INFERRED (bundled-CLI update mechanism)
**Evidence:** Settings sync docs + deprecation migration.

- **Desktop app ↔ bundled Oz CLI:** bundled CLI ships inside the `.app`; app auto-update bumps the bundle. UNCERTAIN whether the palette `Install Warp CLI Command` creates a symlink (app update transparently bumps CLI) or a copy (user must re-run the palette action after each app update). Not documented.
- **Desktop app ↔ standalone `warp-cli` / `oz`:** independent install, independent updates. Brew-managed; auto-upgrades `warp-cli` → `oz` via `brew upgrade`.
- **Cloud-mediated config drift:** because themes + AI settings + agent history live server-side keyed by Warp account, per-install drift on configuration is resolved at login time regardless of local binary versions.

### Finding Warp-D4 — PATH precedence via palette vs brew tap

**Confidence:** CONFIRMED (install paths) / UNCERTAIN (precedence order)
**Evidence:** Cask + tap inspection.

Two ways `oz` / `warp-cli` land on PATH:
1. `Install Warp CLI Command` palette action → `/usr/local/bin` (admin).
2. `brew install warp-cli` from the `warpdotdev/warp` tap → `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel).

UNCERTAIN whether the palette and the tap detect each other; palette reportedly writes directly into `/usr/local/bin` which can shadow or be shadowed by brew-managed symlinks depending on user PATH order.

### Finding Warp-D5 — Desktop auto-update; cloud state is authoritative

**Confidence:** CONFIRMED

- Warp app auto-updates (`auto_updates true` in Homebrew cask; brew does not push updates, the app does — standard Squirrel.Mac pattern).
- Standalone `warp-cli` / `oz` update via brew.
- Bundled Oz CLI updates with the app.
- `warp-cli` → `oz` migration is automatic on next update.
- **Cloud-sync model** means per-install config drift is resolved server-side on next login.

### Finding Warp-D6 — Channel-suffixed state dirs + cloud state

**Confidence:** CONFIRMED
**Evidence:** Homebrew `warp` cask `zap trash:` stanza.

- `~/.warp/` (unsuffixed — shared across channels? UNCERTAIN, only Stable cask inspected)
- `~/Library/Application Support/dev.warp.Warp-Stable/` (per channel)
- `~/Library/Logs/warp.log*` (unsuffixed pattern)
- `~/Library/Preferences/dev.warp.Warp-Stable.plist` (per channel)
- `~/Library/Saved Application State/dev.warp.Warp-Stable.savedState` (per channel)

Cloud state (synced themes, AI settings, agent history) lives server-side, keyed by Warp account; multiple local installs see the same authoritative cloud state once logged in.

### Finding Warp-D7 — Vendor messaging distinguishes bundled vs standalone CLI

**Confidence:** CONFIRMED

Docs clearly differentiate the bundled CLI (ships with the desktop app, palette-installed) from the standalone CLI (brew tap, for headless/CI) with explicit guidance on when to use which ([docs.warp.dev/reference/cli/quickstart](https://docs.warp.dev/reference/cli/quickstart)).

---

## Negative searches (for NOT FOUND)

- **Zed lockfile / IPC handshake between coexisting apps:** searched `/tmp/zed` for `lockfile`, `.lock`, `lock_file`, `pid_file`, `cross.install`. Only per-window IPC sockets (`IPC_SOCKET_PATH`) found — same purpose as VS Code's `VSCODE_IPC_HOOK_CLI`, not cross-install coordination.
- **Zed schema-version probe:** searched `paths.rs` and `db/` crate. Not found.
- **Zed in-app installer conflict detection with brew:** `install_cli_binary.rs` does short-circuit when the existing symlink already points to the same CLI binary (`read_link` + equality check at the top of the install path), but does NOT prompt or warn before overwriting a foreign-written symlink that points elsewhere. Last-writer-wins against foreign targets.
- **Warp lockfile / local IPC:** searched docs.warp.dev. Not found. Cloud is the coordination surface.
- **Warp standalone formula contents:** `curl` 404s on `raw.githubusercontent.com/warpdotdev/homebrew-warp/main/Formula/warp-cli.rb`. Could not confirm install target or `conflicts_with` stanza.

---

## Gaps / follow-ups

- **Zed schema drift consequences** — what actually happens when Preview writes a newer DB schema that Stable later reads? No documented behavior.
- **Zed in-app CLI install does not disambiguate by channel** — Preview's `cli: install` silently replaces Stable's `/usr/local/bin/zed`. Not addressed in docs. Would a namespaced `zed-preview` target (matching Homebrew's pattern) be a fix?
- **Warp bundled-CLI install mechanism** — symlink or copy? Not documented. Determines whether app update auto-bumps CLI.
- **Warp Preview zap paths** — not inspected (only Stable cask sampled).
- **Warp standalone formula internals** — raw files inaccessible; would need a live brew install to inspect.
