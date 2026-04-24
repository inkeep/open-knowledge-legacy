---
title: Cross-install version handshake — server.lock + project state
description: Extend server.lock with version metadata, add .open-knowledge/state.json for cold-start schema compatibility, gate desktop attach on protocol match, and reconcile mismatches via a user-consented kill-and-restart with directional asymmetry. Closes the silent cross-version attach surface surfaced during the 2026-04-23 entry-point architecture review.
tags: [spec, infrastructure, versioning, server-lock, desktop, cli, mcp, cross-install]
status: Draft — 2026-04-24
---

# Cross-install version handshake — server.lock + project state

**Status:** Draft
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-24
**Links:**

- Companion report (same PR): [`reports/server-paths/REPORT.md`](../../reports/server-paths/REPORT.md) — map of every collab + UI entry point; this spec closes the cross-install drift surface it exposes.
- Depends on: [`specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`](../2026-04-21-m6-cli-and-mcp-wiring/SPEC.md) — CLI-on-PATH + first-launch MCP wiring. This spec adds version metadata that M6's bundled-CLI path (`/usr/local/bin/ok`) will write into the same `server.lock`.
- Depends on: [`specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md`](../2026-04-20-cli-distribution-and-install-ux/SPEC.md) — distribution strategy. This spec is the cross-install-drift countermeasure that the distribution spec's NG7 "self-update" decision implicitly relied on.
- Related (precedent): [`packages/cli/src/commands/self-spawn.ts`](../../packages/cli/src/commands/self-spawn.ts) — `resolveSelfSpawn()` already eliminates *intra-tree* drift; this spec generalizes that anti-drift invariant to *inter-tree* (cross-install) boundaries.
- Architecture review transcript: 2026-04-23 (Mike × Andrew) — three-sources-of-truth reframe + kill-and-restart proposal.

---

## 1) Problem statement

**Situation.** Open Knowledge has four first-class install paths — `npx @inkeep/open-knowledge`, `npm install -g @inkeep/open-knowledge`, the Electron DMG (`@inkeep/open-knowledge-desktop`), and editor MCP configs written by `ok init` (bare `npx @inkeep/open-knowledge mcp` args per [`packages/cli/src/commands/editors.ts:24-25`](../../packages/cli/src/commands/editors.ts)). These paths share project state via `<contentDir>/.open-knowledge/` — specifically `server.lock` (ephemeral ownership record), the `.git/open-knowledge/` shadow repo (durable per-writer state per precedent #25), and the markdown files on disk.

Intra-install drift does not exist. The CLI publishes as a single bundled artifact — `@inkeep/open-knowledge-server` and `-core` are devDependencies in [`packages/cli/package.json:62-64`](../../packages/cli/package.json), tsdown rolls them into `dist/cli.mjs`. The DMG bundles the same server in its `utilityProcess.fork()` payload via electron-vite. CLI v1.5 is atomically server v1.5; DMG v1.5 is atomically bundled-server v1.5. Intra-tree sibling spawns (`ok mcp` → `ok start`, `ok start` → `ok ui`) use [`resolveSelfSpawn()`](../../packages/cli/src/commands/self-spawn.ts) which re-invokes `process.execPath + process.argv[1]` — the exact binary that is already running. **Drift is strictly a cross-install problem.**

**Complication.** The cross-install boundary is version-blind in three places:

1. **`server.lock` carries no version metadata.** [`ProcessLockMetadata`](../../packages/server/src/process-lock.ts) is `{pid, hostname, port, startedAt, worktreeRoot}`. Nothing identifies *which* runtime wrote it. Desktop [`tryAttachExistingServer`](../../packages/desktop/src/main/window-manager.ts) (lines 595-606) gates on liveness only: lock exists + same host + pid alive + port>0 → attach. DMG v1.5 can silently drive a CLI v1.0-written WS server, or vice versa. Any API shape change between those versions lands here as silent misbehavior.
2. **No durable state-compatibility gate.** The shadow repo at `<projectRoot>/.git/open-knowledge/` stores per-writer WIP refs, upstream-import, and checkpoint (precedent #25). If a format change ships (e.g., new writer-ID category, new checkpoint metadata, new branch-naming convention), there is no mechanism by which a runtime opening the project cold refuses to read state it does not understand. A crash-killed v1.5 server leaves no live lock; next morning CLI v2.0 cold-starts and reads `.open-knowledge/` blind.
3. **`ok init` writes unpinned MCP commands.** [`buildManagedServerEntry`](../../packages/cli/src/commands/editors.ts) emits `{command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']}`. Every editor launch re-resolves, so the version each editor's MCP child runs can drift silently over weeks. Two editors on the same machine can end up speaking two different protocol versions to the same lock owner.

M6's first-launch MCP wiring partially addresses #3 by writing `/usr/local/bin/ok mcp` (the bundled-CLI shim) into Electron-origin configs — but that only pins the editor side of the DMG-user flow. The CLI-user flow still writes unpinned `npx`. And M6 does nothing about #1 or #2.

**Resolution.** Add version metadata to the two boundaries that already enforce ownership — `server.lock` (live authority) and a new `.open-knowledge/state.json` (durable authority). On cross-install mismatch, apply a direction-asymmetric user-consented kill-and-restart policy. Offer an opt-in `--pin` on `ok init` for CLI users who want reproducible MCP launch.

---

## 2) Three sources of truth

| Authority                        | Answers                                  | Lives in                                                      | Status                |
|----------------------------------|------------------------------------------|---------------------------------------------------------------|-----------------------|
| **Runtime self-identity**        | "How do I spawn a sibling?"              | `process.execPath + process.argv[1]` via `resolveSelfSpawn()` | Exists (precedent)    |
| **Session authority**            | "Who owns this project right now?"       | `server.lock` — extend with version fields                    | Extend existing       |
| **Durable state compatibility**  | "Can anyone read this project at all?"   | NEW: `.open-knowledge/state.json` — `stateSchemaVersion`      | New, one file         |

Each question has exactly one file/mechanism. No global machine-level "active runtime" pointer (D1, rejected). The ephemeral lock answers "can I attach *right now*?"; the durable state manifest answers "can I read this project *at all*?"

---

## 3) Goals

- **G1 — Lock version metadata.** `ProcessLockMetadata` is extended with `runtimeVersion` (semver of the published CLI / DMG bundled CLI that wrote the lock), `protocolVersion` (integer incremented on any cross-process API break), and `executablePath` (absolute `process.argv[1]` of the lock writer, for diagnostics only — not used for re-exec per D3). `startedAt`, `pid`, `hostname`, `port`, `worktreeRoot` continue to mean the same thing.
- **G2 — Durable state schema manifest.** A `.open-knowledge/state.json` is written on first project open / first server boot, containing `{stateSchemaVersion: integer, createdAt: iso, createdBy: {runtimeVersion, protocolVersion}}`. Every runtime that opens the project cold reads this file before touching the shadow repo. Rules:
  - **Genuinely fresh project** (no `.open-knowledge/` AND no `.git/open-knowledge/`) → write at `stateSchemaVersion = STATE_SCHEMA_VERSION` (current).
  - **Adopting a pre-versioned project** (manifest missing AND any prior state present — an `.open-knowledge/` directory or a `.git/open-knowledge/` shadow repo) → write at `stateSchemaVersion = 0` with `createdBy.adoptedAt` set and a one-time warning logged. v=0 is the pre-manifest sentinel; the current binary continues iff its `STATE_SCHEMA_VERSION` can read schema-0 state (true for v1 by definition).
  - **Present manifest** → `stateSchemaVersion` must equal the current binary's `STATE_SCHEMA_VERSION`. Not-equal → refuse to boot (NG4 — no on-the-fly migration). Corrupt → throw (D11 / NG8).
- **G3 — Desktop attach gates on protocol match.** [`tryAttachExistingServer`](../../packages/desktop/src/main/window-manager.ts) reads the lock's `protocolVersion` alongside its existing liveness checks. Match → attach (current behavior preserved). Mismatch → branch to G4 / G5 per direction.
- **G4 — Kill-and-restart on compatible-direction mismatch.** When desktop's protocol ≥ lock's protocol, surface a user-consent dialog identifying the lock owner by a label derived from `lock.executablePath` (see §6.4 for the resolver: Electron `.app` path → "Open Knowledge desktop vX.Y"; `cli.mjs` / `/ok` path → "Open Knowledge CLI vX.Y"; else the raw path). On accept, send `SIGTERM` to `lock.pid`, poll for process death (≤5s), then proceed to `acquireProcessLock` which natively handles any stale-but-not-removed lock via its existing replace path (`process-lock.ts:144-149`). On decline, close the new window. **Silent kill is prohibited** (NG3).
- **G5 — Hard-refuse on incompatible-direction mismatch.** When desktop's protocol < lock's protocol, refuse the window open with a modal: *"Open Knowledge CLI vA.B is driving this project with a newer protocol (vP). Upgrade the desktop app or quit the CLI to continue."* Downgrading the active server could corrupt on-disk state the newer server already wrote (NG5 prohibits migration).
- **G6 — MCP refuses on mismatch.** The MCP stdio process ([`packages/cli/src/mcp/server-discovery.ts`](../../packages/cli/src/mcp/server-discovery.ts)) extends [`decideAutoStart`](../../packages/cli/src/mcp/server-discovery.ts) to check lock `protocolVersion` before returning `connect`. On mismatch, exit 1 with a diagnostic to stderr: *"Server vA.B is running (protocol vP); MCP vX.Y needs protocol vQ. Quit the server or reconcile versions."* MCP cannot prompt (no UI, no attended user) — refusing is the only safe default.
- **G7 — `ok init --pin` for reproducible CLI-side MCP.** `ok init` gains `--pin` / `--no-pin` (default `--no-pin` preserves current behavior). `--pin` writes `{command: <absolute process.argv[1]>, args: ['mcp']}` — the exact binary that ran `ok init`. Users who want `npx`-style self-healing keep the default; users who want determinism opt in.
- **G8 — `bun run check` stays green.** New pure-function tests land alongside each new file (lock-version parsing, state-manifest read/write, attach-mismatch decision). No CI tier promotion.

---

## 4) Non-goals

- **[NEVER] NG1 — Machine-level active-runtime pointer.** The prior architectural proposal (`~/.open-knowledge/current` or similar) was considered and rejected (D1). `resolveSelfSpawn()` + `lock.executablePath` cover intra-tree and diagnostic needs respectively; no global pointer is needed. A pointer file would trade N unpinned editor configs for one centralized elector with its own drift story (who writes it? whose wins when multiple installs race? what happens when the user deletes it?). Revisit: never, or only if the other three mechanisms prove insufficient in production.
- **[NEVER] NG2 — `--pin` as the default for `ok init`.** `npx`-style self-heals after reinstall; the stable absolute path does not. Rewriting to an absolute path silently breaks every editor MCP config when the user `rm -rf ~/.open-knowledge/` or moves their install. Pin is opt-in for users who prioritize reproducibility.
- **[NEVER] NG3 — Silent kill of the lock owner.** G4 mandates a user-consent dialog before `SIGTERM`-ing another process. A server may be hosting live MCP connections from multiple editors, mid-flight agent writes, or an agent-presence loop; silent termination drops those connections without the user's knowledge. The dialog is the firebreak.
- **[NEVER] NG4 — Auto-migration across incompatible `stateSchemaVersion`.** A version-mismatching runtime must refuse to boot, not rewrite state. Migration is a scoped workstream (NG5, not-now). This spec only adds the *detection* mechanism.
- **[NOT NOW] NG5 — On-the-fly protocol or schema migration tooling.** When we ship a breaking bump, we will need a migration path. This spec deliberately does not scope the migrator — it scopes the *detection* that makes a migrator possible. Revisit when the first breaking protocol bump is planned AND the distribution strategy (CLI + DMG auto-updater) is stable enough to ship a coordinated migration.
- **[NOT NOW] NG6 — Re-exec the lock owner's executable.** The original architecture proposal from the prior agent suggested desktop re-exec via `lock.executablePath` to self-heal to the lock writer's version. This has real macOS code-signing / entitlement implications for a signed Electron app shelling out to an un-adjacent binary (D3 evidence). Revisit: if macOS codesigning policy for Electron apps relaxes, OR if the kill-and-restart dialog's UX cost proves unacceptable in production telemetry.
- **[NOT NOW] NG7 — Windows / Linux version-handshake policy.** Desktop UX is macOS-only per the parent Electron spec (D51). Windows and Linux policies inherit the CLI-side rules automatically (MCP refuse, CLI `ok start` refuse on live collision) but the desktop-side kill-and-restart dialog is macOS-only until D51 is reopened.
- **[NEVER] NG8 — State-manifest corruption masks attach failure.** If `.open-knowledge/state.json` parses but has nonsense values, refuse to boot (fail loud). Do not treat corrupt-manifest as absent-manifest; the latter implies a fresh-or-adopted project and writing a new manifest could overwrite real state the current binary cannot parse (see G2 for the fresh-vs-adopt split).

---

## 5) Scope

### Files — server package

| File                                              | Change                                                                                     |
|---------------------------------------------------|--------------------------------------------------------------------------------------------|
| `packages/server/src/process-lock.ts`             | Extend `ProcessLockMetadata` with `runtimeVersion: string`, `protocolVersion: number`, `executablePath: string`. Update `acquireProcessLock`, `updateProcessLockPort` to write the new fields. Promote `readProcessLock` return type to a tagged union so callers can distinguish *no lock* from *incompatible lock* (see §6.1). Backfill tests. |
| `packages/server/src/process-lock.test.ts`        | Existing test file — extend for the new fields + tagged-union return. Cover: idempotent rewrite preserves versions; cross-host lock → `{status: 'absent'}` as before; missing-field lock → `{status: 'incompatible', reason: 'missing-fields'}` (new); corrupt lock → `{status: 'incompatible', reason: 'corrupt'}`. |
| `packages/server/src/server-lock.ts`              | Thin wrapper — pipe runtimeVersion + protocolVersion from the server package's build-time constants. |
| `packages/server/src/version-constants.ts`        | **NEW** — exports `RUNTIME_VERSION: string` (from `package.json` via a `define` / `env` entry in `tsdown.config.ts` that reads `package.json` at build time — pattern documented in the tsdown docs and common across esbuild/Vite-style bundlers), `PROTOCOL_VERSION: number` (hand-bumped per D13), `STATE_SCHEMA_VERSION: number` (hand-bumped per NG5). Single source of truth. |
| `packages/server/src/state-manifest.ts`           | **NEW** — `readStateManifest(contentDir)`, `writeStateManifest(contentDir, {runtimeVersion, protocolVersion, stateSchemaVersion})`, `detectProjectShape(contentDir): 'fresh' \| 'adopt'`, `assertCompatibleStateManifest(contentDir)`. Used at `bootServer` entry before touching shadow repo. |
| `packages/server/src/state-manifest.test.ts`      | **NEW** — fresh-project write; adoption write (schema-0 sentinel); reopen with same version OK; reopen with lower `stateSchemaVersion` throws; corrupt manifest throws (not "fresh"). |
| `packages/server/src/boot.ts`                     | Two changes: (1) on entry, call `assertCompatibleStateManifest(contentDir)` before acquiring lock / initializing shadow repo; write the manifest on first open via the G2 fresh-vs-adopt split. (2) Register `process.on('SIGTERM', …)` / `process.on('SIGINT', …)` handlers that drain Hocuspocus, flush persistence, release the server lock, and exit. Current code has no such handler (on default-kill, the lock file persists until the next acquirer declares it stale) — the kill-and-restart flow (§6.4) relies on this new handler to release the lock promptly when desktop SIGTERMs a CLI server. |
| `packages/server/src/boot.test.ts`                | Existing — cover the new pre-flight assertion paths + SIGTERM graceful-shutdown path (signal handler runs destroy, flushes, releases lock, exits). |
| `packages/server/src/index.ts`                    | Export `readStateManifest`, `writeStateManifest`, `PROTOCOL_VERSION`, `STATE_SCHEMA_VERSION` for downstream consumers. |

### Files — app package (Vite dev-server)

| File                                                    | Change                                                                                                    |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `packages/app/src/server/hocuspocus-plugin.ts`          | The Vite plugin (`bun run dev`) calls `acquireServerLock(...)` at line 121. Wire `RUNTIME_VERSION` + `PROTOCOL_VERSION` + `executablePath` through to the lock-writer call. Without this, the `bun run dev` entry (#3 in `reports/server-paths/REPORT.md`) writes a version-less lock and triggers the "incompatible" fail-closed path for any consumer that reads it. |

### Files — CLI package

| File                                                    | Change                                                                                                    |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `packages/cli/src/mcp/server-discovery.ts`              | Extend `decideAutoStart` input with `expectedProtocolVersion: number`; on `connect` path, if lock's `protocolVersion` !== expected, return `{action: 'incompatible', message}`. Caller (`ensureServerRunning`) surfaces a clear stderr message and throws — MCP process exits 1. |
| `packages/cli/src/mcp/server-discovery.test.ts`         | Extend for incompatible branch (existing test-table pattern covers this cleanly).                          |
| `packages/cli/src/mcp/index.ts`                         | Pass `PROTOCOL_VERSION` from `@inkeep/open-knowledge-server` into `createProjectServerUrlResolver`.         |
| `packages/cli/src/commands/init.ts`                     | Add `--pin` / `--no-pin` option to Commander action. Default false. When true, call `buildManagedServerEntry({mode: 'pinned', cliEntryPath: process.argv[1]})`. |
| `packages/cli/src/commands/editors.ts`                  | Extend `McpInstallMode` union with `'pinned'`. Extend `buildManagedServerEntry` to emit `{command: node, args: [<absolute cliEntryPath>, 'mcp']}` when `mode === 'pinned'`. |
| `packages/cli/src/commands/editors.test.ts`             | Cover the new pinned branch: arg shape, cliEntryPath resolution, env passthrough matches the `dev` branch pattern. |

### Files — desktop package

| File                                                    | Change                                                                                                    |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `packages/desktop/src/main/window-manager.ts`           | Extend `tryAttachExistingServer` to consume the tagged-union `readProcessLock` result; return `{lock, compatibility}` where `compatibility ∈ 'match' \| 'newer-desktop' \| 'older-desktop' \| 'incompatible'`. Branch `createProjectWindow`: `'match'` → attach (unchanged); `'newer-desktop'` → prompt + kill-and-restart; `'older-desktop'` → refuse; `'incompatible'` (missing-fields / corrupt lock) → refuse with a distinct "unrecognized server" dialog (see §6.3). |
| `packages/desktop/src/main/window-manager.test.ts`      | New test cases: attach match (existing), newer-desktop → kill-and-restart path, older-desktop → refuse, incompatible → refuse with unrecognized-server copy, kill-and-restart timeout → clear failure surface. |
| `packages/desktop/src/main/version-mismatch-dialog.ts`  | **NEW** — `describeLockHolder(lock): string` derives a human label from `lock.executablePath` + `lock.runtimeVersion` ("Open Knowledge desktop vX.Y" for `.app` paths, "Open Knowledge CLI vX.Y" for `cli.mjs` / `/ok` paths, raw path fallback). `promptKillAndRestart({lock, desktopVersion, contentDir, holderLabel})` returns `Promise<'kill' | 'cancel'>`. `promptRefuseOlderDesktop({...})` for G5. `promptRefuseIncompatible({lock, contentDir})` for the `'incompatible'` compatibility case. |
| `packages/desktop/src/main/version-mismatch-dialog.test.ts` | **NEW** — pure factory tests for `describeLockHolder` (every executable-path shape) + dialog-message builders (Electron-free via dep injection, matching the `window-manager.test.ts` pattern). |
| `packages/desktop/src/main/kill-and-restart.ts`         | **NEW** — `killAndAwaitLockRelease({lock, lockPath, timeoutMs: 5000})`. Sends SIGTERM, polls for `!isProcessAlive(lock.pid)` AND lock file absent OR pid changed. Throws on timeout. Isolated for unit testing. |
| `packages/desktop/src/main/kill-and-restart.test.ts`    | **NEW** — fake-process cases: clean exit before deadline; hung-holder throws; already-dead pid short-circuits; lock-already-released short-circuits. |

### Documentation

| File                                                                  | Change                                                                |
|-----------------------------------------------------------------------|-----------------------------------------------------------------------|
| `reports/server-paths/REPORT.md` (companion PR #301)                  | Add §5 "Cross-install version drift" with pointer to this spec.       |
| `packages/server/README.md`                                           | Document the new lock fields + state.json schema + compatibility rules.|
| `packages/desktop/README.md`                                          | Document the attach-mismatch UX (dialog, kill-and-restart, refuse).    |
| `PRECEDENTS.md`                                                       | New numbered precedent: "Cross-install boundaries use version-explicit handshakes; never attach version-blind." Point to this spec + `resolveSelfSpawn` as the intra-tree analog. |

---

## 6) Key designs

### 6.1 Lock schema (evolution of `ProcessLockMetadata`)

```ts
export interface ProcessLockMetadata {
  pid: number;
  hostname: string;
  port: number;
  startedAt: string;
  worktreeRoot: string;
  // NEW:
  runtimeVersion: string;       // e.g., "0.3.0" — from package.json via build-time constant
  protocolVersion: number;      // integer; hand-bumped on any cross-process API break
  executablePath: string;       // absolute process.argv[1] of the writer; diagnostics only
}
```

Read-time compatibility: a lock with **any** missing version field is treated as incompatible (not as stale, not as corrupt). This fails closed — a v1.5 binary opening a v0.x-written lock cannot guess at the protocol level and must branch to the mismatch paths.

To make this actionable at every call site, promote `readProcessLock` from `ProcessLockMetadata | null` to a tagged union:

```ts
export type ReadLockResult =
  | { status: 'absent' }                                                        // no file
  | { status: 'stale'; raw: ProcessLockMetadata }                               // dead pid or foreign host — existing stale semantics
  | { status: 'live'; lock: ProcessLockMetadata }                               // parseable + alive + all fields present
  | { status: 'incompatible'; reason: 'missing-fields' | 'corrupt'; raw: unknown }; // live holder we can't version-classify
```

Without this, callers cannot distinguish *no lock* (proceed to acquire) from *live lock we can't parse* (refuse + surface). `tryAttachExistingServer` (desktop) maps `'incompatible'` → `compatibility: 'incompatible'` (distinct from `'older-desktop'` per §6.3); `decideAutoStart` (MCP) maps `'incompatible'` → `action: 'incompatible'` (§6.3, G6).

### 6.2 State manifest schema (`.open-knowledge/state.json`)

```jsonc
{
  "stateSchemaVersion": 1,
  "createdAt": "2026-04-24T13:45:00.000Z",
  "createdBy": {
    "runtimeVersion": "0.3.0",
    "protocolVersion": 1
  },
  "lastWriteBy": {
    "runtimeVersion": "0.3.0",
    "protocolVersion": 1,
    "at": "2026-04-24T13:45:00.000Z"
  }
}
```

`stateSchemaVersion` is the load-bearing field; the `createdBy` / `lastWriteBy` records are diagnostic (helps users file bugs with "was written by vX.Y"). `lastWriteBy` is updated opportunistically on successful boot, not on every write (avoiding write-amplification). `createdBy.adoptedAt` is set (instead of a fresh `createdAt`) when this binary wrote the manifest as part of adopting a pre-versioned project — see rules below.

Boot-time rules (keep in sync with G2):

| Situation                                                                              | Action                                                                                                      |
|----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Manifest present, `stateSchemaVersion` matches current binary                          | Proceed. Update `lastWriteBy`.                                                                              |
| Manifest present, `stateSchemaVersion` does not match                                  | Throw — NG4 prohibits on-the-fly migration.                                                                 |
| Manifest present, corrupt or schema-invalid                                            | Throw — NG8 (do not treat corrupt as absent).                                                               |
| Manifest absent, no `.open-knowledge/` AND no `.git/open-knowledge/` (fresh project)   | Write manifest at `stateSchemaVersion = STATE_SCHEMA_VERSION`, `createdAt = now`.                            |
| Manifest absent, any pre-existing state (`.open-knowledge/` OR `.git/open-knowledge/`) | Write manifest at `stateSchemaVersion = 0` (pre-manifest sentinel), `createdBy.adoptedAt = now`. Log a one-time adoption warning. Current binary (v1) can read schema-0 state by definition; future v≥2 binaries can still refuse if they can't. |

The fresh-vs-adopt split is load-bearing for the rollout — every existing project on the day this ships has a shadow repo and no manifest. Writing today's `STATE_SCHEMA_VERSION` over them would erase the information that they pre-date the manifest scheme and mislead any future version-gating.

### 6.3 Attach compatibility matrix

| Initiator             | Lock owner / lock state                         | Policy                                                                                        |
|-----------------------|-------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Desktop cold open     | No lock                                          | Acquire lock, fork utility (current behavior).                                                |
| Desktop cold open     | Stale lock (dead pid, or cross-host)             | `runClean` removes stale lock, fork utility (current behavior).                               |
| Desktop cold open     | Live lock, protocol matches                      | Attach (current behavior, preserved by G3).                                                   |
| Desktop cold open     | Live lock, desktop protocol > lock protocol      | **G4** — prompt user; on accept, SIGTERM lock.pid, poll for release ≤5s, fork utility.         |
| Desktop cold open     | Live lock, desktop protocol < lock protocol      | **G5** — refuse modal; no kill; window does not open until user reconciles.                    |
| Desktop cold open     | Live lock, missing version fields OR corrupt     | **`compatibility: 'incompatible'`** — refuse with distinct "unrecognized server" dialog (§5 desktop scope). Missing fields ≠ older; the writer's protocol is unknown, not inferior. Kill is prohibited here because the kill-direction guarantees in D4 don't hold for unknown state. |
| CLI `ok start`        | Any live lock                                    | Refuse with `ServerLockCollisionError` (current behavior, unchanged).                          |
| CLI `ok mcp`          | Live lock, protocol matches                      | Connect (current behavior).                                                                    |
| CLI `ok mcp`          | Live lock, protocol mismatches (either direction)| **G6** — exit 1 with stderr diagnostic; MCP client sees connection error and can be restarted after user reconciles. |
| CLI `ok mcp`          | No lock, auto-spawn allowed                      | Detach-spawn `ok start` via `resolveSelfSpawn()` (current behavior).                           |

### 6.4 Kill-and-restart flow (G4)

```
desktop.createProjectWindow(projectPath)
  │
  ├─ tryAttachExistingServer(lockDir) → {lock, compatibility}
  │    ├─ compatibility === 'match' → attachToExistingServer (unchanged)
  │    ├─ compatibility === 'older-desktop' → promptRefuseOlderDesktop → abort
  │    ├─ compatibility === 'incompatible' → promptRefuseIncompatible → abort
  │    └─ compatibility === 'newer-desktop' ↓
  │
  ├─ holderLabel = describeLockHolder(lock)          // parameterized per §5 desktop scope
  ├─ promptKillAndRestart({lock, desktopVersion, contentDir, holderLabel}) → 'kill' | 'cancel'
  │    └─ 'cancel' → abort (window does not open)
  │
  ├─ killAndAwaitProcessDeath({pid: lock.pid, timeoutMs: 5000})
  │    ├─ SIGTERM lock.pid
  │    ├─ poll every 100ms until !isProcessAlive(lock.pid)
  │    ├─ timeout → throw; surface "Failed to stop {holderLabel}; try quitting it manually"
  │    └─ success → proceed
  │
  └─ runClean + acquireProcessLock + forkUtility + ready handshake
     (runClean prunes any stale file left by the killed holder;
      acquireProcessLock also handles stale-replace natively at process-lock.ts:144-149)
```

The poll condition intentionally tracks process death only, not lock-file removal. The killed holder **should** unlink its lock via the graceful-shutdown handler that this spec adds to `bootServer` (§5 server package). But a wedged event loop or a pre-spec CLI that predates the handler will default-exit and leave the lock file behind — that is recovered from on the next `acquireProcessLock` via its existing stale-replace path, so the user-visible kill flow does not depend on the graceful handler to run end-to-end.

Escalation to SIGKILL is out of scope — if the holder process is alive after 5s of SIGTERM, surface the failure to the user rather than force-kill mid-flush (D12).

### 6.5 Version-bump policy (D13)

- `runtimeVersion` tracks `package.json` — semver, human-readable, set at publish time. Used for logs / dialogs only.
- `protocolVersion` is an integer incremented whenever a cross-process API or lock-field contract breaks. **What counts as a break** (and thus triggers a bump): renaming or removing a lock field; changing the shape of a WS frame between server and Electron renderer; adding a required field to the MCP auto-start handshake; changing an HTTP API response field that an existing installed binary depends on. **Non-breaking additions do NOT bump**: new optional lock fields, new WS frame types unknown readers can ignore, new HTTP endpoints, added response fields that don't replace old ones.
- `STATE_SCHEMA_VERSION` increments whenever on-disk durable state changes shape in a way older binaries cannot safely read. Examples: adding a new writer-ID category; changing shadow-repo branch naming; migrating the agent-presence map.

All three live as exported constants in `packages/server/src/version-constants.ts`. Bumping is an explicit code change, not automatic. See D13 for the policy closure that retires the earlier Q1.

---

## 7) Acceptance criteria

### Group A — Lock metadata

| #   | Criterion                                                                                              | Verification                                                   |
|-----|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| A1  | `ProcessLockMetadata` has `runtimeVersion`, `protocolVersion`, `executablePath`.                        | `packages/server/src/process-lock.ts` — type inspection + test. |
| A2  | `acquireProcessLock` writes all eight fields (existing five + three new).                              | `process-lock.test.ts` — existing test file, new assertions.   |
| A3  | `updateProcessLockPort` preserves the version fields (idempotent rewrite).                             | `process-lock.test.ts` — new case.                             |
| A4  | `readProcessLock` returns `{status: 'absent' \| 'stale' \| 'live' \| 'incompatible'}` tagged union — missing-field locks → `{status: 'incompatible', reason: 'missing-fields'}`; corrupt locks → `{status: 'incompatible', reason: 'corrupt'}`; alive + valid → `{status: 'live', lock}`. | `process-lock.test.ts` — one case per status.                   |
| A5  | Writing a v0.x-shape lock (missing fields) and then calling `readProcessLock` via v1.x code returns `{status: 'incompatible', reason: 'missing-fields'}` — NOT `{status: 'absent'}`. Backward-compat smoke. | `process-lock.test.ts` — forward-compat test with hand-crafted JSON. |
| A6  | `bootServer` registers `SIGTERM` + `SIGINT` handlers that drain Hocuspocus, flush persistence, release the server lock, then `process.exit(0)`. | `boot.test.ts` — new case; simulate signal, assert lock file absent + exit invoked. |

### Group B — State manifest

| #   | Criterion                                                                                              | Verification                                                   |
|-----|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| B1  | `bootServer` writes `.open-knowledge/state.json` on first open with current version constants.         | `boot.test.ts` — extend existing.                              |
| B2  | `bootServer` reopening the same project with matching `stateSchemaVersion` succeeds.                    | `boot.test.ts`.                                                |
| B3  | `bootServer` reopening with `stateSchemaVersion < current` throws a clear error before any shadow-repo IO. | `state-manifest.test.ts` + integration via `boot.test.ts`.     |
| B4  | `bootServer` reopening with a corrupt or empty manifest file throws (does NOT treat as fresh).         | `state-manifest.test.ts`.                                      |
| B5  | `lastWriteBy` is updated on successful boot; read failures do not corrupt the manifest.                | `state-manifest.test.ts`.                                      |
| B6  | **Adoption path.** A project with a pre-existing `.git/open-knowledge/` shadow repo (or `.open-knowledge/` directory) and no `state.json` gets a manifest written at `stateSchemaVersion = 0` with `createdBy.adoptedAt` set — NOT at the current `STATE_SCHEMA_VERSION`. Adoption-warning log line emitted once. | `state-manifest.test.ts` — seed a shadow repo, boot, assert manifest schema version 0 + adoptedAt present. |

### Group C — Desktop attach handshake

| #   | Criterion                                                                                              | Verification                                                   |
|-----|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| C1  | `tryAttachExistingServer` returns `compatibility: 'match'` when protocols match. Attach path unchanged from today. | `window-manager.test.ts` — new test, asserts current behavior preserved. |
| C2  | `tryAttachExistingServer` returns `'newer-desktop'` when desktop protocol > lock protocol.              | `window-manager.test.ts`.                                      |
| C3  | `tryAttachExistingServer` returns `'older-desktop'` when desktop protocol < lock protocol.              | `window-manager.test.ts`.                                      |
| C4  | `tryAttachExistingServer` returns `'older-desktop'` on missing-field locks (fail-closed).               | `window-manager.test.ts`.                                      |
| C5  | `createProjectWindow` with `'newer-desktop'` + user declines prompt → no window opens, no process killed. | `window-manager.test.ts` — dep-injected dialog returns `'cancel'`. |
| C6  | `createProjectWindow` with `'newer-desktop'` + user accepts → SIGTERM fired, poll succeeds, utility forked, window opens. | `window-manager.test.ts` — dep-injected dialog + kill primitives. |
| C7  | `createProjectWindow` with `'newer-desktop'` + user accepts + kill timeout → clear error surfaced, no window opens, no partial state. | `window-manager.test.ts`.                                      |
| C8  | `createProjectWindow` with `'older-desktop'` → refuse dialog, no kill, no window opens.                 | `window-manager.test.ts`.                                      |
| C9  | `createProjectWindow` with `'incompatible'` (missing-fields or corrupt lock) → distinct "unrecognized server" refuse dialog, no kill, no window opens. Dialog surfaces `lock.executablePath` when available. | `window-manager.test.ts`.                                      |
| C10 | `describeLockHolder` returns "Open Knowledge desktop vX.Y" for Electron `.app` paths, "Open Knowledge CLI vX.Y" for CLI-shape paths (`cli.mjs`, `/ok`, `/open-knowledge`), raw path for everything else. | `version-mismatch-dialog.test.ts` — parametric over executablePath shapes. |

### Group D — MCP mismatch

| #   | Criterion                                                                                              | Verification                                                   |
|-----|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| D1  | `decideAutoStart` returns `{action: 'incompatible', ...}` when live lock protocol ≠ expected.          | `server-discovery.test.ts` — existing test-table pattern.      |
| D2  | `ensureServerRunning` on `incompatible` throws with stderr diagnostic naming both versions.             | `server-discovery.test.ts`.                                    |
| D3  | MCP exit code is 1 on incompatible connect attempt (not 0, not 2).                                     | `packages/cli/src/mcp/index.test.ts` — e2e exit-code check.    |

### Group E — `ok init --pin`

| #   | Criterion                                                                                              | Verification                                                   |
|-----|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| E1  | `ok init --pin` writes `{command: node, args: [<absolute process.argv[1]>, 'mcp']}` into editor configs. | `editors.test.ts` — new pinned-mode test.                      |
| E2  | `ok init` (no flag) still writes `{command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']}` (unchanged). | `editors.test.ts` — existing test, asserts no regression.      |
| E3  | `ok init --pin` from a `dist/cli.mjs` path and from a monorepo dev path both produce sensible absolute paths. | `editors.test.ts` — parametric.                                |
| E4  | `ok init --pin` on a configured editor with an existing unpinned entry → merges to pinned, idempotent on re-run. | `editors.test.ts`.                                             |

### Group F — Quality gate

| #   | Criterion                                                                                              | Verification                                                   |
|-----|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| F1  | `bun run check` green after all changes.                                                                | CI.                                                            |
| F2  | No new dependencies introduced.                                                                         | `bun.lock` diff inspection.                                    |
| F3  | Per-package unit tests cover each new file.                                                             | Coverage by inspection.                                        |

---

## 8) Decision log

| D#  | Decision                                                                                              | Status    | Reversible? | Rationale                                                                                                     | References                                                  |
|-----|-------------------------------------------------------------------------------------------------------|-----------|-------------|---------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| D1  | No machine-level active-runtime pointer (e.g., `~/.open-knowledge/current`).                           | LOCKED    | No          | Trades N unpinned editor configs for one centralized elector with its own drift story (who writes it, who wins when installs race, what happens when user deletes it). `resolveSelfSpawn` + `lock.executablePath` covers intra-tree + diagnostics needs. The pyenv/nvm/rustup analogy is a warning: pointer files grow into full install managers. | §2, NG1                                                     |
| D2  | Version metadata lives on `server.lock` (live authority) AND `.open-knowledge/state.json` (durable authority) — two files, not one.                           | LOCKED    | No          | Ephemeral vs durable answer different questions. Merging them would make crash-killed state invisible (no live lock → no version gate on cold start).                                                                        | §2, §6.1, §6.2                                              |
| D3  | On desktop↔CLI mismatch, kill-and-restart the lock owner (the user's proposal), NOT re-exec `lock.executablePath`. Gated on direction + user consent.          | LOCKED    | Yes         | User proposed in 2026-04-24 review. Re-exec is *believed* to carry macOS hardened-runtime / entitlement friction for a signed Electron app invoking an un-adjacent CLI binary (not empirically tested in this spec; revisit per NG6 trigger). The core argument stands either way: kill-and-restart launches desktop's OWN bundled server, so there is zero cross-binary codesign surface to reason about. Refinements added in D4 + D5.                                                | §3 G4/G5, §6.4, NG6                                         |
| D4  | Direction-asymmetric: desktop may kill-and-restart *only when* its own protocol ≥ lock's. Older-desktop-vs-newer-lock hard-refuses.                              | LOCKED    | No          | Killing a newer server to start an older one could corrupt on-disk state the newer server already wrote (NG4 prohibits migration). Asymmetry protects state integrity. Analogous to why npm/yarn refuse to downgrade lockfiles without explicit opt-in. | §6.3 matrix                                                 |
| D5  | Kill requires explicit user consent via a dialog; silent kill is prohibited.                                                                                     | LOCKED    | No          | Lock owner may be hosting live MCP connections, mid-flight agent writes, or editor MCP clients. Silent termination drops those without user awareness. Dialog also provides a diagnostic surface for "why did my CLI server just die".                                                                                                      | §3 G4, NG3                                                  |
| D6  | CLI-direction asymmetry: CLI `ok start` never kills a live lock owner; always refuses with collision error.                                                       | LOCKED    | Yes         | A user running `ok start` in a terminal while desktop is open is typically racing by accident, not by intent. Terminal has no UI affordance for a graceful "restart the desktop?" prompt — so refuse. User can quit desktop manually with full awareness.                                                                                   | §6.3 matrix                                                 |
| D7  | MCP on mismatch exits with code 1, does not auto-spawn sibling.                                                                                                  | LOCKED    | Yes         | MCP has no attended user, cannot prompt. Auto-spawn would collide (`ProcessLockCollisionError`) or succeed in some racey cases and leave two servers fighting. Exit 1 surfaces the error to the editor's MCP log where the user can reconcile.                                                                                              | §3 G6                                                       |
| D8  | `--pin` is opt-in (NOT default) for `ok init`.                                                                                                                    | LOCKED    | Yes         | Default `npx` self-heals after install rewrites / path moves. Absolute-path pinning silently breaks editor MCPs when the user reinstalls or deletes `~/.open-knowledge/`. Default preserves the self-healing property; `--pin` serves the reproducibility audience.                                                                            | §3 G7, NG2                                                  |
| D9  | `protocolVersion` is an integer, not semver.                                                                                                                      | LOCKED    | Yes         | Easy to compare (`a < b`, `a === b`). Semver compare is fine too but invites subtle "is this a breaking change or a minor?" disputes at bump time. Integer forces a binary decision: "does this break cross-process contracts? yes → bump." `runtimeVersion` carries the full semver for logs/dialogs.                                       | §6.1, D13                                                   |
| D10 | Missing-field locks fail closed (treated as incompatible, not stale).                                                                                             | LOCKED    | No          | A v0.x lock has no protocol info; we cannot guess what contract the holder speaks. Fail-closed forces user reconciliation instead of a silent, likely-broken attach.                                                                                                                                                                          | §6.1, NG8                                                   |
| D11 | State-manifest corruption throws (not "fresh project").                                                                                                           | LOCKED    | No          | Treating corrupt-as-fresh could overwrite real durable state with a new empty manifest. Fail-loud is safer; the user's recovery path is "manually inspect / restore from git".                                                                                                                                                                | §6.2, NG8                                                   |
| D12 | Kill timeout is 5s (process-death poll); escalation to SIGKILL is out of scope.                                                                                  | LOCKED    | Yes         | 5s gives the server's graceful-shutdown handler (new in this spec, see §5 boot.ts row + A6) time to drain Hocuspocus, flush persistence, and unlink the lock before exit. The kill-flow's poll tracks *process death*, not lock-file removal — `acquireProcessLock` handles a stale-but-present lock via its existing replace path, so the flow is robust to a server that default-exited without running the graceful handler. Force-kill mid-flush could corrupt the shadow repo; better to surface the timeout to the user as a distinct failure mode (*"server is not shutting down; quit it manually"*) than silently SIGKILL. | §5 server package, §6.4, A6 |
| D13 | `protocolVersion` bump policy: **bump whenever a cross-process contract changes shape in a way an existing installed binary cannot interpret safely.** Additive-only changes (new optional fields, new endpoints, new WS frame types old readers can ignore) do NOT bump. `runtimeVersion` (semver) continues to change every release independently. | LOCKED    | Yes         | Closes the earlier open question about bump granularity. G1 already committed to an "on API break" rule and §6.5 gave examples; deferring the policy-level decision to "first candidate bump" was overcautious and invited ad-hoc bumps. Landed during the 2026-04-24 audit pass as M3-finding resolution. | §3 G1, §6.5 |

---

## 9) Open questions

- **Q1 — `STATE_SCHEMA_VERSION` migration tooling.** NG5 defers on-the-fly migration; but when the first candidate bump lands, we need to scope a migrator spec. Open question here: does migration run as a CLI subcommand (`ok migrate`), a desktop menu action, or automatically at first launch with user consent? Defer until the first breaking state-shape change is on the roadmap.
- **Q2 — Windows / Linux policy.** NG7 defers full Windows/Linux desktop UX until the parent D51 (macOS-only v0) reopens. The CLI + server-side lock changes are platform-agnostic and should work identically everywhere. Verify in CI. Note: on Windows, `process.kill(pid, 'SIGTERM')` does NOT send a real SIGTERM — Node maps it to `TerminateProcess`, which is immediate and does not run the graceful-shutdown handler. Mitigated: the kill-and-restart flow (§6.4) is macOS-only in practice because NG7 defers desktop UX, and the Windows kill path is not exercised by any CLI-side surface.
- **Q3 — Impact on integration-test harness + Playwright.** `createTestServer()` and the Playwright per-worker fixture both create `server.lock` files. They will need to write the new version fields. Low-risk mechanical change, but worth a CI pass to confirm no test-harness assumption that the lock is a stable shape breaks.
- **Q4 — Telemetry on kill-and-restart events.** If / when telemetry lands per [`specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md`](../2026-04-20-cli-distribution-and-install-ux/SPEC.md), should mismatched-attach + kill-and-restart events be emitted? Useful signal for "are users actually hitting cross-version drift in the wild" — feeds NG6 (re-exec revisit) decision.
- **Q5 — `executablePath` in the lock: any security implications?** The field carries an absolute path written by the lock holder. A downstream consumer (desktop, MCP) should NEVER execute it (NG6 — that was the rejected re-exec proposal). It's a diagnostic breadcrumb only. Worth a code-review note on the PR so no one innocently `spawn()`s it later.
- **Q6 — Upgrade path for pinned MCP configs.** `ok init --pin` writes an absolute `process.argv[1]` into editor MCP configs (G7). The spec acknowledges the tradeoff (NG2, D8) but does not specify how a pinned config gets upgraded when the underlying CLI is upgraded. Concretely:
  - **Stable-path pin** (`/usr/local/bin/ok` via M6 bundled CLI, global npm bin shim): upgrade-in-place works; no user action needed.
  - **Volatile-path pin** (worktree `dist/cli.mjs`, npx cache path): silently stale after reinstall — pinned MCP either runs the old version (→ G6 protocol-mismatch exit 1) or fails with ENOENT.
  - **Missing-path pin:** spawn fails ENOENT; editor surfaces "MCP disconnected" with no actionable guidance.
  On protocol mismatch, G6's stderr diagnostic currently says *"reconcile versions"* — it does not tell a pinned-config user the specific remediation is to re-run `ok init --pin`.
  
  Candidate resolutions to scope:
  1. Add `ok mcp` preflight: if `process.argv[1]` != what the user most recently ran `ok init --pin` from (tracked somewhere — maybe `.open-knowledge/state.json.lastPinnedBy`?), warn.
  2. Extend G6's diagnostic to branch: if the MCP child's own `process.argv[1]` is pinned (heuristic: absolute path, not an npx cache path), suggest *"re-run `ok init --pin` from your current install to refresh"*. If unpinned, suggest *"upgrade your globally-installed CLI"*.
  3. Add an acceptance criterion (E5) covering `ok mcp` with a pinned, no-longer-existent path: exit 1 with a diagnostic that names the missing path AND suggests `ok init --pin` to refresh.
  4. Document the "stable-path pin" vs "volatile-path pin" taxonomy in the spec (§6.5 or new §6.6) so users choosing `--pin` know which paths are upgrade-safe.
  
  Defer until: the first real user report of pinned-path drift, OR M6's bundled-CLI shim ships and makes `--pin` a more commonly recommended path. Not blocking for initial rollout because the default is unpinned (self-healing via `npx`), but the gap exists the moment anyone opts in.

---

## 10) Future work (trigger-gated)

- **Revisit re-exec (NG6).** Trigger: kill-and-restart dialog telemetry shows user-acceptance rate below ~60%, AND macOS codesigning policy for Electron allows exec'ing un-adjacent signed binaries. Then: implement `execFile(lock.executablePath, ['start'])` as an alternative to kill-and-restart; A/B the two UX in a beta channel.
- **Protocol migration infrastructure (NG5).** Trigger: first planned breaking protocol bump is within 2 milestones. Scope a migrator spec covering: CLI subcommand vs desktop menu, dry-run vs apply, rollback story, backup strategy for the shadow repo.
- **Windows / Linux desktop UX (NG7).** Trigger: parent D51 (macOS-only v0) is reopened. Inherits all server + CLI changes from this spec; adds Windows/Linux dialog code (different primitives than macOS `NSAlert`-backed `dialog.showMessageBox`).
- **Machine-level install manager (NG1).** Trigger: production telemetry shows users hitting cross-install drift > weekly AND kill-and-restart UX proves insufficient. Only then consider a pointer file — and if that fails, a full manager (nvm-style). Evidence bar is deliberately high per the D1 rationale.

---

## 11) Implementation order (suggested)

One PR per group, in this order — each lands green `bun run check` before the next starts:

1. **PR A — version constants + lock schema.** Adds `version-constants.ts` + the new `ProcessLockMetadata` fields. Every lock writer (CLI, desktop, test harness, Playwright fixture) is updated to write them. No consumer gates on them yet. Smallest risk, unblocks everything else.
2. **PR B — state manifest.** Adds `state-manifest.ts`, wires into `bootServer`. Server-only change; CLI + desktop auto-inherit via their dependency on the server package.
3. **PR C — MCP protocol handshake.** Extends `decideAutoStart` + `ensureServerRunning`. CLI-only change. No UI surface.
4. **PR D — Desktop attach handshake + kill-and-restart.** The heaviest PR; depends on PR A. Dialog primitives + kill primitives + window-manager wiring + tests.
5. **PR E — `ok init --pin`.** Smallest; no dependencies on A-D. Can ship in parallel with any of them.
6. **PR F — Docs + PRECEDENTS entry.** Once A-E have landed, update `packages/server/README.md`, `packages/desktop/README.md`, `PRECEDENTS.md`, and backfill the `reports/server-paths/REPORT.md` with a §5 pointing here.

Total: six small PRs, independent except D → A and F → A-E.

---

## 12) Non-obvious things to verify during implementation

- **`createTestServer()` version fields.** The integration harness reuses `createServer()` directly, not `bootServer()`. Ensure the test harness writes version fields into its `server.lock` so cross-test assumptions about lock shape don't break.
- **Hocuspocus SIGTERM drain time.** The 5s timeout in D12 assumes current graceful-shutdown drains in <5s under test load. Verify against a stress-fuzz lock holder — if drain can exceed 5s legitimately, raise the timeout (not the user-facing default; a test-configurable constant).
- **`electron-updater`-triggered restart.** When the desktop auto-updates, electron-updater relaunches. If the relaunch happens while the old desktop's utility still holds the lock (race between electron-updater's quit and Hocuspocus's shutdown drain), the new desktop will see an incompatible lock on first open and trigger the kill-and-restart dialog — for its own previous version. Verify that this degenerate case surfaces a sensible message ("restarting project server in this new version") and doesn't loop.
- **`runClean` ordering.** `runClean` today prunes stale locks before the attach probe. With new version fields, `runClean` should be version-agnostic (it only removes dead-pid or foreign-host locks). Do NOT make `runClean` also prune version-mismatched locks — those are live; killing them without the dialog would violate D5.
- **`updateProcessLockPort` field preservation.** When the port updates post-bind, preserve the version fields. Regression risk if the update helper re-derives the lock payload instead of read-modify-write.
- **Windows SIGTERM semantics.** Node's `process.kill(pid, 'SIGTERM')` on Windows maps to `TerminateProcess` — immediate, no graceful drain. The kill-and-restart flow (§6.4) is macOS-only in practice (NG7 defers Windows desktop UX). CLI-side lock fields still apply to Windows and work regardless. Keep this constraint documented so no one ports the kill flow to Windows without re-planning the termination mechanism.
