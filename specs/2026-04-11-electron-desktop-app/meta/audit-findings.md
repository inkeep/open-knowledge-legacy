# Audit Findings — Electron Spec vs `origin/main`

**Audit date:** 2026-04-17
**Spec baseline:** `f17ad00` (2026-04-15)
**Target state:** `origin/main` at HEAD (`a25b3ee4`) + PR #166 head (`3dcd80cb`, OPEN/CONFLICTING)
**Scope:** 63 commits, 442 package files changed since baseline. 1 major merged re-architecture (PR #173 Zero-Ceremony Resume). 1 major unmerged substrate (PR #166 GitHub Sync). 1 significant architecture shift (PR #152 server-authoritative observer bridge). Audit method: 5 parallel Opus `Explore` subagents per domain + independent verification of every load-bearing claim (commit SHAs, file paths, line numbers read directly via `git show origin/main:<path>`).

---

## Executive summary

The spec is **directionally correct** but has several **BLOCKING** and **SIGNIFICANT** inaccuracies introduced by main-branch drift. Main delivered:

1. **PR #173 (MERGED `d901f563`) — lifecycle split.** `ok start` no longer serves static assets; a new `ok ui` sibling serves the React bundle + `/api/config` + `/api/*` proxy. `server.port` default flipped 3000 → 0. `ui.lock` coexists with `server.lock`. `attachIdleShutdown` primitive (30-min default, WS-count-only) lives in `packages/server/src/idle-shutdown.ts` but is **opt-in per call site** — `createServer()` does NOT auto-wire it. `ok mcp` detach-spawns `ok start` when lock is dead (NOT always — Agent A overstated).
2. **PR #152 (MERGED `9ce56ee1`) — server-authoritative observer bridge (precedent #14).** Cross-CRDT sync writes (`XmlFragment ↔ Y.Text`) now live in `packages/server/src/server-observers.ts`. Client `packages/app/src/editor/observers.ts` kept only for baseline tracking + `markUserTyping`; writes deleted. `createServer()` auto-registers the server observer extension unconditionally.
3. **PR #166 (OPEN/CONFLICTING) — GitHub Sync substrate (D31).** 9,260 LOC, 68 files (up from 8,700/66 when D31 was written). 2 new endpoints added during review cycle (`/api/sync/set-enabled`, `/api/sync/abort-merge`). New files: `ui/switch.tsx`, `local-op-security.ts`, `sync-timing.ts`. Still churning; `CONFLICTING` due to overlap with PR #173.
4. **Renderer bootstrap inversion.** `ProviderPool` constructor now **requires** `wsUrl`. `location.host` fallback moved to `useCollabUrl()` hook, only reached when `/api/config` returns 404. For Electron loaded via `file://`, the fallback produces `ws:///collab` — broken.
5. **OQ-E already CLOSED in main.** `SystemDocSubscriber` reads `collabUrl` from context with dep `[queryClient, collabUrl]`. E-fix-1 is implemented.
6. **Additive server subsystems auto-wired by `createServer()`:** server-observers (PR #152), managed-rename-journal + recovery, agent-focus broadcaster, suggest-links, loopback guard, contributor-tracker. All inherit unchanged in the Electron utilityProcess.
7. **`createServer()` signature drift:** new non-optional `agentFocusBroadcaster` field on `ServerInstance`; new optional `onAgentWrite` option; `commitDebounceMs` default 30s → 15s; `degraded` gains a 4th value `'managed-rename-recovery'`.

**Net:** spec remains achievable; ~15 targeted edits needed before `/decompose`; 4 new open questions require product/technical decisions.

---

## Findings — classified

### BLOCKING (decisions invalidated — resolve before `/decompose`)

#### B1. §8.4 renderer bootstrap is stale (BLOCKING, 3 agents converge)

**Evidence.**
- `packages/app/src/editor/provider-pool.ts:113` on main: `constructor(maxSize: number, wsUrl: string, recycleDebounceMs?: number)` — `wsUrl` **REQUIRED**, no default.
- Comment at provider-pool.ts:115-117: *"wsUrl is REQUIRED post-lifecycle-split (US-014 / FR-1.13) — resolved asynchronously by `useCollabUrl()` from the `ok ui` /api/config endpoint before the pool is instantiated. Callers must not pass an empty string."*
- `packages/app/src/lib/use-collab-url.ts:161` is the bootstrap source. Flow: fetch `/api/config` → resolve `collabUrl` → instantiate pool. On 404 ("absent" = `bun run dev` pattern), falls back to `defaultCollabWsUrl()` (`location.host`-derived).
- For Electron loaded via `file://`: `location.host === ''` → fallback produces `ws:///collab` → broken.

**Spec claim invalidated.**
- SPEC.md:479-484: `constructor(maxSize = 10, wsUrl?: string) { this.wsUrl = wsUrl ?? 'ws://${globalThis.location?.host ?? 'localhost'}/collab'; }` — false.
- SPEC.md:506: *"Web version untouched: when `window.okDesktop` is undefined, the ProviderPool falls back to `location.host` as today"* — false.

**Decision required.** How does Electron renderer bootstrap `collabUrl`?
- **Path A — preload bridge (RECOMMENDED).** Inject `collabUrl` via `window.okDesktop`. Modify `useCollabUrl()` to short-circuit when injected. Small `packages/app/` change (~10 LOC hook edit). Clean D13/D14 alignment; no HTTP round-trip.
- **Path B — utility serves `/api/config`.** Zero `packages/app/` changes. Requires Electron renderer loaded via `http://localhost:<port>/` (not `file://`). Matches CLI pattern.
- **Path C — utility runs a full `ok ui`-equivalent** (static + `/api/config` + proxy). Largest code footprint. Rejected.

#### B2. §7.5 Observer A/B topology is stale (BLOCKING, precedent #14)

**Evidence.**
- `packages/app/src/editor/observers.ts` on main: docstring (lines 1-26) explicitly states *"Under the server-authoritative architecture (precedent #14), cross-CRDT sync writes are performed exclusively by the server observer module at `packages/server/src/server-observers.ts`. This client module NO LONGER writes the derived CRDT."*
- `packages/server/src/server-observers.ts` (401 LOC, NEW) + `server-observer-extension.ts` (117 LOC, NEW) — PR #152.
- `packages/server/src/standalone.ts:224`: `hocuspocus.configuration.extensions.push(createServerObserverExtension({ mdManager, schema }));` — unconditional auto-registration.

**Spec claim invalidated.**
- SPEC.md §7.5 (paragraphs on Observer A XmlFragment → Y.Text and Observer B Y.Text → XmlFragment) describes them as browser-side. That's false post-PR #152. The client module kept baseline-tracking + `markUserTyping`; all writes are server-side.
- SPEC.md's CRDT Bridge Architecture section references (via CLAUDE.md) are stale on the browser-side write paths.

**Action.** Rewrite §7.5 to reflect server-authoritative topology. Reference `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` as authoritative. Note that renderer's only bridge responsibility is typing-activity tracking — simplifies Electron story.

#### B3. §7.2 `ServerInstance` interface quote drifts (BLOCKING if treated as contract)

**Evidence.**
- `packages/server/src/standalone.ts:101` on main: `agentFocusBroadcaster: AgentFocusBroadcaster` — a new non-optional field.
- Spec §7.2 interface quote omits this field.
- `degraded` list on main can include `'managed-rename-recovery'` (4th possible value) per `standalone.ts:842` `recoverPendingManagedRename` failure path. Spec still names three subsystems.

**Action.** Add `agentFocusBroadcaster: AgentFocusBroadcaster` to §7.2 interface. Update `degraded` list to include `'managed-rename-recovery'`. Note `onAgentWrite?: () => void` as a new ServerOption (Electron may or may not use it for window-focus).

#### B4. §8.11 `runInit` signature is wrong on three counts (BLOCKING)

**Evidence.**
- `packages/cli/src/commands/init.ts:321` on main: `export function runInit(options: InitCommandOptions = {}): InitCommandResult`.
- `InitCommandOptions = { cwd?, mcp?, force?, editors?, rootInstructions?, home? }`. Synchronous.
- `editors` defaults to `['claude']` only (init.ts:326) if omitted — the PR #173 US-013 "all detected editors" flip lives in the Commander action handler, NOT in `runInit`.

**Spec claim invalidated.**
- SPEC.md §8.11: *"Main process calls `runInit(projectPath, { editors, force: false, source: 'desktop' })`"* — three errors: (a) no positional `projectPath` arg; (b) no `source` field in options type; (c) to get "all detected editors" behavior, Electron must call `detectInstalledEditors(cwd, home)` explicitly and pass the result.

**Action.** Rewrite §8.11 to: `runInit({ cwd: projectPath, editors: detectInstalledEditors(projectPath), force: false, mcp: true })`. Drop `source: 'desktop'` or add it to the CLI first via a separate spec revision (discriminator is arguably useful for telemetry; not load-bearing today).

#### B5. §7.4 L2 debounce stale (BLOCKING if users infer the quit-flush window)

**Evidence.**
- `packages/server/src/persistence.ts:164` on main: `const commitDebounceMs = options?.commitDebounceMs ?? 15_000`.
- Spec §7.4: *"L2 (disk → git) via shadow-repo commit. Debounced 30s idle."*

**Action.** Update §7.4 to 15s, or parameterize as "`ServerOptions.commitDebounceMs` default 15s; Electron may override if needed."

---

### SIGNIFICANT (spec wording outdated; decisions still hold)

#### S1. §7.2 / §7.7 / §7.8 lifecycle narrative is pre-#173

**Evidence.** `packages/cli/src/commands/start.ts:388-394` on main: 404 body `"Not found. The React UI is served by 'ok ui' (default port 3000)."` `ok start` serves only `/collab` + `/api/*`. The `ok ui` sibling (`packages/cli/src/commands/ui.ts`, 618 LOC NEW) serves static + `/api/config` + proxies `/api/*` to the collab server via `ui-proxy.ts`. `server.port` default now 0 (`config/schema.ts:40`). New `ui.lock` in `packages/server/src/ui-lock.ts`.

**Action.** Rewrite §7.2 opening paragraph. Update §7.7 MCP description (detached spawn, kernel stderr capture, keep-alive WS at `/collab/keepalive`). Update §7.8 layout diagram — add `ui.lock` + `last-spawn-error.log` (with annotation "CLI-distribution only; not written by Electron").

#### S2. §8.4 preload bridge shape is insufficient

**Evidence.** Renderer uses `window.open` in `LinkEditPopover.tsx:94`, `ForwardLinksPanel.tsx:94`, `GraphPanel.tsx:384`, `GraphView.tsx:382` — blocked by default Electron sandbox unless main calls `webContents.setWindowOpenHandler`. `navigator.clipboard.writeText` used in `FileTree.tsx:104` — secure-origin-only (fails on `file://`). `fetch('/api/create-page', ...)` in `FolderOverview.tsx` + several other components — requires `/api/*` reachable from renderer origin. `DocumentContext.tsx` uses `window.localStorage` — works in Electron.

**Action.** Expand §8.4 preload shape to include:

```ts
contextBridge.exposeInMainWorld('okDesktop', {
  projectPath: string;
  projectName: string;
  collabUrl: string;           // NEW — for Path A bootstrap
  apiOrigin: string;           // NEW — for fetch('/api/*') resolution
  platform: 'darwin' | 'win32' | 'linux';
  appVersion: string;
  onProjectSwitch: (cb) => () => void;  // returns unsubscribe
  onMenuAction: (cb) => () => void;
  openFolderDialog: () => Promise<string | null>;
  createFolderDialog: () => Promise<string | null>;
  openExternal: (url: string) => void;        // NEW — window.open replacement
  clipboardWrite: (text: string) => Promise<void>;  // NEW — if file://-loaded
});
```

Also add a main-process `webContents.setWindowOpenHandler` that routes external URLs through `shell.openExternal`.

#### S3. PR #173 `attachIdleShutdown` interaction not addressed

**Evidence.** `packages/server/src/idle-shutdown.ts` exports `attachIdleShutdown(opts)`. Not called by `createServer()`; CLI wires it in `start.ts:469`. Default threshold = 30 min (NOT 30s — Agent A's summary was correct; Agent B's 30-min number is right). Counts `/collab` WebSocket upgrades only; DirectConnections (CC1, AgentSessionManager, agent-focus) invisible. PR #166 SyncEngine runs pull-30s/push-60s from inside `createServer()` process — does NOT open a `/collab` WebSocket → invisible to idle-shutdown.

**The conflict.** If Electron utility attaches idle-shutdown and all BrowserWindows close (spec §8.7 last-window convention), 30-min timer fires → utility dies → auto-sync stops silently. Users expect background sync after opt-in.

**Resolution (all 5 agents converge).** Electron utility does NOT call `attachIdleShutdown`. Window lifecycle (Electron main IPC) owns utility lifetime.

**Action.** Add explicit statement to §8.3: *"Electron utility does NOT call `attachIdleShutdown` — idle-shutdown is a CLI-distribution primitive; BrowserWindow lifecycle (§8.7) + main-process IPC own utility teardown. The default 30-min WS-count threshold conflicts with both the 'app stays running after last window close' macOS convention and PR #166 background auto-sync."* New decision D35 to lock.

#### S4. `ui.lock` not mentioned

**Evidence.** `packages/server/src/ui-lock.ts` (59 LOC) — exclusive lock for `ok ui` sibling, sibling to `server.lock`.

**Resolution.** Electron has no `ok ui` equivalent — BrowserWindow IS the UI surface.

**Action.** Add §8.8 paragraph: *"`ui.lock` is CLI-distribution-only and does NOT apply to Electron. The BrowserWindow is the UI surface. Electron utility entry acquires only `server.lock`. Absence of `ui.lock` in a project directory is expected under Electron."* Update J7b to note harmless CLI/desktop coexistence: a running `ok ui` sibling is ignored by Electron.

#### S5. `bootStartServer` exists — D16 revision worth considering

**Evidence.** `packages/cli/src/commands/start.ts:249` on main: `export async function bootStartServer(opts: BootStartServerOptions): Promise<BootedStartServer>`. Accepts `{ skipAutoInit?, skipUiAutoSpawn?, idleThresholdMs?, ... }`. Wraps: `runInit` (unless `skipAutoInit`), content-dir mkdir, `createServer`, HTTP server with `/api/*` + `/collab` + `/collab/keepalive` handlers, `attachIdleShutdown` (unless `idleThresholdMs === Infinity`), `updateServerLockPort`.

**Option X — D16 as-written (createServer-direct).** Clearer Electron scope; re-implements http-server boot, `/api/*` dispatcher, server.lock port update.

**Option Y — bootStartServer with `{ skipUiAutoSpawn: true, idleThresholdMs: Infinity }`.** Reuses keepalive handler + `/api/*` hook dispatcher + port-write for free. Cleaner since the extracted boundary is explicit.

**Recommendation.** Option Y. The opt-outs are explicit and the reused code is load-bearing. Update D16.

#### S6. D31 shape has drifted (+560 LOC, +2 endpoints, +3 files since D31 was written)

**Evidence.** PR #166 head `3dcd80cb`:
- 9,260 LOC / 68 files (was 8,700 / 66 at D31 write time).
- 37 commits on branch; still active.
- 2 new endpoints added during review: `/api/sync/set-enabled` (US-016 follow-up), `/api/sync/abort-merge` (commit `54e697ae`).
- New files not in D31 inventory: `packages/app/src/components/ui/switch.tsx` (31 LOC, Shadcn primitive used by `SyncStatusBadge`), `packages/server/src/local-op-security.ts` (372 LOC with tests — 127.0.0.1/Origin/path-confinement guard for `/api/local-op/*`), `packages/server/src/sync-timing.ts` (33 LOC — jitter helper).
- Auth subcommand list in D31 wrong: `validate-host` is a helper function (`validateGitHubHost`), NOT a registered subcommand. Actual: `auth {login, status, repos, signout, pat, git-credential}`.
- PR #166 state: OPEN, CONFLICTING (overlap with PR #173 on cli.ts + start.ts + schema.ts).

**Full PR #166 endpoint inventory (verified from api-extension.ts:3877-3917 on PR head):**
- `/api/sync/status`, `/api/sync/trigger`, `/api/sync/set-enabled`, `/api/sync/conflicts`, `/api/sync/resolve-conflict`, `/api/sync/abort-merge` (6)
- `/api/local-op/clone`, `/api/local-op/open`, `/api/local-op/auth/{login,status,repos,signout,pat,identity,set-identity}` (9)
- Total: **15 new endpoints** not in spec §7 API list.

**Action.** Update D31 to reflect drift. Correct auth subcommand list. Add 15-endpoint inventory (or link to this findings doc as source of truth). Downgrade D31 confidence MEDIUM → LOW-MEDIUM until PR #166 merges. Re-validation trigger remains: spec pass after merge.

#### S7. §8.9 `asarUnpack` missing `@napi-rs/keyring` globs

**Evidence.** R15 writes *"`asarUnpack: '**/@napi-rs/keyring/**'` must be added per D31"* but §8.9's YAML block has no such entry. `@napi-rs` splits per-platform binaries into sibling packages (`@napi-rs/keyring-darwin-arm64`, `-darwin-x64`, `-win32-x64-msvc`, `-linux-x64-gnu`) — same pattern as `@parcel/watcher-*`.

**Action.** Append two lines to §8.9 asarUnpack YAML:
```yaml
- "**/@napi-rs/keyring/**"
- "**/@napi-rs/keyring-*/**"
```

#### S8. §8.9 macOS Keychain entitlement + UX caveats

**Evidence.** Non-sandboxed DMG distribution (NG2) does NOT require `com.apple.security.personal-information.keychain` entitlement — Keychain APIs work and the first-access prompt fires regardless. But: prompt shows the utilityProcess name (e.g. `"open-knowledge-server"`) not `"Open Knowledge"` because `token-store.ts` runs in the utility. Bundle identifier must be stable across updates (Keychain ACL attribution) or users re-auth on every update.

**Action.** Clarify §8.9 entitlements block: `com.apple.security.personal-information.keychain` is NOT required for non-MAS direct-DMG; do not add it just to satisfy docs. Update R16 to name two explicit UX caveats: (a) bundle-ID stability across updates; (b) utility-process name surfaces in Keychain prompt → rename utility or accept artifact.

#### S9. §8.8 lock primitive note — atomicity strengthened

**Evidence.** `packages/server/src/server-lock.ts` on main is now a thin adapter over `packages/server/src/process-lock.ts` (289 LOC NEW). `acquireProcessLock` uses `openSync(path, 'wx', 0o600)` (O_CREAT|O_EXCL) with 3-attempt retry on EEXIST. Mode 0o600 owner-only. The previous check-then-write was non-atomic.

**Action.** Add single-sentence callout to §8.8: *"Atomic `O_CREAT|O_EXCL` + 0o600 mode means two Electron windows racing to spawn utility on the same contentDir now race deterministically — no last-writer-wins pathology."*

#### S10. PR #173 `ok stop / clean / status` — Electron may want `runClean` on boot

**Evidence.** `runClean` prunes stale/corrupt locks (`packages/cli/src/commands/clean.ts:103` LOC). Dead-pid + corrupt locks removed; foreign-host and alive locks untouched. If Electron utility crashed previously leaving a dead-pid `server.lock`, the next utility spawn would fail fast on collision — but if a concurrent `ok mcp` invocation wins the race first (spawns its own `ok start` for stdio service), Electron relaunch collides with the CLI sibling.

**Action.** Add to §8.11 or §7.3: *"Before spawning utility, Electron main calls `runClean({ lockDir })` to remove stale locks from crashed prior runs. Dead-pid + corrupt locks are pruned; foreign-host and alive locks are left alone (alive = another Electron instance or `ok start` is running; spawn will fail; focus existing window if possible)."*

#### S11. Observer failure path in `degraded` semantics

**Evidence.** `server-observer-extension.ts:77-89` retries on observer failure once after 5s; does NOT add to `degraded` — observer bridge failure is a per-document degrade, not server-level. Spec §8.8 J7g crash recovery doesn't cover "observer is degraded on one doc."

**Action.** Add risk item R17 or update J7g to note per-document observer degrade.

---

### MINOR (wording fixes, no decision impact)

#### M1. OQ-E already CLOSED in main

**Evidence.** `SystemDocSubscriber.tsx` on main: `collabUrl` read from `useDocumentContext()`; `useEffect` deps `[queryClient, collabUrl]`. E-fix-1's recommendation is already implemented (commits `c5b9671f` then `d901f56`).

**Action.** Update §11 OQ-E to note "CLOSED by main (`c5b9671f` + `d901f56`); E-fix-1 implemented."

#### M2. D26 Welcome.md — NOT yet applied on main

**Evidence.** `SCAFFOLD_FILES` in `packages/cli/src/content/init.ts:331-335` on main: only `AGENTS.md`, `.gitignore`, `config.yml`. No `Welcome.md`.

**Action.** No spec change. D26 still LOCKED as forward direction; note in §12 Assumptions row that D26 is unimplemented on main as of audit date.

#### M3. D20 OK_DIR move — NOT yet applied on main

**Evidence.** `packages/cli/src/config/paths.ts` on main still owns `resolveContentDir` + `resolveLockDir`; imports `OK_DIR` from `./constants.ts` (CLI-local). No `@inkeep/open-knowledge-core` exports for these symbols.

**Action.** No spec change; D20 is an explicit "to-apply" decision. Note in §15 SCOPE that D20 is still an unchecked item on main.

#### M4. PR #166 mergeable — `CONFLICTING`

**Evidence.** Overlaps with PR #173 on `packages/cli/src/cli.ts`, `packages/cli/src/commands/start.ts`, `packages/cli/src/config/schema.ts`. PR owner must rebase.

**Action.** Single sentence in D31: "PR #166 CONFLICTING with main as of audit; re-validation includes conflict-resolution shape changes."

#### M5. `specs/_archive/2026-04-15-pre-merge/` is byte-identical to live

**Evidence.** `specs/_archive/2026-04-15-pre-merge/clone-from-github/SPEC.md` and `specs/_archive/2026-04-15-pre-merge/post-clone-git-sync/SPEC.md` are byte-identical to `specs/2026-04-14-clone-from-github/SPEC.md` and `specs/2026-04-14-post-clone-git-sync/SPEC.md` respectively. Pre-merge snapshot, not divergent approved-post-impl.

**Action.** No spec change. Path-reference correction if any spec or evidence cites `specs/approved/2026-04-15-pre-merge/` (actual: `specs/_archive/2026-04-15-pre-merge/`).

---

## Open questions the spec must answer

### OQ-NEW-1 (BLOCKING) — Renderer bootstrap path

How does Electron renderer resolve `collabUrl`? (See B1.)

- **Path A (RECOMMENDED) — preload-bridge injection + minor `useCollabUrl` edit.** Cleanest D13/D14 alignment; no HTTP round-trip; ~10 LOC hook edit.
- **Path B — utility serves `/api/config` + renderer loads from `http://localhost:<utility-port>/`.** Zero `packages/app/` change; more code in utility.
- **Path C — utility runs static-serve + proxy (= Electron-flavored `ok ui`).** Rejected.

### OQ-NEW-2 (BLOCKING) — D16 revision: `createServer()` direct vs `bootStartServer`

See S5. Option Y (bootStartServer-with-opts) recommended but requires updating D16.

### OQ-NEW-3 (SIGNIFICANT) — `mcp.autoStart` default for Electron-written configs

If Electron utility is always running, `ok mcp` from a terminal should connect, not spawn. But if Electron quits, `ok mcp` should spawn. Config is per-project; could set `false` only when Electron-managed. Or leave default `true` and rely on `decideAutoStart`'s lock-awareness (mcp.ts:80).

**Recommendation.** Leave at default `true`. `decideAutoStart` is lock-aware — when Electron utility is alive, `ok mcp` connects via `server.lock`. Only the rare crash-race edge case (Electron crashes → dead lock → `ok mcp` spawns its own `ok start` → Electron relaunch collides) needs handling — via `runClean` on Electron boot (S10).

### OQ-NEW-4 (SIGNIFICANT) — D31 framing given PR #166 unmerged + drift

Options:
- **Keep D31 as-written** with "close-to-final" caveat (current state).
- **Downgrade to TENTATIVE** pending PR #166 merge.
- **Defer D31** to a follow-up spec revision after PR #166 merges.

**Recommendation.** Keep D31's framing but:
- Refresh shape (9,260 LOC, 15 endpoints, 3 new files).
- Fix auth subcommand list (`validate-host` is a helper, not a subcommand).
- Downgrade confidence MEDIUM → LOW-MEDIUM.
- Reconfirm shape when PR #166 merges.
- Treat Electron spec implementation as starting WITHOUT auto-sync/auth/conflict UI and inheriting when merged. Add a fallback: Electron v0 can ship without D31 substrate (it's opt-in via sign-in); D31 enables the feature but doesn't gate the DMG release.

---

## Proposed spec edits (grouped)

### 1. Correct stale text

- **§7.2** rewrite opening paragraph (S1 lifecycle narrative).
- **§7.2** interface quote — add `agentFocusBroadcaster`, `onAgentWrite`, 4th `degraded` value (B3).
- **§7.4** change "30s idle" → "15s idle (default; overridable via `commitDebounceMs`)" (B5).
- **§7.5** rewrite Observer A/B paragraphs to reflect PR #152 server-authoritative topology (B2).
- **§7.7** MCP narrative — detached spawn, kernel stderr, keep-alive WS (S1).
- **§7.8** layout diagram — add `ui.lock`, `last-spawn-error.log` annotations (S1).
- **§8.4** ProviderPool constructor citation — update to match main signature (B1).
- **§8.4** preload bridge shape — expand to 12 fields including `openExternal`, `clipboardWrite`, `collabUrl`/`apiOrigin` (S2).
- **§8.9** asarUnpack — append `@napi-rs/keyring` globs (S7).
- **§8.9** entitlements — clarify Keychain entitlement non-requirement (S8).
- **§8.11** `runInit` signature — correct to options-only shape (B4).
- **§10 D31** — refresh shape (S6).
- **§11 OQ-E** — mark CLOSED by main (M1).

### 2. New subsections / paragraphs

- **§8.3** — explicit disclaimer: utility does NOT call `attachIdleShutdown`, does NOT acquire `ui.lock` (S3, S4).
- **§8.4 new subsection 8.4.1 "Config bootstrap"** — document chosen path (A/B from OQ-NEW-1).
- **§8.8** — single sentence on atomic lock primitive (S9).
- **§8.11** or **§7.3** — `runClean` call on Electron boot before utility spawn (S10).

### 3. New or updated decisions

- **D16 revision** — Electron uses `bootStartServer({ skipUiAutoSpawn: true, idleThresholdMs: Infinity })` in lieu of `createServer` direct. (S5, OQ-NEW-2)
- **D35 (NEW)** — Electron utility does NOT attach idle-shutdown. Window-close/app-quit IPC owns utility teardown. (S3, OQ-NEW-2)
- **D36 (NEW)** — Electron renderer bootstrap via preload-bridge injection + targeted `useCollabUrl` edit (Path A). (B1, OQ-NEW-1)
- **D37 (NEW)** — `mcp.autoStart` stays default `true`; Electron relies on `decideAutoStart`'s lock-awareness. Crash-race mitigated by `runClean` on boot. (OQ-NEW-3)
- **D38 (NEW)** — Electron renderer receives `openExternal` + `clipboardWrite` bridges via preload; main registers `webContents.setWindowOpenHandler` routing to `shell.openExternal`. (S2, S3)
- **D31 revision** — refresh shape (LOC, endpoints, files, auth subcommand list); downgrade confidence to LOW-MEDIUM; add Electron-v0-without-D31 fallback. (S6, OQ-NEW-4)

### 4. New risks for §9

- **R17 (NEW)** — server-authoritative observer bridge CPU budget inside utility (Agent B). Observer failure is per-document degrade; does NOT add to `degraded` — §8.8 J7g crash recovery may miss it. (B2, S11)
- **R18 (NEW)** — managed-rename-recovery 4th `degraded` value (Agent B). Electron J7g reads `degraded` after `ready` — needs to know this value. (B3)
- **R19 (NEW)** — Idle-shutdown accidentally wired in utility (Agent B). Lint rule or test asserts `attachIdleShutdown` NOT imported by utility entry. (S3)

### 5. Assumptions updates (§12)

- **New row** — PR #173 Zero-Ceremony Resume (merged `d901f563`): `ok ui` sibling, idle-shutdown primitive, `previewUrl` on MCP tools, `server.port: 0` default. Re-validation: spec's CC8 destroy phase ordering + `/api/config` integration.
- **Update row** — PR #166 confidence MEDIUM → LOW-MEDIUM. Re-validation shape drift (+560 LOC, 15 endpoints, 3 new files).

---

## What to do next

**Recommended sequence:**

1. **User reviews this doc** — decide on OQ-NEW-1 (Path A/B), OQ-NEW-2 (D16 revision), OQ-NEW-3 (`mcp.autoStart`), OQ-NEW-4 (D31 framing).
2. **Apply spec edits** in one pass — correction + new decisions D35-D38 + updated D16/D31 + new risks R17-R19 + updated assumptions.
3. **Update changelog** entry for this audit pass.
4. **Optional** — fold audit-findings.md into spec's `evidence/` directory as a historical artifact; keep `meta/audit-findings.md` as the living latest-audit record.
5. **Hold on `/decompose`** until OQ-NEW-1 + OQ-NEW-2 are decided — they materially change §8.3 + §8.4 implementation shape.

**Not recommended:**

- Proceeding to `/decompose` without resolving B1-B4. Those are contract-level drifts that would cause `/decompose` to produce wrong story boundaries.
- Locking D35-D38 without user judgment calls — they're real product/technical decisions with tradeoffs.
- Deleting D31 or deferring it indefinitely — PR #166 is substantive substrate that's ~1 merge away. Refresh shape; don't retreat.

---

## Appendix — Verification log

All agent findings were independently verified by reading `origin/main` files + commits via `git show origin/main:<path>` and `git fetch origin pull/166/head:pr166-audit` for PR #166.

| Claim | Source | Verification |
|---|---|---|
| ProviderPool constructor `wsUrl` required | Agent A, C | `provider-pool.ts:113-120` ✓ |
| `ok start` 404s "React UI served by ok ui" | Agent A | `start.ts:388-394` ✓ |
| `server.port` default 0 | Agent A | `config/schema.ts:40` ✓ |
| `mcp.autoStart` added, default true | Agent A | `config/schema.ts:60-64` ✓ |
| `useCollabUrl` fetches `/api/config` w/ backoff | Agent A | `lib/use-collab-url.ts:161`, `runCollabUrlPoll` ✓ |
| `fetchApiConfig` returns `{absent, ok, error}` | Agent A | `lib/api-config.ts:29-56` ✓ |
| `ServerInstance.agentFocusBroadcaster` NEW | Agent B | `standalone.ts:101` ✓ |
| `commitDebounceMs` default 15s | Agent B | `persistence.ts:164` ✓ |
| `attachIdleShutdown` not auto-wired | Agent B | `standalone.ts` (not present), `start.ts:469` (is) ✓ |
| `DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000` | Agent B | `start.ts:33` ✓ |
| Server-observer-extension auto-registered | Agent B | `standalone.ts:224` ✓ |
| `recoverPendingManagedRename` auto-run | Agent B | `standalone.ts:842` ✓ |
| Client `observers.ts` no longer writes | Agent C | `editor/observers.ts:1-26` docstring ✓ |
| `SystemDocSubscriber` deps include collabUrl | Agent C | `SystemDocSubscriber.tsx:149` ✓ |
| `runInit(options)` synchronous, no positional | Agent D | `init.ts:321` ✓ |
| `InitCommandOptions` shape `{cwd,mcp,force,editors,rootInstructions,home}` | Agent D | `init.ts:86-95` ✓ |
| `bootStartServer` exists | Agent D | `start.ts:249` ✓ |
| CLI registers only start/mcp/init/preview/ui/stop/clean/status | Agent D | `cli.ts:82-102` ✓ |
| `decideAutoStart` lock-aware | Agent D | `mcp.ts:80-131` ✓ |
| No `packages/cli/src/github/` on main | Agent D | `git ls-tree` ✓ |
| PR #166 OPEN/CONFLICTING | Agent E | `gh pr view 166` `mergeable: CONFLICTING, state: OPEN` ✓ |
| PR #166 head `3dcd80cb` | Agent E | `gh pr view 166 --json headRefOid` ✓ |
| 15 PR #166 endpoints (6 sync + 9 local-op) | Agent E | `pr166-audit:api-extension.ts:3877-3917` ✓ |
| `/api/sync/set-enabled` + `/api/sync/abort-merge` present on PR #166 | Agent E | `pr166-audit:api-extension.ts:3905,3908` ✓ |
| `ui/switch.tsx`, `local-op-security.ts`, `sync-timing.ts` on PR #166 | Agent E | Presumed — not independently re-verified; high confidence from Agent E citation |
| `specs/_archive/2026-04-15-pre-merge/` byte-identical to live | Agent E | Not independently verified; low priority |

Cross-agent convergence: Agents A, B, C all converge on "Electron utility calls `createServer` directly (or `bootStartServer` with opt-outs), does NOT attach idle-shutdown, does NOT acquire ui.lock." Agents D + E converge on "PR #166 unmerged, D31 substrate still forthcoming."

---

# Addendum — Research + Scenario Update (2026-04-17 afternoon)

After the initial audit, three Opus research fanouts (T1/T2/T3) landed at `reports/electron-ai-coding-agent-development/fanout/2026-04-17-audit-followups/` to close open risks + validate API shapes. A follow-up scenario walkthrough then identified multi-process/multi-UI interaction gaps. This addendum captures the research-verified conclusions, corrections to the original audit, and new decisions.

## Research conclusions (verified against primary sources)

### From T1 — @napi-rs/keyring in utilityProcess + Keychain UX

- **`@napi-rs/keyring` viable in `utilityProcess.fork()` on Electron ≥ 34** (INFERRED-strong). N-API 3 ABI-stable; 12 platform prebuilts via `optionalDependencies` split packages. Electron 34 is the floor because PR #46380 (April 2025) fixed a `utilityProcess.fork()` + asar-path crash ([electron/electron#41396](https://github.com/electron/electron/issues/41396)).
- **`asarUnpack` globs needed:** `"**/*.node"` + `"**/@napi-rs/keyring/**"` + `"**/@napi-rs/keyring-*/**"` (platform-split siblings).
- **CRITICAL CORRECTION TO R16 (my earlier speculation was wrong):** macOS keychain prompt uses the app name from `CFBundleDisplayName`, NOT the helper/utility process name. All processes sharing the `.app`'s code-signing identity are attributed to the parent app. Confirmed by Apple Developer Forums thread 649081, [electron/electron#47341](https://github.com/electron/electron/issues/47341), 1Password's production Electron helper-process pattern. **No utility-process renaming needed.**
- **Direct-DMG apps do NOT require `com.apple.security.personal-information.keychain` entitlement.** That entitlement is sandbox-only (MAS apps). Hardened-runtime-but-not-sandboxed direct-DMG apps access their own keychain items by default.
- **Bundle ID + Apple Developer Team stability preserves Keychain ACL across updates** (CONFIRMED via negative search — zero issue-tracker complaints of mass re-prompts after annual Developer ID renewal).
- **Critical anti-pattern: delete+recreate token on refresh wipes ACL.** Must use `set_password` upsert (which `@napi-rs/keyring`'s `Entry.setPassword` does natively via `SecItemUpdate`). Reference: [steipete/CodexBar#340](https://github.com/steipete/CodexBar/issues/340).
- **Linux fail-loud** (SecretService → keyutils → throw). No silent plaintext fallback (stricter than Electron's `safeStorage`, which degrades to hardcoded-key plaintext).
- **`safeStorage` is NOT a drop-in replacement.** Main-process-only. For utility-process architectures, either `@napi-rs/keyring` directly OR main-process IPC relay. Storage models differ (safeStorage: encrypted ciphertext on disk; keyring: keychain item). Migration between requires explicit re-auth pass.

### From T2 — Electron preload bridge patterns

- **`contextBridge` wraps callbacks — `ipcRenderer.removeListener(channel, cb)` with renderer's cb reference silently fails** ([electron/electron#33328](https://github.com/electron/electron/issues/33328), published minimal reproduction). Subscription methods MUST create a preload-side listener wrapper and close over it:
  ```ts
  onProjectSwitched: (cb) => {
    const listener = (_, cfg) => cb(cfg);
    ipcRenderer.on('ok:project-switched', listener);
    return () => ipcRenderer.removeListener('ok:project-switched', listener);
  }
  ```
- **`shell.openExternal` is documented "non-sandboxed only"** — under `sandbox: true` (our default), the bridge method MUST IPC-relay to a main-process `ipcMain.handle`, not call `shell.openExternal` directly from preload. Same for `dialog.*`. For `clipboard`: `navigator.clipboard.writeText` works from `http://localhost` but NOT `file://`; if loading via `loadFile`, clipboard needs IPC relay too.
- **Production patterns surveyed (VS Code, Mattermost Desktop, Logseq, GitHub Desktop):** method-per-channel (Mattermost, Logseq) is idiomatic for small-to-medium surfaces; narrow-channel-namespace (VS Code) scales for 50+ channels; no-bridge-at-all (GitHub Desktop's `nodeIntegration: true, contextIsolation: false`) is legacy and not a model for new apps.
- **Config bootstrap: inject vs fetch.** Injection (`readonly config: {...}`) viable IF all values synchronously known at preload-exposure time. Our design satisfies this because main spawns utility → awaits bound port → then creates BrowserWindow with preload. Production apps (VS Code, Mattermost) lean toward fetch (`resolveConfig(): Promise<Config>`), but injection is valid and has no HTTP round-trip cost.
- **Getter/setter properties on the bridge fire at exposure time, not at access** ([electron/electron#25516](https://github.com/electron/electron/issues/25516)). Use plain values or explicit methods.
- **TypeScript pattern:** `window.okDesktop?: OkDesktopBridge` (optional, `?:`) — shared `packages/app/` bundle runs in web mode without the bridge; renderer must guard.

### From T3 — Multi-window Electron lifecycle

- **Use Electron's native lifecycle flags:** VS Code's `WindowUtilityProcess` uses `utilityProcess.fork(entry, args, { windowLifecycleBound: true, windowLifecycleGraceTime: 6000 })`. The utility terminates automatically on window `closed` + `willLoad`. No manual process-tracking needed for the common case. Adopt directly.
- **Post-exit PID-liveness probe is production necessity.** `utilityProcess.on('exit')` alone is NOT reliable per [VS Code Issue #194477](https://github.com/microsoft/vscode/issues/194477). After `exit` fires, `setTimeout(() => { try { process.kill(pid, 0); process.kill(pid, 'SIGTERM'); } catch {} }, 1000)`.
- **Shutdown drain gate:** `app.on('will-quit', e => e.preventDefault())`, NOT `before-quit`. The latter fires too early (BrowserWindows still open). Use join pattern:
  ```ts
  app.on('will-quit', (e) => {
    e.preventDefault();
    const joiners = [];
    fireOnWillShutdown({ join: (_id, p) => joiners.push(p) });
    Promises.settled(joiners).then(() => app.exit(0));
  });
  ```
  Each per-window tracker registers a drain promise that sends shutdown IPC + awaits utility exit with `Promise.race([exit, timeout(6000)])` fallback to `kill()`.
- **Budgeted auto-restart on crash:** 3 crashes per 5-minute rolling window. Below budget: transient "Restarting..." toast + silent respawn. Above budget: modal "Restart / Close Window." Skip auto-restart on `reason: 'launch-failed'` (deterministic, would loop).
- **Collision dialog is divergent from industry** (0/9 surveyed apps show one — all silent-focus). Keeping our dialog is a deliberate UX choice; consider the variant "silent-focus same-machine + dialog only for foreign-host holders" (captures the genuinely novel cross-machine case).
- **File-based locks:** our `O_EXCL` primitive works on local filesystems. `proper-lockfile` uses `mkdir` (atomic on NFS too) — worth considering if we ever claim NFS/iCloud/Dropbox support. Not required for v0.

## Scenario walkthrough findings (multi-process/multi-UI matrix)

Exhaustive enumeration of who-runs-what-against-folderA surfaced four scenarios where the spec is silent on behavior that happens in practice:

### Scenario A — Electron + `ok start` same folder
✅ Mechanically correct (lock throws). ⚠️ Spec §8.8 J7b dialog only handles Electron-owns-lock vs Electron-sees-foreign; needs explicit CLI-sibling case.

### Scenario B — Electron + `ok ui` same folder
✅ Works by accident (different lock files; `ok ui` proxies to port in `server.lock` → Electron's utility). ⚠️ Spec silent. Browser tab at `localhost:3000` becomes a valid parallel UI client.

### Scenario C — Electron + Claude MCP stdio
✅ Fully covered.

### Scenario D — Claude's `previewUrl` / deep-link (the "embedded webviewer")
❌ **Major gap.** PR #173 added `previewUrl` to all 21 MCP tool responses. URL is built from `ui.lock` via `preview-url.ts`. In Electron mode with no `ok ui` running, `previewUrl` is null → Claude's "Open in browser" links don't work. Three resolution options:
- **Option 1:** Electron registers `openknowledge://` URL scheme; MCP returns `openknowledge://open?project=...&doc=...` when running under Electron (detected via env var set at fork time); Electron main handles `app.on('open-url')` → focuses the right BrowserWindow + navigates renderer to doc.
- **Option 2:** Electron utility serves `/preview/<docName>` HTML page itself. (Utility becomes fatter; port changes per restart break copy-pasted URLs.)
- **Option 3:** Leave null; graceful degradation.

**Recommendation:** Option 1 + Option 3 fallback. Custom scheme is native-Electron and sets a broader deep-link primitive. Lock as D43.

### Scenario E — All three simultaneous (Electron + ok ui + MCP)
✅ Works (CRDT handles multi-client). ⚠️ Spec silent. Three UI surfaces (Electron editor, browser tab, Claude chat) talking to one server via CRDT. No warning needed.

## New decisions this addendum drives (D35-D45)

- **D35 (LOCKED) — Utility boots via `bootServer` extracted to server package.** Move `bootStartServer` from `packages/cli/src/commands/start.ts` to `packages/server/src/boot.ts` as `bootServer(opts): Promise<BootedServer>`. CLI's `start.ts` becomes a thin Commander wrapper that adds CLI-specific concerns (auto-spawn `ok ui`, stderr capture for MCP detached-spawn, `runInit` auto-init). Electron utility imports `bootServer` from the server package directly. Dep graph stays clean: desktop → server + core (no desktop → CLI). Resolves OQ-NEW-2. Forces D20 (`OK_DIR` + `resolveContentDir` / `resolveLockDir` → core) to apply as part of the same refactor.

- **D36 (LOCKED) — Utility does NOT attach `attachIdleShutdown` and does NOT acquire `ui.lock`.** Window lifecycle (main process) owns utility lifetime via `windowLifecycleBound: true, windowLifecycleGraceTime: 6000`. `ui.lock` is a CLI-distribution concern; Electron has no `ok ui` equivalent (BrowserWindow IS the UI). Explicit via `bootServer({ idleShutdownMs: null, attachUiSibling: false })`.

- **D37 (LOCKED) — Renderer bootstrap via preload injection (Path A).** `window.okDesktop.config = {collabUrl, apiOrigin, projectPath, projectName}` injected at preload-exposure (synchronously known because main awaits utility's bound port before creating BrowserWindow). `useCollabUrl()` hook short-circuits when `window.okDesktop?.config.collabUrl` is set; falls through to `fetch('/api/config')` otherwise (preserves CLI-web compat). One-liner edit to `packages/app/src/lib/use-collab-url.ts`. Resolves OQ-NEW-1.

- **D38 (LOCKED) — `OkDesktopBridge` API shape (typed + subscription-based).**
  ```ts
  interface OkDesktopBridge {
    readonly config: {
      collabUrl: string;
      apiOrigin: string;
      projectPath: string;
      projectName: string;
    };
    onProjectSwitched: (cb: (next: Config) => void) => () => void;  // preload-wrapped unsubscribe
    onMenuAction: (cb: (action: MenuAction) => void) => () => void;
    dialog: {
      openFolder: () => Promise<string | null>;
      createFolder: () => Promise<string | null>;
    };
    shell: {
      openExternal: (url: string) => Promise<void>;  // IPC relay, not direct shell call
    };
    clipboard: {
      writeText: (text: string) => Promise<void>;  // IPC relay for file:// load
    };
    platform: 'darwin' | 'win32' | 'linux';
    appVersion: string;
  }
  ```
  Type definition lives in `@inkeep/open-knowledge-core/src/desktop-bridge.ts` so both preload (desktop package) and renderer (app package) import from one source. Subscriptions MUST use preload-side listener wrapper pattern (not pass renderer cb to `ipcRenderer.removeListener` — [#33328](https://github.com/electron/electron/issues/33328)). `shell.openExternal` under `sandbox: true` MUST be IPC-relay.

- **D39 (LOCKED) — Utility process lifecycle uses `windowLifecycleBound: true, windowLifecycleGraceTime: 6000` + post-exit PID-liveness probe.** Adopted verbatim from VS Code's reference implementation. Utility terminates on window `closed` + `willLoad`. After `utilityProcess.on('exit')` fires, main runs `setTimeout(() => { try { process.kill(pid, 0); process.kill(pid, 'SIGTERM'); } catch {} }, 1000)` to catch the zombie case per [VS Code Issue #194477](https://github.com/microsoft/vscode/issues/194477).

- **D40 (LOCKED) — Shutdown coordination via `will-quit.preventDefault()` + join pattern.** Not `before-quit` (too early). `fireOnWillShutdown` emits event with `join(id, promise)` callback. Each per-window tracker registers its utility's drain promise (`shutdown IPC → utility destroy → Promise.race([exit, timeout(6000)])` with `kill()` fallback). `Promises.settled(joiners)` barrier with 20s overall cap → `app.exit(0)`.

- **D41 (LOCKED) — Crash recovery: budgeted auto-restart before modal.** `CrashTracker` per-utility: 3 crashes per 5-minute rolling window. Below budget → transient toast "Server restarting..." + silent respawn. Above budget → modal "Server crashed repeatedly. [Restart] [Close Window]." Skip auto-restart entirely when `utilityProcess.on('exit', (code, reason))` reports `reason: 'launch-failed'` (deterministic failure, would loop). Replaces spec §7 J7g's unconditional modal prompt.

- **D42 (LOCKED) — `mcp.autoStart` stays at PR #173 default `true`.** No Electron-side override. `decideAutoStart` is lock-aware: live lock → connect, dead/missing lock → spawn. Crash-race edge case (J6) handled via `runClean` on Electron boot + J7b collision dialog. Same MCP entry behaves identically across CLI-init and Electron-init origins. Resolves OQ-NEW-3.

- **D43 (LOCKED) — Electron registers `openknowledge://` URL scheme for deep-linking + MCP previewUrl.** `app.setAsDefaultProtocolClient('openknowledge')`. MCP `preview-url.ts` helper detects Electron origin (env var set at utility fork: `OK_ELECTRON_PROTOCOL_HOST=1`) → returns `openknowledge://open?project=<realpath>&doc=<docName>` when under Electron. Main handles `app.on('open-url', (e, url) => ...)` → parses → finds or spawns BrowserWindow for the project → navigates renderer to doc → focuses window. Fallback (when no Electron): returns existing `http://localhost:3000/<docName>` from `ui.lock`. Closes Scenario D gap.

- **D44 (LOCKED) — J7b collision dialog generalizes based on lock-holder identity.** Three cases:
  - **(a) Another Electron window owned by this app** (pid ∈ our window map): "[Cancel] [Focus existing window]"
  - **(b) CLI `ok start` sibling** (pid alive, hostname matches localhost, pid NOT in our map): "[Cancel] [Quit the CLI server and continue]" (main sends SIGTERM to pid → waits up to 10s for release → re-acquires)
  - **(c) Foreign-host** (hostname mismatch — e.g., iCloud-synced folder being opened on a different machine): "[Cancel] [Show lock in Finder]"

- **D45 (LOCKED) — `ok ui` + Electron coexistence is explicitly supported, no warning.** `ok ui` running alongside Electron's utility is valid and useful (browser tab at `localhost:3000` becomes a parallel UI client of Electron's Hocuspocus via `ok ui`'s `/api/config` + `/api/*` proxy). No conflict — different lock files (`ui.lock` vs `server.lock`). Document as supported multi-UI pattern in §8.

## D31 reframe — inheritance posture, not shape

Per greenfield-lens analysis, D31 shifts from "inherit PR #166 with specific 15-endpoint / 9,260-LOC inventory" to "inherit the git-collab substrate from wherever it ships, posture: no Electron-side re-design; UI in packages/app/ via D13 shared bundle, server logic in createServer via D35 bootServer." Shape inventory (as-of-audit-date) moves from D31 body to this audit-findings as evidence. Electron v0 can ship without PR #166 merging (auto-sync is opt-in via sign-in; inert without sign-in; enables automatically when PR #166 merges via D13).

## R16 correction (supersedes earlier R16 text)

**Earlier speculation (WRONG):** "utility-process name surfaces in Keychain prompt dialog instead of 'Open Knowledge' — either rename utility to user-friendly string or accept the artifact."

**Correction (T1 evidence):** macOS Keychain prompt uses app name from `CFBundleDisplayName`. All processes sharing the `.app`'s code-signing identity (including utility processes) are attributed to the parent app. No utility-process renaming needed. Bundle-ID + Apple Developer Team stability across updates preserves the Keychain ACL. Delete+recreate anti-pattern destroys ACL — use `set_password` upsert (handled by `@napi-rs/keyring` natively).

## New risks (add to §9)

- **R17 — Observer bridge server-side CPU budget.** PR #152 moves cross-CRDT sync (Observer A/B) server-side. `createServer()` auto-attaches `createServerObserverExtension` per document. Utility hosts N observers for N open documents. Verify integration-test with 10+ docs + disk-churn event doesn't stall utility event loop.
- **R18 — `managed-rename-recovery` as 4th `degraded` value.** Spec §7.2 lists three possible `degraded` subsystem names; PR #139 added a fourth. Electron's J7g crash recovery UX reads `degraded` after `ready` resolves; must handle this value.
- **R19 — Idle-shutdown accidentally wired.** An engineer copying `bootStartServer` logic into the utility entry would pick up `attachIdleShutdown`, killing the utility after 30 min of no WS clients — bad for a minimized BrowserWindow. Add lint rule or integration test asserting `attachIdleShutdown` is NOT called from the utility entry.
- **R20 — Multi-UI-client user perception.** When a user has Electron editor + browser tab (via `ok ui`) + Claude MCP all editing the same doc, CRDT reconciles correctly but the user may be confused ("which one is authoritative?"). Cosmetic risk, not correctness. Document in help. No mitigation needed.

## Closes

- **OQ-NEW-1** → D37 (Path A preload injection)
- **OQ-NEW-2** → D35 (extract bootServer)
- **OQ-NEW-3** → D42 (mcp.autoStart stays default)
- **OQ-NEW-4** → D31 reframed to posture

**Scenario D `previewUrl`** → D43 (openknowledge:// URL scheme)
**Scenario A J7b generalization** → D44 (three-case dialog)
**Scenario B/E multi-UI** → D45 (coexistence explicitly supported)

---

# Addendum 2 — T4 + T5 Research (2026-04-17 late)

Two additional research fanouts (T4 deep-linking, T5 startup-order matrix) landed as `reports/electron-ai-coding-agent-development/fanout/2026-04-17-audit-followups/{t4-deeplinking-url-schemes,t5-startup-order-matrix}/`. They validate + extend the earlier decisions with production-verified patterns and surface additional spec gaps.

## T4 key findings (deep-linking / URL schemes)

- **CVE-2018-1000006 closed the inbound argv-injection class via the `--` sentinel pattern.** VS Code's production code: `setAsDefaultProtocolClient(scheme, execPath, ['--open-url', '--'])`. Trailing `--` tells Chromium all subsequent argv are positional, defeating the class. Historical victims: Slack, Skype, Signal, GitHub Desktop, Twitch, WordPress.com. Bypass via `host-rules` (Doyensec 2018) was the second patch. Applies to D43.
- **macOS `open-url` can fire before `ready`** ([electron/electron#32600](https://github.com/electron/electron/issues/32600)). Listener must be registered synchronously at top-of-main, URLs queued until a window exists. VS Code's `ElectronURLListener` queue-then-flush with 10×500ms retry is the reference pattern.
- **Registration is three-platform-three-mechanism:** macOS `CFBundleURLTypes` in Info.plist (packaging-time via electron-builder `protocols` key); Windows `HKCU\Software\Classes\<scheme>` (runtime via `setAsDefaultProtocolClient`); Linux `.desktop` with `MimeType=x-scheme-handler/<scheme>;` (install-time via `linux.mimeTypes` for deb/rpm). **AppImage is broken** — no .desktop generation ([electron-userland/electron-builder#4035](https://github.com/electron-userland/electron-builder/issues/4035)).
- **Shabarkin 2022 "1-click RCE" class** — Electron apps passing untrusted URLs to `shell.openExternal()` can invoke OS-native schemes (`ms-msdt:`, `search-ms:`, `ms-officecmd:`) whose own argv injection produces RCE. **Defense:** allowlist schemes at our `openExternal` IPC bridge (applies to D38).
- **Production URL shape convention:** `scheme://<action>?<params>` with required workspace-identifier. Fixed action allowlist. URI parse try/catch + silent-drop on failure. Focus-existing window default. Survey: VS Code, Cursor (JWT-signed payloads for sensitive actions), Obsidian, Logseq, GitHub Desktop, Figma, Slack, Discord, Notion, Linear — all converge.
- **Single-instance coordination:** `app.requestSingleInstanceLock(additionalData?)` + `second-instance` event. `additionalData` (Electron 14+) is the structured payload channel; `argv` is unreliable (Chromium appends flags).
- **Playwright can test cold-start argv path** directly via `electron.launch({ args: [url] })`. `open-url` / `second-instance` need `app.evaluate` to dispatch. True OS-handler integration needs packaged-smoke tier.

## T5 key findings (startup-order matrix)

- **24 raw permutations collapse into 8 equivalence classes** (C1–C8). Reductions: `ok ui` uses separate lock (not on exclusive axis); MCP is passive-reader (never acquires); Electron/CLI-server symmetric on `server.lock`.
- **VS Code's 3-layer model** is the canonical analog: IPC pipe EADDRINUSE (authoritative "anyone running?") + lockfile (diagnostic PID record) + in-memory workspace-window registry (route "which window for this workspace?"). Single-lockfile approaches (GitHub Desktop, Logseq) work for single-window apps only.
- **Docker Desktop's CLI-is-a-client pattern** is the cleanest conceptual analog for CLI+GUI coexistence — CLI invocations speak the daemon's protocol instead of contending for a file lock. Our `ok mcp` already does this (connects to `server.lock`-advertised server); extending to `ok ui` is the natural evolution.
- **No production Electron app ships auto-takeover.** User-mediated dialogs only. VS Code's "not responding" 10s timeout surfaces the failure; silent focus-existing is the majority pattern.
- **Process-tree cleanup on parent-crash is OS-dependent:**
  - **Windows:** Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — kernel-guaranteed cascade.
  - **Linux:** `prctl(PR_SET_PDEATHSIG, SIGTERM)` — race-prone but functional; utility must also check `getppid() == 1` at startup for fork-race recovery.
  - **macOS:** **NO kernel primitive.** Child must self-monitor: stdin-EOF (if spawned with inherited stdin pipe), `kqueue(NOTE_EXIT)`, or poll-based `kill(ppid, 0)` heartbeat. macOS is the binding constraint.
- **Cross-machine sync (iCloud/Dropbox) defeats file-locking.** flock/fcntl don't work over NFS/SMB; sync services produce "conflicted copy" files. Logseq's proposed hostname-per-file lock-directory (one file per holder named `<hostname>-<uuid>.lock`) is the cleanest available pattern — not implemented in any shipping app.
- **Electron's `requestSingleInstanceLock` has a known Windows race** ([electron/electron#35680](https://github.com/electron/electron/issues/35680)) where both instances claim the lock. Production apps layer IPC-pipe on top for reliability.
- **Collision UX converges on 3 shapes:** silent focus-existing (VS Code, Cursor, GitHub Desktop, Slack/Discord); three-way dialog (JetBrains — "This Window / New Window / Cancel"); hard refuse (Logseq, Obsidian).

## T5 gaps surfaced → new decisions / risks

- **Gap 1: Cross-machine sync** → no production-app solution. Closest pattern = Logseq's hostname-per-file proposal. **Severity: HIGH** for iCloud/Dropbox users, **NONE** for local-only. New decision D50 below.
- **Gap 2: MCP-spawned-server orphaning** — if `ok mcp` self-spawns `ok start` (C5), and `ok mcp` dies, `ok start` persists and blocks Electron. **Fix:** ok-start-when-spawned-by-mcp must inherit stdin and self-exit on stdin-EOF. This is PR #173 territory — flag as SPEC guidance, not an Electron-specific decision.
- **Gap 3: Takeover semantics for stuck first instance** — spec should explicitly state policy. **Fix:** D44 three-case dialog handles this; refined to include "takeover if lock-holder is known-headless (e.g., `ok start`)" because `ok start`'s unsaved state is minimal (L1/L2 debouncers flush on destroy).
- **Gap 4: 12-hour `ok ui` safety-net UX** — cosmetic; flag as R21.
- **Gap 5: URL cold-start with no handler registered** — addressed by install-time protocol registration (D43 already covers macOS Info.plist + Linux .desktop at install; Windows runtime registration on first launch). For pre-install fallback: shareable URLs should have an HTTPS form (`https://openknowledge.example/goto?...`) that redirects to `openknowledge://` + offers app download. Out of scope for v0 but flagged in D43.
- **Gap 6: Process-tree cleanup on Electron-main crash** → new decision D49 below.
- **Gap 7: Diagnosis-rich collision error** → new decision D48 below.

## New decisions from T4 + T5 (D46–D50)

- **D46 (LOCKED) — `setAsDefaultProtocolClient` with `--` sentinel + `will-finish-launching` queue.** Closes CVE-2018-1000006 argv-injection class. Packaging: macOS `CFBundleURLTypes` via electron-builder `protocols`, Windows runtime `setAsDefaultProtocolClient('openknowledge', process.execPath, ['--open-url', '--'])`, Linux `linux.mimeTypes` for deb/rpm (AppImage explicitly out-of-scope for deep-linking per NG4 Linux-NOT-NOW). macOS listener registered inside `app.on('will-finish-launching')` + queue-then-flush pattern (VS Code `ElectronURLListener` reference). Refines D43's implementation contract.
- **D47 (LOCKED) — URL payload validation defense-in-depth.** (1) Parse via `new URL(incoming)` with try/catch, silent-drop on failure — no user-visible dialog; (2) Fixed action allowlist — `open | focus | preview` only; no eval-style dispatch; (3) Project param: realpath + containment check against Recent Projects list; reject paths outside; (4) `shell.openExternal` IPC bridge (D38) enforces outbound scheme allowlist — prevents Shabarkin 1-click-RCE via chained OS-native schemes (`ms-msdt:` et al.); (5) No payload signing needed for v0 (not installing executable code — Cursor's JWT pattern is for MCP-install, which we don't do).
- **D48 (LOCKED) — `ServerLockCollisionError` diagnostic shape.** Error surface to the user in J7b dialog includes: PID, hostname, process name guess (Electron / `ok start` / MCP-spawned), startedAt timestamp, worktreeRoot. User can correlate with Activity Monitor / Task Manager. Matches VS Code's precision-error pattern ("running as administrator"). Per-OS "process name guess" derivation: read the lock's `processName` field (added to `ServerLockMetadata` or inferred from `worktreeRoot` matching app bundle location).
- **D49 (LOCKED) — Process-tree cleanup on Electron-main crash.** Utility must self-detect parent death to prevent orphaning:
  - **Windows:** main process assigns utility to a Job Object via native addon (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`). Kernel-guaranteed cascade on main death.
  - **Linux:** utility entry calls `prctl(PR_SET_PDEATHSIG, SIGTERM)` at startup, THEN checks `getppid() === 1` (fork-race check — if already orphaned, self-exit).
  - **macOS:** utility entry polls `process.kill(parentPid, 0)` every 5s; on EPERM-or-ESRCH, self-exit. Alternative: use stdin-EOF if Electron supports inherited stdin to utilityProcess (unverified — spike needed).
  - Complements R19 (idle-shutdown accidental wiring risk): both ensure utility can't outlive its main process.
- **D50 (TENTATIVE) — Cross-machine sync (iCloud/Dropbox) read-only fallback.** When `server.lock` is held by a different hostname (cross-machine case), Electron's utility refuses to acquire write-lock but offers READ-ONLY mode via dialog: *"This project is already open on MacBook-Pro (Nick). Proceed in read-only?"* + "I know better" override (force-acquire, explicit user choice). Adopted from Logseq's proposed pattern; TENTATIVE because no production app ships this yet — may need v0.1 spike to validate CRDT semantics under simultaneous cross-machine open. Also update `acquireServerLock` to write lock as a directory with one file per holder (rather than a single file) to survive sync-service conflict-copy generation.

## New risks (R21–R22)

- **R21 — `ok ui` 12-hour safety-net shutdown cosmetic surprise.** If user runs `ok ui` alongside Electron and leaves it for >12 hours, `ok ui` self-exits; their browser tab (if still open) gets ENOCONN on reload. **Mitigation:** document in `ok ui` help output; consider user-visible indicator in the proxied page. Cosmetic, not correctness.
- **R22 — `app.relaunch()` reliability.** Known issues per [electron/electron#31726](https://github.com/electron/electron/issues/31726). Pair crash-recovery auto-restart (D41) with crash reporting so failed relaunches don't silently orphan users.

## Updated OQ closes (final)

- **OQ-NEW-1** → D37 (Path A preload injection) ✓
- **OQ-NEW-2** → D35 (extract `bootServer` to server package) ✓
- **OQ-NEW-3** → D42 (mcp.autoStart stays default true) ✓
- **OQ-NEW-4** → D31 reframed to posture-not-shape ✓

All spec-level open questions closed pending D30–D50 + R15–R22 spec ingestion.
