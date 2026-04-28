# @inkeep/open-knowledge-desktop

## 0.3.0

### Minor Changes

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

- 267c8ba: feat(handoff): "Open in Agent Desktop" — one-click handoff from Open Knowledge to Claude Cowork / Claude Code / OpenAI Codex Desktop / Cursor.

  A new "Open in…" dropdown surfaces from three places — the editor header action strip, the `Cmd+K` command palette ("Open in agent" group), and the file-tree right-click menu — routing every click through a single `dispatchHandoff` entry point (AC9 asserts no other dispatch sites). Each enabled row fires the target's canonical URL scheme through the existing `shell.openExternal` IPC (Electron host) or an anchor-click (web host), with a minimal auto-composed prompt that points the target agent at the doc plus a hint to use the `open-knowledge` MCP for backlinks + related context. Disabled rows render with a keyboard-reachable submenu — install link + `Open in claude.ai →` secondary affordance on Claude rows — instead of a non-interactive tooltip.

  Built on four pure URL builders in the new `packages/core/src/handoff/` (`claude-url.ts`, `codex-url.ts`, `cursor-url.ts`, `web-fallback-url.ts`) with an encoding discipline pinned against Cursor's two-pass-decode behavior (`text=` double-encoded, `workspace=` single-encoded basename, `mode=agent` literal). The Cursor two-step dispatcher (`cursor-two-step.ts`, Electron only per E4 DIRECTED) spawns the workspace first through a dedicated `ok:shell:spawn-cursor` IPC — distinct from the URL-scheme allowlist because the threat model is a command allowlist — then fires the `cursor://` prompt after a 1000–1500 ms settle. On macOS the spawn routes through `/usr/bin/open -a <bundle>` because `app.getApplicationInfoForProtocol('cursor://')` returns the `.app` bundle (a directory), not an executable.

  Install detection is unified across hosts: Electron uses `app.getApplicationInfoForProtocol(scheme)` per probe (with an `xdg-mime query default x-scheme-handler/<name>` fallback on Linux); web uses a new `GET /api/installed-agents` endpoint with a per-scheme 60 s server-side cache, a 10 s per-client refresh throttle, and the standard `checkLocalOpSecurity` loopback + Host-header gate. Windows probes the merged `HKCR` view so machine-scope (HKLM) installers are detected alongside user-scope. Web-host Cursor is always disabled-with-tooltip regardless of probe result (E4 DIRECTED — local-use-case only; the `/api/handoff/open-folder` cross-machine primitive is deferred).

  Security: `packages/desktop/src/main/shell-allowlist.ts` (D47) extended with `claude:`, `codex:`, `cursor:` behind per-scheme JSDoc and an exact-set test. A drift-detector in `shell-allowlist.test.ts` reads `KNOWN_TARGETS` and fails if any future target lands without an allowlist row. Every outbound URL is built by a typed pure function — never from user-supplied raw URL strings.

  Observability: `~/.open-knowledge/stats.jsonl` append-only per dispatch (zero phone-home per XQ3 LOCKED). Success/failure sonner toasts close the DC3/DC4/vendor-drift silent-failure gap, with a bounded retry (2–3 attempts; distinct copy on the final failure) per review M5. Full spec with decision log + test plan at `specs/2026-04-21-open-in-agent-desktop/SPEC.md`; end-user guide at `docs/content/guides/open-in-agent-desktop.mdx`.

- 6839071: feat(desktop): file-tree right-click → "Reveal in Finder" / "Reveal in File Explorer" / "Open Containing Folder".

  A new entry on the file-tree row context menu (Electron host only) reveals the right-clicked file or folder in the OS file manager. Label adapts per platform — "Reveal in Finder" on macOS, "Reveal in File Explorer" on Windows, "Open Containing Folder" on Linux (matching VS Code's copy; the Linux verb asymmetry is intentional because no single Linux file manager has a stable brand to "Reveal in"). Hidden on the web variant where it would have no useful no-op.

  Wired through a new `ok:shell:show-item-in-folder` IPC channel that wraps Electron's `shell.showItemInFolder`. Path validation reuses the same `validateSpawnPath` + `isPathWithinProject` lexical guard the Cursor handoff already enforces — out-of-project, non-absolute, or null-byte-bearing paths are silently refused at the wire, with a main-process `console.warn` capturing the refusal reason (`invalid-format` / `no-project-bound` / `out-of-project`) for debugging. Disabled-with-hint when the renderer hasn't yet resolved the workspace metadata, mirroring the `Open in Agent` submenu's pattern.

- 48d4218: feat(shadow-repo): collapse dual-mode to single-mode at `<projectRoot>/.git/open-knowledge/`, auto-`git init` on first run when no parent repo exists, and rename legacy `.git/openknowledge/` shadows in place.

  The shadow repo (OK's attribution journal for WIP refs, upstream imports, checkpoints, and the rescue timeline) previously branched between `integrated` mode at `<root>/.git/openknowledge/` and `standalone` mode at `<root>/.openknowledge/`. Standalone mode had semantically distinct behavior — no parent `.git/HEAD` for the HEAD watcher, no real project branch for the `refs/wip/<branch>/<writer-id>` namespace, no upstream-import path — which forced every shadow-touching change through a two-mode test matrix for zero user-facing payoff. The dual-mode split is now gone: the shadow always lives at `<projectRoot>/.git/open-knowledge/`, projects without `.git/` get auto-`git init`'d by the new `ensureProjectGit` helper (fail-fast on missing git — no degraded fallback), and legacy `.git/openknowledge/` shadows are silently `renameSync`-migrated on first run so pre-spec users keep their attribution history.

  - `@inkeep/open-knowledge-core` — `resolveShadowDir(projectRoot: string): string` — return type collapses from `{ path, mode }` to a plain string; `ShadowRepoMode` and `ResolvedShadowDir` types are deleted. `OkDesktopBridge` gains `onGitInitNotice(cb)` alongside the existing `onProjectSwitched` / `onMenuAction` push-event surfaces.
  - `@inkeep/open-knowledge-server` — new `ensureProjectGit` + `ProjectGitInitError` exports (pre-listen fail-fast hook). `BootServerOptions` gains `ensureProjectGitFn`; `BootedServer` gains `didGitInit`. `initShadowRepo` carries a ~5-line R9 rename shim for legacy layouts. `skipAutoInit` now gates both `ensureProjectGitFn` and `autoInitFn`.
  - `@inkeep/open-knowledge` — `ok start` and `ok init` call `ensureProjectGit(cwd)` in the fresh-directory path; the CLI preview-block gate extends to `didAutoInit || didGitInit` and emits `Initialized git repo at <cwd>/.git/ (default branch: main)`. `ok mcp` is unchanged directly but inherits the side effect transitively when it auto-spawns `ok start` (opt out with `OK_MCP_AUTOSTART=0` or config `mcp.autoStart: false`). `.gitignore` auto-append of `.openknowledge/` is deleted; `.openknowledge` is removed from `enrichment.ts` / `mtime-scan.ts` scan-exclusion sets.
  - `@inkeep/open-knowledge-desktop` — utility process passes `ensureProjectGitFn` to `bootServer`; `UtilityReadyMessage` carries `didGitInit`. New `git-init-notice` push event on the preload bridge; main-side dispatch deferred until `webContents.once('dom-ready', ...)` to defeat the subscriber-mount race.
  - `@inkeep/open-knowledge-app` — renderer subscriber (`lib/install-git-init-toast.ts`, wired imperatively in `main.tsx`) routes `onGitInitNotice` to `toast.info(\`Initialized git repo at ${gitDir}\`)`. No-op outside Electron.

  Legacy `.openknowledge/` standalone-mode directories are silent orphans (no detection, no warning, no migration) — OK carries zero runtime reference to that path per D5/NG5. Worktree-specific semantics are out of scope for this change; they remain owned by a separate spec (NG6).

  Full spec + decision log (D1–D14, R1–R9): [`specs/2026-04-21-shadow-repo-single-mode/SPEC.md`](specs/2026-04-21-shadow-repo-single-mode/SPEC.md).

### Patch Changes

- fe2ed47: chore(licensing): ship `THIRD_PARTY_NOTICES.md` in npm tarball + Electron `.app`

  Adds a reproducible attribution pipeline for the published `@inkeep/open-knowledge` CLI tarball and the `@inkeep/open-knowledge-desktop` Electron app. Both bundle source from MIT/ISC/BSD/Apache-2.0 deps and OFL-1.1 fonts; the new `THIRD_PARTY_NOTICES.md` at repo root is the committed source-of-truth and ships under each artifact:

  - npm CLI tarball — copied to `packages/cli/dist/THIRD_PARTY_NOTICES.md` via the existing `build:assets` step (already covered by `files: ["dist", …]`).
  - Electron desktop — `electron-builder.yml` `extraResources` places it at `Open Knowledge.app/Contents/Resources/THIRD_PARTY_NOTICES.md` (alongside electron-builder's auto-generated `LICENSE` + `LICENSES.chromium.html`).

  The closure walker (`scripts/generate-third-party-notices.mjs`) is deterministic (byte-stable sort, no timestamps) and the committed file is drift-checked against the resolved dep tree by `bun run check`, `bun run check:full:parallel`, and the `lint` job in `.github/workflows/ci.yml`.

- Updated dependencies [ddd4efc]
- Updated dependencies [5fdd555]
- Updated dependencies [05c7e37]
- Updated dependencies [39fa932]
- Updated dependencies [3ab7ae9]
- Updated dependencies [19b51e4]
- Updated dependencies [3079199]
- Updated dependencies [1f030ba]
- Updated dependencies [9a26a27]
- Updated dependencies [1d58475]
- Updated dependencies [5cc3e75]
- Updated dependencies [267c8ba]
- Updated dependencies [ba88a91]
- Updated dependencies [fa8f5de]
- Updated dependencies [cb8901b]
- Updated dependencies [48d4218]
- Updated dependencies [5444369]
- Updated dependencies [1451548]
- Updated dependencies [fe2ed47]
- Updated dependencies [17d5a91]
  - @inkeep/open-knowledge-core@0.3.0
  - @inkeep/open-knowledge-server@0.3.0
  - @inkeep/open-knowledge@0.3.0
