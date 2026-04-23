# @inkeep/open-knowledge-desktop

Native macOS Electron desktop app for Open Knowledge. Private package (not published to npm). Distributed as a signed DMG through GitHub Releases when signing lands.

See root `CLAUDE.md` → "Package: desktop" for the pointer map. Full architectural rationale (D1–D52) in [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../../specs/2026-04-11-electron-desktop-app/SPEC.md).

## Status

M1 shipped (dev loop, local, unsigned). M2 scaffolding landed — `electron-builder.yml` configures a Universal DMG with the `afterPack` (fuse flip) + `afterSign` (notarize + staple + fuse verify) hooks wired up. The signed path is **gated on env vars**: absent Apple credentials → unsigned DMG smoke; credentials present → full signed/notarized/stapled output. Apple Developer Program enrollment + cert procurement is in progress; the **signed+notarized** per-arch pipeline closes the moment credentials land in GitHub secrets. The **end-state M2 DOD** (Universal DMG green end-to-end) remains blocked on the bun-workspace universal-merge gap described in ["Universal DMG + bun workspace: known gap"](#-universal-dmg--bun-workspace-known-gap) below — that is a pre-existing workspace issue, not a credentials issue. M4 shipped (`openknowledge://` URL scheme deep-linking on macOS — see ["Deep linking"](#deep-linking-openknowledge-url-scheme) below).

M3 shipped (electron-updater wiring + toasts + release workflow — see ["M3 — Auto-update"](#m3--auto-update-electron-updater--install-on-quit) below). M5 keyring packaged-E2E verification layer landed — utility-process `runKeyringSmoke`, main↔utility debug IPC relay, boot-time auto-smoke mode, unsigned-DMG driver, 11-step signed runbook. Creds-free ACs (AC1–AC3, AC8–AC10) are green; signed-build ACs (AC4–AC7) are executable via the [manual runbook](#signed-dmg-manual-runbook-creds-gated) once Apple Developer credentials are on the test machine. See [`specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md`](../../specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md) and [`#keychain--auth-m5`](#keychain--auth-m5) for full detail.

See SPEC §14 for the remaining M6 + M7 milestones.

## Process model

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (electron/src/main)                                │
│  - BrowserWindow lifecycle (N editor windows + 1 launcher)       │
│  - Native menus, dialogs, Dock                                   │
│  - Project state (electron-store: recents + geometry)            │
│  - runClean on boot (prunes stale server.lock from crashes)      │
│  - Per-project: spawns + supervises utilityProcess               │
└───────────────┬─────────────────────────────┬──────────────────┘
                │                             │
                │ typed IPC                   │ utilityProcess.fork
                │                             │ (one per editor window)
  ┌─────────────▼───────────┐   ┌─────────────▼────────────────┐
  │ Renderer (BrowserWindow)│   │ utilityProcess (Node runtime)│
  │  - React bundle from    │   │  - bootServer(opts) from     │
  │    @inkeep/open-        │   │    @inkeep/open-knowledge-   │
  │    knowledge-app        │   │    server                    │
  │  - Navigator mode       │   │  - createServer +            │
  │    (launcher) OR        │   │    acquireServerLock         │
  │    Editor mode (doc)    │   │  - @parcel/watcher           │
  │                         │   │  - simple-git (shadow repo)  │
  │ Connects to             │   │  - @napi-rs/keyring          │
  │ ws://localhost:<port>   │   │  - macOS parent-death poll   │
  │ /collab                 │   │                              │
  └─────────────────────────┘   └──────────────────────────────┘
```

One BrowserWindow ↔ one utilityProcess ↔ one `createServer` ↔ one `contentDir` (D6). Enforced by the shipped `server.lock` contract (V0-1).

## Directory layout

```
packages/desktop/
├── electron.vite.config.ts        # Three-section build: main / preload / renderer (empty)
├── electron-builder.yml           # macOS Universal DMG target (config validity only until M2)
├── build/entitlements.mac.plist   # Hardened-runtime entitlements
├── scripts/postinstall.mjs        # electron-builder install-app-deps + ELECTRON_SKIP_REBUILD=1 gate
├── src/
│   ├── main/
│   │   ├── index.ts               # app.whenReady, single-instance lock, menu bar
│   │   ├── window-manager.ts      # createProjectWindow — spawns BrowserWindow + utility
│   │   ├── navigator-window.ts    # createNavigatorWindow — persistent launcher
│   │   ├── state-store.ts         # electron-store for recents + window bounds
│   │   ├── shell-allowlist.ts     # shell.openExternal scheme allowlist (D47 + Open-in-Agent)
│   │   ├── ipc-handlers.ts        # pure handlers: detect-protocol, spawn-cursor, record-handoff
│   │   ├── url-scheme.ts          # openknowledge:// parser + queue-then-flush handler (M4)
│   │   └── utility-fork-env.ts    # OK_ELECTRON_PROTOCOL_HOST=1 injection for utility fork (M4)
│   ├── preload/
│   │   └── index.ts               # contextBridge.exposeInMainWorld('okDesktop', ...)
│   ├── utility/
│   │   └── server-entry.ts        # bootServer + IPC handshake + parent-death poll (D49)
│   └── shared/
│       ├── ipc-channels.ts        # RequestChannels typed map (D14)
│       ├── ipc-events.ts          # EventChannels typed map (main → renderer)
│       ├── ipc-invoke.ts          # createInvoker — preload-side typed helper
│       ├── ipc-handler.ts         # createHandler — main-side typed helper
│       └── bridge-contract.ts     # OkDesktopBridge interface (desktop-local consumer copy)
└── tests/
    ├── integration/m1-smoke.test.ts                   # M1 Definition of Done
    ├── integration/no-loosely-typed-webcontents-ipc.test.ts  # D19 rule verification
    ├── main/{shell-allowlist,state-store,window-manager}.test.ts
    ├── preload/bridge.test.ts
    ├── unit/scaffold.test.ts                           # deps-resolve smoke
    └── utility/server-entry.test.ts
```

The canonical `OkDesktopBridge` interface also lives at [`packages/core/src/desktop-bridge.ts`](../core/src/desktop-bridge.ts) as a documentation anchor. It is intentionally **duplicated** (not re-exported) because TypeScript module augmentation through workspace barrels turned out to be brittle under `moduleResolution: bundler`. Keep the two files in sync when the shape changes.

## Running locally

From the repo root:

```bash
bun install                                       # installs desktop deps; postinstall rebuilds native modules
bun run --filter=@inkeep/open-knowledge-desktop dev
```

On first run, the app opens the Navigator window. Click "Open folder on disk" to pick a content directory — every project pick spawns a new editor window (D3 revised — there is no switch-in-place UX). Closing every editor window keeps the app and the Navigator running; click the Dock icon to bring the Navigator back.

To skip the native-module rebuild during `bun install` (faster on machines that don't need the desktop build):

```bash
ELECTRON_SKIP_REBUILD=1 bun install              # D34
```

Agents never set this — they want the full env. Add it to your shell profile if you're only iterating on non-desktop packages.

## IPC discipline (D14 + D19)

Every renderer↔main call goes through the typed channel map in `src/shared/ipc-channels.ts` (requests) or `src/shared/ipc-events.ts` (events). **Never call `ipcMain.handle` or `ipcRenderer.invoke` directly** — use `createHandler` / `createInvoker`. Biome's GritQL rule `no-loosely-typed-webcontents-ipc` (configured at the repo root, D19) fails lint on violations.

File-scoped allowlist for direct IPC access (the wrapper implementations themselves):

- `src/shared/ipc-handler.ts`
- `src/shared/ipc-invoke.ts`
- `src/preload/index.ts`

Subscription methods on the bridge (`onProjectSwitched`, `onMenuAction`, etc.) **must** use the preload-side listener-wrapper pattern — the contextBridge wraps callbacks, so passing the renderer's callback reference directly to `ipcRenderer.removeListener` silently fails ([electron/electron#33328](https://github.com/electron/electron/issues/33328)). The existing bridge in `src/preload/index.ts` is the reference.

`shell.openExternal` is proxied through main with an explicit scheme allowlist (`https | http | mailto | openknowledge | claude | codex | cursor`) per D47 + the [[specs/2026-04-21-open-in-agent-desktop/SPEC|Open-in-Agent extension]] to close the Shabarkin 2022 "1-click RCE" class via OS-native schemes. Adding a new scheme requires editing `src/main/shell-allowlist.ts` and updating its exact-set test. The drift-detector test in `tests/main/shell-allowlist.test.ts` imports `KNOWN_TARGETS` from `packages/app/src/lib/handoff/targets.ts` and fails if a target's scheme is not covered by `ALLOWED_SCHEMES`.

## Open-in-Agent IPC channels

Three channels added for the [[Open in Agent Desktop|Open-in-Agent]] handoff feature (SPEC `2026-04-21-open-in-agent-desktop`). Handlers are pure injectable functions in `src/main/ipc-handlers.ts` (registered from `main/index.ts`, the only file on the D19 direct-IPC allowlist). The same channels are mirrored in `src/shared/bridge-contract.ts` and `packages/core/src/desktop-bridge.ts` so the typed `window.okDesktop.shell.*` surface stays in sync via the contract-equality integration test.

| Channel                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ok:shell:detect-protocol` | Probe whether `<scheme>://` has a registered handler. macOS + Windows use `app.getApplicationInfoForProtocol` (2 s timeout); Linux falls back to `xdg-mime query default x-scheme-handler/<scheme>` because the Electron API is mac+win only. Returns `{ installed, displayName? }`; any failure collapses to `{ installed: false }`.                                                                                                                                                                                          |
| `ok:shell:spawn-cursor`    | Step 1 of Cursor's two-step handoff — spawn `cursor <projectDir>` so the workspace is open before the `cursor://` prompt URL fires. Binary resolution prefers `getApplicationInfoForProtocol('cursor://').path`, falls back to `which cursor` / `where cursor` (500 ms budget). Spawn uses argv array + `shell: false` + 2 s timeout. Deliberately a separate channel from `ok:shell:open-external` — the threat model is command allowlisting with argument-injection + PATH-hijacking concerns, not URL-scheme allowlisting. |
| `ok:shell:record-handoff`  | Append one JSONL line per dispatch to `~/.open-knowledge/stats.jsonl`. Local-only telemetry; failures are logged and swallowed so dispatch never depends on telemetry success. Zero network. Named under the `ok:shell:*` namespace to match the `shell.recordHandoff` bridge location.                                                                                                                                                                                                                                        |

The Cursor two-step step 1 is wired on the Electron host only — the web host renders the Cursor row disabled-with-tooltip ("Cursor handoff requires the desktop build") per E4 DIRECTED. Claude and Codex dispatch via `ok:shell:open-external` with the URL builders in `packages/core/src/handoff/`.

## Lifecycle primitives

- **`bootServer`** from `@inkeep/open-knowledge-server`. The utility calls it with `{ attachUiSibling: false, idleShutdownMs: null }` (D36) — no `ok ui` sibling, no 30-minute idle-shutdown timer. Other opt-outs (`skipAutoInit`) stay at their defaults.
- **`utilityProcess.fork(entry, [], { windowLifecycleBound: true, windowLifecycleGraceTime: 6000 })`** (D39). The utility terminates automatically on window close after the 6 s grace window. Main runs a 1-second post-exit PID-liveness probe to catch zombies per [VS Code #194477](https://github.com/microsoft/vscode/issues/194477).
- **Parent-death detection** (D49). The utility polls `process.kill(parentPid, 0)` every 5 s; on `EPERM` / `ESRCH` it drains and exits. Linux (`PR_SET_PDEATHSIG`) and Windows (Job Objects) paths are documented in comments but not implemented — M1 is macOS-only per D51.
- **`runClean({ lockDir })`** from the CLI's clean command runs on main-process boot before spawning utilities (D44). Stale locks from crashed prior sessions are pruned automatically.

## Renderer integration

The editor renderer is the existing `packages/app/` Vite bundle, loaded through `webPreferences.additionalArguments` which injects `window.okDesktop.config` at preload-exposure time. The app's `useCollabUrl` hook (`packages/app/src/lib/use-collab-url.ts`) short-circuits on `window.okDesktop?.config.collabUrl` and skips the `/api/config` poll path used by the web/CLI distribution. When `mode === 'navigator'`, `packages/app/src/main.tsx` mounts `NavigatorApp` instead of the editor shell.

## Deep linking (`openknowledge://` URL scheme)

Any app (Terminal, Mail, Slack, Claude Desktop) can deep-link into a project window on macOS via:

```
openknowledge://open?project=<absolute-project-path>&doc=<doc-name>
```

Both query values are URL-encoded. `project` must be an absolute path; `doc` is a relative name inside the project (no `..`, no `/`, no `\`). The `open` host is the only one recognized in v0 — other hosts silent-drop. URL shape is LOCKED by parent spec D43 (it is the MCP contract M6 depends on).

### Terminal smoke

```bash
open "openknowledge://open?project=/abs/path/to/project&doc=example.md"
```

- **Cold-start** (app not running): OK launches → editor window spawns for the project → renderer navigates to the doc.
- **Warm-start, same project** already open: existing window focuses + navigates. No duplicate.
- **Warm-start, different project**: a new editor window spawns. D24 — every project pick spawns its own window.

### Validation & silent-drop

URL parsing is in `src/main/url-scheme.ts`. Malformed URLs emit a single `[url-scheme] dropped malformed URL` warn-log and otherwise do nothing — no error dialog, no window spawn. Reject triggers:

- Null bytes anywhere in the raw input (including layered encodings like `%2500`).
- Protocol other than `openknowledge:` or host other than `open`.
- `project` or `doc` missing, empty, or fails URL-decoding.
- `project` is not absolute, or contains `..` segments (checked on the decoded-but-unnormalized path — `path.resolve` / `path.normalize` would silently flatten traversal and are not safe gates).
- `doc` contains `/`, `\`, or equals `..`.

### macOS cold-start queue-then-flush

`open-url` Apple Events can fire before `app.whenReady()` on macOS ([electron/electron#32600](https://github.com/electron/electron/issues/32600)). `registerProtocolHandler` is called synchronously at the top of `src/main/index.ts` — BEFORE `whenReady` — and enqueues URLs until the first BrowserWindow is ready. The drain loop retries 10 × 500 ms (the VS Code [`ElectronURLListener`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/url/electron-main/electronUrlListener.ts) convention) before flushing unconditionally.

CLI / dev launches (e.g. `Open\ Knowledge.app/Contents/MacOS/Open\ Knowledge openknowledge://...`) deliver the URL via `process.argv` rather than firing an Apple Event, so `app.on('second-instance', ...)` also scans argv for `openknowledge://` strings.

### Dev mode

Unpackaged Electron's `Info.plist` belongs to the Electron shell, not this app — so Launch Services has no OS-level binding to forward Apple Events at dev time. `registerProtocolHandler` calls `app.setAsDefaultProtocolClient('openknowledge')` automatically when `app.isPackaged === false`, writing a runtime binding so `open openknowledge://...` targets the dev instance. Packaged builds rely on the `CFBundleURLTypes` declaration already in `electron-builder.yml` (shipped at M1 scaffolding time).

### Playwright smoke test

`tests/smoke/deep-link.e2e.ts` exercises the warm-start delivery path via `execSync('open -g "openknowledge://..."')` — this dispatches through macOS Launch Services like a real user click. Gated by `OK_DESKTOP_E2E_SMOKE=1` (default-off so `bunx playwright test` on the full repo doesn't try to launch Electron on headless CI):

```bash
bun run build:desktop
OK_DESKTOP_E2E_SMOKE=1 bunx playwright test packages/desktop/tests/smoke/deep-link.e2e.ts
```

The test polls `app.windows()` for a hash ending in the target doc, with a 5s budget. Passes in ~2.3s locally.

**Cold-start Apple-Event simulation is a documented deferred gap.** Playwright's `_electron.launch({ args: [url] })` delivers the URL via `process.argv` (exercising the `second-instance` argv path), NOT via an `open-url` Apple Event. True cold-start Apple-Event simulation requires a signed/notarized DMG so macOS Launch Services binds the scheme to this specific bundle instead of the generic Electron shell — tracked alongside the M2 packaged-build harness.

### MCP `previewUrl` integration

The CLI's `preview-url.ts` helper has a highest-precedence `electron-protocol` source: when `OK_ELECTRON_PROTOCOL_HOST=1` is set in the server environment (the desktop main process injects it at `utilityProcess.fork` time via `buildUtilityForkEnv`), and the content dir's `realpathSync` resolves, the helper emits `openknowledge://open?project=<realpath>&doc=<docName>` instead of `http://localhost:<port>/#/<docName>`. CLI / `bunx` servers never set the flag, so they keep the HTTP preview URL behavior.

This is how MCP tool responses (e.g. `write_document` returning a `previewUrl`) deep-link the user back into the exact doc an agent just touched, routed through the main-process URL handler to the correct project window.

### Renderer subscriber

`packages/app/src/lib/install-deep-link-listener.ts` subscribes to the `ok:deep-link` bridge event during `main.tsx` module init (before React mount, so the first event can't race). On receipt it sets `window.location.hash = '#/' + encodeURIComponent(doc)` — the existing hash-route listener in `App` then opens the doc. No-op in web / CLI distributions (`window.okDesktop` undefined).

## Testing

| File                                                         | What it covers                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/m1-smoke.test.ts`                         | End-to-end Definition of Done: dev loop, keyring round-trip, parent-death exit, server.lock acquire/release         |
| `tests/integration/no-loosely-typed-webcontents-ipc.test.ts` | D19 rule asserts on a seeded violation and passes on current code                                                   |
| `tests/main/shell-allowlist.test.ts`                         | D47 scheme allowlist: accepts `https:`/`http:`/`mailto:`/`openknowledge:`, rejects `ms-msdt:`/`file:`/`javascript:` |
| `tests/main/state-store.test.ts`                             | electron-store shape — recents cap 20, window-bounds persistence, corrupt-file recovery                             |
| `tests/main/window-manager.test.ts`                          | Spawning + tracking + collision-dialog dispatch, `focusWindowForProject` warm-deep-link path; M5 `ok:debug:keyring-smoke` routing to per-window utility |
| `tests/main/url-scheme-handler.test.ts`                      | M4 handler: queue-then-flush retry loop, argv scan, dev-mode `setAsDefaultProtocolClient`, routing dispatch          |
| `src/main/url-scheme.test.ts`                                | M4 parser: valid/malformed/null-byte/path-traversal fixtures for `parseOpenKnowledgeUrl`                            |
| `src/main/utility-fork-env.test.ts`                          | M4 env injection: `buildUtilityForkEnv` sets `OK_ELECTRON_PROTOCOL_HOST=1` without bleeding to other forks           |
| `src/main/debug-ipc.test.ts`                                 | M5 main↔utility debug IPC relay: correlation-ID map, 10 s default timeout, clean-on-resolve / clean-on-timeout        |
| `tests/smoke/deep-link.e2e.ts`                               | M4 warm-start smoke (opt-in via `OK_DESKTOP_E2E_SMOKE=1` + `bun run build:desktop`)                                  |
| `tests/preload/bridge.test.ts`                               | `window.okDesktop` config parsing, subscription wrapper correctness                                                 |
| `tests/utility/server-entry.test.ts`                         | IPC handshake, graceful shutdown drain, parent-death exit, M5 `debug-request` dispatcher + boot-time auto-smoke      |
| `src/utility/keyring-smoke.test.ts`                          | M5 `runKeyringSmoke(deps?)` primitive: success round-trip + cleanup, error shapes, injectable-dep YAML-fallback path |
| `tests/unit/scaffold.test.ts`                                | Smoke: `OK_DIR` (core) and `bootServer` (server) imports resolve from desktop                                       |
| `tests/unit/verify-keyring-driver.test.mjs`                  | M5 `scripts/verify-keyring-in-packaged-dmg.mjs` driver: exit-code mapping (0/1/2/3), arg parsing, env-var plumbing   |

Run the full gate from the repo root (`bun run check`) or scope to this package with `cd packages/desktop && bun test`.

## M2 — signed/notarized DMG build

### Local smoke (unsigned, no creds needed)

**Prereqs.** `bun install` at the repo root installs the new `@electron/fuses` + `@electron/notarize` devDeps. The CLI's `build:assets` script copies `packages/app/dist/` → `packages/cli/dist/public/` (consumed by `electron-builder.yml`'s `extraResources` rule), but the CLI doesn't declare its app workspace dep in `package.json` — so turbo's `^build` doesn't build the app first. Build in explicit order:

```bash
bun install
bun run --filter=@inkeep/open-knowledge-app build
bun run --filter=@inkeep/open-knowledge build
cd packages/desktop
bunx electron-builder --mac --arm64 -c.mac.identity=null   # arm64-only smoke, see below
```

`afterPack.mjs` flips the six spec-§8.9 fuses; `afterSign.mjs` logs `skipping notarize — no Apple credentials in env` and exits clean. Verify the packaged binary:

```bash
bunx --bun electron-fuses read --app "dist-desktop/mac-arm64/Open Knowledge.app"
```

Expected output matches `targetFuses` in `scripts/target-fuses.mjs` (shared source of truth imported by both `afterPack.mjs` and `afterSign.mjs`): RunAsNode=**Enabled** (M6a amendment — enables `ELECTRON_RUN_AS_NODE=1` in the bundled `ok.sh` wrapper; defense-in-depth rationale in `scripts/target-fuses.mjs`), EnableCookieEncryption=Enabled, EnableNodeOptionsEnvironmentVariable=Disabled, EnableNodeCliInspectArguments=Enabled, EnableEmbeddedAsarIntegrityValidation=Enabled, OnlyLoadAppFromAsar=Enabled.

Install smoke: `open dist-desktop/*.dmg`, drag to Applications, `xattr -cr "/Applications/Open Knowledge.app"` to clear the quarantine bit, launch. The app is ad-hoc signed (`codesign -dv` reports `Signature=adhoc`) — Gatekeeper-runnable locally, unusable by anyone else (the proper Developer-ID sign comes from `CSC_LINK`).

### ⚠ Universal DMG + bun workspace: known gap

`build:mac` / `build:mac:unsigned` (without `--arm64`) target a **Universal DMG** per spec D29 (single download, arm64 + x64 merged). Today this fails in our bun workspace during `@electron/universal.makeUniversalApp` with:

> Detected file `Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/keyring-darwin-arm64/keyring.darwin-arm64.node` that's the same in both x64 and arm64 builds and not covered by the x64ArchFiles rule

**Root cause:** `@napi-rs/keyring` ships arch-specific prebuilt binaries via optionalDependencies. Bun only installs the host arch's variant (`@napi-rs/keyring-darwin-arm64` on an M-series Mac), never the x64 variant. When electron-builder packs both arches for the universal merge, both arch-specific temp dirs contain the same arm64 `.node` file — `@electron/universal`'s SHA-parity check then refuses the merge because arch-specific binaries shouldn't be bit-identical. **`@parcel/watcher` is at lower risk** because `@electron/rebuild` compiles it from source per-arch during electron-builder's rebuild step; the prebuilt-binary pattern on `@napi-rs/keyring` is what trips the merge.

**Fix (follow-up, not M2 scaffolding scope):** force-install both darwin-arm64 and darwin-x64 keyring prebuilt binaries before `build:mac`. Options: `bun add -D --filter=@inkeep/open-knowledge-desktop @napi-rs/keyring-darwin-arm64@1.2.0 @napi-rs/keyring-darwin-x64@1.2.0` (pollutes package.json), or a `scripts/prepare-universal.mjs` that extracts the tarballs into `node_modules/@napi-rs/` without recording them in package.json. The second is cleaner. Either way this lands separately — the M2 scaffolding in this PR already does its job (fuses + signing + notarization hooks), and the universal-merge issue is a pre-existing bun+workspace gap that would have blocked M1's `build:dir` too if anyone had run it.

**Workaround today:** use `--arm64` or `--x64` alone for local smoke; the CI workflow will hit the same universal blocker and needs the follow-up fix before it can produce a real universal DMG.

### Local signed build (requires creds)

Export all five env vars, then run `bun run build:mac`:

```bash
export CSC_LINK="$(base64 -i ./developer-id.p12)"   # .p12 cert + private key
export CSC_KEY_PASSWORD='<p12-password>'
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'   # appleid.apple.com → sign in & security
export APPLE_TEAM_ID='ABCDE12345'                    # developer.apple.com/account
bun run build:mac
```

`afterSign.mjs` runs `@electron/notarize` (which staples on success), `xcrun stapler validate`, then `@electron/fuses.getCurrentFuseWire` and asserts every fuse matches `afterPack.mjs`'s `targetFuses` map. Any mismatch fails the build loud (D17).

Alternative credentials: App Store Connect API key — set `APPLE_API_KEY` (path to `.p8`) + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` instead of the APPLE\_ID triplet. The afterSign script auto-detects which shape is present.

### CI

`.github/workflows/desktop-build.yml` (manual `workflow_dispatch` for this iteration) runs the same flow on a `macos-14` runner and uploads the DMG + `latest-mac.yml` as a 14-day artifact. The workflow detects signing mode from `CSC_LINK`'s presence and routes accordingly — `build:mac` when set, `build:mac:unsigned` when absent — and encodes the mode in the artifact name (`open-knowledge-macos-signed-<sha>` vs `open-knowledge-macos-unsigned-<sha>`) so downstream consumers cannot confuse the two. Wire the five secrets at Settings → Secrets to upgrade from unsigned smoke to full signed+notarized output. Path-gated `pull_request` trigger is deferred until the signed path has been green at least once.

Partial Apple credentials (e.g. `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` set but `APPLE_TEAM_ID` omitted) now **fail loud** in `afterSign.mjs` rather than silently skipping notarize. Silent skip only happens when zero notarize credentials are present, which is paired with the explicit `build:mac:unsigned` invocation from the workflow.

### M2 DOD checklist

- [x] Universal DMG target (D29) wired in `electron-builder.yml` (`mac.target.arch: [universal]`, fuse-flip + notarize hooks).
- [ ] **(follow-up)** Universal DMG merge produces a valid DMG end-to-end. Blocked by `@napi-rs/keyring` single-arch install under bun — configured, not yet green. See ["Universal DMG + bun workspace: known gap"](#-universal-dmg--bun-workspace-known-gap) above.
- [x] `afterPack` flips fuses per spec §8.9 (D17); verified on packaged arm64 binary via `electron-fuses read`.
- [x] `afterSign` invokes `@electron/notarize` + `xcrun stapler validate` + `@electron/fuses.getCurrentFuseWire` verification; graceful-skip on absent creds smoke-tested.
- [x] Hardened runtime + entitlements applied (unchanged from M1 — already matches spec).
- [x] CI workflow structure in place; artifact upload on success.
- [ ] **(creds-gated)** Fresh-Mac install of signed DMG: drag to `/Applications`, open, **no Gatekeeper warning**, M1 dev loop works end-to-end in packaged mode.
- [ ] **(creds-gated)** First-launch Keychain prompt shows `CFBundleDisplayName` correctly (R16).

## M3 — Auto-update (electron-updater + install-on-quit)

**Status:** Scaffolding shipped; end-state smoke deferred to post-M2-creds + universal-merge fix.

**Spec:** [`specs/2026-04-21-m3-electron-updater/SPEC.md`](../../specs/2026-04-21-m3-electron-updater/SPEC.md). See the parent spec [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../../specs/2026-04-11-electron-desktop-app/SPEC.md) §14 for the milestone definition.

M3 wires [electron-updater](https://www.electron.build/auto-update) into the main process behind the `app.isPackaged` gate. The update path is: `autoUpdater.checkForUpdatesAndNotify()` → GitHub Releases CDN (`releases/latest/download/latest-mac.yml`) → auto-download of the `.zip` → `update-downloaded` event → renderer Toast A (`"Update downloaded"` + `"Relaunch now"`) → install on next quit via `autoInstallOnAppQuit = true`.

### Runtime dependency

`electron-updater` is pinned exact (no caret) as a runtime `dependencies` entry of `@inkeep/open-knowledge-desktop` — see `package.json`. Version paired with `electron-builder@^26.9.0` via shared `builder-util-runtime`; upgrade only as a coupled pair.

### Main-process entry point

- [`src/main/auto-updater.ts`](src/main/auto-updater.ts) — exports `startAutoUpdater(opts): { destroy }`. Every time + Electron + state surface is injectable so unit tests drive all paths under `bun test` without an Electron runtime.
- [`src/main/index.ts`](src/main/index.ts) — calls `startAutoUpdater(...)` as the last step in `app.whenReady().then(...)` (after the window-open branch, not gated on which window opened per F2); tears down on `app.on('will-quit')` per parent D40 canonical shutdown ordering.

Six `autoUpdater` events subscribed (AC2): `checking-for-update`, `update-available`, `update-not-available`, `download-progress` (debug-level log only), `update-downloaded`, `error`. NOT subscribed: `login`, `update-cancelled`, `appimage-filename-updated`.

Four AppState fields persisted in [`src/main/state-store.ts`](src/main/state-store.ts):
- `versionPendingInstall: string | null` — Toast A once-per-version gate (D11).
- `lastSeenVersion: string | null` — Toast B once-per-version-transition gate (D9/D11).
- `lastSuccessfulCheckAt: string | null` — D12 stuck-hint 7-day counter baseline.
- `stuckHintShown: boolean` — D12 Toast C once-per-installation flag (resets on successful check so gate re-arms).

### IPC surface

Three main→renderer push events (in `src/shared/ipc-events.ts` `EventChannels`):
- `ok:update:downloaded` `{ version }` → Toast A in renderer.
- `ok:update:whats-new` `{ version, releaseUrl }` → Toast B in renderer.
- `ok:update:stuck-hint` `{ downloadUrl }` → Toast C in renderer.

One renderer→main request (in `src/shared/ipc-channels.ts` `RequestChannels`):
- `ok:update:relaunch-now` → main calls `autoUpdater.quitAndInstall()` (Toast A action).

All four new channels exposed on `window.okDesktop` via the triple-copy bridge contract (core/desktop/app per CLAUDE.md deliberate-duplication). Added `createSender()` typed wrapper to `src/shared/ipc-events.ts` — the third IPC wrapper alongside `createHandler` / `createInvoker`; main→renderer fan-out is type-checked against `EventChannels`.

### Dev-mode smoke

Three verification tiers per SPEC §7 D4:

| Tier | Where | What it exercises |
|------|-------|-------------------|
| 1 — unit | `tests/integration/auto-updater.test.ts` | 6 events + error classification + Toast gates + IPC handlers — FakeUpdater event-stub, no Electron runtime. 51 tests, ~40ms. |
| 2 — HTTP smoke | `scripts/smoke-mock-update.mjs` (pure node) | `GenericProvider` HTTP plumbing: `latest-mac.yml` + fake `.zip` with valid sha512 served on `127.0.0.1:<ephemeral>`. Self-tests via its own `fetch`. |
| 3 — end-state (post-creds) | `packages/desktop/build/dev-app-update.yml` + `forceDevUpdateConfig=true` | `GitHubProvider` URL resolution against a staged pre-release tag. Canonical approach per [electron.build/auto-update](https://www.electron.build/auto-update); runs only after M2 creds procurement. |

Run Tier 2 in isolation:

```bash
bun run --cwd packages/desktop smoke:mock-update
# Prints: [mock-updater] port=<N> ...
# Serves /latest-mac.yml + /open-knowledge-mock.zip, self-tests, exits 0.
```

Tier 2 paired with a dev Electron build (full round-trip short of the Squirrel.Mac swap):

1. Terminal A: `bun run --cwd packages/desktop smoke:mock-update`. Note the printed port.
2. Write `packages/desktop/dev-app-update.yml`:

   ```yaml
   provider: generic
   url: http://localhost:<N>
   ```

3. Terminal B: `OK_UPDATER_FORCE_DEV=1 bun run --filter=@inkeep/open-knowledge-desktop dev`.
4. Electron's main-process auto-updater (with `OK_UPDATER_FORCE_DEV=1` bypassing the `!app.isPackaged` guard, and `forceDevUpdateConfig=true` causing the feed to be read from `dev-app-update.yml`) hits the local server, downloads the fake zip, fires `update-downloaded`. Renderer Toast A renders.

### Cutting a release

1. `bun changeset` on a feature branch — declare a minor/patch bump for `@inkeep/open-knowledge-desktop` (and any other fixed-group packages touched).
2. Merge the branch into main. Changesets' release bot opens a "Version Packages" PR that bumps all fixed-group versions lockstep (D7).
3. Merge the "Version Packages" PR. `release.yml` fires on push-to-main, runs quality gates, publishes npm packages, then runs `gh release create "v${VERSION}"` with the generated notes.
4. `desktop-release.yml` fires on the `release: published` event. Runs signed build + notarize + staple + fuse-verify on `macos-14`, then `electron-builder --publish always` uploads `.dmg`, `.dmg.blockmap`, `-mac.zip`, `-mac.zip.blockmap`, and `latest-mac.yml` to the existing Release.
5. Users auto-update on next launch or within 1 hour via the periodic interval (D10 — matches Obsidian's hourly cadence).

Required secrets for `desktop-release.yml` (same set as `desktop-build.yml`): `CSC_LINK`, `CSC_KEY_PASSWORD`, and one of the Apple notarization triples — `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, OR `APPLE_API_KEY` + `APPLE_API_KEY_ID` [+ `APPLE_API_ISSUER`]. Unsigned mode is rejected — `auto-update` refuses unsigned upgrades.

### Unsigned local smoke — M2 universal-merge workaround

Because `packages/desktop/build:mac:unsigned` defaults to `mac.target.arch: [universal]` and the M2 FU-1 `@napi-rs/keyring` SHA-parity issue still blocks Universal merge, the per-arch workaround is the working unsigned path:

```bash
cd packages/desktop
bun run build:desktop
CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --mac dmg:arm64 zip:arm64 -c.mac.identity=null
```

Produces `.dmg` + `.dmg.blockmap` + `-mac.zip` + `-mac.zip.blockmap` + `latest-mac.yml` under `dist-desktop/`. Worth noting: the `--arm64` CLI flag alone does NOT override `mac.target.arch: [universal]` — it ADDS `arm64`, so electron-builder tries both and re-triggers the universal-merge blocker. The `dmg:arm64 zip:arm64` target-shorthand form bypasses the YAML-default arch list entirely.

### Debugging J7a failures

M3's [`auto-updater.ts`](src/main/auto-updater.ts) emits structured bracket-prefixed logs (`[updater] event ...`) per CLAUDE.md's logging convention. For classified errors (`ERR_UPDATER_*` / `HTTP_ERROR_*`), the log payload is `{ code, message, timestamp }`; for unclassified (bare Squirrel.Mac `Error`), it's `{ message, stack, timestamp }`. Both paths are silent to the user per D5 — no dialog, no per-error toast.

In production: find logs via Console.app filtered by the app's PID, or in `app.getPath('logs')` when writing a file logger. The one user-visible signal is Toast C (D12 stuck-hint), which fires exactly once per installation after 7 consecutive calendar days without a successful update check.

Real-world error telemetry (Sentry integration) is deferred to FW5 — promote when M7 design-partner builds start generating real-world error rates.

### Promote triggers (FW1a, FW2–FW6)

- **FW1a** — Promote Toast B copy from bare version string + link to GitHub Release body fetch. Trigger: user asks to see release notes in-app OR reports bare-string as insufficient.
- **FW2** — Staged rollouts via `stagingPercentage` in `latest-mac.yml`. Trigger: first real update cycle completes successfully end-to-end.
- **FW3** — Beta channel. Trigger: more than one concurrent user-facing version line (dogfood vs stable).
- **FW4** — Auto-rollback on crash loop. Trigger: first user-reported "update broke the app" incident.
- **FW5** — Sentry / crash-reporter integration for update-error telemetry. Trigger: M7 design-partner builds start.
- **FW6** — Windows / Linux auto-update. Trigger: parent D51 macOS-only constraint is lifted.

### Known deferrals (creds-gated)

- **AC15** — Real `v{X}` → `v{X+1}` silent upgrade on a fresh Mac. Blocked on Apple Developer Program creds + `@napi-rs/keyring` universal-merge fix.
- **AC16** — Failed-update smoke (J7a): kill updater mid-download → next launch retries cleanly. Blocked on same creds set.

Both verified once M2 FU-1 + FU-2 close and the first signed DMG lands. Workflow files (`desktop-release.yml`) are committed and lint-validated; dispatch path is gated on creds.

## Keychain + auth (M5)

Open Knowledge stores GitHub OAuth tokens via `@napi-rs/keyring` → macOS Keychain (the substrate was merged as PR #166). M5 wires up the end-to-end verification that proves the binding loads + round-trips in the packaged, signed, notarized build. Full spec: [`specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md`](../../specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md).

### Prompt UX — `CFBundleDisplayName` contract (R16)

The first-access Keychain ACL prompt reads **"Open Knowledge" wants to use your confidential information…**. The string comes from `CFBundleDisplayName` in `Info.plist`, which electron-builder auto-derives from `productName: Open Knowledge` in [`electron-builder.yml`](./electron-builder.yml). **Do not rename the product in only one place** — a mismatch between the signed bundle's internal name and the user-visible Keychain prompt is what the R16 test guards against.

- If a future cosmetic rename is proposed (e.g. marketing wants "Open Knowledge Desktop"), update `productName` in `electron-builder.yml` ONLY and re-run the full M5 signed runbook — every user who already authenticated under the old name will see a new first-access prompt even though the token is preserved (the ACL grant is keyed by `appId`, not `CFBundleDisplayName`).

### Bundle-ID stability contract

The `appId: com.inkeep.open-knowledge` in `electron-builder.yml` is **LOCKED forever**. Changing it breaks every existing user's Keychain access — their token stays in the keychain (keyed by `com.inkeep.open-knowledge`), but the newly-signed app bundle with the new ID cannot read it. Users appear signed out on next launch, with no recoverable state.

Changing the Apple Developer Team ID (e.g. migrating between Apple Developer accounts) triggers the same break: macOS treats a bundle signed under a different Team ID as a different app for ACL purposes. Any future Team ID change requires a data-migration plan (re-auth flow, preserved session cookies, or silent Device Flow); that's explicitly not covered here.

The `electron-version` contract test (`tests/unit/scaffold.test.ts`) enforces version-pin consistency mechanically. An `appId` stability test is not yet wired up because the value is referenced in exactly one place; if the appId ever gets split across multiple source files, add a similar drift catcher.

### Dev-vs-release coexistence (OQ-4)

If a developer runs both a signed release DMG and an unsigned local build on the same Mac, macOS may treat them as different apps for ACL purposes (the signing identity is part of the chain-of-trust check). Result: the dev build prompts independently on first Keychain access even though both bundles share `appId: com.inkeep.open-knowledge`.

This is intentional. `appId` identifies the user-perceived app; the code-signing identity differentiates release-quality from dev-quality for security policy.

### Debugging locally

The utility process exposes a namespace-scoped keyring smoke (service `open-knowledge-smoke`, account `test-user` — distinct from production's `open-knowledge`/`<host>` so they cannot collide). Run it in dev mode:

```bash
bun run --filter=@inkeep/open-knowledge-desktop dev
# In the editor window's DevTools Console:
await window.okDesktop.debug.keyringSmoke()
// → { ok: true, backend: 'keyring', durationMs: N, timestamp: '2026-…' }
```

The `bridge.debug` namespace only exists when the runtime gate allows it: app is NOT packaged (dev mode is always open), OR `OK_DEBUG_KEYRING_SMOKE=1` is set in the environment that launched the app. In normal packaged runs, `window.okDesktop.debug` is `undefined` and a typo like `window.okDesktop.debug.keyringSmoke()` surfaces at TypeScript compile time — not at runtime in production.

### Headless / CI smoke — unsigned DMG

For creds-free pre-flight before the manual signed runbook, use the driver:

```bash
# Against an .app directly (fastest):
bun run --cwd packages/desktop build:mac:unsigned
node scripts/verify-keyring-in-packaged-dmg.mjs \
  packages/desktop/dist-desktop/mac/Open\ Knowledge.app

# Against an .dmg (mounts + copies + detaches + launches):
node scripts/verify-keyring-in-packaged-dmg.mjs \
  packages/desktop/dist-desktop/Open\ Knowledge-<version>-universal.dmg
```

Exit codes:

- `0` — smoke reported `ok:true` (backend loaded + round-trip succeeded)
- `1` — smoke reported `ok:false` (binding failed, read mismatch, etc.)
- `2` — app did not exit within the 30 s timeout (stuck on boot, or bad args)
- `3` — app exited without writing the output file (pre-smoke crash)

The driver sets `OK_DEBUG_KEYRING_SMOKE=1 + OK_DEBUG_KEYRING_SMOKE_EXIT=1 + OK_DEBUG_KEYRING_SMOKE_OUT=<tmp>` in the child environment, so the utility auto-runs the smoke at boot (before the `init` IPC) and the app exits after writing JSON. This is the only creds-free way to prove the native binding works under the packaged hardened-runtime environment — dev mode doesn't exercise the entitlements + fuses + signed-binary loader path.

### Signed-DMG manual runbook (creds-gated)

See [`tests/smoke/keyring-e2e.md`](./tests/smoke/keyring-e2e.md) for the 11-step procedure covering the four AC4–AC7 proof points: CFBundleDisplayName prompt UX, relaunch persistence, v0.1.0→v0.1.1 upgrade persistence, `log show` caller-attribution evidence. Runnable once Apple Developer credentials (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are available on the test machine.

## M6a — Command-Line Tools

**Status:** Shipped. `Install Command-Line Tools…` File menu item (macOS-only per D51) creates user-local symlinks at `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge`, both pointing at the bundled wrapper at `Contents/Resources/cli/bin/ok.sh`. The wrapper invokes the bundled CLI via `ELECTRON_RUN_AS_NODE=1` — no Node install required on the user's machine. Full spec: [`specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`](../../specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md). Phase 2 (M6b — first-launch MCP consent) is in progress; this section covers Phase 1 only.

### Install / uninstall

Click **File → Install Command-Line Tools…** on macOS. An admin prompt fires via `osascript`; after authentication, both symlinks land and the menu label flips to **Uninstall Command-Line Tools**. Click again to remove (same admin flow; only removes symlinks whose `readlink` target is inside the currently-running bundle — foreign files untouched per G6).

The wrapper runs the Electron binary as a Node process under the hood. It re-exports any `NODE_OPTIONS` set by the user's shell as `OK_NODE_OPTIONS` and `unset`s `NODE_OPTIONS` before exec, avoiding the VS Code "`--require of ESM`" crash class when a user's project-level Node options conflict with Electron's embedded Node.

### Diagnostic — `which -a ok`

Both `ok` and `open-knowledge` resolve to the same binary (`open-knowledge` is the backward-compat alias retained per D52). To see every `ok` on your `$PATH`:

```bash
which -a ok
```

Expected output after M6a install:

```
/usr/local/bin/ok
```

If a second path shows up (e.g. `/opt/homebrew/bin/ok`), an npm-global install coexists — see the coexistence matrix below.

### Coexistence with `npm install -g @inkeep/open-knowledge`

Two origins of `ok` can live on the same machine — the DMG's wrapper (M6a) and a published npm global install. macOS resolution depends on the chip:

| Architecture  | Homebrew prefix      | Typical `$PATH` order                           | Effect                                                                                                                                                                                                                                                                 |
| ------------- | -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Silicon | `/opt/homebrew/bin`  | `/opt/homebrew/bin` precedes `/usr/local/bin`   | Terminal-typed `ok` resolves to the npm install; M6b writes MCP configs that point at the DMG wrapper (distinct binaries). Same codebase today, but versions can drift if you upgrade one without the other.                                                          |
| Intel         | `/usr/local/bin`     | `/usr/local/bin` IS Homebrew's default prefix   | M6a and `npm -g` compete for the same path. G4's collision guard prompts before overwriting. If `npm install -g` later stomps the M6a symlink, re-run **File → Install Command-Line Tools…** to restore.                                                              |

The diagnostic posture is the same on both chips: `which -a ok` shows every copy. Note that M6b resolves `cliPath` for MCP configs via a hybrid path per D-M6-R9 — the symlink at `/usr/local/bin/ok` is preferred when present AND ownership-checked (`readlink` target lives inside the current bundle), with a bundle-absolute fallback (`.../Contents/Resources/cli/bin/ok.sh`) otherwise. Foreign symlinks are never trusted.

### Translocation gotcha

macOS App Translocation runs unsigned apps launched directly from a DMG mount or a random Downloads-adjacent path out of a randomized `/private/var/folders/.../AppTranslocation/` copy. The translocated copy vanishes when the app quits, so symlinks pointing at it would break immediately.

The menu item refuses to install when `app.getPath('exe')` lives under a translocation path. A dialog points the user at the fix:

> Drag **Open Knowledge.app** to `/Applications/`, relaunch from there, then click **Install Command-Line Tools…** again.

Signed+notarized DMGs also trigger translocation on the first launch from the mount. The same recipe applies.

### Drag-to-Trash recovery

If you uninstall the app (drag to Trash) without clicking **Uninstall Command-Line Tools…** first, the symlinks at `/usr/local/bin/ok` + `/usr/local/bin/open-knowledge` dangle — their targets vanish with the bundle. On your next app launch (e.g. after reinstalling the DMG), a **"Command-Line Tools are broken — repair?"** dialog offers to re-point the symlinks at the new install via the same admin flow as the initial install (G5). Decline to leave them; accept to repair in place.

This check fires once per app session on packaged builds only — dev-mode launches (`electron-vite dev`) never classify a prior user's symlinks as "broken" relative to the dev binary, which would otherwise be a contamination vector.

## M6b — MCP wiring (first-launch consent)

First-launch MCP consent dialog on packaged-app first-open — user-scoped (not per-project per D-M6-R1) — that writes MCP server entries to detected AI-tool user-level configs and records a marker so it never re-fires. Spec: [`specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md`](../../specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md).

### What fires and when

On every packaged-app launch (`app.isPackaged === true`, macOS-only in v0), `runMcpWiringOnFirstLaunch` (`src/main/mcp-wiring.ts`) checks for `~/.open-knowledge/.mcp-status.json`. Marker absent → install IPC handlers, wait for the first renderer's `ok:mcp-wiring:renderer-ready` ack, send `ok:mcp-wiring:show` back with the detected-editors payload. `<McpConsentDialog>` is subscribed from BOTH `NavigatorApp` and `App.tsx` (host-agnostic per D-M6-R10), so whichever window opens first — Navigator (common case), editor via `lastOpenedProject`, or editor via `openknowledge://` cold-start deep-link — renders the dialog.

Marker present (either shape below) → skip immediately; dialog never re-fires on that boot.

### Marker shape and location

`~/.open-knowledge/.mcp-status.json` — user-scoped, sits next to `~/.open-knowledge/config.yml`.

Confirmed:

```json
{
  "configured": true,
  "configuredAt": "2026-04-23T15:30:00Z",
  "editors": ["claude", "cursor"],
  "cliPath": "/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh"
}
```

Skipped:

```json
{
  "configured": false,
  "skippedAt": "2026-04-23T15:30:00Z"
}
```

**Re-triggering the dialog:** delete the marker file. Next app launch surfaces the consent flow again.

### Hybrid `cliPath` resolution (D-M6-R9)

At confirm time, `resolveCliPath(app.getPath('exe'))` prefers a bundle-owned symlink over the bundle-absolute path:

1. Probe `/usr/local/bin/ok`. If it exists AND is a symlink AND `readlinkSync` resolves into the current `.app/` bundle (ownership check), return `/usr/local/bin/ok` — stable across Squirrel.Mac atomic-swap auto-updates and user drag-to-new-location moves.
2. Otherwise return `${bundleRoot}/Contents/Resources/cli/bin/ok.sh` — self-contained, works without the M6a CLI-on-PATH install.

MCP entries are written as `{"command": <cliPath>, "args": ["mcp"]}` — never `npx` for Electron-origin writes. CLI-origin `ok init` continues to produce `{"command": "npx", "args": ["@inkeep/open-knowledge", "mcp"]}` since CLI users have Node by definition.

### Dev-mode contamination guard

The consent flow is gated on `app.isPackaged === true`. In `electron-vite dev`, `app.getPath('exe')` points at the dev Electron binary (not a bundle) and `extraResources` aren't mounted — writing `cliPath` against that path would contaminate the developer's real `~/.claude.json` irrecoverably. Dev-mode invocations are a no-op.

Developer opt-in for testing the flow requires BOTH the env bypass AND an isolated `HOME`:

```bash
OK_M6B_FORCE=1 HOME=/tmp/ok-m6b-home \
  bun run --filter=@inkeep/open-knowledge-desktop dev
```

### Merge semantics

`computeForce(existing, target)` classifies each editor's existing OK entry in three tiers:

1. `target.isCompatible(existing, '', {mode: 'published'})` — canonical `{command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']}` (including user-added `env` augmentation).
2. Historical `-y npx` variant (`{command: 'npx', args: ['-y', '@inkeep/open-knowledge', 'mcp']}`).
3. Prior `cliPath` shape from an earlier M6b run (`{command: <path-ending-in-ok.sh-or-ok>, args: ['mcp']}`).

Any match → overwrite with the current cliPath shape (preserving `env` / other managed fields). Foreign customization (`{command: 'custom-wrapper', ...}`) is preserved; `mcp-wiring-skip-customized` JSON event emitted for observability.

### Partial-failure recovery (OQ-19)

If any per-editor write returns `action: 'failed'` (read-only target dir, platform not supported, etc.), the marker is NOT written so the dialog re-fires on next launch. Successful writes still land. One `mcp-wiring-write-failed` structured JSON event emits per failed editor.

### Testing

- **Unit tests:** `packages/desktop/src/main/mcp-wiring.test.ts` (49 tests — pure helpers + runtime orchestration).
- **Playwright smoke:** `packages/desktop/tests/smoke/mcp-wiring.e2e.ts`. Invoke:

```bash
bun run build:desktop
OK_DESKTOP_E2E_SMOKE=1 bunx playwright test \
  --config packages/desktop/playwright.config.ts \
  packages/desktop/tests/smoke/mcp-wiring.e2e.ts
```

5 active scenarios (happy-path, skip, idempotency, partial-failure, F1 `lastOpenedProject`) + 2 documented-skip (F2 cold-start deep-link and AC2.6 P1 E2E — both gated on signed DMG delivery via `openknowledge://` through Launch Services).

## Scope boundary

This package is M1 + M2-scaffolding + M3 (auto-update scaffolding) + M4 (URL scheme) + M5-verification + M6a (CLI-on-PATH install) + M6b (first-launch MCP wiring). M7 (Windows + Linux parity) is out of scope — see [`specs/2026-04-11-electron-desktop-app/SPEC.md §14`](../../specs/2026-04-11-electron-desktop-app/SPEC.md) for the milestone definitions and promote triggers.
