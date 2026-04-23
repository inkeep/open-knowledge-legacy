# Evidence: Install mechanisms — symlink vs wrapper script vs PATH append

**Dimension:** D6, D7 (install mechanism matrix + permission model)
**Date:** 2026-04-21
**Sources:** Aggregated from other evidence files + cross-referenced

---

## Findings

### Finding: Three distinct install shapes exist, with different tradeoffs

**Confidence:** CONFIRMED (observed across 7 Electron/desktop apps)

| Shape | Exemplar | What's placed in PATH | Target behavior |
|---|---|---|---|
| A. **Symlink to shell-wrapper in bundle** | VS Code, Atom, Cursor, Windsurf | Symlink at `/usr/local/bin/code` → `/Applications/VS Code.app/Contents/Resources/app/bin/code` (which IS a bash script) | Wrapper script resolves symlink chain, sets `ELECTRON_RUN_AS_NODE=1`, invokes Electron main binary with CLI JS as arg |
| B. **Symlink to native binary in bundle** | Zed, Docker Desktop | Symlink at `/usr/local/bin/zed` → `/Applications/Zed.app/Contents/MacOS/cli` (a compiled Rust binary) | Binary runs directly; may use IPC to talk to running instance |
| C. **PATH append (no symlink)** | Sublime, VS Code "manual alternative" | `export PATH="$PATH:/Applications/.../bin"` appended to `~/.zshrc` | In-bundle `bin/` becomes part of user PATH; survives symlink-less install |

**Implications:**

- **Shape A (VS Code)**: lightweight (one small shell script per app), re-uses Electron's bundled Node, no extra binary to sign/notarize separately. Cons: requires `/usr/bin/env bash` present (universal on macOS); wrapper has to defend against macOS sh quirks.
- **Shape B (Zed)**: self-contained native binary. Pros: fast startup (no Node boot); explicit IPC layer. Cons: ships a second native binary to sign/notarize; IPC protocol is a maintenance surface.
- **Shape C (Sublime)**: no root escalation ever. Cons: leaky — renaming the app or moving to a non-default location breaks PATH; no version coupling enforcement; user friction.

**For Open Knowledge**: Shape A is the right default. The spec D52 already converged on this. Shape B would mean compiling `packages/cli` to a native binary (via `bun build --compile`); Shape C is a documented fallback for admin-refusal cases.

---

### Finding: `ELECTRON_RUN_AS_NODE=1` is the enabling technology for Shape A

**Confidence:** CONFIRMED
**Evidence:** VS Code `code.sh` + Electron documentation

The line in VS Code's wrapper:

```bash
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
```

sets an environment variable that Electron's main binary honors: instead of initializing Chromium and opening a window, it spawns as a plain Node.js process and executes the JS file given as argv[0]. This is an official Electron API, documented at the Electron docs site under `app.getAppPath()` / environment variables.

Without this flag, invoking `Contents/MacOS/Electron` would launch the GUI app. With it, Electron's Node runtime becomes a de-facto `node` binary for the bundled JS.

**Implications:**

- The VS Code pattern does NOT ship a separate `node` binary inside the `.app`. The `cli.js` is transpiled ESM/CJS runnable by the Electron-embedded Node.
- For Open Knowledge: `packages/cli/dist/cli.mjs` already works under Bun (current CLI distribution). For the Electron-bundled CLI, the bundled `cli.mjs` can run under Electron's Node runtime via `ELECTRON_RUN_AS_NODE=1` — no Bun install required for P1 desktop users.
- **However**: Bun-specific features (like Bun's built-in sqlite, shell API, etc.) won't work under Node-mode Electron. Audit `packages/cli/` for Bun-specific imports before assuming this pattern works unchanged. Known good: Commander.js v14 (pure Node), YAML config loader (pure Node). Known risk: any `bun:*` imports.

---

### Finding: `/usr/local/bin` is the uncontested target on macOS

**Confidence:** CONFIRMED
**Evidence:** Apple SIP docs + every precedent app

`/usr/local/bin` is the standard location for user-installed command-line tools on macOS:

- NOT protected by System Integrity Protection (SIP) — writable by admin. `/usr/bin` IS SIP-protected and read-only since Catalina.
- Pre-included in the default zsh / bash PATH on macOS (via `/etc/paths` or `/etc/paths.d/`).
- Every surveyed editor (VS Code, Atom, Cursor, Zed, Docker Desktop default) targets this path.

On Apple Silicon, Homebrew installs to `/opt/homebrew/bin/` and may or may not add `/usr/local/bin/` to PATH depending on user setup. This is a minor divergence — OK's D52 plan still uses `/usr/local/bin/` because that's the Intel-Mac-default + explicit-in-PATH location.

**Implications:**

- Sticking with `/usr/local/bin/ok` is the right call. No need to detect `/opt/homebrew/bin/` — any user with Homebrew on Apple Silicon already has PATH configured correctly for both.
- On a VERY fresh Apple Silicon machine without Homebrew, `/usr/local/bin/` may not be pre-created. The install action should `mkdir -p /usr/local/bin/` (requires admin) before symlinking.

---

### Finding: Admin prompts via `osascript` are portable across macOS 11–15

**Confidence:** INFERRED (behavioral stability observed, no Apple breaking change announced)

The `osascript -e 'do shell script "..." with administrator privileges'` pattern has been stable since macOS 10.x. It surfaces the standard system authorization dialog (username + password or Touch ID on Apple Silicon). No macOS version through Sequoia (15.x) has broken or deprecated this API.

Alternatives considered and rejected:

- **`AuthorizationServices.framework`** (pure C API) — more complex; useful for tools that need to persist the authorization ticket across invocations. Overkill for a one-time symlink install.
- **`sudo`** — requires user to have `sudo` configured; breaks for non-admin users (many enterprise-managed Macs).
- **setuid helper tool** — Apple discourages. Requires separate installer package.

**Implications:** VS Code's approach (spawn `osascript`, wait for exit code) is the right answer. Non-zero exit = user cancelled; display helpful error, don't retry. OK M6 should follow this pattern directly.

---

### Finding: electron-builder's `extraResources` lands files in `Contents/Resources/`; `app.asar.unpacked/` holds binaries that must be outside the ASAR archive

**Confidence:** CONFIRMED
**Evidence:** [electron-builder docs](https://www.electron.build/configuration.html) + [issue #3940](https://github.com/electron-userland/electron-builder/issues/3940)

From electron-builder docs (verbatim):

> "extraResources: A glob patterns relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux and Windows)."

Placement discipline for OK's bundled CLI:

- **Shell wrapper** (e.g., `ok.sh`): `extraResources: "path/to/ok.sh"` → `Contents/Resources/ok.sh`. Small, plain-text — no signing concerns.
- **`packages/cli/dist/`** (JS + deps): same treatment — `extraResources: { from: "../cli/dist", to: "cli" }` → `Contents/Resources/cli/cli.mjs` (and node_modules). Already defined in OK Electron spec §8.9.
- **Native modules** (e.g., `@napi-rs/keyring` on the server side): MUST be in `app.asar.unpacked/` because Node can't `require()` .node binaries from inside an ASAR archive. OK spec §8.9 already has asarUnpack globs for `@parcel/watcher` + `@napi-rs/keyring`.

Known issue ([#3940](https://github.com/electron-userland/electron-builder/issues/3940)): executables in `app.asar.unpacked/` may not be signed automatically by electron-builder in some configurations. Workaround: use `afterSign` hook OR enumerate in `mac.binaries` config.

---

## Gaps / follow-ups

- **Bun-specific imports in `packages/cli/`**: not audited here. If `packages/cli/src/cli.ts` or any transitive dep imports `bun:*`, the Electron-Node-mode approach breaks. Needs a one-off audit before M6 implementation.
- **Windows installer PATH**: NSIS / MSI conventions not covered — `[HKCU\Environment]\Path` manipulation, `[HKLM\...]` for system PATH. Out of scope for OK M2-M3 but needed for Windows release.
