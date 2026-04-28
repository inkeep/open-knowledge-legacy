---
title: "Electron Spawns CLI: Security Implications and the Path A vs B Decision"
description: "Threat-model synthesis for Open Knowledge's distribution-architecture fork. Resolves the 'is the desktop opening an unsafe CLI binary?' worry by tying together prior research on bundled-CLI install patterns, cross-install coordination, hardened runtime, and Bun-compile signing. Concludes that M6/D52 (already locked) is Path B in everything but name; the actual unsigned-spawn surface is `npx ... mcp` in editor MCP configs, not the desktop-spawning-bundled-binary case."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - Open Knowledge
  - Electron
  - electron-builder
  - Visual Studio Code
  - Claude Code
  - Claude Desktop
  - Cursor
  - Bun
  - Apple Hardened Runtime
  - macOS Gatekeeper
topics:
  - Electron spawning CLI subprocess
  - hardened runtime entitlement inheritance
  - Gatekeeper quarantine flag
  - signed CLI distribution
  - npm-spawned MCP threat model
  - bundled CLI security
---

# Electron Spawns CLI: Security Implications and the Path A vs B Decision

**Purpose:** The reader is choosing between Path A (DMG bundles the server, cross-install handshake addresses drift) and Path B (DMG installs a CLI on first launch and spawns the same binary terminal users run). The user's anchoring concern is that "the desktop app opens an unsafe CLI binary" — they want to know whether the spawned binary can be signed like the DMG, how comparable apps handle this, and whether security risk is the deciding factor.

This report resolves that question by tying together what existing OK research already covered piecemeal, with three targeted verification points (hardened-runtime spawn rules, quarantine inheritance, current Bun --compile signing status).

---

## Executive Summary

**The "unsafe CLI binary" concern does not apply to Path B as OK has already locked it.** Open Knowledge's M6 design (D52, locked 2026-04-17 in [`specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`](../../specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md)) adopts the VS Code wrapper-script pattern: `ok` lives inside the signed `.app` bundle as a small shell wrapper plus the published JS, and `/usr/local/bin/ok` is a symlink to the wrapper. When the desktop "spawns the CLI," the wrapper invokes the parent app's *own* signed Electron binary in Node mode (`ELECTRON_RUN_AS_NODE=1`). Same Developer ID. Same notarization ticket. Same hardened-runtime entitlements. There is no separate "CLI binary" to be unsafe.

**The actual unsigned-spawn surface in OK's deployment is `npx @inkeep/open-knowledge mcp`** in `ok init`-written editor MCP configs (`packages/cli/src/commands/editors.ts:24-25`). Every editor launch spawns whichever interpreter `npx` resolves to and runs the npm-cached tarball through it. Path A vs Path B does not change this — both paths still write `npx ... mcp` for CLI-origin configs. If the worry is unsigned spawn, that surface is where to address it (the cross-install-handshake spec's `--pin` option, or a more aggressive shift to absolute paths).

**Bun --compile signing for macOS is no longer blocked** — the truncation bug ([oven-sh/bun#29120](https://github.com/oven-sh/bun/issues/29120)) was closed via PR #29272 in April 2026. A future "Path B+" ship of `ok` as a self-contained signed Mach-O is now feasible. It does not improve security over the wrapper-script model and adds doubled signing surface, so it should remain a non-goal absent a concrete forcing function.

**Recommended decision:** Adopt **Path B** (the M6/D52 architecture is already this; it doesn't need reframing). Drop the heaviest pieces of the cross-install-handshake spec — kill-and-restart dialog, `executablePath`, `describeLockHolder`, direction-asymmetric refuse — because Path B makes them unreachable in normal use. **Keep** the durable-state schema gate (`.open-knowledge/state.json`) because it protects against on-disk format drift on cold start, which Path B does not address. Keep `--pin` as an opt-in for users who want reproducible MCP launches.

---

## Research Rubric

**Report Type:** Conclusions report (recommendation tied to evidence).
**Primary Question:** When an Electron desktop app spawns a CLI binary on macOS, what is the security delta between Path A (DMG bundles server, cross-install handshake), Path B (DMG bundles CLI, exposes via PATH symlink, both surfaces spawn the same binary), and Path C (DMG requires external CLI install)? When is signing the CLI binary load-bearing?
**Stance:** Conclusions — recommendation is named.
**Audience:** OK staff making the distribution-architecture decision; future readers re-litigating it.

| Dimension | Depth | Priority |
|---|---|---|
| D1 — Hardened runtime spawn rules (entitlement inheritance, same-team requirement) | Light | P0 |
| D2 — First-launch quarantine and Gatekeeper on bundled-CLI / symlinked binary | Light | P0 |
| D3 — What "spawning the CLI" actually means in M6/D52 | Light | P0 |
| D4 — The actual unsigned-spawn surface (`npx ... mcp`) | Light | P0 |
| D5 — Bun --compile signing status | Light | P1 |
| D6 — Empirical: Claude Code, VS Code, Cursor patterns | Light | P0 |

**Non-goals:** re-deriving the VS Code wrapper pattern (covered in [`reports/electron-bundled-cli-install-patterns/`](../electron-bundled-cli-install-patterns/REPORT.md)); Apple Developer Program enrollment ([`reports/apple-developer-program-enrollment/`](../apple-developer-program-enrollment/REPORT.md)); generic Electron operations ([`reports/electron-desktop-app-operations-2025/`](../electron-desktop-app-operations-2025/REPORT.md)); Mac App Store distribution (separate decision, separate constraints).

---

## Detailed Findings

### D1 — Hardened runtime governs the *parent* process; spawned children run under their own bundle attributes

**Finding:** Hardened Runtime is per-process. When a hardened-runtime app calls `posix_spawn` / `execve`, the resulting child is a separate process with its own code signature and entitlement set. macOS does not enforce a same-Team-ID check on the child. App Sandbox (a different feature, opt-in) does propagate to children via `com.apple.security.inherit`; Hardened Runtime alone does not. OK's desktop is hardened-runtime + non-sandboxed (per the M2 entitlements file).

**Evidence:** [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) (Finding 1).

**Implications:**
- The desktop spawning *any* binary on PATH is allowed by hardened-runtime; macOS does not refuse it for not being same-team.
- Whether a foreign binary on PATH is "safe" is a threat-model question, not an entitlement question.
- D9 of the bundled-CLI report's claim — "no new entitlements needed for M6" — holds.

---

### D2 — First-launch Gatekeeper checks gate on the quarantine xattr; binaries copied out of a notarized .app inherit no quarantine

**Finding:** `com.apple.quarantine` is added by quarantine-aware downloaders and `LSFileQuarantineEnabled`-flagged apps. Gatekeeper invokes its signature/notarization check on first execution **only when this xattr is present**. Files copied via `cp` / `fs.copyFile` / `fs.symlink` from inside a `.app` bundle do not inherit the xattr; the xattr lives on the bundle root, not on inner files. A binary at `/usr/local/bin/ok` that was symlinked-from or copied-from `Contents/Resources/cli/` does not trigger a separate first-launch Gatekeeper challenge.

**Evidence:** [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) (Finding 2). Background: [Eclectic Light Co — Quarantine and the quarantine flag](https://eclecticlight.co/2020/10/29/quarantine-and-the-quarantine-flag/), [Apple Developer Forums #732370](https://developer.apple.com/forums/thread/732370).

**Implications:**
- No "second trust dialog" when the desktop creates the `/usr/local/bin/ok` symlink and a terminal user invokes it.
- Gatekeeper trust flows through the parent bundle's notarization ticket; the symlink target inherits that trust.

---

### D3 — In M6/D52, "spawning the CLI" means re-invoking the signed Electron binary in Node mode

**Finding:** The VS Code wrapper-script pattern (locked in OK by D52) places `ok.sh` and `cli.mjs` inside `Contents/Resources/cli/`. The wrapper sets `ELECTRON_RUN_AS_NODE=1` and invokes the parent app's signed Electron binary (`Contents/MacOS/Open Knowledge`) with the path to `cli.mjs`. There is no separate Node interpreter shipped. The binary that runs as `ok` is the *same* signed Mach-O that runs as the GUI.

**Evidence:** [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) (Finding 3); [`reports/electron-bundled-cli-install-patterns/evidence/signing-notarization-and-lifecycle.md`](../electron-bundled-cli-install-patterns/evidence/signing-notarization-and-lifecycle.md).

**Implications:**
- The "desktop spawns an unsafe CLI binary" framing is mis-anchored. The CLI binary IS the signed desktop, in Node mode.
- The hardened-runtime entitlements OK already ships in M2 (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`) cover both the GUI and the `ELECTRON_RUN_AS_NODE` invocation. No new entitlement plist needed.

---

### D4 — The actual unsigned-spawn surface is `npx @inkeep/open-knowledge mcp` in editor MCP configs

**Finding:** `ok init` writes `{command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']}` for CLI-origin editor MCP configs. Every editor launch spawns the user's local `npx` (not signed by OK), which resolves the npm tarball (signed by no one in the macOS sense) and runs `dist/cli.mjs` under whichever Node/Bun is on PATH. D52 already addresses Electron-origin configs by hard-coding `/usr/local/bin/ok` (in-bundle, signed); CLI-origin configs intentionally remain unpinned for `npx`-style self-healing.

**Evidence:** [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) (Finding 4); `packages/cli/src/commands/editors.ts:24-25`.

**Implications:**
- This is the only *crosses-an-unsigned-trust-boundary* spawn in OK's deployment. The threat is approximately the same as any npm-installed dev tool the user auto-launches via editor config — a broad ecosystem norm, not specifically a desktop-app concern.
- Path A vs B does not change this surface. Both paths leave the CLI-origin MCP write as `npx`.
- If OK chooses to address this, the cross-install-handshake spec's [G7 `ok init --pin`](../../specs/2026-04-24-cross-install-version-handshake/SPEC.md) is the existing, opt-in mitigation.

---

### D5 — Bun --compile signing for macOS is no longer blocked

**Finding:** [oven-sh/bun#29120](https://github.com/oven-sh/bun/issues/29120) (macOS code-signature truncation in `bun build --compile`) was closed via PR #29272. The truncation was caused by a `sig_size` calculation in `src/macho.zig` that became insufficient when the runtime grew ~337 KB between Bun 1.3.11 and 1.3.12. The fix landed in April 2026.

**Evidence:** [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) (Finding 5). This is a status update relative to [`reports/mastra-speakeasy-cli-install-recommendations/REPORT.md`](../mastra-speakeasy-cli-install-recommendations/REPORT.md) D8, which reported the issue as open.

**Implications:**
- A self-contained signed Mach-O distribution of `ok` (separate from the Electron-as-Node bundled CLI) is now technically feasible.
- It does *not* improve security over the wrapper-script model: the wrapper already runs signed code (the parent Electron binary). Adding a parallel signed-binary distribution doubles the signing/notarization surface for marginal user benefit.
- Worth knowing the door is open if a future scenario requires it (Homebrew Cask wanting a leaner artifact, or Path B+ where the desktop ships without bundled Electron-as-Node). Not a current need.

---

### D6 — How Claude Code, VS Code, Cursor handle this — empirical synthesis

**Finding:** Three patterns in the cohort:
- **Claude Desktop** ships a bundled CLI at `~/Library/Application Support/Claude/claude-code/<ver>/`, NOT exported to PATH. Terminal users install separately (native installer, npm, Homebrew). Two coexisting CLIs at different versions on one machine is documented and routine.
- **VS Code** ships the wrapper-script + symlink pattern. Inherited unchanged by Cursor, Windsurf, Trae, Atom (defunct). ~12 years of production hardening.
- **Cross-install version handshake**: only VS Code documents a hard-refuse on mismatch ([microsoft/vscode#310090](https://github.com/microsoft/vscode/issues/310090)) — and it's a binary↔binary handshake, not a disk-state-mediated gate. Claude Code/Desktop, Cursor, Windsurf, Zed, Warp do not version-handshake at all.

**Evidence:** [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) (Finding 6); [`reports/electron-bundled-cli-install-patterns/REPORT.md`](../electron-bundled-cli-install-patterns/REPORT.md) D1, D2; [`reports/ai-coding-tools-cross-install-coordination/evidence/claude-code.md`](../ai-coding-tools-cross-install-coordination/evidence/claude-code.md) D1, D3a.

**Implications:**
- OK's M6/D52 design lands in the dominant cohort; not novel.
- The OK cross-install-handshake spec would be *novel* — a real correctness improvement, but the empirical baseline is "tolerate silent drift." This raises a calibration question: how aggressive should OK be relative to the cohort norm?

---

## Recommendation

**Adopt Path B (already locked as M6/D52). Reduce the cross-install-handshake spec significantly.**

The Path A architecture exists to manage drift between two independent server runtimes (DMG-bundled vs CLI). Path B makes them the same runtime: the desktop's "server" is the same `ok` binary terminal users invoke, just running with a different argv. Several major spec items become unreachable:

| Spec item | Status under Path B |
|---|---|
| Lock-version mismatch desktop attach | **Unreachable** — desktop spawns its own bundled `ok`, can't mismatch itself |
| Kill-and-restart dialog (G4) | **Unreachable** — same |
| Direction-asymmetric refuse (G5, D4) | **Unreachable** — same |
| `executablePath` in lock + `describeLockHolder` | **Unnecessary** — diagnostic-only field with no consumer |
| MCP exit-1 on protocol mismatch (G6) | **Still useful** for `npx` spawns where version *can* drift |
| `.open-knowledge/state.json` durable schema (G2) | **Still useful** — protects against on-disk format drift on cold start; Path B doesn't address this |
| `ok init --pin` (G7) | **Still useful** — opt-in mitigation for the `npx` spawn surface (D4) |

The remaining high-value spec items are:
1. The `state.json` durable-schema gate (handles the cold-start version-blind read of shadow repo).
2. MCP `protocolVersion` check on the `npx`-spawned MCP child against the live lock owner.
3. `--pin` as opt-in for users who want determinism.

That's a much smaller PR — likely two PRs (state-manifest, protocol gate) instead of six.

**Why not Path A** (despite the spec being good work)? Path A solves a problem that Path B structurally eliminates. The handshake mechanism is architecturally sound but addresses an absent failure mode if Path B holds.

**Why not Path C** (require CLI installed first)? Loses the zero-terminal Mac user journey, which the M6 design explicitly preserves.

**Watch-outs:**
- **Mac App Store path closed**: Path B (writing to `/usr/local/bin/`) is forbidden by MAS sandboxing. If MAS distribution is ever a strategic goal, this decision needs revisiting. M6's spec already non-goals MAS for v1.
- **Intel Mac collisions** at `/usr/local/bin/ok`: documented in the bundled-CLI report's `npm-electron-coexistence.md` evidence; symmetric-fail-safe (npm errors, OK install prompts).
- **Translocation bug**: VS Code and Zed both have it; OK's M6 spec includes a runtime guard.
- **Bun --compile in scope**: explicitly NOT recommended for v1. It's now feasible but brings doubled signing surface for no security improvement.

---

## Limitations & Open Questions

### Dimensions covered at moderate confidence

- **electron-updater + bundled-CLI atomicity** during in-place auto-update: assumed safe (whole `.app` is replaced atomically), not empirically verified. Tracked in the bundled-CLI report's gaps.
- **Path B's interaction with future OS-level codesigning policy changes**: macOS Sequoia removed right-click-Open bypass; future versions may add similar friction to symlink-from-`/Applications/`-to-`/usr/local/bin/` patterns. Watch Apple's developer forums.

### Out of scope

- Windows / Linux equivalents — Path B applies on macOS; cross-platform is out of scope per the broader Electron desktop spec D51.
- Mac App Store distribution — separate decision, separate constraints; M6 non-goals MAS.
- npm package signing / Sigstore-style supply-chain verification — different layer; not addressed by macOS code signing.

---

## References

### Evidence Files

- [evidence/spawn-mechanism-and-signing.md](evidence/spawn-mechanism-and-signing.md) — the load-bearing synthesis with citations

### External Sources

- [Apple — Configuring the hardened runtime](https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime)
- [Apple Developer Forums #732370 — Gatekeeper does not lift the quarantine attribute of a signed binary](https://developer.apple.com/forums/thread/732370)
- [Eclectic Light Co — Quarantine and the quarantine flag](https://eclecticlight.co/2020/10/29/quarantine-and-the-quarantine-flag/)
- [HackTricks — macOS Gatekeeper / Quarantine / XProtect](https://book.hacktricks.xyz/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-gatekeeper)
- [oven-sh/bun#29120 — macOS code-signature truncation (closed)](https://github.com/oven-sh/bun/issues/29120)
- [microsoft/vscode#310090 — standalone CLI version handshake](https://github.com/microsoft/vscode/issues/310090)

### Related Research (navigation aids — not evidence)

- [`reports/electron-bundled-cli-install-patterns/REPORT.md`](../electron-bundled-cli-install-patterns/REPORT.md) — VS Code lineage, signing of inner CLIs, M6 implementation design
- [`reports/ai-coding-tools-cross-install-coordination/REPORT.md`](../ai-coding-tools-cross-install-coordination/REPORT.md) — Claude Code et al, empirical cross-install survey
- [`reports/electron-desktop-app-operations-2025/REPORT.md`](../electron-desktop-app-operations-2025/REPORT.md) — codesigning + entitlement inventory
- [`reports/apple-developer-program-enrollment/REPORT.md`](../apple-developer-program-enrollment/REPORT.md) — Developer ID procurement
- [`reports/mastra-speakeasy-cli-install-recommendations/REPORT.md`](../mastra-speakeasy-cli-install-recommendations/REPORT.md) — single-file CLI distribution patterns (D8 status update needed: Bun --compile signing fixed)
- [`reports/server-paths/REPORT.md`](../server-paths/REPORT.md) — collab + UI entry-point map and the cross-install drift surface this report's recommendation modifies
- [`specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`](../../specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md) — D52 LOCKED bundled-CLI design (Path B)
- [`specs/2026-04-24-cross-install-version-handshake/SPEC.md`](../../specs/2026-04-24-cross-install-version-handshake/SPEC.md) — Path A handshake spec; this report recommends scope reduction
