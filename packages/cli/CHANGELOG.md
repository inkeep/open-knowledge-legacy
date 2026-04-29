# @inkeep/open-knowledge

## 0.3.0

### Minor Changes

- ddd4efc: feat(agent-writes): optional `summary` on all four MCP write tools — renders as collapsible bullets on the Timeline row so readers can scan agent intent without opening every diff.

  Agents calling `write_document`, `edit_document`, `rename_document`, or `rollback_to_version` can now pass an optional one-line `summary` describing the outcome of the edit (e.g. `"Fixed token-refresh race"`). Summaries persist per-contributor to the shadow-repo `ok-contributors:` JSON line and render under the author on the [[timeline]] WIP row — first bullet inline, the rest collapsed behind a "Show N more" expander matching the existing `WipGroup` pattern. The doc-list stays visible as ground truth alongside the bullets.

  - `@inkeep/open-knowledge-core` — `ShadowContributor` gains `summaries?: string[]` (flat per-contributor array, oldest-first). `parseContributors` accepts both legacy (no field) and new shapes; malformed `summaries` values drop just that field while preserving the contributor entry — a deliberate divergence from the whole-entry-skip convention so decorative loss (no bullets) never escalates to attribution loss.
  - `@inkeep/open-knowledge-server` — new `agent-write-summary.ts` exports `normalizeSummary` as the single API-boundary truncation point (80-char cap, U+2026 suffix when truncated; whitespace-only and empty strings classify as `absent`). `recordContributor` threads through the optional 5th-arg summary; `formatContributorsFrom` emits `summaries` on the `ok-contributors:` line only when non-empty so summary-less writes stay byte-identical to today. Five API handlers (`/api/agent-write`, `/api/agent-write-md`, `/api/agent-patch`, `/api/rename`, `/api/rollback`) accept the optional body field and return `summary: {value, truncatedFrom?}` + a human-readable hint when truncation fires. Three new metrics counters (`agentWriteCalls`, `summariesProvided`, `summariesTruncated`) track M1 adoption and M2 cap efficacy. `handleRename` and `handleRollback` now call `extractAgentIdentity` + `recordContributor` — **but only when the request body carries an explicit `agentId`** (D22 LOCKED), so the in-editor Restore button (which posts with no identity) stays anonymous on the timeline as it always has. MCP-driven rename and rollback calls get a server-generated default summary (`"Renamed <from> → <to>"` / `"Restored to <sha-short>"`) when the agent omits one.
  - `@inkeep/open-knowledge` — the four write MCP tools expose `summary` in their Zod schemas (Zod hard-cap of 200 chars as a transport-safety bound separate from the 80-char rendering cap); `rename_document` and `rollback_to_version` also thread agent identity (`agentId`/`agentName`/`clientName`/`colorSeed`) matching the pattern from `write-document.ts` so summary attribution lands correctly. Tool descriptions include the cap, the rename/rollback defaults, and a no-PII/secrets hint.
  - `@inkeep/open-knowledge-app` — `TimelinePanel` `EntryRow` renders the collapsible bullet list when any contributor on the row has `summaries`; zero regression for legacy rows without the field. The doc-list line stays as ground truth alongside the bullets.

  The `ok-contributors:` JSON line stays at `v: 1` — `summaries` is purely additive (precedent #9). Legacy commits (no field) and summary-less writes (field omitted) both remain byte-identical to pre-feature behavior. `exec` / `read_document` enrichment carries the field through automatically via `history.contributors[*].summaries`.

  Full spec + decision log (D1–D27, US-001–US-007): [`specs/2026-04-21-agent-write-summaries/SPEC.md`](specs/2026-04-21-agent-write-summaries/SPEC.md).

- 05c7e37: feat(desktop): Electron desktop M1 — native macOS app with persistent Navigator launcher, per-project editor windows, and attach-to-existing-server.

  New private package `@inkeep/open-knowledge-desktop` launches Open Knowledge as a native macOS Electron app (dev loop only — signing, notarization, DMG, auto-update, URL scheme, keyring, MCP wiring, CLI-on-PATH menu are M2–M7). `bun run dev --filter=@inkeep/open-knowledge-desktop` opens a Navigator window with three cards (Clone from GitHub, Open folder on disk, Start fresh) + Recent list; every project pick spawns a new editor window per D3/D24 revised (no switch-in-place).

  Process model: one BrowserWindow ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir` (D6), with a second branch that attaches to a live same-host `server.lock` instead of colliding — so a running `npx open-knowledge start` CLI and the desktop app cooperate on the same project. Typed IPC channel map (D14), hand-rolled preload bridge with contextBridge listener wrappers (D38 + electron/electron#33328), `utilityProcess.fork` with `windowLifecycleBound: true` (D39), macOS poll-based parent-death detection (D49), `shell.openExternal` scheme allowlist (D47), sandbox-compatible CommonJS preload.

  Server + core refactors that landed alongside:

  - `@inkeep/open-knowledge-server` exports `bootServer(opts)` — the shared wrapper that composes `createServer()` + HTTP listener + server-lock port-write + optional `ok ui` sibling + idle-shutdown. CLI's `ok start` is now a thin wrapper over it; Electron's utility process calls it with `{ attachUiSibling: false, idleShutdownMs: null }`. Also emits permissive CORS headers for `/api/*` so cross-origin renderer fetches (Electron dev server → utility process) work.
  - `@inkeep/open-knowledge-core` gains `OK_DIR` (moved from CLI) and the canonical `OkDesktopBridge` interface.
  - `@inkeep/open-knowledge-app` ships `NavigatorApp.tsx` (Electron-only launcher), `WorkspaceSwitcher.tsx`, `CommandPalette.tsx` (Cmd+K), and `desktop-fetch.ts` — a renderer-side `/api/*` fetch rewriter that targets `window.okDesktop.config.apiOrigin` when present. `useCollabUrl` short-circuits on the same bridge config in Electron.
  - `@inkeep/open-knowledge` (CLI) is unchanged externally; internally `bootStartServer` delegates to `bootServer`.

  Web and CLI distributions are unaffected — `window.okDesktop` is undefined outside Electron, and every desktop-specific surface is gated on it.

  Full spec + decision log (D1–D52): `specs/2026-04-11-electron-desktop-app/SPEC.md`.

- 39fa932: feat(desktop): M3 — Auto-update (electron-updater + install-on-quit).

  Wires `electron-updater@6.8.4` (exact-pinned, paired with `electron-builder@^26.9.0` via shared `builder-util-runtime@9.6.0`) into the Electron main process behind the `app.isPackaged` gate. Adds `.zip` to `mac.target` in `electron-builder.yml` so Squirrel.Mac's ZIP-based swap path has the artifact it needs (`MacUpdater.ts:89` downloads `.zip`, not `.dmg`).

  Main-process module at `packages/desktop/src/main/auto-updater.ts` subscribes six `autoUpdater` events (`checking-for-update`, `update-available`, `update-not-available`, `download-progress` debug-only, `update-downloaded`, `error`) and explicitly skips `login`, `update-cancelled`, `appimage-filename-updated`. Classified errors (`ERR_UPDATER_*` / `HTTP_ERROR_*`) and bare Squirrel.Mac Errors both log silently and retry on the next launch per parent J7a — no dialog, no nag.

  Three renderer toasts via the existing sonner mount in `packages/app/src/main.tsx` (all `duration: Infinity`, user-dismissable):

  - **Toast A** — `"Update downloaded"` + `"Relaunch now"` action button, fires once per pending-update version.
  - **Toast B** — `"Updated to v${VERSION} — see what's new"` with a link to the GitHub Releases tag, once per version transition.
  - **Toast C** — D12 stuck-update escape hatch: after 7 consecutive calendar days without a successful update check, fires once per installation with a link to the manual-download page.

  Four new `AppState` fields persist the toast gates (`versionPendingInstall`, `lastSeenVersion`, `lastSuccessfulCheckAt`, `stuckHintShown`), backwards-compatible with pre-M3 `state.json` via the existing defensive-coercion pattern in `parseAppState`.

  Periodic check every 1 hour (matching Obsidian UX per D10 revised), singleton-per-launch, cleared on `app.on('will-quit')`. Relaunch-now button invokes `autoUpdater.quitAndInstall()`; if the user dismisses the toast instead, `autoInstallOnAppQuit = true` still installs at next natural quit.

  Release pipeline: new `.github/workflows/desktop-release.yml` triggers on `release: published` (fired by `release.yml`'s `gh release create`) and runs `electron-builder --mac --publish always` on `macos-14` to upload `.dmg`, `.dmg.blockmap`, `.zip`, `.zip.blockmap`, and `latest-mac.yml` to the existing GitHub Release. Workflow lints + parses but its real-world execution is gated on M2's Apple-creds procurement and the universal-merge SHA-parity fix (M2 FU-1 / FU-2).

  Dev-mode smoke: `packages/desktop/scripts/smoke-mock-update.mjs` spins a local HTTP server with a hand-crafted `latest-mac.yml` + fake `.zip` so the wiring can be exercised end-to-end (short of the signature-verified Squirrel.Mac swap) before signed DMGs exist.

  Version bootstrap is governed by the `changesets fixed` group — `@inkeep/open-knowledge-desktop@0.0.0` bumps lockstep with its peers at next `release.yml` run; no hand-edit to `package.json`.

  Full spec + decision log (D1–D12): `specs/2026-04-21-m3-electron-updater/SPEC.md`.

- 3ab7ae9: feat(desktop): M4 `openknowledge://` URL scheme end-to-end.

  Closes M4's DOD in the Electron desktop app. Clicking `openknowledge://open?project=<abs-path>&doc=<name>` from any surface (Terminal `open`, Mail/Slack hyperlinks, MCP tool responses in Claude Desktop) routes the user to the right project window with the renderer navigated to the target doc. Unblocks M6: MCP `preview-url.ts` now emits `openknowledge://` URLs when running inside Electron (gated on `OK_ELECTRON_PROTOCOL_HOST=1`, set at utility fork), and falls through to `http://localhost/...` for CLI/bunx consumers.

  Implementation details: synchronous top-level `open-url` listener registration (per electron/electron#32600 — `open-url` can fire before `will-finish-launching` OR `ready` on macOS); VS Code-style queue-then-flush with 10 × 500ms retries; `second-instance` argv scan for CLI-style launches; `realpathSync`-canonicalized `windowsByPath` keys; `dom-ready`-gated `sendDeepLink` on cold spawns to defeat subscriber-mount races; dev-mode `setAsDefaultProtocolClient('openknowledge')` with `before-quit` cleanup via `removeAsDefaultProtocolClient` (prevents stale Launch Services bindings to deleted worktrees). Path-traversal defense rejects null bytes (pre-decode + post-decode for layered `%2500` shapes), URL-decodes, then checks the raw decoded string for `..` segments before normalization — `path.resolve`'s silent-flatten behavior makes equality-style gates insufficient. `shell.openExternal` scheme allowlist (`https`, `http`, `mailto`, `openknowledge`) enforced at the main-process boundary per D47. Nested doc names (`notes/meeting-2026`) round-trip correctly via `encodeURIComponent` on both producer (preview-url) and consumer (renderer hash nav) sides.

  macOS-only v0 per D51. Windows/Linux NG1/NG2 paths remain `NOT NOW`. Cold-start Apple-Event delivery requires signed DMG + Launch Services binding — deferred to M3/M7 and captured as a named `test.skip` in `deep-link.e2e.ts` for explicit CI visibility.

  See `specs/2026-04-21-m4-url-scheme/SPEC.md` and parent `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.

- 19b51e4: feat(desktop): M6 CLI-on-PATH install + first-launch MCP consent.

  Closes M6's DOD on the Electron desktop app. Two phased deliverables on one branch:

  - **M6a — Install Command-Line Tools…** menu item (macOS only). Click → admin prompt → `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` symlinks pointing at the bundled wrapper. Wrapper uses `ELECTRON_RUN_AS_NODE=1` to host the CLI under the bundled Electron binary — no separate Node install required (D17 amendment flips `RunAsNode` fuse to `true`; VS Code / Atom precedent). Translocation guard refuses install from DMG mount; collision guard prompts before stomping foreign files; G5 launch-time repair offers re-link when symlinks point at a removed bundle.
  - **M6b — first-launch MCP consent dialog** (host-agnostic; renders in whichever window opens first per D-M6-R10). User-scoped marker at `~/.open-knowledge/mcp-status.json` fires the dialog exactly once per user per Mac. Detected editors preselected (Claude Code, Claude Desktop, Cursor, VS Code, Codex, Windsurf — `detectInstalledEditors` already global-scoped). Add → per-editor MCP config writes via NEW CLI export `writeUserMcpConfigs(opts)` (NOT `runInit` — `runInit` runs `ensureProjectGit` + `initContent` + `scaffoldLaunchJson` + `upsertRootInstructions` which would `git init /` from a packaged Electron app's `process.cwd()`). Hybrid `cliPath` per D-M6-R9: `/usr/local/bin/ok` when M6a installed AND ownership-checked, bundle-absolute `Resources/cli/bin/ok.sh` otherwise.

  Public-surface additions to `@inkeep/open-knowledge` (the published CLI):

  - `writeUserMcpConfigs(opts: UserMcpConfigsOptions): Promise<EditorMcpResult[]>` — new export. Writes per-editor MCP entries without `runInit`'s project-scoped side effects. Surface for Electron main; CLI `ok init` from terminal continues to use `runInit` unchanged.
  - `UserMcpConfigsOptions` interface — `{editors, force?:boolean|Set<EditorId>, cliPath?:string, home?:string}`.
  - `readExistingMcpEntry(target, cwd, home?)` — new export. Format-aware (JSON / TOML) tolerant reader. Never throws — returns `null` on absent / unparseable / shape-incompatible config.
  - `writeEditorMcpConfig` — promoted from private to exported (was already declared at `init.ts`, now available via the public surface).
  - `McpInstallOptions.cliPath?: string` — new optional field. Highest-precedence branch in `buildManagedServerEntry`: `{command: cliPath, args: ['mcp']}`. Backward-compatible — existing `ok init` calls without `cliPath` continue to produce the canonical `{command:'npx', args:['@inkeep/open-knowledge','mcp']}` shape.

  Notable implementation decisions:

  - `confirmHandler` returns `{ok:false, error: <user-readable>}` on partial-write failure — sonner toast surfaces the failure to the user since the dialog itself unmounts on result resolution. Marker stays absent (deferred-marker per OQ-19) so the dialog re-fires next launch for retry.
  - Renderer-ready handshake (D-M6-R10) registers a one-shot `ok:mcp-wiring:renderer-ready` invoke handler; main responds with `ok:mcp-wiring:show` to the same WebContents and removes the handler ONLY on successful dispatch — so a failed first dispatch keeps the handler armed for the next renderer's mount-ack.
  - POSIX-safe shell escape on the install-script command builders — apostrophes in bundle paths (renamed `.app`, account name with `'`, etc.) cannot inject root commands through the `osascript ... do shell script "..." with administrator privileges` chain.
  - Atomic marker writes via `tmp+rename` — mirrors `state-store.saveAppStateToDir` so power-loss between write and fsync can't leave a truncated marker.
  - macOS-only v0 per D51. Windows/Linux NG4 paths remain `NOT NOW`.

  See `specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md` and parent `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.

- 3079199: feat(init): scope selection for MCP config — user, project, or both

  `ok init` now supports writing MCP server config at the user level, the project level, or both.

  - **Interactive (TTY):** checkbox prompt, both scopes pre-selected
  - **Non-interactive (piped/CI):** defaults to `both`
  - **`--scope <user|project|both>`:** bypasses the prompt

  Project-level paths: `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), `.vscode/mcp.json` (VS Code), `.codex/config.toml` (Codex). Windsurf and Claude Desktop are skipped (no project-local config format).

- 1f030ba: feat(presence): unify agent presence on `__system__` awareness (multi-agent)

  N concurrent agents (Claude + Cursor, two Claudes, etc.) now coexist in the presence bar as distinct badges. The previous per-content-doc awareness surface stomped because every Hocuspocus `Document` has one shared `Awareness` clientID — every agent's `setLocalState` overwrote the prior. Presence now lives on the `__system__` Y.Doc's awareness as a map-valued `agentPresence` field keyed by `agentId`.

  **Breaking (core):**

  - `AwarenessUser.type` narrowed from `'human' | 'agent'` to `'human'`. Agents no longer publish per-doc awareness — construct `AgentPresenceEntry` instead and call the server-side `AgentPresenceBroadcaster`. If you were reading `user.type === 'agent'` on per-doc awareness, that path is gone; read `agentPresence?` on `__system__.awareness` instead.
  - `AgentFocusEntry` type export removed. Use `AgentPresenceEntry` from `@inkeep/open-knowledge-core`.
  - `AwarenessState.agentFocus?` field removed. Replaced by `agentPresence?: Record<string, AgentPresenceEntry>` on the same type.

  **Breaking (server):**

  - `AgentFocusBroadcaster` renamed to `AgentPresenceBroadcaster`. API replaced: `setFocus`/`clearFocus`/`getFocusMap` → `setPresence(agentId, entry)`, `clearPresence(agentId)`, `touchMode(agentId, mode)`, `getPresenceMap()`. Entry shape now `{displayName, icon, color, currentDoc, mode, ts}` (was `{agentName, currentDoc, writeKind, ts}`).
  - `ServerInstance.agentFocusBroadcaster` renamed to `agentPresenceBroadcaster`.
  - `ApiExtensionOptions.agentFocusBroadcaster` renamed to `agentPresenceBroadcaster`.
  - New endpoint `GET /api/metrics/agent-presence` returns the presence map for operator diagnostics (not polled by the browser).

  **CLI:**

  - MCP keepalive URL now carries `&agentId=${connectionId}` so the server can deterministically clear presence on process exit. Older MCP clients without the param fall back gracefully to the 5s TTL filter.

  **Client:**

  - `PresenceBar` renders sectioned: current-doc agents + humans | divider | cross-doc agents (dimmed). Cross-doc agents are now keyboard-accessible — the avatar itself is a button with an aria-label describing the target doc; clicking navigates.
  - `-space-x-1.5` (overlapping avatars) replaced with `gap-1.5` so 2+ agents render side-by-side cleanly (triage #1 fix).

- 9a26a27: chore: complete the Node.js 24 floor rollout — `@types/node` aligned to `^24.7.0` for the CLI.

  Follows #296 which raised `engines.node` from `>=22` to `>=24` on the CLI. This change finishes the rollout by bumping the CLI's `@types/node` dev type definitions so TypeScript sees the same Node 24 API surface the declared `engines.node` advertises. Companion desktop/root engine additions and the user-facing `Node.js >= 24` prerequisite in `docs/content/guides/getting-started.mdx` ship in the same PR but are private-package changes, so they do not emit their own changeset entries.

  CI already pins `node-version: "24"` across every workflow (`ci.yml`, `release.yml`, `nightly-e2e-stability.yml`, `desktop-build.yml`, `desktop-release.yml`, `bundle-size.yml`). The Bun-first development path (`bun install`, `bun run dev`, `bun run check`) is unchanged — `engines.node` only gates consumers who run the published CLI under Node directly.

- 1d58475: feat(cli): register `ok` as a short bin alias alongside `open-knowledge`. Both bins point to the same CLI entrypoint (`./dist/cli.mjs`); existing `open-knowledge` invocations are unchanged. Users installing globally (`bun i -g`, `npm i -g`, `pnpm add -g`) now have `ok init` / `ok start` / `ok mcp` available as the short form. One-shot runners (`bunx`, `npx`, `pnpm dlx`) continue to default to the package-name-matching `open-knowledge` bin — use `npx -p @inkeep/open-knowledge ok <cmd>` (or the bunx / pnpm equivalents) to select the short bin from an ephemeral install.

  README install-path matrix expanded to cover all three package managers (bun / npm / pnpm) for both global installs and dlx runners, and the lifecycle-commands table now shows long / short pairs.

  Decision rationale and peer precedent (Mastra + Speakeasy neither register a short alias because their product names are already short; open-knowledge at 14 chars justifies the alias) are captured in the companion research report at `reports/mastra-speakeasy-cli-install-recommendations/` and codified as `specs/2026-04-20-cli-distribution-and-install-ux/` D1.

- 267c8ba: feat(handoff): "Open in Agent Desktop" — one-click handoff from Open Knowledge to Claude Cowork / Claude Code / OpenAI Codex Desktop / Cursor.

  A new "Open in…" dropdown surfaces from three places — the editor header action strip, the `Cmd+K` command palette ("Open in agent" group), and the file-tree right-click menu — routing every click through a single `dispatchHandoff` entry point (AC9 asserts no other dispatch sites). Each enabled row fires the target's canonical URL scheme through the existing `shell.openExternal` IPC (Electron host) or an anchor-click (web host), with a minimal auto-composed prompt that points the target agent at the doc plus a hint to use the `open-knowledge` MCP for backlinks + related context. Disabled rows render with a keyboard-reachable submenu — install link + `Open in claude.ai →` secondary affordance on Claude rows — instead of a non-interactive tooltip.

  Built on four pure URL builders in the new `packages/core/src/handoff/` (`claude-url.ts`, `codex-url.ts`, `cursor-url.ts`, `web-fallback-url.ts`) with an encoding discipline pinned against Cursor's two-pass-decode behavior (`text=` double-encoded, `workspace=` single-encoded basename, `mode=agent` literal). The Cursor two-step dispatcher (`cursor-two-step.ts`, Electron only per E4 DIRECTED) spawns the workspace first through a dedicated `ok:shell:spawn-cursor` IPC — distinct from the URL-scheme allowlist because the threat model is a command allowlist — then fires the `cursor://` prompt after a 1000–1500 ms settle. On macOS the spawn routes through `/usr/bin/open -a <bundle>` because `app.getApplicationInfoForProtocol('cursor://')` returns the `.app` bundle (a directory), not an executable.

  Install detection is unified across hosts: Electron uses `app.getApplicationInfoForProtocol(scheme)` per probe (with an `xdg-mime query default x-scheme-handler/<name>` fallback on Linux); web uses a new `GET /api/installed-agents` endpoint with a per-scheme 60 s server-side cache, a 10 s per-client refresh throttle, and the standard `checkLocalOpSecurity` loopback + Host-header gate. Windows probes the merged `HKCR` view so machine-scope (HKLM) installers are detected alongside user-scope. Web-host Cursor is always disabled-with-tooltip regardless of probe result (E4 DIRECTED — local-use-case only; the `/api/handoff/open-folder` cross-machine primitive is deferred).

  Security: `packages/desktop/src/main/shell-allowlist.ts` (D47) extended with `claude:`, `codex:`, `cursor:` behind per-scheme JSDoc and an exact-set test. A drift-detector in `shell-allowlist.test.ts` reads `KNOWN_TARGETS` and fails if any future target lands without an allowlist row. Every outbound URL is built by a typed pure function — never from user-supplied raw URL strings.

  Observability: `~/.open-knowledge/stats.jsonl` append-only per dispatch (zero phone-home per XQ3 LOCKED). Success/failure sonner toasts close the DC3/DC4/vendor-drift silent-failure gap, with a bounded retry (2–3 attempts; distinct copy on the final failure) per review M5. Full spec with decision log + test plan at `specs/2026-04-21-open-in-agent-desktop/SPEC.md`; end-user guide at `docs/content/guides/open-in-agent-desktop.mdx`.

- cb8901b: feat(presence): use git-config name for the human presence avatar; dedupe tabs of the same checkout

  The presence bar now shows the user's actual name (from `git config user.name`) and a deterministic per-principal color, instead of a random `Adjective Animal` nickname. Multi-tab users see ONE avatar with a tooltip like `"Miles Kaming-Thanassi · 2 tabs"` instead of N copies. Users on a fresh box without git config keep the existing animal-fallback experience — no regression.

  Cursor labels and tooltips polish Unix-style names: `miles-kt-inkeep` floats `Miles Kt Inkeep` next to selections, matching the `MK` initials the avatar already shows.

  The data plumbing reuses an existing fetch — `DocumentContext` already calls `GET /api/principal` for the auth-token claim — and threads the resolved principal into a new optional `principalId?: string` field on `AwarenessUser`. `usePresence()` dedupes humans whose `principalId` matches; cursors stay per-clientId so N tabs editing still render N cursors in the editor.

  **API surface:**

  - New optional wire field `AwarenessUser.principalId` on per-doc awareness (loopback-only trust today; non-loopback connections must switch to server-authoritative attribution at `onAuthenticate`).
  - New public exports from `@inkeep/open-knowledge-core`: `Principal` (now an alias of the schema-inferred `PrincipalResponse`), `PrincipalResponseSchema`, `PrincipalResponse`, `computeInitials`, `formatPresenceLabel`, `HUMAN_COLORS`.
  - `colorFromSeed` now accepts an optional `palette` parameter; the default remains `AGENT_COLORS` so existing single-arg callers are byte-equivalent.
  - `HumanParticipant` from `@inkeep/open-knowledge-app` (internal) gains `tabCount: number`.
  - `localStorage` cache keys for the random-fallback identity move from `ok-user-{name,color}-v2` to `-v3`. No migration — pre-launch state.

  **Hardening:**

  - `GET /api/principal` now requires loopback + Host-header gates so PII (`display_name`, `display_email`) doesn't leak under `--host 0.0.0.0` deployments. Matches the gate `/api/metrics/agent-presence` and `/api/workspace` already enforce.
  - `PrincipalResponseSchema.display_name` and `display_email` use `.min(1)` so an empty git-config value routes through the silent random-identity fallback rather than rendering an empty initial / blank tooltip / blank cursor label.

- 48d4218: feat(shadow-repo): collapse dual-mode to single-mode at `<projectRoot>/.git/open-knowledge/`, auto-`git init` on first run when no parent repo exists, and rename legacy `.git/openknowledge/` shadows in place.

  The shadow repo (OK's attribution journal for WIP refs, upstream imports, checkpoints, and the rescue timeline) previously branched between `integrated` mode at `<root>/.git/openknowledge/` and `standalone` mode at `<root>/.openknowledge/`. Standalone mode had semantically distinct behavior — no parent `.git/HEAD` for the HEAD watcher, no real project branch for the `refs/wip/<branch>/<writer-id>` namespace, no upstream-import path — which forced every shadow-touching change through a two-mode test matrix for zero user-facing payoff. The dual-mode split is now gone: the shadow always lives at `<projectRoot>/.git/open-knowledge/`, projects without `.git/` get auto-`git init`'d by the new `ensureProjectGit` helper (fail-fast on missing git — no degraded fallback), and legacy `.git/openknowledge/` shadows are silently `renameSync`-migrated on first run so pre-spec users keep their attribution history.

  - `@inkeep/open-knowledge-core` — `resolveShadowDir(projectRoot: string): string` — return type collapses from `{ path, mode }` to a plain string; `ShadowRepoMode` and `ResolvedShadowDir` types are deleted. `OkDesktopBridge` gains `onGitInitNotice(cb)` alongside the existing `onProjectSwitched` / `onMenuAction` push-event surfaces.
  - `@inkeep/open-knowledge-server` — new `ensureProjectGit` + `ProjectGitInitError` exports (pre-listen fail-fast hook). `BootServerOptions` gains `ensureProjectGitFn`; `BootedServer` gains `didGitInit`. `initShadowRepo` carries a ~5-line R9 rename shim for legacy layouts. `skipAutoInit` now gates both `ensureProjectGitFn` and `autoInitFn`.
  - `@inkeep/open-knowledge` — `ok start` and `ok init` call `ensureProjectGit(cwd)` in the fresh-directory path; the CLI preview-block gate extends to `didAutoInit || didGitInit` and emits `Initialized git repo at <cwd>/.git/ (default branch: main)`. `ok mcp` is unchanged directly but inherits the side effect transitively when it auto-spawns `ok start` (opt out with `OK_MCP_AUTOSTART=0` or config `mcp.autoStart: false`). `.gitignore` auto-append of `.openknowledge/` is deleted; `.openknowledge` is removed from `enrichment.ts` / `mtime-scan.ts` scan-exclusion sets.
  - `@inkeep/open-knowledge-desktop` — utility process passes `ensureProjectGitFn` to `bootServer`; `UtilityReadyMessage` carries `didGitInit`. New `git-init-notice` push event on the preload bridge; main-side dispatch deferred until `webContents.once('dom-ready', ...)` to defeat the subscriber-mount race.
  - `@inkeep/open-knowledge-app` — renderer subscriber (`lib/install-git-init-toast.ts`, wired imperatively in `main.tsx`) routes `onGitInitNotice` to `toast.info(\`Initialized git repo at ${gitDir}\`)`. No-op outside Electron.

  Legacy `.openknowledge/` standalone-mode directories are silent orphans (no detection, no warning, no migration) — OK carries zero runtime reference to that path per D5/NG5. Worktree-specific semantics are out of scope for this change; they remain owned by a separate spec (NG6).

  Full spec + decision log (D1–D14, R1–R9): [`specs/2026-04-21-shadow-repo-single-mode/SPEC.md`](specs/2026-04-21-shadow-repo-single-mode/SPEC.md).

- 5444369: feat(skill, ingest): closed-loop grounding, broadened `ingest` trigger, log-discipline rule, and project-shape-neutral terminology.

  Three behavioral additions to the bundled `open-knowledge` Agent Skill and the `ingest` MCP tool, driven by a wiki author's diagnostic of two recurring lapses (citing web sources inline instead of ingesting them; not appending to the project log after KB-changing turns).

  - **Closed-loop grounding.** External sources don't get cited _out_ to the live web — they get pulled _in_ via `ingest`, then cited locally. A bare `[source](https://...)` URL inside a knowledge-base doc is now explicitly a TODO, not a finished citation. Self-fetched URLs (`WebFetch` / `WebSearch` from the agent itself) trigger `ingest` exactly like a user share does.
  - **Broadened `ingest` trigger.** Both the SKILL.md workflow-tools row and the MCP tool's discoverable `DESCRIPTION` now name agent-initiated fetches as a first-class trigger. Prior framing was user-share-only, which let agents downgrade to inline-URL citation when they did the fetch themselves.
  - **Log-discipline rule.** New SKILL.md section: after any turn that creates / edits / restructures KB content, check for a project `log.md` (project root or seed `rootDir`) and follow whatever its frontmatter `description:` and in-file comment say. The skill carries the **trigger**; the seeded file owns the **policy** (cadence, entry shape, categories) — so projects that don't run `ok seed` can opt out by simply not having a `log.md`. The seeded `LOG_MD_TEMPLATE` (`packages/server/src/seed/starter.ts`) now spells the contract out in its frontmatter description so it surfaces in every `exec("ls")` enrichment, and the example entry shape uses real markdown links (`[path](./path.md)`) instead of bare path strings — so log entries register in `get_backlinks` for the docs they reference and the audit trail compounds inside the doc graph.
  - **Project-shape-neutral terminology.** Open Knowledge knowledge bases serve multiple shapes — wiki, LLM brain, spec collection, research log, project notes. Replaced "wiki" with "knowledge base" / "KB doc" everywhere it had been used as a project-shape claim (skill grounding section, workflow-tools layer column, hub-candidates JSDoc). Kept the term where it's a legitimate technical reference (the `[[Page]]` "wiki-link" syntax, `ARCHITECTURE.md` competitive-landscape rows naming Notion/Confluence/Wiki.js).

  The change is additive on the install side: the skill `metadata.version` and `@inkeep/open-knowledge-server` package version both control the install gate (`~/.open-knowledge/skill-installed-version` sidecar), so this version bump triggers a fresh skill install in environments where 0.2.0 was previously cached.

- 1451548: feat(cli): require explicit project routing for MCP tool calls

  MCP tool calls now route by explicit `cwd` first, otherwise by the client's only advertised root, and fail clearly instead of guessing the startup project.

### Patch Changes

- 5fdd555: feat(desktop): M5 — `@napi-rs/keyring` end-to-end verification in packaged build.

  Adds the verification layer that proves `@napi-rs/keyring` loads and round-trips inside `utilityProcess.fork()` in the packaged Electron app. The PR #166 auth substrate itself is unchanged — this milestone ships infrastructure for observing the substrate from outside the app (driver script) and from inside the renderer (gated debug IPC), so R15 (utilityProcess compat) and R16 (`CFBundleDisplayName` prompt + bundle-ID stability + upsert semantics) become empirically verifiable.

  New surfaces:

  - `packages/desktop/src/utility/keyring-smoke.ts` — `runKeyringSmoke(deps?)` primitive. Namespace-scoped round-trip (`open-knowledge-smoke` / `test-user`) via `@napi-rs/keyring`; cleans up on success. Injectable `deps` parameter allows AC3 YAML-fallback unit coverage without touching the production substrate (SPEC §9 SCOPE lock). Returns `KeyringSmokeResult = { ok, backend, durationMs, timestamp, error? }`.
  - `packages/desktop/src/main/debug-ipc.ts` — renderer↔main↔utility relay. Correlation-ID `Map<id, {resolve,reject,timer}>` with 5 s default timeout; `clearTimeout` fires on both resolve and timeout paths so the Map stays bounded.
  - `packages/desktop/src/utility/server-entry.ts` — extends the IPC protocol with `{ kind: 'debug-request' }` dispatch. Also adds a boot-time auto-smoke mode gated on `OK_DEBUG_KEYRING_SMOKE=1`: writes `KeyringSmokeResult` JSON to `OK_DEBUG_KEYRING_SMOKE_OUT`, exits `0` post-write when `OK_DEBUG_KEYRING_SMOKE_EXIT=1`. This is the only creds-free path that exercises the hardened-runtime + fuses + signed-binary loader on packaged builds.
  - `packages/desktop/src/shared/{ipc-channels.ts,bridge-contract.ts}` + `packages/core/src/desktop-bridge.ts` + `packages/app/src/lib/desktop-bridge-types.ts` — add the `ok:debug:keyring-smoke` channel and the optional `debug?: { keyringSmoke(): Promise<KeyringSmokeResult> }` bridge namespace. The namespace is gated at preload time: `!app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1'`. In normal packaged runs, `window.okDesktop.debug` is `undefined` and typos surface at TypeScript compile time, not runtime.
  - `scripts/verify-keyring-in-packaged-dmg.mjs` — driver for creds-free pre-flight. Accepts an `.app` or `.dmg`, launches the packaged app with the `OK_DEBUG_KEYRING_SMOKE*` env triplet, parses the result JSON, exits `0` on ok / `1` on smoke failure / `2` on 30 s boot timeout / `3` on pre-smoke crash.
  - `packages/cli/src/auth/token-store.test.ts` — extended with upsert-semantics characterization tests + YAML-fallback mocking strategy. The production `token-store.ts` substrate is **unchanged** per SPEC §9 SCOPE lock; the new tests document and guard the substrate's already-correct behavior.
  - `packages/desktop/tests/smoke/keyring-e2e.md` — 11-step creds-gated manual runbook covering AC4 (CFBundleDisplayName prompt), AC5 (relaunch persistence), AC6 (v0.1.0→v0.1.1 upgrade persistence), AC7 (`log show` caller-attribution). Executable once Apple Developer credentials are on the test machine.

  Web and CLI distributions are unaffected — the debug namespace and env-var auto-smoke only fire in the Electron utility process, and the token-store test changes don't touch runtime behavior.

  Creds-free ACs (AC1–AC3, AC8–AC10) land green in this changeset. Creds-gated ACs (AC4–AC7) execute manually via the runbook and will attach screenshots + `log show` output to a follow-up status update once Apple credentials are available on the test machine (same external dependency that gates M2's end-state DOD).

  Full spec: `specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md`; design decisions (D-M5-1 through D-M5-8): `specs/2026-04-21-m5-keyring-packaged-e2e/meta/investigation-findings.md`; parent milestone plan: `specs/2026-04-11-electron-desktop-app/SPEC.md` §14.

- 5cc3e75: fix(cli): `ok start` banner URL now tracks the port `ok ui` actually bound.

  Post-D-033 the auto-spawned `ok ui` defaults to port 0 (kernel-allocated), but the banner had hardcoded `http://localhost:3000` on the spawn branch. Users running `bun run packages/cli/dist/cli.mjs start` saw the banner URL, got connection-refused, and no documents loaded.

  `bootStartServer` now polls `ui.lock` after spawn and exposes `resolvedUiPort` on `BootedStartServer`; the banner uses that, falling back to the API URL on timeout. `bun run dev` is unaffected (Vite serves everything same-origin on one port).

- fe2ed47: chore(licensing): ship `THIRD_PARTY_NOTICES.md` in npm tarball + Electron `.app`

  Adds a reproducible attribution pipeline for the published `@inkeep/open-knowledge` CLI tarball and the `@inkeep/open-knowledge-desktop` Electron app. Both bundle source from MIT/ISC/BSD/Apache-2.0 deps and OFL-1.1 fonts; the new `THIRD_PARTY_NOTICES.md` at repo root is the committed source-of-truth and ships under each artifact:

  - npm CLI tarball — copied to `packages/cli/dist/THIRD_PARTY_NOTICES.md` via the existing `build:assets` step (already covered by `files: ["dist", …]`).
  - Electron desktop — `electron-builder.yml` `extraResources` places it at `Open Knowledge.app/Contents/Resources/THIRD_PARTY_NOTICES.md` (alongside electron-builder's auto-generated `LICENSE` + `LICENSES.chromium.html`).

  The closure walker (`scripts/generate-third-party-notices.mjs`) is deterministic (byte-stable sort, no timestamps) and the committed file is drift-checked against the resolved dep tree by `bun run check`, `bun run check:full:parallel`, and the `lint` job in `.github/workflows/ci.yml`.

- 17d5a91: Handle final chunks from github stream buffer and bypass simple git auth check.

## 0.2.0

### Minor Changes

- 7fb215b: feat(bridge): correctness guardrail, silent recovery UX, and settlement-based propagation for the dual-CRDT observer bridge (Y.XmlFragment ↔ Y.Text).

  **Paired-write symmetry (Bucket 0).** Adds a typed `context.paired: true` marker to the four origins that atomically write both CRDTs inside one `doc.transact()` block — `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`. Server Observer A and Server Observer B now short-circuit symmetrically on paired-write drains via a semantic predicate (`context.paired === true`), closing the prior Observer-B asymmetry that could re-propagate RGA-level corruption under concurrent typing. `MANAGED_RENAME_ORIGIN` is now exported and included in `BRIDGE_ENFORCING_ORIGINS`.

  **Loud-on-content-loss merge (Bucket A).** `mergeThreeWay` now asserts a maximal-unique-line-substring post-condition with a weak order-preservation side-check (`assertContentPreservation`). Violations throw `BridgeMergeContentLossError` in tests so regressions surface; production swallows the error, emits a structured `bridge-merge-content-loss` JSON log, and queues a silent named checkpoint via the new `saveInMemoryCheckpoint` shadow-repo primitive so the editor keeps responding. Users can recover the pre-merge state via the existing TimelinePanel — no toast, no banner. The algorithm's academic-proven limits (Khanna-Kunal-Pierce 2007) are turned into observable, recoverable events rather than silent byte loss.

  **TimelinePanel kind-aware rendering.** Checkpoint rows render with distinct icon + label per kind: `Save Version` (diamond, existing), `bridge-merge-loss` (amber alert-triangle, "Before concurrent merge @ …"), `external-change-rescue` (sky file-archive, "External change recovered @ …"). Pure helpers `checkpointVariant` + `checkpointHeadlineLabel` are exported for tests.

  **Rescue-buffer consolidation.** Reconcile-delete and branch-switch rescue paths now write `external-change-rescue` checkpoints to `refs/checkpoints/<branch>/*` via `saveInMemoryCheckpoint`. `/api/rescue` + `/api/rescue/:docName` merge flat-file (shutdown-flush, retained) and timeline-ref (new) sources — response rows carry a `source: 'flat' | 'timeline'` discriminator.

  **Settlement-based observer dispatch (Bucket B).** Server Observer A + Observer B now run from `doc.on('afterAllTransactions', ...)` — one fire per outermost `doc.transact()` drain, Observer A before Observer B so any Y.Text write from A is visible to B. The 50 ms wall-clock debounce is gone. Client observer debounce machinery is deleted (per precedent #14, the client is baseline-only). A new grep gate (`packages/server/src/bridge-no-wallclock.test.ts`) fails CI if wall-clock `setTimeout` reappears in either bridge-observer file.

  **Telemetry.** New `bridgeMergeContentLoss` and `bridgeMergeCheckpointCreated` counters exposed via the existing `GET /api/metrics/reconciliation` endpoint. Structured log events (`bridge-merge-content-loss`, `bridge-merge-checkpoint-created`) follow the existing JSON-log convention.

  **Elevated fuzz coverage.** `bridge-convergence.fuzz.test.ts` now runs 200 seeds per PR (`STRESS_FUZZ_PR=1`, wired in `ci.yml`), 10 000 seeds nightly (`STRESS_FUZZ_NIGHTLY=1`, wired in `nightly.yml`), and logs the resolved seed count at startup for CI visibility. Default local runs remain 25 seeds to keep the dev loop fast.<br>_[Corrected 2026-04-19 post-ship: automated fuzz tier removed from CI and nightly per `specs/2026-04-19-ci-signal-quality/SPEC.md` (FR-2 / D-Q1 LOCKED). `STRESS_FUZZ_PR` and `STRESS_FUZZ_NIGHTLY` env wirings deleted from both workflows; the fuzz test file is preserved and invoked ad-hoc via `bun run measure:fuzz`.]_

  **Fuzz structural quiescence.** Tests now use `awaitDocQuiescence(doc)` instead of `wait(ms)` around `pauseSync`/`resumeSync` — race reproduction is event-ordered, not wall-clock.

  Precedents #1, #11(b), and #13(b) in `AGENTS.md` are updated to reflect the shipped behavior.

## 0.1.1

### Patch Changes

- ee1fc3a: Bundle and minify the published CLI. `tsdown` now produces two minified bundles (`dist/cli.mjs` for the `bin`, `dist/index.mjs` for the `exports` field) with third-party deps inlined, replacing the previous 148-file unbundled output. Native addon deps (`@parcel/watcher`, `chokidar`, `simple-git`) stay external so their `.node` binaries resolve at runtime. Tarball drops from 2.1 MB → 1.6 MB packaged and 660 → 40 files.

## 0.1.0

### Minor Changes

- dc84735: feat: CLI colorized output, boxed banner, and NO_COLOR support

  - Add colorized CLI output via picocolors with semantic color helpers (error, warning, success, info, dim, accent)
  - Render Vite-style boxed startup banner using cli-boxes
  - Full NO_COLOR standard compliance: NO_COLOR env var, FORCE_COLOR env var, --no-color/--color CLI flags
  - Clickable URLs in startup banner via OSC 8 hyperlinks (iTerm2, modern terminals)
  - MCP stdout isolation preserved — diagnostics stay on stderr

- 748f63e: Unify wiki → content config, mirrored catalogs

  - **Config**: `wiki` section replaced by `content` with `dir`, `include`, `exclude`
    - `content.dir` defaults to `.` (project root)
    - `content.include`/`exclude` are glob patterns for tracked content files
  - **MCP tool**: `init-wiki` renamed to `init-content`
  - **Mirrored catalogs**: INDEX.md catalogs generated inside `.open-knowledge/catalogs/` instead of in-place next to source files

  Unify wiki → content config, mirrored catalogs

  - **Config**: `wiki` section replaced by `content` with `dir`, `include`, `exclude`
    - `content.dir` defaults to `.` (project root)
    - `content.include`/`exclude` are glob patterns for tracked content files
  - **MCP tool**: `init-wiki` renamed to `init-content`
  - **Mirrored catalogs**: INDEX.md catalogs generated inside `.open-knowledge/catalogs/` instead of in-place next to source files

- 1f72b85: feat: exclude git-ignored files from document system

  The file watcher now maintains a filtered in-memory file index, replacing the slow `readdirSync` in the documents API. Filtering uses a unified `ContentFilter` that combines `.gitignore` rules with `config.content.exclude` patterns. The `content.include` and `content.exclude` config fields are now wired end-to-end. Response time for `GET /api/documents` dropped from ~35s to ~2-5ms.

- 6517724: Finish the fullscreen graph surfaces by adding `Orphans` and `Hubs` views inside `GraphPanel`, with a visible orphan-mode toggle for `No Incoming`, `No Outgoing`, and `Both`.

  The `get_orphans` MCP tool and the backing server API now share the same three-mode orphan contract, so agents can query disconnected pages by graph lens instead of only the default fully-disconnected view.

- ce09519: feat: add `get_history` and `save_version` MCP tools, fix IPv6 MCP connectivity

  - Add `get_history` MCP tool wrapping GET /api/history for querying document version history with filtering and pagination
  - Add `save_version` MCP tool wrapping POST /api/save-version for creating checkpoint commits
  - Update `rollback_to_version` description to reference `get_history` instead of raw API endpoint
  - Fix MCP server discovery using `localhost` instead of `127.0.0.1` to support IPv6-only server bindings

- 20dfb13: Image upload + asset resolution: sibling-co-located storage, filter reinterpretation, shortest-path hybrid references, SVG support.

  - **Storage**: Uploaded images land as siblings of the editing `.md` file (not a flat `uploads/` dir). Multiple `.md` files can reference the same image via relative paths.
  - **Config**: `content.uploadsDir` removed. `content.include`/`content.exclude` schema unchanged — interpretation extended so allowlisted asset extensions (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`) in directories containing ≥1 included `.md` file are auto-included. `exclude`/gitignore continues to supersede.
  - **Serving**: Filter-aware `sirv` middleware over `contentDir` (both dev plugin and standalone CLI). Filter-excluded paths return 404. `X-Content-Type-Options: nosniff` preserved.
  - **References**: Editor inserts bare filename for sibling uploads (`![](screenshot.png)`). New `shortestImageRef(assetPath, mdPath)` helper returns bare filename when co-located, else root-relative-with-leading-slash.
  - **SVG**: Now accepted at upload — consistent with the storage-fidelity precedent. Rendered via `<img src>` only; inline `<svg>` embedding remains unsupported in the editor.
  - **Security**: Upload endpoint requires `parentDocName` form field, normalizes it (rejects absolute paths, `..` segments, NUL), verifies destination is `isWithinContentDir`, and checks `realpathSync` on the destination directory to defeat symlink escape. Existing magic-bytes MIME check, 10 MB cap, atomic `openSync('wx')` write, and numeric-suffix collision retry preserved.
  - **Paste naming**: Clipboard pastes without a meaningful filename synthesize `pasted-YYYYMMDD-HHMMSS.<ext>`.
  - **Supersedes**: #41 (Sarah's original PR — every preserved contribution kept; three load-bearing decisions reworked per the spec).

- 35803ea: `open-knowledge init` now appends a load-bearing "Open Knowledge" section to root `CLAUDE.md` and `AGENTS.md` (idempotent via `<!-- open-knowledge:begin -->` markers; dedups symlinked files via `realpath`). The appended section nudges agents toward `exec`, `write_document`/`edit_document`, and `[[wiki-links]]`. Use `--force` to overwrite the block in place.

  The `exec` MCP tool now auto-scopes recursive `grep -r` / `find` invocations with `--exclude-dir=` / `-not -path` for known non-wiki directories (`node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`, `.nuxt`, `coverage`, `.cache`, `.parcel-cache`, `.vercel`, `.open-knowledge`). Observed speedup on a real repo: ~210× (56.6s → 0.27s). User-provided `--exclude-dir` / `-not` / `-prune` disables injection for that stage.

- f5e19dd: feat(mcp): add managed document rename with backlink rewrite

  Add the `rename_document` MCP tool and the backing managed rename server flow so page renames update inbound wiki-links plus supported internal inline Markdown links instead of leaving stale references behind.

  Managed rename now uses a persisted recovery journal for crash-safe rollback, updates already-loaded documents through the live Y.Doc path, and keeps sidebar file rename on the graph-safe endpoint while folder rename stays on the lower-level path rename flow.

- d4c2b06: feat: `open-knowledge init` now configures MCP for multiple editors

  - Interactive multi-select prompt asks which tools you use (Claude Code, Cursor, VS Code, Windsurf)
  - Writes each editor's MCP config to its expected location and format
  - `--editor` flag for non-interactive use (e.g. `--editor cursor,vscode` or `--editor all`)
  - Falls back to Claude Code only when stdin is not a TTY

- 51c48d8: Add semantic color bloom to the graph visualization. The `/api/link-graph` endpoint now returns frontmatter metadata (`cluster`, `category`, `tags`) on doc nodes. Graph nodes are colored by cluster using a deterministic 16-color palette, with rich HTML tooltips showing metadata on hover and a cluster legend in fullscreen Explore mode.
- 81e2503: feat: add suggest_links discovery and precision patch targeting

  - add a `suggest_links` MCP tool and `/api/suggest-links` endpoint for deterministic missing-link discovery
  - add title-aware and alias-aware mixed live-or-disk scanning that skips already-linked and non-prose regions
  - add optional offset-aware `edit_document` patch targeting so follow-up edits can address an exact mention

- 29fc273: feat: symlink-safe file sync

  Symlinks inside the content directory are now fully supported. The file watcher indexes documents by canonical path (`realpath`), deduplicating aliases that point to the same file into a single Y.Doc. Persistence writes target the canonical path so atomic rename never breaks symlink chains. Symlinks that escape the content directory are refused, cyclic symlinks are rejected, and broken symlinks fall back to direct writes. The `/api/documents` endpoint surfaces alias metadata (`isSymlink`, `canonicalDocName`, `targetPath`), and the file sidebar renders a Link2 badge with a hover tooltip for symlinked entries.

- e5bfff4: feat: `open-knowledge init` command and MCP workflow tools

  - Add `open-knowledge init` CLI subcommand to scaffold `.open-knowledge/` and register the MCP server in `.mcp.json`
  - Add three MCP workflow tools: `init-wiki`, `ingest`, and `research` with structured skill-style descriptions (Use when / Triggers on)
  - MCP server auto-generates INDEX.md catalogs via file watcher on `.open-knowledge/`

- d901f56: feat: Zero-Ceremony Resume — dual-process lifecycle + MCP auto-spawn

  Behavior changes operators should know about:

  - **`ok mcp` auto-spawns `ok start` by default.** When `ok mcp` starts with no
    live `server.lock`, it detach-spawns the current `@inkeep/open-knowledge`
    binary with `start` as a sibling process (re-exec via `process.execPath` —
    not `npx`, so the sibling is pinned to the same version the MCP client is
    running). Opt out via the `OK_MCP_AUTOSTART=0` env var or
    `mcp.autoStart: false` config. A pre-existing live lock is always connected
    regardless of the opt-out (opt-out only suppresses the spawn path).
  - **`server.port` default changed from `3000` to `0`.** `ok start` now asks
    the kernel for a free port by default; the resolved port is written to
    `server.lock` for MCP discovery. To keep the old behavior, set
    `server.port: 3000` in `.open-knowledge/config.yml` or pass `--port 3000`.
  - **New `ok ui` command.** The React editor now runs in its own sibling
    process (default port 3000; respects `PORT` env / `--port`). `ok start`
    auto-spawns it when `ui.lock` is absent. A `GET /api/config` endpoint on
    `ok ui` bootstraps the React app's HocuspocusProvider with the live
    collab URL read from `server.lock`.
  - **New utility commands:** `ok status`, `ok stop`, `ok clean`.
  - **`ok init` defaults changed.** Non-TTY invocations now write MCP config
    for every detected editor (Claude, Cursor, VS Code, Windsurf) — previously
    only Claude. TTY pre-selects all detected editors. `--editor <all|claude|...>`
    preserved.
  - **`.claude/launch.json` scaffolding updated.** Entry now launches
    `@inkeep/open-knowledge ui` (not `start`) with `autoPort: true`. Existing
    entries from earlier versions are detected as stale and flagged with a
    WARN pointing at `ok init --force`.

  See `docs/content/internals/lifecycle.mdx` and `docs/content/guides/mcp-integration.mdx`
  for the full lifecycle reference.

- fe89406: Zero-config bunx packaging: chokidar as default file watcher with @parcel/watcher as optional native accelerator, React app assets bundled into dist/public/, auto-init on first start

### Patch Changes

- 3eb50c2: fix(bridge): close Bug-A (server-side `syncTextToFragment` destroying concurrent client XmlFragment) and Bug-B (client Observer A's remote-tx baseline refresh absorbing local changes). Server-side agent writes now follow the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` replaces `syncTextToFragment`). Client Observer A uses conditional baseline refresh when a local debounce is pending. Extracts `applyByPrefixSuffix` to `@inkeep/open-knowledge-core` for shared use. Hardens the bridge-testing harness (FR-11 invariant watcher, FR-12 origin probe, FR-15 Scheduler DI with clock unification, FR-16 network control, FR-17 multi-client convergence fuzzer with char-granular content oracle).
- 25357e1: Exclude `dist/**/*.map` from the published npm tarball. Source maps ship full TypeScript source via `sourcesContent`; dropping them from the tarball keeps maps available locally for debugging while the published package is ~46% smaller (3.9 MB → 2.1 MB, 1284 → 660 files).
- 12b6157: ci: Playwright E2E suite is now deterministic and debuggable on failure

  - **Event-coupled waits.** Removed all 73 `page.waitForTimeout(N)` magic
    sleeps and the 1 `waitUntil: 'networkidle'` from the E2E suite. Every
    wait now couples to a real signal (CRDT propagation, menu render,
    selection flush, debounce). CI contention no longer causes spurious
    failures from "200ms should be enough" gone wrong.
  - **Failure observability.** On CI, every test failure now uploads the
    Playwright HTML report + `test-results/` (trace, video, screenshot)
    with 14-day retention. Configure: `retries: 2`, `failOnFlakyTests:
true` (retry-success still fails the PR), `trace: 'on-first-retry'`,
    `video: 'retain-on-failure'` at 1280×720, `screenshot: 'only-on-
failure'`. Developers can `bunx playwright show-trace` on the
    downloaded artifact instead of re-running locally to reproduce.
  - **Named flake fixes.** Resolved 4 named flakes from main CI:
    sidebar-folder (under user investigation), QA-022 chunked-paste perf
    (now baseline-relative — `max(2 × p50Baseline, 32ms)` reading from
    `perf-baseline.json`), crdt-stress S6 (root cause: `/api/config`
    404 was logged as critical-error by an over-strict filter),
    docs-open F11 (root cause: `Promise.all` of clicks didn't preserve
    array order — sequential awaits restore determinism).
  - **PR #188 absorbed fixes.** Cherry-picked from Andrew's PR #188:
    Branch C wikiLink parseHTML priority-100, `wrapAsInlineCode` mark
    handler with 9 unit tests, FR-19 `<pre>` regex tightening
    (`/<pre[\s>]/`), FR-15 Source empty-selection preventDefault.
  - **DEV-gating.** `window.__agentFlashState` writes wrapped in
    `if (import.meta.env.DEV)` so production bundles tree-shake the test
    hook. STOP rule prevents future ungated `window.__*` assignments
    outside the documented allowlist.
  - **STOP rule enforcement.** New mechanical test
    (`tests/integration/e2e-stop-rules.test.ts`) fails CI on any
    reappearance of `page.waitForTimeout`, `waitUntil: 'networkidle'`,
    busy-wait `Promise+setTimeout`, `page.pause`, webkit-skip ratchet,
    inner-helper-import (must use barrel), or ungated `window.__` write.
    Zero allowlist; per-pattern failure messages list `file:line`.
  - **Architectural precedent #20** added to `AGENTS.md` documenting the
    E2E test-infra conventions for future contributors.

  User-facing impact: faster CI feedback on real regressions, no more
  "flake or real?" guessing, debuggable failures from CI artifacts alone.

- ffac734: fix: file sidebar reveals the active file on navigation

  When the active document changes from any entry point (graph click, direct URL, wikilink, rename, browser back/forward), the file sidebar now expands ancestor folders and scrolls the active row into view. Expansion is recomputed per render as `(ancestors ∪ userExpanded) \ userCollapsed`, so a user's manual collapse of the active file's folder sticks until they navigate elsewhere. Adds `aria-current="page"` on the active row and roving tabindex for keyboard access; no focus steal.

- 02c2211: Improve editor hitbox focus by making TiptapEditor and SourceEditor fill the full height of their containers, so clicking anywhere in the editor area activates focus.
- e8f4dd8: Markdown pipeline engineering health — 21 P0 requirements landing across perf measurement, code refactors, fidelity fixes, test tightening, and CI infrastructure.

  **Perf measurement:** seeded synthetic benchmark corpus + committed harness with pinned methodology (10 warm-ups, `Bun.gc(true)`, `bun@1.3.11`); re-measured baseline at 7 block counts; per-stage profile harness + published findings; calibrated perf regression gate (`max(2× p99 variance, 10% floor)`) + parse-health gate (`parseFallback.wholeDoc === 0`) in tier-2 CI.

  **Code refactors:** R23 guard `O(n·m) → O(n log n)` via pre-indexed tag-offset map + binary search (568.88ms → 4.76ms on pathological corpus); processor caching at `MarkdownManager` construction + idempotency refactor for both `remarkMdxAgnostic` and `remarkWikiLink` attachers; 2-phase merged post-parse walker (Phase A restoration + Phase B merged dispatcher) gated by one-time byte-for-byte mdast diff validator on 714 fixtures; structural PM↔mdast fix — `hydrateMarks` outside-in greedy (library patch), `Code` mark `excludes: '_'` widened via `CodeMarkFidelity` (schema widening per precedent #9), context-aware backslash-before-entity policy.

  **Fidelity:** all 6 CommonMark serialization bugs fixed. CommonMark corpus 652/652 idempotent; `KNOWN_CRASH_CEILING` lowered from 50 to 0; all 19 formerly-NORMALIZE sections promoted to byte-identity idempotence assertion.

  **Test tightening:** NG1 + NG11 byte-identity pinning; I3's `markdownDoc` arbitrary parametric blank-line joiner; 6 new PBT invariants (emphasis-cumulation, backslash-idempotence, list-nesting, html-block-edge, link-edge, image-edge) green at 1K samples; `parseWithFallback` perf bound (≤5× happy-path) + parametric `MAX_SPLIT_DEPTH` boundary test.

  **Infrastructure:** all markdown fixtures consolidated into `packages/core/src/markdown/fixtures/{commonmark,gfm,mdx,wiki-links,frontmatter,ng-pinned,perf}/` with typed loader helpers; all 7 stale `@tiptap/markdown` references removed; three CI tiers (`ci.yml` / `nightly.yml` / `weekly.yml`) calibrated against measured baselines.

- 95259a3: feat: indicate when an editor doc does not yet exist on disk

  - EditorHeader shows a "New file" badge next to the filename when navigating to a non-existent document; disappears after the file is created
  - WYSIWYG mode shows contextual placeholder text: "Start writing to create this page…" for new docs, "Start writing…" for empty existing docs
  - Source (Markdown) mode shows the same contextual placeholder text via a CodeMirror Compartment

- 107e2ef: fix(observers): preserve CRDT Item identity through Observer A bridge cycles

  Observer A (Y.XmlFragment → Y.Text) now preserves CRDT Items whose content at their position already matches what the sync would write, fixing **origin-laundering** that broke `Y.UndoManager({ trackedOrigins })` consumers — Items written under `'agent-write'` origin no longer get replaced by Items under `'sync-from-tree'` origin.

  Two-path implementation:

  - **Path A** (Y.Text in sync with baseline): `applyIncrementalDiff` adds a content-comparison gate before each adjacent REMOVED+ADDED hunk; if Y.Text already has the added value at that offset, both `delete` and `insert` are skipped — preserving CRDT Item identity for any unchanged region.
  - **Path B** (Y.Text diverged from baseline): `applyUserDelta` is rewritten to use DMP `patch_make` + `patch_apply` (canonical three-way merge) so same-line concurrent edits (user WYSIWYG + agent API write) merge correctly, preserving Item-equal prefix/suffix regions via `applyByPrefixSuffix`.
  - New optional `ObserverDeps.onMergeFailed` callback + `console.warn` diagnostic when DMP `patch_apply` reports failed patches.

  Server-side cleanup: removed the two dead `Y.Map('conflicts')` write stanzas in `standalone.ts` (zero consumers; reconciliation logic, `incrementConflict()`, and the `{ kind: 'conflicts' }` return type all preserved).

  Adds `AGENTS.md` precedent #9 documenting the three unclaimed bridge-quality patterns and introduces a third invariant (Item-preservation) to the CRDT Bridge Architecture section.

  Internal change — no public API surface changes.

- Initial publish
- 12ee3d6: Add a dead-link audit surface to the server API and expose it through the MCP tool surface.
- 94b8a19: fix: eliminate silent data loss on graceful shutdown

  `createServer().destroy()` had two compounding bugs that could silently drop up to 10 seconds of user typing on every Ctrl+C / SIGTERM:

  1. `hocuspocus.flushPendingStores()` is fire-and-forget (`void` return) — awaiting it awaited nothing
  2. The L2 git-commit flush ran before L1 markdown drain, so it drained an empty queue

  The fix adds a `flushAllStoresAndWait()` helper that installs a one-shot `afterUnloadDocument` extension hook (the same pattern `@hocuspocus/server`'s own `Server.destroy()` uses internally), reorders destroy phases correctly (watchers → sessions → L1 drain → L2 git → shadow repo release), and adds a cached-Promise idempotency guard so concurrent shutdown signals (e.g., SIGINT + SIGTERM) share a single teardown. A configurable `destroyTimeoutMs` (default 10s) bounds the flush to prevent hangs from misbehaving `onStoreDocument` hooks. Structured shutdown logs are emitted on every exit. If the L1 flush hits its timeout ceiling, each still-loaded document's in-memory Y.Doc is dumped to `<shadow-gitDir>/rescue/<docName>.md` (best-effort per document) so the user can recover edits via the existing `GET /api/rescue` and `GET /api/rescue/:docName` endpoints, even when `onStoreDocument` itself is hung.
