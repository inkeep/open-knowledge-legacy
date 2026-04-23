# Changelog — Electron Desktop App spec

Append-only record of process events. Not a substitute for the Decision Log in SPEC.md §10.

## 2026-04-21 — D47 allowlist extension (from open-in-agent-desktop spec, PR #254)

Extended `packages/desktop/src/main/shell-allowlist.ts` `ALLOWED_SCHEMES` from
`{https:, http:, mailto:, openknowledge:}` to
`{https:, http:, mailto:, openknowledge:, claude:, codex:, cursor:}`.

**Rationale.** AI-desktop-app deep-link handoff for the Open-in-Agent feature
(Claude Cowork / Claude Code / Codex / Cursor). Each scheme's outbound payload
is constructed by a per-target URL builder in
`packages/core/src/handoff/{claude,codex,cursor}-url.ts` — never by
user-supplied raw URL. The composer output is bounded (<1 KB) and scoped
(path + single-line MCP hint). D47's "narrow attack surface + deliberate
allowlist" posture is preserved by continuing to enforce the `checkOutboundUrl`
exact-set gate at the main-process boundary.

**Threat model preserved.** The [Shabarkin 2022 "1-click RCE" attack class](https://positive.security/blog/url-open-rce)
(`ms-msdt:`, `ms-officecmd:`, `search-ms:`, and analogous URL-scheme-delivered
RCE chains) is defended against by the same exact-set allowlist that excludes
those schemes. Adding `claude:`, `codex:`, `cursor:` widens the allowlist by
three well-audited targets whose handlers OK emits structured, non-executable
payloads to — it does NOT relax the gate for arbitrary schemes.

**Drift-detector test.** `packages/desktop/tests/main/shell-allowlist.test.ts`
imports `KNOWN_TARGETS` from `packages/app/src/lib/handoff/targets.ts` and
asserts every scheme in the targets' `schemes` arrays is present in
`ALLOWED_SCHEMES`. A future target addition to `KNOWN_TARGETS` without an
allowlist edit fails this test at PR tier. See also the shell-allowlist
exact-set membership test in the same file.

**See.** `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.6 (allowlist diff
+ per-scheme JSDoc), §13 (test plan), §9 (decision log — SQ8 LOCKED + TQ4b
LOCKED for the separate `ok:shell:spawn-cursor` channel which keeps the
command-allowlist threat model distinct from the URL-scheme allowlist).

## 2026-04-20 (late) — Pre-ship decision-lock pass: D3 revised, D24 revised, D44 revised, D50 retracted, D52 finalized, R3 retracted

User conversation before kicking off `/ship`. Five product/technical tensions revisited and locked based on direct user confirmation:

**D3 revised — new-window-default, switch-in-place retired.** User: *"new window is the better experience, there will be scenarios that you want multiple windows open at the same time."* Every project pick — from Navigator, File → Open Recent, deep-link, or any other surface — now spawns a new editor BrowserWindow. The "click to switch in current window" UX (prior J4a) is removed. Cmd+Click modifier dropped as redundant; right-click/context-menu covers Show in Finder / Remove from Recent. Sections updated: §6 J4 (collapsed J4a + J4b into a single journey), §7.5 (ProviderPool framing — one pool per window, never re-pointed), §8.6 (Navigator mockup footer, Recent-project rows), §8.7 (multi-window lifecycle bullets).

**D24 revised — Navigator is its own persistent-launcher BrowserWindow.** Under D3 revised (new-window-default), same-window conditional render (original D24, CS1-driven) is no longer the right pattern — the Navigator only needs to *launch* new windows, not transition-in-place. Navigator becomes a UI-only BrowserWindow (no utilityProcess attached) that stays alive on the Navigator view as a persistent launcher. Shared React bundle with `mode: 'navigator'` flag (preload-injected). Matches GitHub Desktop / TextMate project-chooser pattern.

**R3 retracted** alongside D3 revised. Utility lifetime now bound 1:1 to window lifetime — no mid-lifetime utility swaps to reason about.

**D50 RETRACTED — cross-machine read-only fallback removed from v0.** User asked: *"how do we even identify this situation with dropbox icloud?"* — surfaced the real issue: there is no reliable way to detect cross-machine concurrent opens via filesystem-level signals. Dropbox / iCloud / Google Drive frequently ignore or delay `.lock` files, create conflict-copies, and offer no ordering guarantees. Without a trustworthy detection trigger, the novel read-only UX has no foundation. D44 case (c) simplified to hard-refuse dialog: *"Close it there before editing here. [Cancel] [Show lock in Finder]"*. §13 Future Work adds "Cross-machine concurrent editing" entry with revisit conditions (a non-filesystem coordination channel — mDNS, cloud relay, or CRDT awareness — is the minimum primitive to build on).

**D44 revised — case (c) hard-refuse, no read-only fallback.** Cascades from D50 retraction. Three-case dialog keeps its shape; only the foreign-host dialog body + buttons changed. Confidence moves from "HIGH (cases a + b); TENTATIVE (case c via D50)" to "HIGH (all three cases)."

**D52 finalized — dual-bin confirmed on origin/main.** User: *"cli dual bin is already on the main branch."* Verified — `packages/cli/package.json` on main ships `"bin": { "open-knowledge": "./dist/cli.mjs", "ok": "./dist/cli.mjs" }`. D52's conditional "if upstream ships first / if Electron ships first" language removed; the bundled CLI inherits both bins through `extraResources` packaging without any coordination step.

**Apple Developer creds confirmed as load-bearing.** User: *"Do we need apple dev creds to distribute this app from our own site?"* — answered yes, independent of App Store. Gatekeeper + notarization is required for P1 UX on macOS Sequoia+ even for direct-DMG distribution from our own site; unsigned apps hit the "cannot verify developer" friction that ends at "unusable for P1." `electron-updater` signature-verifies each update → unsigned auto-update is broken. §12 procurement bullet ("Apple Developer Program + D-U-N-S + Developer ID + notary creds within ≤4 weeks") remains critical-path for M2.

**bootServer extraction confirmed in-scope.** User: *"bootserver extraction is in scope for this work"* — D35 stays as specified. M1 includes the `packages/cli/src/commands/start.ts:249 → packages/server/src/boot.ts` move.

**Net state:** 52 decisions (D1–D52) with D7/D11/D32 superseded, D50 retracted. 22 risks (R1–R22) with R1/R3/R6 retracted. Spec is ready for `/ship` — user invoked immediately after this decision pass.

## 2026-04-20 — /audit + /assess-findings round → 17 findings resolved

Fresh-eyes `/audit` (Opus subagent, eng:audit skill) on SPEC.md + audit-findings.md; output at `meta/audit-findings-pass2.md`. Triaged via `/assess-findings` methodology — adversarial investigation before accepting. 17 findings: 4 High, 8 Medium, 5 Low. 15 resolved autonomously, 2 escalated to user (both resolved).

**Escalated → user decisions:**
- **H2 D52 `ok` alias** — PR #170 (merged 2026-04-17) recommends `ok` as primary bin. User chose Option 1: revise D52 to ship `ok` primary + `open-knowledge` alias. Dual-symlink menu item. `runInit` writes `ok mcp` in MCP configs. Doc sweep reversed: 58 occurrences of `open-knowledge foo` → `ok foo` (all command-form invocations; package name `@inkeep/open-knowledge` preserved).
- **M6 audit-findings canonicity** — user chose Option B: both files coexist. Pass-2 is verification-on-current-state; pass-1 is prior-audit-plus-research. No pointer changes needed.

**Wave 1 HIGH resolved:**
- H1 — PR #166 status updated MERGEABLE → **MERGED** (2026-04-17 at `986ebafe`); shape numbers corrected to +10,474 LOC / 73 files / 15 endpoints; re-validation gate executed (✓ @napi-rs/keyring dep, ✓ asarUnpack globs, ✓ syncEngine field on ServerInstance, ✓ endpoint inventory). D31 confidence MEDIUM → HIGH.
- H3 + M4 — EditorId union updated 4 → 6 editors (adds `claude-desktop`, `codex`) at 5 enumeration locations; `Continue` references scrubbed from G4, NG11, §4 persona, §8.2 mockup (4 places) — Continue is not in `EDITOR_TARGETS` on main.
- M1 — `commitDebounceMs` default reverted 15s → **30s** in §7.2 + §7.4 (`standalone.ts:142` authoritative; my earlier 15s edit was wrong — the auditor caught my introduced error).

**Wave 2 MEDIUM resolved:**
- H4 — `bootServer` references in §7.2 qualified as "per D35, lands in M1" (was narrated as shipped). §8.3 already correctly framed.
- M2 — Added `readonly syncEngine: SyncEngine | null;` to §7.2 `ServerInstance` interface quote.
- M3 — OQ-E rewritten as CLOSED (E-fix-1 already shipped upstream on main — `SystemDocSubscriber` deps are `[queryClient, collabUrl]`, not the `[queryClient]` only that the prior-audit claim said).
- M5 — J1 step 6 updated to options-object `runInit` signature matching §8.11 (drop positional `projectPath`, drop `source: 'desktop'`).
- M8 — D31 posture framing tightened alongside H1 edit.

**Wave 3 LOW resolved:**
- M7 — D29/OQ-O DMG size phrasing unified: "~250-280MB Universal vs ~140MB per-arch ≈ ~110-140MB overhead."
- L1 — §14 M7 calendar estimate expanded: "~4-6 weeks assuming Apple Dev Program enrolled; ~5-12 weeks compound worst case if procurement from scratch."
- L2 — §5 Electron 41 CVE-2025-55305 mitigation explicitly labeled **INFERRED** (release notes don't name-check the CVE).
- L3 — §7.2 endpoint list framed as "representative, not exhaustive; CLAUDE.md is source of truth."
- L4 — §13 Linux deferral prose rearranged — "when Linux re-enters scope" prefix on AppImage/deb/rpm detail.
- L5 — D45 `ok ui` port clarification: "port is user's choice (config or --port flag), not controlled by Electron."

**Also swept:** `open-knowledge {clone,pull,push,sync,auth,preview}` command forms → `ok {...}` (17 additional occurrences from PR #166 substrate discussion).

**Net state:** 52 locked decisions (D1–D52, with D7/D11/D32 superseded via D51/D52/D51). 22 risks tracked (R1–R22, with R1/R6 retracted). Zero product/engineering OQs remain. Audit pass-2 serves as merge-state verification snapshot; audit-findings.md (pass 1) + audit-findings-pass2.md coexist.

## 2026-04-17 (late) — macOS-only scope pivot + CLI-on-PATH + M1-M7 milestones + doc sweep

Scope narrowed to macOS-only for v0 per user product-sequencing call ("end-to-end on macOS first"). Architecture stays platform-agnostic; Windows re-entry is additive when trigger fires.

- **D32 SUPERSEDED → D51.** Earlier macOS+Windows day-0 call conflated "agents should have cross-platform CI coverage" with "we must ship cross-platform from day 0." Under explicit product sequencing, Windows is NOT NOW; agent-first *benefits* from narrower shipping surface.
- **D11 SUPERSEDED → D52.** Reverses "drop CLI shim install" based on agent-first + G3 analysis. P1 without Node.js cannot get MCP integration working without a bundled CLI on PATH. Electron ships "Install Command-Line Tools…" menu item (VS Code / Cursor / Docker Desktop pattern). `runInit` prefers bundled CLI path over `npx` in Electron-written MCP configs.
- **NG4 reverted** to "[NOT NOW] Windows and Linux desktop packaging" (was "Linux only" under D32).
- **§5 locked constraints** — Azure Trusted Signing removed from locked distribution block; Apple Developer Program elevated to critical-path with explicit calendar warning (1-6 weeks incl. D-U-N-S).
- **§8.9 platform targets** — macOS DMG only (Universal per D29); Windows/Linux parts of D43/D46/D49 kept specified as future-ready but guarded with `process.platform === 'win32'` no-op branches.
- **§8.12** rewritten — was "DROPPED (see OQ-B)," now "SHIPS via menu item per D52" with full specification of symlink mechanics + `runInit` bundled-path preference.
- **§12 assumptions** — ATS eligibility row retired (deferred with Windows); new row "Apple Developer Program + D-U-N-S + Developer ID + notary creds within ≤4 weeks" as critical-path for M2.
- **§13 future work** — Windows day-0 named explicitly with promote trigger ("macOS v0 stable in ≥5 design-partner machines for ≥4 weeks AND product commits to broader audience"); Linux further deferred.
- **OQ-M closed** (deferred to §13 Future Work per D51).
- **New §14 Implementation Sequence — M1-M7 macOS v0 milestones:**
  - M1 — Dev loop (local, unsigned)
  - M2 — Packaged + signed + notarized DMG (Apple Dev Program critical path)
  - M3 — Auto-update (install-on-quit)
  - M4 — `openknowledge://` URL scheme
  - M5 — `@napi-rs/keyring` end-to-end
  - M6 — MCP first-launch wiring + CLI-on-PATH (D52)
  - M7 — First design-partner build
  Each with explicit "definition of done" + blocks/depends relationships. Serial critical path M2 → M7 (signed DMG is the gate for everything user-facing); M1 + dev-loop iteration parallelizes with Apple-cert procurement.
- **§14 → §15 (References), §15 → §16 (Agent Constraints)** — section renumber.
- **Doc sweep:** `ok foo` → `open-knowledge foo` across SPEC.md + meta/audit-findings.md (47 occurrences). The `ok` shorthand was my conversational abbreviation; the actual binary name is `open-knowledge` per `packages/cli/package.json` `bin` map.

**Net state:** 52 locked decisions (D1-D52, with D7/D11/D32 superseded, R1/R6 retracted). Shipping surface: macOS only for v0. Windows + Linux in §13 Future Work with explicit promote triggers. 7 implementation milestones with concrete DoD. Critical-path procurement: Apple Developer Program enrollment. Spec is `/decompose`-ready.

## 2026-04-17 — Audit follow-up + 5 research fanouts → D35-D50 + R15-R22

Deep-audit pass (5 parallel Opus Explore subagents) surfaced contract drifts + new subsystems since baseline `f17ad00`. Five follow-up research fanouts (T1-T5) landed at `reports/electron-ai-coding-agent-development/fanout/2026-04-17-audit-followups/` to close open risks + lock API shapes. Scenario walkthrough of multi-actor coexistence (Electron + CLI `ok start` + `ok ui` + MCP subprocess) identified previewUrl + collision-dialog gaps. Spec + audit-findings updated end-to-end.

**Audit fanouts (read-only verification):**
- Audit A — PR #173 Zero-Ceremony Resume impact
- Audit B — Server contracts + new subsystems (server-lock, CC1, createServer, idle-shutdown, process-lock, ui-lock, server-observers, managed-rename, etc.)
- Audit C — App/renderer refactors (DocumentContext +356, SystemDocSubscriber, ConnectingBanner, EditorActivityPool, clipboard subsystem, ProviderPool)
- Audit D — CLI surface (new stop/clean/status/ui/ui-proxy commands; refactored start/mcp/init; `runInit` signature drift)
- Audit E — Git/sync landscape + PR #166 status

**Research fanouts (new formal reports):**
- T1 — `@napi-rs/keyring` in `utilityProcess` + keychain UX. Closes R15. **Corrects R16** — keychain prompt uses `CFBundleDisplayName`, NOT helper-process name (contradicting earlier spec speculation).
- T2 — Electron preload bridge patterns (VS Code / Mattermost / Logseq / GitHub Desktop). Locks D38 `OkDesktopBridge` shape with `contextBridge` function-identity workaround ([electron/electron#33328](https://github.com/electron/electron/issues/33328)).
- T3 — Multi-window subprocess lifecycle + crash recovery. Sources D39 lifecycle flags, D40 will-quit+join pattern, D41 budgeted auto-restart.
- T4 — Deep-linking / URL schemes. Sources D43 `openknowledge://` scheme + D46 `--` sentinel (CVE-2018-1000006 mitigation) + D47 URL payload validation.
- T5 — Startup-order matrix (24 permutations → 8 equivalence classes). Sources D44 three-case collision dialog, D48 diagnostic-rich error, D49 parent-death detection, D50 cross-machine read-only fallback.

**Decision Log additions (D35-D50):**
- D35 — extract `bootServer` from CLI to `packages/server/src/boot.ts` (closes OQ-NEW-2, supersedes earlier D16 framing)
- D36 — utility does NOT wire `attachIdleShutdown` or acquire `ui.lock` (BrowserWindow lifecycle owns utility lifetime)
- D37 — renderer bootstrap via preload injection (Path A — closes OQ-NEW-1)
- D38 — `OkDesktopBridge` API shape + subscription wrapper pattern
- D39 — `utilityProcess.fork` with `windowLifecycleBound: true, windowLifecycleGraceTime: 6000` + post-exit PID-liveness probe (VS Code Issue #194477)
- D40 — shutdown drain via `will-quit.preventDefault()` + join pattern (not `before-quit`)
- D41 — crash recovery: budgeted auto-restart (3/5min) before modal; skip auto-restart on `launch-failed`
- D42 — `mcp.autoStart` stays at PR #173 default true (closes OQ-NEW-3)
- D43 — `openknowledge://` URL scheme for deep-linking + MCP `previewUrl`
- D44 — J7b collision dialog three-case (own window / CLI sibling / foreign host)
- D45 — `ok ui` + Electron coexistence explicitly supported as multi-UI-client pattern
- D46 — protocol registration + `--` sentinel (CVE-2018-1000006) + macOS queue-then-flush
- D47 — URL payload validation defense-in-depth (parse try/catch + action allowlist + realpath containment + shell.openExternal scheme allowlist)
- D48 — `ServerLockCollisionError` diagnostic shape ({pid, hostname, processName, startedAt, worktreeRoot})
- D49 — utility parent-death detection (PR_SET_PDEATHSIG Linux / polling macOS / Job Objects Windows)
- D50 — TENTATIVE: cross-machine iCloud/Dropbox read-only fallback (Logseq hostname-per-file pattern)

**D31 reframed** from shape-specific inventory to inheritance posture (architectural stance, not pinned PR #166 file count). Shape snapshot moved to `meta/audit-findings.md` as evidence. PR #166 status: 9,558 LOC / 71 files / 15 endpoints / `MERGEABLE` at head `ad53dd3e` as of 2026-04-17.

**Risk additions (R17-R22):** R17 observer CPU budget; R18 `managed-rename-recovery` as 4th `degraded` value; R19 idle-shutdown accidental wiring; R20 multi-UI perception drift (cosmetic); R21 `ok ui` 12hr safety-net surprise; R22 `app.relaunch()` reliability. R16 **corrected** from speculation to T1-verified fact (app name, not helper-process name).

**Section rewrites:**
- §5 Locked — added agent-first primary principle + PR #166 substrate bullet with re-validation trigger
- §7.2 — rewrite for post-PR #173 lifecycle split; `ServerInstance.agentFocusBroadcaster` new field; `degraded` 4th value; server-observers auto-registered
- §7.4 — L2 `commitDebounceMs` default 30s → 15s
- §7.5 — observer A/B topology rewrite (server-authoritative post-PR #152); `useCollabUrl` bootstrap description
- §8.3 — explicit non-behaviors (no idle-shutdown, no ui.lock, no bootStartServer); parent-death detection per-OS; post-exit PID probe; runClean on boot; Electron ≥ 34 floor
- §8.4 — full preload bridge definition (D38 shape); `useCollabUrl` short-circuit; IPC-relay pattern for sandbox-blocked APIs
- §8.5 — IPC channel inventory updated (renamed with `ok:` prefix; added shell/clipboard/dialog IPC-relays)
- §8.8 — J7b three-case dialog (D44); D45 `ok ui` coexistence support; D48 diagnostic error shape
- §8.9 — asarUnpack gains `@napi-rs/keyring` globs; protocol scheme registration + `--` sentinel; macOS entitlement clarification
- §8.11 — `runInit` signature corrected to options-only (no positional `projectPath`, no `source` field)
- §9 — R15-R22 added/corrected
- §12 — PR #166 merge re-validation refreshed for posture; added Electron ≥ 34 assumption + macOS cold-start timing + PR_SET_PDEATHSIG spike

**Net state:** 50 locked decisions (D1-D50), 22 risks tracked (R1-R22 with R1/R6 retracted). Zero product/engineering OQs remain (all closed via D-numbers). Only OQ-M (Azure Trusted Signing eligibility) is ops-team calendar-gated — rolls up to D32 execution. Spec is `/decompose`-ready pending PR #166 merge re-validation.



## 2026-04-16 — Final 4 OQs closed · agent-first codified as primary principle · PR #166 inherited as substrate

Locked D30-D34 and closed the last four open questions (OQ-D, OQ-H, OQ-J, OQ-N). Analysis pass applied the newly-codified agent-first principle (D30) as the organizing lens for the remaining calls; this flipped OQ-J from J2 to J1.

- **§3 NG4 updated** — "Windows and Linux NOT NOW" → "Linux only NOT NOW." Windows moves to day-0 per D32. Explicitly notes `@parcel/watcher` + `@napi-rs/keyring` both work on Linux so a later flip is one CI row + one builder target.
- **§5 Primary principle** — new block at the top of the Locked section: "Agent-first from day 0, end-to-end (D30)." Establishes the organizing frame: every choice evaluated against agent velocity; where this trades against human-contributor convenience, agent velocity wins + humans get an env-var opt-out (canonical pattern: D33 + D34). Sits alongside the 10 architectural precedents in root `CLAUDE.md`.
- **§5 substrate** — new bullet: PR #166 (Miles, in-flight; ~8,700 LOC, 68 files). Full GitHub collaboration round-trip: clone → auth → auto-sync → conflict resolution. Editor UI (AuthModal, CloneDialog, ConflictBanner, ConflictResolver, SyncStatusBadge, DiffView.conflictMode, EditorHeader auth button) inherited through shared `packages/app/` bundle. Server SyncEngine with pull 30s / push 60s, squash-before-push, content-scope-only commits. CLI auth commands + clone/pull/push/sync. Native: `@napi-rs/keyring` for OS keychain + plaintext fallback. Auto-sync is opt-in (signing in IS the opt-in). **⚠️ Explicit re-validation trigger** written into the bullet: when PR #166 merges, re-read body + files and reconfirm asarUnpack globs, destroy() phase ordering, `@napi-rs/keyring` utility-process compat, auth IPC/API surface.
- **§9 Risks** — added R15 (`@napi-rs/keyring` utility-process compat, with plaintext-YAML fallback + IPC-relay fallback paths) and R16 (macOS Keychain access prompt UX on first sync).
- **§10 Decision Log** — D7 marked SUPERSEDED → D32. Added D30-D34:
  - D30: Agent-first principle codified as a cross-cutting decision (principle is in §5; entry here gives it a stable ID for traceability from downstream decisions).
  - D31: Inherit PR #166 substrate — closes OQ-H. Includes explicit re-validation trigger at merge. Confidence MEDIUM until PR #166 merges, then HIGH.
  - D32: macOS + Windows day-0, Linux NOT NOW — closes OQ-D, supersedes D7. Critical-path action: start ATS enrollment at scope freeze.
  - D33: J1 postinstall rebuild — closes OQ-J. Flipped from J2 via agent-first (D30): agent's first `bun install` must produce a working desktop env.
  - D34: `ELECTRON_SKIP_REBUILD=1` N1 semantics — closes OQ-N.
- **§11 Open questions** — OQ-D / OQ-H / OQ-J / OQ-N each rewritten as closure blocks referencing the locked decision + reasoning. **All OQs are now closed except OQ-M** (which is the ops-team eligibility verification for Azure Trusted Signing and rolls up to D32's execution).
- **§12 Assumptions** — added two rows: (1) PR #166 merges with shape captured in D31 (re-validation plan enumerated); (2) `@napi-rs/keyring` rebuilds cleanly against Electron 41 Node 24 ABI.

**Net state:** 34 locked decisions (D1-D29 + D30-D34), 0 product/engineering OQs remaining, 1 ops-team OQ (OQ-M, ATS eligibility, calendar-gated). Spec is ready for `/decompose` into `spec.json` stories.

## 2026-04-15 — SPEC.md body research-consumed

Threaded the electron-ai-coding-agent-development research report + 4 follow-ups + repo-integration-design into SPEC.md's body. Prior changelog entries (regrounding pass, repo-integration-design added) captured the evidence artifacts; this entry captures what landed in the spec itself.

- **Header / Status:** "Draft (Re-grounded 2026-04-15 · research-consumed 2026-04-15 · scope-freeze pending)". Added primary-research-report link to the Links section + cross-reference to `evidence/repo-integration-design.md`.
- **§5 Locked constraints:** added new "Repo / toolchain integration" block (8 bullets). Locks Bun+turbo+Biome toolchain inheritance, new `packages/desktop/` placement (not restructure), renderer reuse of `packages/app/` via extraResources, utility-process importing `createServer` directly from server package, typed-IPC hand-rolled baseline (per FU-3), tsconfig project references scoped to desktop-only, turbo tasks additive to existing graph, Electron 41 fuses enabled with post-sign verification required.
- **§8.9 electron-builder configuration:** replaced with concrete shape referencing repo-integration-design §2.6. `extraResources: from: "../cli/dist/public"` named as the renderer-bundle source. `asarUnpack` extended to include `simple-git` + platform-specific `@parcel/watcher-*`. Post-sign `@electron/fuses read` verification surfaced as required.
- **§10 Decision Log:** added D12-D17 (6 new locked decisions):
  - D12 — new `packages/desktop/` package, no restructure of existing
  - D13 — renderer reuses `packages/app/` Vite build as extraResources
  - D14 — typed-IPC baseline = hand-rolled discriminated-union channel map (per FU-3)
  - D15 — inherit Bun+turbo+Biome toolchain from monorepo
  - D16 — utility imports `createServer` directly from server (not CLI); resolveContentDir / resolveLockDir move to core
  - D17 — post-sign `@electron/fuses read` verification is a required release-pipeline step (per FU-2 Class 8)
- **§11 Open Questions:** added OQ-I through OQ-N (6 new open questions):
  - OQ-I — Biome v2 GritQL capability for `no-loosely-typed-webcontents-ipc`; fallback I2 scoped-ESLint, I3 CI-grep
  - OQ-J — native-module rebuild trigger: postinstall (J1) vs CI-only (J2)
  - OQ-K — moving `resolveContentDir` / `resolveLockDir` to core (K1 preferred)
  - OQ-L — desktop-native renderer HTML vs direct loadFile of packages/app's bundle (L1 preferred)
  - OQ-M — Azure Trusted Signing eligibility verification (rolls up to OQ-D)
  - OQ-N — ELECTRON_SKIP_REBUILD escape-hatch semantics (N1 preferred)
- **§13 Future Work (Out of Scope):** populated with 10 explicitly-deferred items, each with a promote trigger. Notable: utility-process HMR (no framework ships it), tRPC-over-IPC migration trigger (>20 channels / streaming / compliance), read-only-second-window (feature bet), git operations UI H2/H3, Windows day-0 gated on OQ-M, Mac App Store [NEVER].
- **§14 References:** restructured into "Primary research consumed (drives §5 / §8 / §10)", "1P design artifact", "Other related — see Links". Named all 5 electron-ai-coding-agent-development fanout reports.
- **§15 Agent Constraints:** drafted SCOPE / EXCLUDE / STOP_IF / ASK_FIRST blocks — turns abstract research into operational bounds for the implementing agent. ~100 lines total. Includes concrete SCOPE items (create packages/desktop, wire turbo tasks, implement 14 initial typed IPC channels, port GitHub Desktop's 63-LOC ESLint rule), EXCLUDE items (tRPC-IPC, Spectron, root-level ESLint, changing V0-1/V0-2 contracts), STOP_IF triggers (Biome GritQL insufficient + scoped-ESLint unacceptable, ATS eligibility fails, electron-vite v6 GA, Ubuntu 24.04 Playwright regression), ASK_FIRST items (any server-package API change, any packages/app change affecting the CLI asset path, introducing pnpm, publishing desktop to npm).

Spec is now ready for `/decompose` into `spec.json` stories. All open questions explicitly enumerated with leaning recommendations; all locked decisions cite evidence.

## 2026-04-15 — Repo integration design added (evidence/repo-integration-design.md)

Added `evidence/repo-integration-design.md` (735 lines) — 1P mapping of the FU-4 agent-first skeleton onto OK's actual Bun + turbo + Biome monorepo at baseline `f17ad00`. Consumes `reports/electron-ai-coding-agent-development/` + all four follow-up fanouts. Contains: new `packages/desktop/` package layout, `turbo.json` task additions, `electron.vite.config.ts` + `electron-builder.yml` concrete shape, tsconfig project references scoped to desktop-only, Biome `noRestrictedImports` config for 4 of 5 custom rules + scoped-ESLint fallback for the 5th, typed IPC channel map with 14 concrete channels, CI `desktop-smoke` job addition, `packages/desktop/src/utility/server-entry.ts` reuse of shipped `createServer` + `acquireServerLock` + CC1 contracts, 11-phase rollout sequence, 6 open questions surfaced back to the spec. Design deliberately does NOT touch existing Biome setup, existing CLI tsdown config, existing app Vite build, V0-1 lock, or V0-2 CC1 protocol.

## 2026-04-15 — Re-grounding pass (greenfield lens)

New owner context: spec was scaffolded 2026-04-11, then substrate shipped fast (server-lock V0-1 PR #99, CC1 V0-2 PR #106, Timeline PR #39, graph / rename / image-upload / new-item-dialog / extension-aware docNames). Intersecting specs landed (`zero-config-bunx-packaging`, `clone-from-github`, `server-process-safety`, `v0-2-sidebar-push`). Electron spec re-grounded end-to-end under greenfield directive: no deferral, architectural correctness over scope expediency.

**Method.**

- `/worldmodel` full depth — 4 parallel channels (web probes, code `/explore`, OSS, reports) + 5 inline user-source reads (SPEC, evidence, 4 intersecting specs, PROJECT.md). Output: [`evidence/worldmodel-2026-04-14-regrounding.md`](../evidence/worldmodel-2026-04-14-regrounding.md).
- `/assess-findings` adversarial verification on every load-bearing claim. Codebase + web + spec cross-reads per finding. One major correction to my own regrounding (client-side CC1 IS shipped via `SystemDocSubscriber`). Verified Electron 41.2.0 GA via releases page.

**Edits applied.**

- **Baseline bumped** `4884f5f` → `f17ad00`; Last updated → 2026-04-15; Status → "Draft (Re-grounded 2026-04-15 — backlog phase next)".
- **Links section** — added worldmodel-2026-04-14-regrounding evidence; added 3 new intersecting specs (zero-config-bunx, server-process-safety, v0-2-sidebar-push, clone-from-github); added 3 new reports (zero-config-bunx, open-from-github, symlink-handling); cross-referenced projects/v0-launch/.
- **§5 Locked constraints** — removed "ESM not supported in utilityProcess" (fixed by [PR #40047](https://github.com/electron/electron/pull/40047) Sept 2023). Pinned Electron 41.2.0 GA (2026-04-07). Added substrate-inheritance entries: shipped `server.lock` (V0-1), shipped CC1 (V0-2), in-flight zero-config-bunx T1/T2/T3, in-flight clone-from-github 3-card empty state. Added symlink-handling precedent.
- **§7 Current state** — full refresh. ServerInstance shape updated (adds `cc1Broadcaster`, `contentFilter`, `degraded`, `lockDir`). API endpoint summary now lists current ~24 routes and points at CLAUDE.md for source of truth. Shadow repo location corrected to `.git/openknowledge/` (integrated) / `.openknowledge/` (standalone). Sidebar rewritten from polling to push (CC1 `{v,ch,seq}` contract + react-query invalidation via `SystemDocSubscriber`). New surfaces enumerated (TimelinePanel, GraphView/Panel, BacklinksPanel, ForwardLinksPanel, OutlinePanel, DiffView, NewItemDialog, ThemeToggle). `.open-knowledge/` diagram drops `catalogs/` (removed PR #114).
- **§8 Proposed solution** — menu bar extended to current shipped surfaces (View → Graph/Timeline/Backlinks/Outline, File → Rename/Delete/Insert Image, Project → Save Version/Version History, Clone from GitHub… entry). §8.5 removed optional `sidebar-update` IPC (obviated by CC1 direct-to-renderer). §8.6 rewritten as **3-card empty state** matching clone-from-github J1. §8.8 replaced re-designed lock with reference to shipped `ServerLockMetadata` contract + lean J7b dialog (hard-refuse + focus existing window). §8.9 builder references `packages/cli/dist/public/` (shared bundle with bunx). Added Electron 41 fuses list. §8.11 rewritten to delegate to `runInit(...)` (4-editor support already shipped). §8.12 "CLI shim install" **DROPPED** per D11.
- **§9 Risks** — R1 retracted (ESM myth). R6 closed by V0-1. R10 softened by T2 chokidar fallback. Added R11 (Electron 8-week major cadence), R12 (CC1 WS stability per window), R13 (trust-pending menu disable), R14 (preload security boundary).
- **§10 Decision Log** — D1 **APPLIED** (cli-packaging cross-spec flip). D3 clarified (one window ↔ one contentDir enforced by `server.lock`). D4 updated (3-card empty state). Added D9 (substrate inheritance), D10 (no `sidebar-update` IPC), D11 (drop CLI shim).
- **§11 Open questions** — restructured from 9 flat items to OQ-A through OQ-H, each with option tradeoffs and leaning-but-not-locked recommendations. New: OQ-A (collision dialog simplicity vs read-only-second-window feature), OQ-D (macOS-only-day-0 reconsidered given P1 Windows skew), OQ-F (utilityProcess vs `child_process.fork` lock), OQ-H (git operations UX surface).
- **§12 Assumptions** — three retracted as verified at re-grounding (createServer-in-utility, React app has no localhost hardcodes, provider-pool shape). Remaining assumptions tightened with concrete verification plans.
- **Cross-spec edit applied:** `specs/2026-04-08-cli-packaging/SPEC.md:33` — `[NEVER] GUI/Electron packaging, Docker distribution` split into `[NOT NOW] GUI/Electron packaging` (with back-reference) + `[NEVER] Docker distribution` (unchanged). Per D1 authorization. Entry added to that spec's changelog.

**Pending (next turn):** §6 user journeys updated to reflect 3-card empty state + clone-from-github device-flow surface + J4a project-switch lifecycle verified against CC1 and ProviderPool teardown. §8.2 diagram re-drawn. §8.14-8.16 mermaid sequences updated. §13 Future work populated. §15 Agent Constraints drafted. Step 4 (backlog extraction via walk-through / tensions / negative space) runs next — this re-grounding unblocks it.

## 2026-04-11

- **Intake phase complete.** Problem framed in SCR format. SCR stress-tested across demand reality (real — P1 persona cannot currently use OK), status quo cost (addressable market stays capped at terminal-comfortable devs), narrowest wedge (macOS-only, solo-player, day 0), observation (inferred from reports/web-to-macos-desktop-wrapping-2025/ inspection of 20 reference apps), future-fit (essential — native wrapping is the standard distribution form for this category).
- **Scaffold phase started.** Baseline commit `4884f5f` stamped. SPEC.md created with full §1 problem statement, §2 G1-G9, §3 NG1-NG13 (temporal-tagged), §4 P1-P3 personas, §5 locked constraints, §9 R1-R10 risks, §10 D1-D8 decisions (all LOCKED), §11 first-pass open questions, §12 first-pass assumptions. §6-§8 marked TBD.
- **Worldmodel dispatched.** Agent "Worldmodel: OK desktop app topology" returned 3,650-word topology at `evidence/worldmodel-topology.md`. Covers current server architecture (standalone.ts factory contract, file-watcher.ts DiskEvent taxonomy, persistence.ts two-layer debounce, api-extension.ts routes), React app entry (main.tsx, App.tsx, DocumentContext, ProviderPool), CLI command surface, file system topology including `.open-knowledge/` marker + shadow repo, and a candidate process model for Electron. Confirmed: **the codebase is already desktop-ready** — server is pure Node.js, React app is WebSocket-native with `location.host` URL inference, file I/O uses standard Node APIs. Main work is IPC choreography, not refactor.
- **In-flight specs summarized.** Agent returned `evidence/in-flight-specs-summary.md` covering 5 specs: provider-pool (final), document-list-api (final), content-config-unification (complete), exclude-gitignored-files (draft), sidebar-realtime-updates (draft/seed). Surfaced **12 cross-cutting design constraints** the desktop spec must inherit — most importantly #12 "Multi-Window State Coordination" which directly validates D6 (one utilityProcess per window) as opposed to a shared-pool IPC relay.
- **Correction to worldmodel topology:** §3.2 of topology says "Default port: 8080" — this is wrong. The Zod default in `packages/cli/src/config/schema.ts:17` is **3000**. Fixed in spec §7.2.
- **Correction to topology 6.1:** `@parcel/watcher` does not use libfsnotify — it binds directly to OS APIs (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows). Used the correct description in spec §7.3.
- **§7 Current state written.** 9 subsections covering distribution, server, watcher + ContentFilter, persistence, React app, dev mode, MCP bridge, project marker directory, and gap analysis ("what's missing for desktop-author UX").
- **§6 User journeys written.** J1 first launch, J2 returning user, J3 new project from inside app, J4a/J4b switch in current vs new window, J5 AI agent collaboration, J6 auto-update install-on-quit, J7a-h failure modes (failed update, lock collision, stale lock, content dir moved, no AI tool, permissions, utility crash, native module load failure).
- **§8 Proposed solution written.** 16 subsections: process model diagram, main process responsibilities, utilityProcess responsibilities, renderer responsibilities (minimal change: ProviderPool WS URL from preload bridge), IPC channel inventory (main↔utility and main↔renderer), Project Navigator window layout, multi-window lifecycle, lock file protocol, electron-builder.yml, electron-updater config, MCP wiring on first launch, CLI shim install, rejected architectural alternative (shared utilityProcess via IPC relay — rejected for isolation, reversibility, and minimal memory win), system context diagram (mermaid), first-launch sequence (mermaid), failed-update sequence (mermaid).
- **Pending:** Move to Step 4 (Backlog extraction via 3 probes — walk-through, tensions, negative space).
