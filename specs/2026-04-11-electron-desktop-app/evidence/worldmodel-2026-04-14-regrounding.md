---
title: "Worldmodel re-grounding — 2026-04-14"
date: 2026-04-14
supersedes_contextually: ./worldmodel-topology.md (2026-04-11)
depth: full
channels_run: [web, code, oss, reports, user-sources]
channels_skipped: [catalog-skills (removed from repo, commit d6c6f42)]
baseline_at_original_spec: 4884f5f
baseline_at_regrounding: f17ad00 (main, 2026-04-14) — delta ≈ 140 commits / 50 PRs / 27 new specs / 19 new reports
---

# Worldmodel — Electron Desktop App Re-grounding

**Stance:** non-prescriptive topology. This document maps what exists and what changed. It does NOT recommend what the spec rebase should do — the human + rebase loop decide that.

## Scope

The original spec (`SPEC.md`, 754 lines) framed the Electron wrap around:
- **createServer** factory → utilityProcess per window
- **ProviderPool** in renderer → `ws://localhost:<port>/collab`
- **Native UX**: Project Navigator, folder-picker new-project, DMG+notarize+signed
- **MCP wiring**: first-launch prompt, per-project `.mcp.json`
- **Locked decisions**: D1–D8 (multi-window, macOS-first, skip MAS, etc.)

Since then, the substrate the spec depends on has shipped several critical pieces, and adjacent specs have landed that the Electron story must now sit on top of rather than re-invent. Re-grounding = refresh the "7) Current state" section, update locked constraints against Electron ecosystem reality, align §8 IPC + lock-file design with the **already-shipped** server-lock protocol, and fold in the clone-from-github + zero-config-bunx stories.

---

## A. Topology Map — Stable anchors (spec claims that still hold)

| Anchor | Confidence | Evidence |
|---|---|---|
| createServer is pure-Node + options-driven + `ready` promise + `destroy()` | CONFIRMED | code channel: `packages/server/src/standalone.ts`; interface enlarged but shape preserved. `destroy()` now has documented CC8 6-phase ordering. |
| Factory takes everything via options (no globals) | CONFIRMED | code channel |
| Multi-window = one server per window per contentDir | CONFIRMED as design-locked | PROJECT.md: *"Lock file (V0-1) extends to multi-window Electron without redesign."* Server-lock enforces one server per contentDir. |
| ProviderPool URL inferred from `location.host` | CONFIRMED | `packages/app/src/editor/provider-pool.ts`. Desktop override via `new ProviderPool(10, 'ws://localhost:<port>/collab')` still works. |
| `@parcel/watcher` requires `asarUnpack` + `electron-builder install-app-deps` | CONFIRMED | web-to-macos REPORT.md:388; common pattern across Claude Desktop, Codex, Notion. |
| `utilityProcess` is the 2026-correct child-process API | CONFIRMED | OSS channel: Electron docs; web channel: Electron 34+ mainline. *Note: GitHub Desktop and Logseq both still use `child_process` — they predate the shift, NOT evidence that utilityProcess is wrong.* |
| AGPL-3.0 + commercial dual-license strategy | CONFIRMED | reports channel: `oss-licensing-strategies-open-core` — this is the converged pattern. |
| Skip Mac App Store (NG2) | CONFIRMED | reports channel: 6/7 reference apps skip MAS; sandbox blocks `@parcel/watcher` recursive watch + git shelling. |
| Install-on-quit auto-update (Obsidian/Claude Desktop model) | CONFIRMED | reports channel + OSS channel: canonical pattern via `electron-updater` `autoInstallOnAppQuit`. |
| Direct-download DMG as primary distribution | CONFIRMED | reports channel. |
| Electron is the right framework for OK's Node-heavy stack | CONFIRMED | web-to-macos REPORT.md:38–42; reinforced by OSS channel (Tauri Rust-backend binding constraint for Bun+Node+simple-git+@parcel/watcher stack). |

**Locked decisions D1–D8 all still hold** as architectural directives.

---

## B. Drift Zones (spec text that needs update)

Items where the spec's claims are either stale, under-specified, or now partially-shipped. The spec doesn't need to be wrong to need re-grounding — "still correct but now builds on X" is itself a rebase task.

### B1. Server-lock (§8.8 Lock file model)
**Spec says** (§8.8): design a per-project `.open-knowledge/.lock` file with `{pid, host, startedAt, owner, wsPort}`.

**Reality as of 2026-04-14:** `server-lock` SHIPPED via PR #99 / V0-1 (commit `cafed34`). Live contract:
- Path: `<contentDir>/.open-knowledge/server.lock`
- Shape: `{ pid, hostname, port, startedAt, worktreeRoot }` (no `owner` field, no `wsPort` — single `port`)
- `acquireServerLock()` throws `ServerLockCollisionError` on live same-host collision
- `updateServerLockPort(lockDir, realPort)` called post-`listen()`; port=0 is the "starting" sentinel
- `readServerLock()` is the **MCP discovery mechanism** (already used by `packages/cli/src/commands/mcp.ts`)
- **CC8 shutdown ordering:** lock released LAST in `destroy()` (phase 6, inside `try/finally`)
- Spec file: `specs/2026-04-13-server-process-safety/SPEC.md` is the authoritative contract doc

**Spec rebase action (non-prescriptive):** §8.8 should reference the existing lock module rather than re-design it. "Coexistence with the npm CLI distribution" (R6) is a solved problem — same lock primitive is used by both.

### B2. CC1 broadcast (§8.5 IPC channel inventory)
**Spec says** (§8.5 table): "Util → Main `sidebar-update {fileIndex}` (optional — only if we decide to bypass polling for desktop)".

**Reality as of 2026-04-14:** CC1 push-over-awareness SHIPPED via PR #106 / V0-2 (commit `88351e1`). Live contract:
- Transport: dedicated `__system__` Y.Doc (`broadcastStateless(payload)`)
- Payload: `{ v: 1, ch: string, seq: number }` — no path, no kind; clients re-fetch the channel's endpoint
- Channels: `'files'` (emits on create/delete/rename, NOT update/conflict). Reserved: `'backlinks'` (V0-3), `'graph'` (V0-11)
- Debounce: 100ms trailing-edge per channel
- Cross-cutting skip: every subsystem keying on `documentName` must call `isSystemDoc()` guard
- Server pre-opens `__system__` at startup via `hocuspocus.openDirectConnection('__system__')` so DiskEvents arriving before any client connects have a broadcast target
- Spec file: `specs/2026-04-13-v0-2-sidebar-push/SPEC.md` + server-side PR #106 landed; client-side FileSidebar subscriber still pending (Dima's follow-up)

**Spec rebase action (non-prescriptive):** the "optional sidebar-update IPC" row in §8.5 should be removed. Desktop inherits the CC1 protocol unchanged — each window's ProviderPool connects to its utilityProcess's `__system__` doc the same way it connects in CLI/web mode. No new IPC channel needed. **This is a simplification of the original spec.**

### B3. Constraint §5: "Electron 41+ required for CVE-2025-55305"
**Spec says** (§5 Locked): "Electron 41+ — required for CVE-2025-55305 ASAR integrity fix (Trail of Bits Sept 2025)."

**Web channel finding:** Electron 34+ is current stable in early 2026 per one trade source. Electron 41 is claimed by electron-ops REPORT.md:82 to introduce signed ASAR integrity. electron-ops REPORT.md:446 says "Apps confirmed affected at disclosure: Signal, Slack, 1Password ... Electron 41 + `@electron/asar ≥ 4.1.0` closes it."

**Divergence to resolve:** Is Electron 41 actually shipping / current in 2026-04, or is it future? **UNRESOLVED** — needs a WebFetch against the Electron releases page during rebase. If 41 is not GA, the locked constraint should be relaxed to "Electron ≥ (whatever is current) + ASAR integrity mitigation" with a note to upgrade when 41 lands.

**Action during rebase:** verify current Electron major, confirm ASAR integrity fuse landed, update the constraint to match the concrete version shipping when the Electron implementation begins. This is a "temporal-tagged" constraint — it ages automatically.

### B4. Constraint §5: "ESM not supported in utilityProcess (electron/electron#40031)"
**Spec says:** "Server package needs CJS build target."

**Web-to-macos REPORT.md:386:** confirms as of report writing (2026-04-11).

**Spec rebase action:** re-verify issue status before rebase. If Electron has landed ESM-in-utilityProcess support by the implementation start date, the dual-format build becomes unnecessary — server package can stay ESM. Until verified, treat as still-locked. Low-effort verification.

### B5. Distribution (§7.1)
**Spec says** (§7.1): `npx @inkeep/open-knowledge` as the current distribution.

**Reality:** The zero-config bunx packaging spec (`specs/2026-04-11-zero-config-bunx-packaging/SPEC.md`, Owner Andrew, approved) ships four workstreams to make `bunx @inkeep/open-knowledge` work — (T1) bundle React app in CLI, (T2) chokidar fallback when @parcel/watcher fails, (T3) auto-init on first `start`, (T4) Claude Code plugin. **T1–T3 affect what the Electron utilityProcess ships:** if bunx mode bundles `packages/app/dist` into the CLI, Electron's builder config in §8.9 can reuse the same bundling logic rather than re-specifying.

**Spec rebase action:** reconcile with zero-config-bunx-packaging. Likely shared build infra.

### B6. Journey J1: "No AI tool detected" / MCP wiring
**Spec says** (§8.11): on first project creation, detect Claude Desktop / Cursor / Continue; prompt user to add MCP entries.

**Reality:** `open-knowledge init` already writes project-level `.mcp.json` today. The user-level MCP config (e.g., Claude Desktop's `claude_desktop_config.json`) is handled by separate CLI init flow that's evolved — see commit `35803ea feat(cli): append root instructions on init + auto-scope grep/find in exec (#129)` and `dfe9a49 feat: CLI init clarity — content preview, preview verb, cross-platform open (#109)`.

**Spec rebase action:** read the current CLI init logic (`packages/cli/src/commands/init.ts`) and align §8.11 with what actually ships in the CLI. Likely the Electron "first-launch prompt" just invokes the existing init routine with `--source desktop-gui`.

### B7. New surfaces that didn't exist on 2026-04-11 and need to be wrapped
The spec's §7 "Current state" maps a simpler product. These have landed since:
- **Timeline & rollback** (PR #39 / `db8a6d6`): `GET /api/document/<name>/history`, `POST /api/rollback/<name>`. The Electron menu bar should expose "Version History" as a first-class View command.
- **Graph view** (PR #140 + #141 + #142): fullscreen graph surface with orphans/hubs, dead-link audit, suggest-links discovery. Desktop windows inherit this; menu bar needs "View → Graph" entry.
- **Image upload** (PR #112 / `20dfb13`): `POST /api/upload-image` with multipart. Electron's window-native `dialog.showOpenDialog` + paste-image flow can call this same endpoint — no IPC needed if renderer has network access to its utilityProcess's HTTP.
- **Managed rename with backlink rewrite** (PR #139), **file/folder creation UI** (PR #127, #144). File menu "New…" already has the right wiring via `NewItemDialog`; desktop menu bar routes to the same React component.
- **Extension-aware docNames** (PR #126): `.mdx` first-class. Spec's §7.3 mention of gitignore + config exclude is correct but the default include is now `['**/*.md', '**/*.mdx']`, not `['**/*.md']`.
- **Dark mode** (earlier, pre-spec, but worth noting): shipped via `next-themes` class strategy + FOUC script. Desktop should use `nativeTheme` for system-theme tracking + `setTitleBarOverlay` for dark-mode title bar.

### B8. Catalog folder (spec's §7.8 directory layout)
**Spec says** (§7.8): `.open-knowledge/catalogs/` is part of the project marker directory.

**Reality:** Commit `d6c6f42 remove catalog` + `edcf49e remove catalogs` + `b7d09a2 remove dead catalog-generation code (#114)` — the catalog system was removed. Spec's directory diagram is stale.

**Spec rebase action:** remove `catalogs/` from the §7.8 diagram. Current layout: `config.yml`, `server.lock`, `.git/openknowledge/` (shadow repo, integrated mode) or `.openknowledge/` (standalone mode), `AGENTS.md`/`INDEX.md` (if Claude Code plugin installed), `.mcp.json` at project root.

---

## C. New intersecting specs (must be reconciled with Electron spec at rebase)

### C1. `specs/2026-04-14-clone-from-github/` (Approved — Nick + Miles)
Ships CLI subcommand (`open-knowledge clone`) + editor-side empty-state UI + trust model. Orchestrator module handles all surfaces. OAuth Device Flow + gh delegation + PAT fallback. **Direct impact on Electron spec:**
- Project Navigator's "New Project" button in §8.6 should gain a "Clone from GitHub" option alongside Open/New-from-folder (matches P1 persona's onboarding story).
- Device Flow modal is an Electron-native opportunity: `shell.openExternal(deviceAuthUrl)` + clipboard copy + polling — cleaner UX than CLI terminal output.
- Trust-pending state is server-instance-level — each per-window utilityProcess handles its own trust check. No shared-state across windows needed.
- Token storage via `@napi-rs/keyring` (keytar archived Dec 2022) — desktop app has native access to this; CLI users get same primitive.

### C2. `specs/2026-04-11-zero-config-bunx-packaging/` (Approved — Andrew)
T1 (bundle React app in CLI) and T2 (chokidar fallback) directly reduce Electron build risk. T3 (auto-init) simplifies J1 in the desktop spec.

### C3. `specs/2026-04-13-server-process-safety/` (Final / Shipped — V0-1)
The lock-file contract Electron depends on. §2 in that spec is now the authoritative contract — the Electron spec should link to it rather than re-spec.

### C4. `specs/2026-04-13-v0-2-sidebar-push/` (Server shipped, client pending)
CC1 contract. The Electron spec's "sidebar-update IPC" becomes unnecessary.

### C5. `projects/v0-launch/PROJECT.md` (Active bet)
**Electron is explicitly [NOT NOW] in v0 scope.** The v0 launch ships in CLI + web form. V0-20 "desktop build prep" (Andrew, Later) is the gating story. *This means: the Electron spec is for the post-v0 implementation phase; substrate work (V0-1, V0-2, V0-4 file ops, V0-5 rename+backlinks) is being shipped TO MAKE THE ELECTRON SPEC IMPLEMENTABLE, without being gated on the Electron spec itself.*

---

## D. Entity inventory (canonical names for rebase)

### D1. Frameworks & wrappers (3P)
- **Electron** — canonical choice. Version baseline requires live verification at rebase time.
- **Tauri 2.x** — alternative, Rust backend. Not a fit for Bun+Node+@parcel/watcher+simple-git stack unless Bun-subprocess sidecar pattern is adopted. Reports-channel + OSS-channel converge.
- **electron-builder** — packaging + updater. Dominant in ecosystem (Claude Desktop, Obsidian, Slack, Notion, Cursor).
- **electron-forge** — alternative packaging (Logseq uses it). Newer, batteries-included. Not blocking.
- **@electron/notarize** — replaces legacy altool. Called from `afterSign` hook.
- **electron-updater** — auto-update via `latest-mac.yml`. Supports `stagingPercentage`.
- **@electron/fuses** — post-package hardening (RunAsNode, OnlyLoadAppFromAsar, etc.).

### D2. OS / distribution requirements
- **Apple Developer Program** — $99/yr. Developer ID Application cert. D-U-N-S Number required for Org enrollment (1–6 week wait — R9 path-blocker).
- **Azure Trusted Signing** — $120/yr. US/Canada-only, 3-year business history (or individual). Windows deferred to NG4.
- **Hardened Runtime + entitlements.plist** — canonical macOS signing flags.
- **Notarization** — mandatory from day 0 (macOS Sequoia removed right-click-Open bypass for unsigned).

### D3. OK subsystems (1P)
| Subsystem | State | Primary file |
|---|---|---|
| `createServer` factory | stable | `packages/server/src/standalone.ts` |
| `ServerInstance` interface | enlarged since spec | same — now includes `cc1Broadcaster`, `contentFilter`, `lockDir` |
| `acquireServerLock` / `updateServerLockPort` / `releaseServerLock` | SHIPPED | `packages/server/src/server-lock.ts` |
| `CC1Broadcaster` + `isSystemDoc` | SHIPPED (server-side) | `packages/server/src/cc1-broadcast.ts` |
| `ContentFilter` | shipped | `packages/server/src/content-filter.ts` |
| `ProviderPool` | shipped | `packages/app/src/editor/provider-pool.ts` |
| `DocumentContext` | shipped | `packages/app/src/editor/DocumentContext.tsx` |
| `FileSidebar` + `NewItemDialog` + context menus | shipped | `packages/app/src/components/` |
| Timeline API | shipped | `packages/server/src/api-extension.ts`, `packages/server/src/shadow-repo.ts` |
| Graph surfaces | shipped | `packages/app/src/components/GraphView.tsx` (per PR #140) |
| Image upload | shipped | `packages/server/src/api-extension.ts` |
| MCP stdio with `discoverServerUrl()` | shipped | `packages/cli/src/commands/mcp.ts` |
| `resolveContentDir` / `resolveLockDir` | shipped | `packages/cli/src/config/paths.ts` |

### D4. Reference apps (for J1/J4/J7 patterns)
- **GitHub Desktop**: Electron 40.1.0, electron-packager (not builder), legacy `nodeIntegration: true` — not a modern pattern reference. Useful for: typed IPC channel map + `isTrustedIPCSender` guard, signing recipe, dugite bundle pattern.
- **Logseq**: Electron 38.4.0, electron-forge, multi-window per-graph pattern (Map<window, graphPath>), `contextIsolation: true` + preload.js — **modern pattern reference for multi-project UX**.
- **Obsidian** (closed-source, inferred): Electron, multi-vault via separate windows/instances, plugin ecosystem, no first-party MCP.
- **AFFiNE / Notesnook / Anytype**: Electron; stack details not confirmed in this probe.

### D5. Clone-from-github stack
- **simple-git** (Node shell-out) — primary clone transport
- **dugite** — blocked on Bun today (per clone-from-github spec); for Node-only environments
- **isomorphic-git** — narrow public-HTTPS fallback
- **gh credential helper** (`credential.helper='!gh auth git-credential'`) — zero-code auth for devs with gh
- **OAuth App + Device Flow** — universal pattern across reference editors
- **@napi-rs/keyring** — OS keychain for token storage (keytar archived)

---

## E. Connection map (dependency chains)

```
User launches OK.app
  ↓
Main process (Electron)
  ├── electron-updater check → GitHub Releases
  ├── BrowserWindow per project
  │     ↓
  ├── utilityProcess.fork(server-entry.js) — per window
  │     ↓
  │     ├── acquireServerLock(.open-knowledge/server.lock)  ← V0-1 shipped
  │     ├── createServer({ contentDir, port: 0, ... })
  │     │     ├── Hocuspocus + ContentFilter + @parcel/watcher
  │     │     ├── CC1Broadcaster (pre-opens __system__ Y.Doc)  ← V0-2 shipped
  │     │     ├── api-extension (documents/history/rollback/upload/rename/delete/etc.)
  │     │     └── shadow-repo (.git/openknowledge/ — attribution)
  │     ├── updateServerLockPort(realPort)  ← advertises port for MCP discovery
  │     └── postMessage({ type: 'ready', port })
  │           ↓
  └── Renderer (BrowserWindow)
        ├── preload exposes { wsPort, projectPath } via contextBridge
        ├── ProviderPool(10, ws://localhost:<port>/collab)
        │     ├── opens __system__ first (CC1 subscriber)  ← invalidation signal
        │     └── opens active doc
        ├── FileSidebar subscribes to ch:'files' → re-fetches /api/documents
        ├── TiptapEditor + SourceEditor (bidirectional observer sync)
        └── Menu bar (File, Edit, View, Project, History, Help)
              ↓
Separately, user's AI tool (Claude Desktop / Cursor / Claude Code)
  ├── Launched independently
  ├── Reads project's .mcp.json (written by init)
  ├── Spawns MCP stdio subprocess (packages/cli/src/commands/mcp.ts)
  │     ├── readServerLock() → port discovery  ← V0-1 shipped
  │     └── Connects to HTTP at http://localhost:<port>/api/*
  └── Agent writes attributed via AgentSessionManager transaction origins
```

### E1. Chain: clone-from-github
```
P1 non-dev user in empty editor
  ↓
FileSidebar empty-state → "Clone from GitHub" card
  ↓
CloneDialog (React)
  ├── URL input → parse → gh/PAT/Device-Flow auth (per clone-from-github spec)
  │     └── Electron-specific: shell.openExternal(deviceAuthUrl) for Device Flow
  ├── simple-git clone → shadow-repo startup HEAD-drift check → T0 upstream-import
  ├── initContent(dir) if no .open-knowledge/
  ├── spawn new utilityProcess for the cloned dir
  └── trust-pending banner in editor (server-instance flag)
```

---

## F. Patterns observed (cross-channel convergences)

1. **utilityProcess is the 2026 pattern for Electron child-processes.** Web + OSS channels converge. GitHub Desktop / Logseq still using `child_process` is historical, not normative.
2. **Electron-builder + electron-updater is the de facto package/update pair.** Reference-app cohort convergence.
3. **OAuth App + Device Flow + gh credential-helper delegation is universal** for on-device editors with no backend. Reports + code convergence.
4. **Bundled-binary-via-postinstall + asar-unpacked rewrite** is how `dugite` ships git, how `@parcel/watcher` ships native binaries, how OK Electron would ship either Bun runtime or native modules if needed.
5. **Signing recipe convergence**: `osxSign` + `hardenedRuntime: true` + entitlements.plist + `osxNotarize` via env-var credentials.
6. **Direct-download DMG (skip MAS)** for any app doing filesystem watching, child_process, or git shell-outs. 6/7 reference apps match.
7. **realpath-based document identity** is how TS / Node / rust-analyzer / pnpm / OK-server all resolve symlinks.
8. **"Clone" not "Open"** is the verb every editor uses for the github-onboarding flow (clone-from-github REPORT.md:68).
9. **Lock-file-with-PID + `process.kill(pid, 0)` liveness** is the portable process-exclusivity primitive across shadow-lock, server-lock, and the to-be-written Electron window-lock.
10. **Push-over-awareness for derived views** (CC1) is OK's invalidation protocol; any future view (backlinks, graph, outline) plugs into the same contract. Desktop inherits unchanged.

---

## G. Divergences & contradictions

| # | Channel A | Channel B | Resolution stance |
|---|---|---|---|
| G1 | Web channel says Electron 34+ is "current stable in early 2026" | electron-ops REPORT.md says Electron 41 introduces signed ASAR integrity | Both may be correct (Electron major bumps every 8 weeks — 41 may be current by implementation start). **Action: WebFetch releases page at rebase time.** Do NOT trust either claim as a 2026-04 hard fact. |
| G2 | Spec §8.5 proposes `sidebar-update` IPC channel (Util→Main) as optional | CC1 protocol SHIPPED via __system__ Y.Doc → renderer subscribes directly, no IPC | Remove §8.5 row. CC1 is the primitive. |
| G3 | Spec R9: "D-U-N-S Number, 1-6 week wait" flagged as path-blocker | electron-ops REPORT.md:116 confirms $99/yr + notarization is "98% <15min"; doesn't contradict enrollment wait | Not a contradiction — R9 remains valid as a calendar risk, just unrelated to per-build notarization latency. |
| G4 | web channel: "Obsidian has no first-party MCP" | Spec §8.11 assumes Claude Desktop / Cursor / Continue are installed and have MCP config files | Not contradictory — spec's MCP wiring targets the AI tools (Claude Desktop / Cursor / Continue) that DO ship MCP, not the editor (Obsidian) that doesn't. |

---

## H. Terminology (consolidated glossary)

| Term | Source | Definition |
|---|---|---|
| **utilityProcess** | Electron docs | Sandboxed Node.js child-process API; MessagePort IPC; canonical for 2026 |
| **@electron/fuses** | web/reports | Compile-time hardening flags flipped post-package, pre-sign |
| **ASAR integrity** | reports | Electron's packed-archive integrity check; signed digest in Electron 41 |
| **Hardened Runtime** | macOS | Signing flag required for JIT + native modules |
| **notarytool** | web | Apple's current notarization CLI (altool deprecated Nov 2023) |
| **Azure Trusted Signing** | web/reports | MS cloud HSM signing service, replaces EV USB HSM |
| **Device Flow** | clone-from-github | OAuth grant usable without client_secret; displays user-code, user authorizes in browser |
| **Workspace Trust** | reports | VSCode-origin security surface gating untrusted config in cloned repos |
| **CC1 / push-over-awareness** | OK code | OK's invalidation protocol: pure-signal `{v, ch, seq}` over `__system__` Y.Doc |
| **CC8 shutdown ordering** | OK CLAUDE.md | 6-phase server destroy: watcher → sessions → L1 flush → L2 flush → shadow lock → server lock |
| **server.lock** | OK code | `<contentDir>/.open-knowledge/server.lock` — JSON `{pid, hostname, port, startedAt, worktreeRoot}` |
| **Squirrel.Mac** | Electron | macOS auto-update framework behind electron-updater |
| **electron-updater `stagingPercentage`** | electron-ops | Per-release rollout throttle in `latest-mac.yml` |
| **dugite** | OSS | GitHub's embedded-git Electron binding; bundled-binary + asar-unpacked rewrite pattern |
| **`invalid_markdown` sentinel** | reports (TinaCMS) | Opaque-source node preserving unparsable content verbatim; pattern OK could adopt |

---

## I. UNRESOLVED / ADJACENT / INACCESSIBLE

### UNRESOLVED
- **Current Electron major version in 2026-04.** Web-channel surfaced "34+" (one trade source); reports-channel claims "41 introduces ASAR integrity." **Needs WebFetch of Electron releases page during rebase.**
- **ESM-in-utilityProcess status** (electron/electron#40031). Last datapoint: open as of 2026-04-11 per web-to-macos REPORT.md. **Needs re-check during rebase.**
- **`@parcel/watcher` ABI compat against the Electron version chosen at implementation.** Needs a packaged-app smoke test (covered by spec R10) — this is a known pattern not a true unknown.
- **Bun runtime inside utilityProcess** — can the utilityProcess run Bun instead of Node? Not mentioned in any channel. If unresolved at implementation time, default is Node 22+ in utilityProcess (per spec §5 locked constraint).
- **Logseq's `utilityProcess` usage** (OSS channel only skimmed `shell.cljs`). Could be a reference pattern if they've adopted it elsewhere. Low priority.

### ADJACENT
- **tinacms `invalid_markdown` fail-soft sentinel** — render-time pattern for unparsable source. OK's mdx-tolerant-parsing spec already has `rawMdxFallback` + `jsxInline` primitives. Not a blocker, but an adjacent pattern.
- **Pake / Wails / capacitor-desktop** — web-channel UNRESOLVED. Unlikely to be relevant but not ruled out.
- **Open-core / split-licensing `ee/` directory pattern** — open-core-split-licensing REPORT.md synthesized the pattern; Electron build needs a clean boundary between open-core code and any enterprise-edition code if OK goes AGPL + EE route. Adjacent to distribution, not Electron-specific.

### INACCESSIBLE
- **`reports/git-lifecycle-push-pull-merge-patterns/REPORT.md`** — uncommitted, only `meta/` exists on disk. Likely intersects with clone-from-github but not readable.
- **Official Electron `utilityProcess` sample repo** — not located on disk; recommendation is inferred from docs.

---

## J. Load-bearing aged-badly flags for the spec rebase

These are specific §-line claims the rebase should verify and update:

| Spec § | Claim | Action |
|---|---|---|
| §5 Locked: Electron 41+ | Version may be ahead of current stable | WebFetch releases page; align version, keep CVE-2025-55305 ASAR mitigation as the requirement |
| §5 Locked: ESM blocked in utilityProcess | electron/electron#40031 | Re-check issue status; if closed, relax constraint |
| §7.1 Distribution = npx | Zero-config-bunx-packaging spec reshapes this | Align with bunx mode, share bundling infra |
| §7.2 ServerInstance interface | Shape has enlarged (cc1Broadcaster, contentFilter, lockDir) | Update TypeScript snippet |
| §7.3 Default content include | Now `['**/*.md', '**/*.mdx']` | One-word fix |
| §7.4 Shadow repo at `.open-knowledge/.git` | Current path is `.git/openknowledge/` (integrated) OR `.openknowledge/` (standalone) — depends on presence of project `.git/` | Two-case description |
| §7.5 Sidebar polls every 5s | Server-side CC1 shipped; sidebar moving to push (Dima's pending) | Describe the push protocol; reference CC1 spec |
| §7.8 `.open-knowledge/` layout | Remove `catalogs/` | One-line delete |
| §7.9 What's missing | Several items shipped (auto-update would still be net-new; multi-project via windows still net-new) | Refresh list |
| §8.5 IPC table: `sidebar-update` optional | Redundant — CC1 handles this | Remove row |
| §8.8 Lock file model | Use the shipped `server-lock.ts` contract; do not re-spec | Replace §8.8 body with link + any Electron-specific additions (window-ownership metadata?) |
| §8.11 MCP wiring on first launch | Align with current init command evolution | Read current init flow; describe as "invokes existing init with source=desktop-gui" |
| §8.12 CLI shim install | `ok` vs `open-knowledge` — check name conflicts | Verify no existing `ok` CLI collisions on PATH |
| R1 | ESM in utilityProcess | Re-verify |
| R2 | Native-module rebuild on Electron upgrade | Still valid |
| R6 | Lock-file coexistence CLI↔desktop | Now solved at infra level via server-lock |
| D1 | cli-packaging spec's `[NEVER]` GUI/Electron | Update `cli-packaging/SPEC.md` to `[NOT NOW]` — lifted |

---

## K. Meta — channels & confidence

- **Channels run:** web (3 probes), code (/explore, very-thorough), OSS (4 repos + ecosystem discovery), reports (4 deep reads + catalog scan), user sources (SPEC.md, evidence, 5 intersecting specs, PROJECT.md)
- **Channels unavailable:** catalog skills (removed from repo)
- **Stagnation rule:** not triggered
- **Confidence ceiling per section:** A = CONFIRMED (code-verified); B = MEDIUM-HIGH (code + spec cross-refs); C = HIGH (spec-verified); D = HIGH; E = HIGH; F = MEDIUM-HIGH (multi-source convergence); G = MEDIUM (some divergences still open); H = HIGH; I = LOW by definition; J = MEDIUM
- **Non-prescription check:** passed — this doc reports what exists and changed; does not tell the rebase what to write

**Output compliance:** saved to `specs/2026-04-11-electron-desktop-app/evidence/worldmodel-2026-04-14-regrounding.md`; superseding-contextually the 2026-04-11 `worldmodel-topology.md` for rebase purposes.
