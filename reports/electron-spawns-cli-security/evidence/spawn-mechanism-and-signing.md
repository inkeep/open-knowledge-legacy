# Evidence: Electron-spawns-CLI security — mechanism, signing, threat model

**Dimension:** Spawn mechanism, hardened runtime, quarantine, threat-model comparison
**Date:** 2026-04-27
**Sources:** Apple Developer docs, Electron docs, electron-builder docs/issues, Bun GitHub issues, prior OK research reports under `reports/`.

---

## Key files / pages referenced

- [Apple — Configuring the hardened runtime](https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime) — entitlement semantics
- [Apple Developer Forums #732370 — Gatekeeper does not lift the quarantine attribute of a signed binary](https://developer.apple.com/forums/thread/732370)
- [Eclectic Light Co — Quarantine and the quarantine flag](https://eclecticlight.co/2020/10/29/quarantine-and-the-quarantine-flag/)
- [HackTricks — macOS Gatekeeper / Quarantine / XProtect](https://book.hacktricks.xyz/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-gatekeeper)
- [oven-sh/bun#29120 — macOS code-signature truncation](https://github.com/oven-sh/bun/issues/29120) (closed via PR #29272)
- [microsoft/vscode#310090 — standalone CLI version handshake refuses on mismatch](https://github.com/microsoft/vscode/issues/310090)
- `reports/electron-bundled-cli-install-patterns/REPORT.md` (D9, D11) — signing inheritance + entitlements
- `reports/electron-bundled-cli-install-patterns/evidence/signing-notarization-and-lifecycle.md` — full lifecycle
- `reports/ai-coding-tools-cross-install-coordination/evidence/claude-code.md` (D1, D3a) — Claude Code/Desktop bundled-CLI shape
- `reports/electron-desktop-app-operations-2025/evidence/code-signing.md` — entitlement inventory
- `reports/mastra-speakeasy-cli-install-recommendations/REPORT.md` (D8) — single-file CLI distribution patterns
- `specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` — D52 LOCKED bundled-CLI design

---

## Findings

### Finding 1 — Hardened runtime governs the *parent* process; spawned children run under their own bundle attributes

**Confidence:** CONFIRMED
**Evidence:** [Apple — Configuring the hardened runtime](https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime), Apple Developer Forums #120647 + #706390.

Hardened Runtime is per-process: it constrains library injection, JIT, dyld environment, and similar behaviors *inside* the process whose code signature carries the entitlements. When that process calls `posix_spawn` / `execve`, the resulting child is a separate process with its own code signature and entitlement set. The child does NOT need to be signed by the same Team ID; macOS does not enforce a same-team check on `exec`-style transitions.

**App Sandbox** (a different feature, opt-in) does propagate to children via `com.apple.security.inherit`. Hardened Runtime alone does not. OK's desktop is hardened-runtime + non-sandboxed (per `entitlements.mac.plist` in the M2 spec), so this distinction matters: spawning a CLI child is not blocked by entitlement inheritance rules.

**Implications:**
- The desktop spawning an external `ok` binary on PATH is *allowed* by hardened-runtime; macOS does not refuse it for not being same-team.
- Whether a *foreign* binary on PATH is "safe" is a threat-model question (Finding 4), not a hardened-runtime question.

---

### Finding 2 — First-launch Gatekeeper checks gate on the quarantine xattr; binaries copied from a notarized .app inherit no quarantine

**Confidence:** CONFIRMED
**Evidence:** [Eclectic Light Co — Quarantine and the quarantine flag](https://eclecticlight.co/2020/10/29/quarantine-and-the-quarantine-flag/), [HackTricks — macOS Gatekeeper](https://book.hacktricks.xyz/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-gatekeeper), [Apple Developer Forums #732370](https://developer.apple.com/forums/thread/732370).

The `com.apple.quarantine` extended attribute is added by quarantine-aware downloaders (Safari, Chrome, Mail) and by `LSFileQuarantineEnabled`-flagged apps. Gatekeeper invokes its signature/notarization check on first execution *only when this xattr is present on the executable being launched*. Files copied via `cp`/`fs.copyFile`/`fs.symlink` from inside a `.app` bundle do NOT inherit the quarantine xattr; the source's xattr lives on the bundle root, not on inner files.

When a user double-clicks a downloaded DMG, the DMG and the contained `.app` carry the quarantine xattr; Gatekeeper runs once at first-launch on the `.app` and (per the linked thread) does not lift the xattr from a signed app. But binaries that the running `.app` later copies to user-writable locations (e.g., `/usr/local/bin/`, `~/.ok/bin/`) are not flagged — they're produced by an already-trusted process.

**Implications:**
- A binary copied from `Contents/Resources/cli/` to `/usr/local/bin/ok` (M6 model) does not trigger a separate Gatekeeper challenge on first invocation. There is no "second trust dialog."
- A symlink at `/usr/local/bin/ok` → in-bundle path inherits no quarantine; invoking it executes the in-bundle file under whatever signature/entitlements the bundle carries.

---

### Finding 3 — In M6/D52, "spawning the CLI" means re-invoking the signed Electron binary in Node mode, not running a separate executable

**Confidence:** CONFIRMED
**Evidence:** `reports/electron-bundled-cli-install-patterns/evidence/signing-notarization-and-lifecycle.md` §"Signing and the wrapper-script model interact cleanly", `specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` D52.

The VS Code lineage's bundled-CLI mechanism (inherited unchanged by Cursor, Windsurf, Trae; locked into OK's M6 by D52) is:

1. `Contents/Resources/cli/bin/ok.sh` — shell wrapper (~30 LOC) that sets `ELECTRON_RUN_AS_NODE=1`.
2. `Contents/Resources/cli/dist/cli.mjs` — the published CLI's compiled JS.
3. `/usr/local/bin/ok` — symlink to the wrapper.
4. The wrapper invokes the parent app's signed Electron binary with `ELECTRON_RUN_AS_NODE=1` + path to `cli.mjs`. There is no separate Node interpreter.

Net effect: the binary that runs when the desktop (or terminal user) invokes `ok` is the *same* signed Mach-O at `Contents/MacOS/Open Knowledge` that the OS launched as the GUI. It just runs in Node mode this time. Same Developer ID signature. Same notarization ticket. Same hardened-runtime entitlements (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` already on the M2 build).

**Implications:**
- The "desktop spawns an unsafe CLI binary" framing does not apply to the M6 path. The CLI binary IS the desktop, signed and notarized as one unit.
- Per `evidence/signing-notarization-and-lifecycle.md`: "No new entitlements needed for M6."

---

### Finding 4 — The actual unsigned-spawn surface for OK is `npx @inkeep/open-knowledge mcp` in editor MCP configs

**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/editors.ts:24-25` (in-tree); `reports/ai-coding-tools-cross-install-coordination/evidence/claude-code.md` D3a.

`ok init` writes `{command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']}` into editor MCP configs. Every editor launch:
1. Spawns the user's local `npx`/`node`/`bun` (whatever's on PATH; not signed by OK, not under OK's control).
2. `npx` resolves `@inkeep/open-knowledge` to a tarball in the npm cache (signed by no one in the macOS sense; npm package signing is a different layer entirely).
3. The tarball's `dist/cli.mjs` runs under that interpreter.

This is the spawn that crosses an unsigned-code-trust boundary in OK's deployment. Notably:

- D52 already addresses **Electron-origin** MCP configs (those written by the desktop app's init flow): they get `{command: '/usr/local/bin/ok', args: ['mcp']}` — absolute path into the signed bundle. ✓
- D52 leaves **CLI-origin** MCP configs as `npx`. The trade-off is intentional: `npx` self-heals after CLI reinstalls; an absolute path doesn't.
- The exposure is approximately the same as any tool a developer installs via npm and auto-launches via editor config — broad ecosystem norm. It is not specifically a desktop-app-spawning-CLI concern.

**Implications:**
- The user's "unsafe CLI binary" worry maps cleanly to *this* surface, not to the desktop-app-spawning-bundled-binary surface. Path A vs B doesn't change it; both paths still write `npx ... mcp` for CLI-origin configs.
- Mitigation, if pursued, is the `--pin` flag in the cross-install-handshake spec (G7). Optional; not load-bearing for security if one trusts npm.

---

### Finding 5 — Bun --compile signing gap closed (April 2026); single-file signed CLI is now technically feasible

**Confidence:** CONFIRMED
**Evidence:** [oven-sh/bun#29120](https://github.com/oven-sh/bun/issues/29120) (closed) + [PR #29272](https://github.com/oven-sh/bun/pull/29272).

The `bun build --compile --target=bun-darwin-arm64` macOS code-signature truncation bug (latent in `src/macho.zig`'s `sig_size` calculation, exposed when the runtime grew ~337 KB between Bun 1.3.11 and 1.3.12) was fixed via PR #29272. As of the fix, single-file Bun-compiled binaries on macOS can be `codesign`-ed and notarized cleanly.

This is a **status update** to `reports/mastra-speakeasy-cli-install-recommendations/REPORT.md` D8, which reported the issue as open (April 2026) blocking production use. That blocker is gone.

**Implications:**
- A future "Path B+" — ship `ok` as a self-contained signed Bun-compiled Mach-O — is no longer technically blocked.
- Whether to actually do this is a *separate* judgment; the wrapper-script + bundled-Electron-as-Node pattern (M6) doesn't need it. Adding a parallel signed-binary distribution would double the signing surface for marginal user benefit (the first launch isn't faster; the security floor isn't higher because the wrapper already runs signed code).
- Worth knowing the door is open if a future scenario materializes (e.g., desktop optionally runs without a bundled Electron-as-Node, or a Homebrew Cask wants a leaner artifact).

---

### Finding 6 — How Claude Code, VS Code, Cursor handle this — empirical synthesis

**Confidence:** CONFIRMED
**Evidence:** `reports/ai-coding-tools-cross-install-coordination/evidence/claude-code.md` D1; `reports/electron-bundled-cli-install-patterns/REPORT.md` D1, D2.

- **Claude Desktop** ships a bundled CLI at `~/Library/Application Support/Claude/claude-code/<ver>/`, NOT exported to PATH. The desktop invokes its bundled CLI directly; terminal users install separately via the native installer (`~/.local/bin/claude`) or npm (`@anthropic-ai/claude-code`). Two coexisting CLIs at different versions on one machine is documented and routine (the cited report's authoring machine had v2.1.119 native + v2.1.111 bundled simultaneously).
- **VS Code** ships the wrapper-script + symlink pattern (`Contents/Resources/app/bin/code` → `/usr/local/bin/code` via a "Shell Command: Install 'code' command in PATH" menu action). Inherited unchanged by Cursor, Windsurf, Trae, Atom (defunct). ~12 years of production hardening.
- **Cursor** additionally ships a separately-distributed `cursor-agent` AI CLI via `curl | bash` to `~/.local/bin/`. Two distinct CLIs from one company. OK's choice of one binary (`ok`) with subcommands sidesteps this user-confusion surface.
- **Cross-install version handshake**: only VS Code documents a hard-refuse on mismatch ([microsoft/vscode#310090](https://github.com/microsoft/vscode/issues/310090)) — and it's a binary↔binary check, not a disk-state-mediated gate. Claude Code/Desktop, Cursor, Windsurf, Zed, Warp do not version-handshake at all.

**Implications:**
- OK's M6/D52 design lands squarely in the dominant cohort.
- The OK cross-install-handshake spec (`specs/2026-04-24-cross-install-version-handshake/SPEC.md`) would be *novel* for the cohort. That's not by itself bad — it's a real correctness improvement — but the empirical baseline is "everyone tolerates silent drift."

---

## Negative searches

- "macOS hardened runtime requires same-team signing for spawned children" → NOT FOUND. Multiple Apple Developer Forums threads (#120647, #706390) clarify hardened runtime is per-process; same-team is required only for *library injection* (`disable-library-validation` lifts even that). `exec` of a child is not gated.
- "Gatekeeper second-launch check on binary copied out of .app" → NOT FOUND. The xattr is the gate; copies don't carry it.

---

## Gaps / follow-ups

- **electron-updater + bundled-CLI atomicity**: when the app auto-updates, does the `Contents/Resources/cli/` subtree update atomically with the rest of `.app`, or is there a window where `/usr/local/bin/ok` resolves to an inconsistent state? Assumed safe (the whole `.app` is replaced atomically), not verified empirically. Tracked in `reports/electron-bundled-cli-install-patterns/evidence/signing-notarization-and-lifecycle.md` follow-ups.
- **Translocation + bundled CLI**: noted in the bundled-CLI report (#209356 / #5276); covered there with a runtime guard. Not unique to spawn-security.
- **Intel Mac collision at `/usr/local/bin/ok`** with Homebrew Node: documented in `reports/electron-bundled-cli-install-patterns/evidence/npm-electron-coexistence.md` — last-writer-wins, but symmetric-fail-safe (npm errors `EEXIST`, OK install prompts).
