---
title: "Server Paths, Entry Points, and Version-Drift Architecture"
description: "Staff-architect synthesis of the cross-install version-drift problem across CLI, desktop, npx, and editor-launched MCP, with a scoped three-authority target architecture."
tags: [architecture, versioning, mcp, desktop, cli, server-lock, shadow-repo]
status: draft
audience: [staff-architect, maintainers]
---

# Server Paths, Entry Points, and Version-Drift Architecture

A three-round agent exchange on how Open Knowledge's install entry points interact, where version drift actually hides, and what the minimum viable "sources of truth" set should be. Preserved here so the reasoning chain is legible to future work.

## Context

Open Knowledge is greenfield and unreleased. Anything can still change. The goal of the exchange was to minimize sources of truth for the project's on-disk state and live runtime identity, given that the product ships through multiple channels (npx, `npm -g`, DMG, MCP configs written by `ok init`, and optional `bunx`/`ok` short alias).

---

## Round 1 — initial framing of user install entry points and drift vectors

### User install entry points

1. `npx @inkeep/open-knowledge` via CLI
2. `npm install -g @inkeep/open-knowledge` via CLI
3. Download/install DMG for the Electron app
4. MCP file in your project which runs `npx @inkeep/open-knowledge mcp`

Additional entry points discovered in the codebase:

5. `bunx @inkeep/open-knowledge` — same as `npx` but via Bun (distinct runtime, some users prefer it)
6. `ok` short alias — `packages/cli/package.json` registers both `open-knowledge` and `ok` as bin commands, so `npx @inkeep/open-knowledge` and `npx ok` are technically separate entry points
7. Auto-registration via `ok init` — the init command writes MCP configs directly into editor config paths for Claude Code, Cursor, VS Code, Windsurf, Codex, and Claude Desktop. A user running `ok init` gets MCP wired up without manually editing any config file

Not found:
- No Homebrew formula
- No Windows installer (README notes macOS only)
- No Docker image
- No VS Code Marketplace extension

### Version-drift vectors (as initially diagnosed)

1. **Desktop bundles a frozen server at build time.** `packages/desktop` depends on `@inkeep/open-knowledge-server` as a workspace dep and forks it via `utilityProcess.fork()` (`packages/desktop/src/main/index.ts:259-270`). It does not shell out to `npx` or the global CLI. Whatever was in the monorepo when the DMG was built is what the desktop runs forever — until the user accepts an auto-update. Desktop version = DMG build version, period.
2. **CLI (global + npx) floats independently.** `npm i -g` pins until the user updates. `npx` resolves to latest unless the npx cache serves a stale copy (common — npx keeps hits around). Two different editors on the same machine can end up invoking two different cached versions of the MCP server.
3. **`ok init` writes unpinned MCP entries.** `packages/cli/src/commands/editors.ts:24-25` writes bare `npx @inkeep/open-knowledge mcp` — no `@x.y.z`. Every MCP launch re-resolves, so the version each editor gets can drift silently over time, and across editors on the same machine.
4. **Attach-mode is the real cross-version surface.** When `ok start` owns `.open-knowledge/server.lock`, desktop skips its own spawn and attaches to that HTTP server (`index.ts:282`). Desktop v1.5 can be driving a CLI v1.0 server's API, or vice versa. Any API shape or behavior change between those versions lands here.
5. **Multiple MCP stdio processes on shared on-disk state.** Desktop's bundled server, a CLI `ok start`, plus each editor's `npx ... mcp` can all touch the same `<contentDir>/.open-knowledge/` directory — shadow git repo, server.lock, and markdown files.
6. **No visible schema version on `server.lock` or the shadow repo.** If either format changes, older binaries see "foreign" state with no explicit version gate.

### First recommendation (prior agent)

A "single managed runtime with thin adapters" model:

- npx, `npm -g`, and the DMG as installers/updaters for the same runtime, not independent long-lived execution paths.
- `ok init` should stop writing `npx @inkeep/open-knowledge mcp` into editor configs; replace with a stable absolute launcher path.
- Desktop should not be a separate server authority; it should use the managed runtime directly or install/adopt its bundled runtime into a shared store.
- Attach allowed only when `protocolVersion` and `stateSchemaVersion` match; otherwise fail loudly and restart with one runtime.

Proposed three sources of truth:

1. **Machine truth:** one active runtime pointer, e.g. `~/.open-knowledge/current`.
2. **Project truth:** one durable project manifest, e.g. `<project>/.open-knowledge/project.json`, holding state/schema compatibility.
3. **Process truth:** `server.lock` as an ephemeral lease and discovery record only.

---

## Round 2 — critique and alternative framing

### What the prior agent got right (verified against code)

- **`init` really does write unpinned `npx @inkeep/open-knowledge mcp`** into editor configs (`packages/cli/src/commands/editors.ts:24-25`, `buildManagedServerEntry`). Every editor config independently re-resolves at launch. CONFIRMED.
- **`server.lock` has zero version metadata.** `ProcessLockMetadata` is `{pid, hostname, port, startedAt, worktreeRoot}` — no `runtimeVersion`, no `protocolVersion`, no `stateSchemaVersion` (`packages/server/src/process-lock.ts:28-35`). Attach-mode verifies *liveness* only, never *compatibility* (`packages/desktop/src/main/window-manager.ts:595-606`). CONFIRMED.
- **`resolveSelfSpawn()` is the right nucleus.** Already deployed in the two intra-tree spawn points: `ok mcp` → `ok start` (`packages/cli/src/mcp/server-discovery.ts:210`) and `ok start` → `ok ui` (`packages/cli/src/commands/start.ts:92`). The block comment at `packages/cli/src/commands/self-spawn.ts:4-14` explicitly articulates the anti-drift principle. CONFIRMED.

### Holes in the prior agent's recommendation

#### 1. The prior agent under-counts what's already solved

The published CLI is a **single bundled artifact** — `@inkeep/open-knowledge-server` and `-core` are `devDependencies` in `packages/cli/package.json:62-64` and get rolled up into `dist/cli.mjs` by tsdown. Same for desktop: `electron-vite` bundles the server into `out/main/utility/server-entry.js`. **Intra-install drift doesn't exist** — CLI v1.5 is, atomically, server v1.5; DMG v1.5 is, atomically, bundled-server v1.5. The drift is strictly a cross-*install* problem (DMG install ↔ npx cache ↔ global npm ↔ editor configs). That reframing matters because it narrows the actual fix surface considerably.

#### 2. `~/.open-knowledge/current` is a new singleton with its own drift story

Introducing a machine-level "active runtime pointer" trades `N` unpinned editor configs for **1 centralized runtime-elector**, which isn't obviously simpler — it's a different shape of complexity:

- Who writes it? The DMG postinstall? `npm -g`'s postinstall? `npx`? (`npx` runs in a hashed cache directory — it has no stable hook.)
- Whose wins? User installs DMG Monday (v1.5), global `npm i -g` Tuesday (v2.0), runs `npx ...@3.0` Friday — which is "current"?
- What happens with per-worktree Bun vs Node choices, monorepo dev builds, CI hosts with no home dir?
- What happens when the user deletes it? Every editor config breaks silently.

This is swapping *drift* for *brittleness*. The reference class (`pyenv`/`nvm`/`rustup`) solves this by becoming themselves a full install-management system — not a pointer file.

#### 3. The "stable local launcher path" replaces a self-healing system with a fragile one

`npx @inkeep/open-knowledge mcp` has one virtue the prior agent glossed: **it self-heals after reinstalls.** Rewriting that to a stable absolute path means: the user `rm -rf`s their install, and every editor's MCP config fails silently next time they open the app. The *drift* problem becomes a *"my MCP silently stopped working six weeks ago"* problem, which is worse because it's invisible.

#### 4. The proposal puts state-schema compatibility on the *lock* — but the lock is ephemeral

The prior agent suggested gating attach on `stateSchemaVersion` in `server.lock`. But the real state-drift hazard isn't live attach — it's **cold start against stale on-disk state.** Scenario: desktop v1.5 crashes hard (no lock release), leaves shadow repo in v1.5 format → next morning CLI v2.0 cold-starts and reads `.open-knowledge/`. There's no live lock; nothing to gate on. Schema version belongs **on the state** (a `.open-knowledge/manifest.json` or a header inside the shadow repo), not on the ephemeral lock. The lock should answer "can I attach to you *right now*?"; state metadata should answer "can I read this project *at all*?"

### Alternative invariant

> Many runtimes may exist, but for any given project at any given moment there is exactly one authoritative runtime, and everyone else either defers to it or refuses to proceed.

That's already the latent design — `resolveSelfSpawn` enforces it intra-tree, and `server.lock` enforces it inter-tree. The gap is that neither mechanism is **version-aware** yet. Make them version-aware and you don't need a new global singleton.

### Three sources of truth, scoped properly

| Authority | Answers | Lives in | New? |
|---|---|---|---|
| **Runtime self-identity** | "How do I spawn a child?" | `process.execPath` + `process.argv[1]` via `resolveSelfSpawn` | Exists |
| **Session authority** | "Who owns this project *right now*?" | `server.lock` + version metadata | Extend existing |
| **Durable state compatibility** | "Can anyone read this project at all?" | `.open-knowledge/manifest.json` with `stateSchemaVersion` | New, one file |

Each question has exactly one file/mechanism. No global `~/.open-knowledge/current`. No "managed runtime store." No per-editor launcher shim.

---

## Round 3 — refinements from a third reviewer

### Agreements and affirmations

- **Invariant is right.** Project-scoped, not machine-scoped.
- **Cross-install vs intra-install diagnosis is sharp.** `packages/cli/tsdown.config.ts:5` has `unbundle: false`, and `packages/desktop/electron.vite.config.ts:36` bundles the desktop's server entry. Whether every dep is literally bundled or packaged alongside matters less than the operational fact: one coherent server version per install.
- **Durable schema compatibility does not belong only in `server.lock`.** Lock is live-process discovery; it cannot answer "is this project's on-disk state readable after a cold start?" because no lock may exist. Durable project state needs its own versioned manifest.

### Refinements that improve the proposal

#### Launch-vector shape

`resolveSelfSpawn()` returns `{command, prefixArgs}`. `process.argv[1]` is the entry script, not the executable — so storing `executablePath` alone in the lock is wrong. The right shape, if you store it at all, is:

```ts
owner: {
  kind: 'cli' | 'desktop',
  packageVersion: string,
  protocolVersion: number,
  command: string,
  argsPrefix: string[],
}
```

#### Desktop's utility entry is not a CLI

`out/main/utility/server-entry.js` is an Electron `utilityProcess.fork()` entry, not a general-purpose executable you can spawn from outside Electron. Delegation breaks asymmetrically: CLI→desktop delegation is impossible; desktop→CLI delegation is *plausible* but has macOS signing/entitlement implications for a signed app shelling out to an external binary. In v1, the safe move is:

- Compatible protocol → attach.
- Incompatible protocol → refuse with a clear message.
- Optional later improvement: CLI-owned lock can expose a reusable MCP launch vector.

#### Naming

`state.json` is already taken. `packages/desktop/src/main/state-store.ts` and `packages/server/src/sync-engine.ts` (which writes `sync-state.json`) both use that name. Use `manifest.json` or `project.json` to avoid muddy collisions.

#### Editor configs

Keep `npx @inkeep/open-knowledge mcp` as the default. Upside is real: editor configs keep working after reinstall. Safety comes from protocol and state gates, not from pinning every editor launch path.

#### Desktop mismatch policy

Desktop should **hard-refuse** on incompatible live locks in v1. Do not make the signed app shell out to arbitrary external CLI runtimes until there is a concrete reason and a macOS signing/security pass behind it. That gives the core invariant without building a hidden runtime manager.

### Pushback on Round 3

**Drop the launch vector from v1 entirely.** The v1 behavior is strictly attach-or-refuse. The launch vector has no consumer. Adding it anticipates a delegation feature that has unresolved design questions (macOS signing, no viable CLI→desktop exec path). Shipping a field no one reads is how schemas rot.

Smaller v1 lock shape:

```ts
// server.lock additions
lockSchemaVersion: 1,
ownerKind: 'cli' | 'desktop',
packageVersion: string,        // for error messages
sessionProtocolVersion: number // the actual compatibility gate
```

Add `command`/`argsPrefix` when a concrete delegation feature lands and forces the question.

### Things neither round fully addressed

**A. What does the protocol version actually cover?**
The MCP wire protocol is independently version-negotiated by the MCP SDK. The lock's protocol-version field is *not* that. What it gates:
- The desktop↔server WebSocket/HTTP API (Hocuspocus + whatever REST/IPC surface the renderer uses)
- The y-doc payload format and any server-side collab hooks
- Any on-the-wire contract between same-project sibling processes

Recommend naming the field `sessionProtocolVersion` to disambiguate from MCP's protocol version and from anything else labeled "protocol."

**B. Discipline for bumping `sessionProtocolVersion`.**
Without a rule, either nothing bumps it (and the gate is useless) or every PR touches it (thrashing). Rough rule: bump on any breaking change to the desktop↔server wire surface, the y-doc schema, or any cross-process IPC contract. Document in `AGENTS.md` or the code comment on the constant. The version number lives as an exported constant from a single package (probably `@inkeep/open-knowledge-server`), so diffs that change it are reviewable.

**C. `manifest.json` write ordering.**
- **Who writes it first?** Probably `ensureProjectGit` or a sibling bootstrap — same place the shadow repo gets created.
- **When does `lastOpenedByVersion` update?** Every server acquire? First write? It needs to not race the lock and not thrash on every tool call.
- **Is it committed to the shadow repo?** Probably yes (durable project state), which means it participates in git attribution — fine, but worth being explicit.

**D. Strict equality vs compatibility ranges for `sessionProtocolVersion`.**
Strict equality is simpler for v1 but means every bump forces all sibling processes to restart in lockstep. A single `minCompatibleProtocol` field (server declares the oldest client it still accepts) buys a lot of soft-migration headroom for almost no complexity. Worth deciding up front because retrofitting it later means parsing two schemas.

---

## Synthesized v1 proposal

Five concrete changes, three of them one-liners:

1. **Extend `ProcessLockMetadata`** (`packages/server/src/process-lock.ts:28-35`) with:
   ```ts
   lockSchemaVersion: number;
   ownerKind: 'cli' | 'desktop';
   packageVersion: string;
   sessionProtocolVersion: number;
   ```
2. **Gate `tryAttachExistingServer`** (`packages/desktop/src/main/window-manager.ts:595-606`) on `sessionProtocolVersion` match. Mismatch → hard refuse with a message naming both versions and the owner kind.
3. **Introduce `.open-knowledge/manifest.json`** with:
   ```ts
   {
     stateSchemaVersion: number;
     createdByVersion: string;
     lastOpenedByVersion: string;
     migrations: Array<{ from: number; to: number; at: string; by: string }>;
   }
   ```
   Gate cold-start on `stateSchemaVersion` before touching the shadow repo.
4. **Keep `npx @inkeep/open-knowledge mcp`** as the default in editor configs. Offer a `--pin` flag on `ok init` later if users want it.
5. **Do not add launch-vector fields to the lock.** Do not build a machine-wide runtime pointer (`~/.open-knowledge/current`). Do not make the signed desktop app shell out to external CLI runtimes.

### Architectural win

> Many runtimes may exist, but for any given project at any given moment there is exactly one authoritative runtime. Everyone else speaks a compatible protocol, or refuses loudly.

Three authorities, each answering exactly one question:

- **Runtime self-identity** → existing `resolveSelfSpawn`.
- **Session authority** → extended `server.lock`.
- **Durable state compatibility** → new `manifest.json`.

No new centralized authority, no fragile launcher shims, no silent cross-version attach. The cold-start path is finally gated. The editor-config self-heal property is preserved. The DMG can still boot offline.

---

## Open decisions for the human

1. **Strict equality vs `minCompatibleProtocol` ranges** on `sessionProtocolVersion`. Decide now; retrofitting later means parsing two schemas.
2. **Location and ownership of the `sessionProtocolVersion` constant.** Single exported constant from `@inkeep/open-knowledge-server` is the obvious choice, but confirm it's not imported by something that would force bumping it accidentally.
3. **Manifest file lifecycle.** When exactly does `lastOpenedByVersion` update? Every attach? First write in a session? On `ok start`? Nail down before implementation.
4. **Whether `manifest.json` is shadow-repo-tracked or ignored.** Tracked gives forensic history (who opened when, from what version); ignored keeps the working tree clean.
5. **Error UX for incompatible-protocol refusal.** Desktop hard-refuse is the right default, but the message matters — it should name both versions, the owner kind, and a concrete next action ("upgrade the DMG" vs "stop `ok start` and relaunch").

---

## Evidence index

- `packages/cli/package.json` — bin entries (`open-knowledge`, `ok`), server/core as workspace devDeps.
- `packages/cli/tsdown.config.ts:5` — `unbundle: false`, single-bundle CLI.
- `packages/cli/src/commands/editors.ts:24-25` — unpinned `npx @inkeep/open-knowledge mcp` in `ok init`-generated configs.
- `packages/cli/src/commands/self-spawn.ts:4-48` — `resolveSelfSpawn` anti-drift pattern and rationale.
- `packages/cli/src/mcp/server-discovery.ts:210` — self-spawn used for `ok mcp` → `ok start`.
- `packages/cli/src/commands/start.ts:92` — self-spawn used for `ok start` → `ok ui`.
- `packages/server/src/process-lock.ts:28-35` — `ProcessLockMetadata` with no version fields.
- `packages/desktop/package.json:23-24` — server/core as workspace deps (bundled by electron-vite).
- `packages/desktop/src/main/index.ts:259-270` — `utilityProcess.fork` of bundled server entry.
- `packages/desktop/src/main/window-manager.ts:595-606` — `tryAttachExistingServer` liveness checks (no version gate).
- `packages/desktop/src/main/state-store.ts` — desktop's existing `state.json` (naming collision source).
- `packages/server/src/sync-engine.ts` — server's existing `sync-state.json` (naming collision source).
