# Evidence: Zed — Rust-native CLI binary bundled in a non-Electron .app

**Dimension:** D3 (Zed as non-Electron-but-relevant precedent)
**Date:** 2026-04-21
**Sources:** [Zed macOS docs](https://zed.dev/docs/macos), [CLI Reference](https://zed.dev/docs/reference/cli), Zed issues

---

## Key pages referenced

- [Zed macOS install](https://zed.dev/docs/macos)
- [Zed Linux install](https://zed.dev/docs/linux) — quotes the symlink recipe
- [Zed CLI reference](https://zed.dev/docs/reference/cli)
- [zed-industries/zed#5276 — CLI install breaks under app translocation](https://github.com/zed-industries/zed/issues/5276)
- [crates/cli/src/cli.rs](https://github.com/zed-industries/zed/blob/main/crates/cli/src/cli.rs) — CLI ↔ running-Zed IPC protocol

---

## Findings

### Finding: Zed exposes an app-menu item + Command Palette action that symlinks to a native Rust binary in the bundle

**Confidence:** CONFIRMED
**Evidence:** Zed docs search result

Two entry points:

1. **App menu**: `Zed > Install CLI`
2. **Command Palette**: `cli: install`

Both create a symlink at `/usr/local/bin/zed` pointing to `/Applications/Zed.app/Contents/MacOS/cli`.

Unlike VS Code, Zed does NOT install a shell-script wrapper — the target is a **real native binary** (a separate Rust executable shipped in the `.app`'s `Contents/MacOS/` directory). The binary is named `cli` (not `zed`); the symlink renames it to `zed` on the user's PATH.

On Linux, Zed's tarball ships `~/.local/zed.app/bin/zed` and the installer (or user) runs:

```bash
ln -sf ~/.local/zed.app/bin/zed ~/.local/bin/zed
```

**Implications:**

- **Two viable bundling shapes**: (a) VS Code-style shell-script-wrapper that re-uses the Electron runtime as a Node.js host (`ELECTRON_RUN_AS_NODE=1`); (b) Zed-style separate native CLI binary bundled next to the app. Zed's shape is possible because the CLI is small (IPC talker, not the full editor logic).
- For Open Knowledge, shape (a) is the better fit because `ok mcp` and `ok init` are substantial — they need the server package's code. Re-using the Electron runtime via `ELECTRON_RUN_AS_NODE=1` avoids shipping two runtimes.

---

### Finding: Zed's CLI is a thin IPC client talking to a running desktop instance

**Confidence:** CONFIRMED
**Evidence:** `crates/cli/src/cli.rs` IPC protocol definitions

The Rust CLI defines an IPC handshake structure:

```rust
pub struct IpcHandshake {
  pub requests: ipc::IpcSender<CliRequest>,
  pub responses: ipc::IpcReceiver<CliResponse>,
}

// CliRequest::Open { paths, urls, ... }
```

When the user runs `zed ~/my-project`, the CLI does NOT spawn a new Zed instance — it connects to the running Zed process (or launches + connects if none) and sends an `Open` request. Responses include status messages, prompts, and wait-signals (for `--wait` behavior).

**Implications:**

- This is the same architectural pattern as VS Code's `code --wait` and Sublime's `subl --wait`: the CLI is an IPC talker, not a standalone editor launcher.
- For Open Knowledge: `ok` (no args) could similarly detect a running OK.app and focus it vs. launching a new instance. **However** OK Electron spec D24 already decided: every project pick spawns a new editor window; there is no switch-in-place UX. So OK's `ok` CLI behavior differs — it always launches a new window, and the subcommands (`ok mcp`, `ok init`) are standalone (no IPC to running app). This is a simpler model.

---

### Finding: Zed's CLI install has a known app-translocation bug (same as VS Code's)

**Confidence:** CONFIRMED
**Evidence:** [zed-industries/zed#5276](https://github.com/zed-industries/zed/issues/5276)

User-reported failure mode (verbatim):

> "symlink in `/usr/local/bin` was not what I expected. It pointed to `/private/var/folders/lp/053qjqyj1cg5gx_23kr9fphc0000gn/T/AppTranslocation/EB60641D-B689-46D7-853D-7875F0B9FFCA/d/Zed.app/Contents/MacOS/cli`"

Expected target: `/Applications/Zed.app/Contents/MacOS/cli`.

Root cause: macOS app translocation copies the .app to a temp dir (triggered when launched from Downloads, DMG mount, or third-party launchers like Alfred). The CLI install reads its own `.app` path AT INSTALL TIME — if that path is the translocated temp path, the symlink permanently points there.

No Zed-side fix was documented at the time of the issue. The reporter references TextMate and Sublime Text discussions of the same class of bug.

**Implications (echoes VS Code finding):**

- **This is a universal bug class** across every editor that symlinks into its `.app` bundle on macOS. Whether the CLI is a shell script (VS Code) or a Rust binary (Zed), translocation poisons the install if invoked before the user drags the app to `/Applications/`.
- Open Knowledge's M6 implementation of "Install Command-Line Tools…" MUST detect translocation and refuse to install, directing the user to move the app first. Detection: check `app.getPath('exe').includes('/AppTranslocation/')` or `/private/var/folders/` prefix in the executable path.

---

## Gaps / follow-ups

- **Admin prompt in Zed**: not explicitly fetched — `/usr/local/bin` requires admin on most systems, so Zed almost certainly surfaces one, but the specific mechanism (osascript? `sudo`? AuthorizationServices?) isn't captured here.
- **Zed on Windows**: Zed ships Linux + macOS first-class; Windows is in preview. Windows install mechanism not investigated.
