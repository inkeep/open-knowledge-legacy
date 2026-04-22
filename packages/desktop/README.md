# @inkeep/open-knowledge-desktop

Native macOS Electron desktop app for Open Knowledge. Private package (not published to npm). Distributed as a signed DMG through GitHub Releases when signing lands.

See root `CLAUDE.md` → "Package: desktop" for the pointer map. Full architectural rationale (D1–D52) in [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../../specs/2026-04-11-electron-desktop-app/SPEC.md).

## Status

M1 shipped (dev loop, local, unsigned). M2 scaffolding landed — `electron-builder.yml` configures a Universal DMG with the `afterPack` (fuse flip) + `afterSign` (notarize + staple + fuse verify) hooks wired up. The signed path is **gated on env vars**: absent Apple credentials → unsigned DMG smoke; credentials present → full signed/notarized/stapled output. Apple Developer Program enrollment + cert procurement is in progress; the **signed+notarized** per-arch pipeline closes the moment credentials land in GitHub secrets. The **end-state M2 DOD** (Universal DMG green end-to-end) remains blocked on the bun-workspace universal-merge gap described in ["Universal DMG + bun workspace: known gap"](#-universal-dmg--bun-workspace-known-gap) below — that is a pre-existing workspace issue, not a credentials issue. See SPEC §14 for M3–M7.

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
│   │   └── shell-allowlist.ts     # shell.openExternal scheme allowlist (D47)
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

Every renderer↔main call goes through the typed channel map in `src/shared/ipc-channels.ts` (requests) or `src/shared/ipc-events.ts` (events). **Never call `ipcMain.handle` or `ipcRenderer.invoke` directly** — use `createHandler` / `createInvoker`. Enforcement is a Bun integration test at `tests/integration/no-loosely-typed-webcontents-ipc.test.ts` that greps the source tree for raw electron IPC calls outside an allowlist (Biome 2.4 doesn't yet ship custom lint plugins — the test's header comment documents the fallback). Consult that file's `ALLOWLIST` constant for the authoritative list of permitted wrapper-implementation files.

File-scoped allowlist for direct IPC access — the wrapper implementations themselves plus channel-contract and top-level bootstrap. Source of truth is the test's `ALLOWLIST` constant:

- `src/shared/ipc-handler.ts`
- `src/shared/ipc-invoke.ts`
- `src/shared/ipc-channels.ts`
- `src/shared/ipc-events.ts`
- `src/preload/index.ts`
- `src/main/index.ts`

Subscription methods on the bridge (`onProjectSwitched`, `onMenuAction`, etc.) **must** use the preload-side listener-wrapper pattern — the contextBridge wraps callbacks, so passing the renderer's callback reference directly to `ipcRenderer.removeListener` silently fails ([electron/electron#33328](https://github.com/electron/electron/issues/33328)). The existing bridge in `src/preload/index.ts` is the reference.

`shell.openExternal` is proxied through main with an explicit scheme allowlist (`https | http | mailto | openknowledge`) per D47 to close the Shabarkin 2022 "1-click RCE" class via OS-native schemes. Adding a new scheme requires editing `src/main/shell-allowlist.ts` and updating its test.

## Lifecycle primitives

- **`bootServer`** from `@inkeep/open-knowledge-server`. The utility calls it with `{ attachUiSibling: false, idleShutdownMs: null }` (D36) — no `ok ui` sibling, no 30-minute idle-shutdown timer. Other opt-outs (`skipAutoInit`) stay at their defaults.
- **`utilityProcess.fork(entry, [], { windowLifecycleBound: true, windowLifecycleGraceTime: 6000 })`** (D39). The utility terminates automatically on window close after the 6 s grace window. Main runs a 1-second post-exit PID-liveness probe to catch zombies per [VS Code #194477](https://github.com/microsoft/vscode/issues/194477).
- **Parent-death detection** (D49). The utility polls `process.kill(parentPid, 0)` every 5 s; on `EPERM` / `ESRCH` it drains and exits. Linux (`PR_SET_PDEATHSIG`) and Windows (Job Objects) paths are documented in comments but not implemented — M1 is macOS-only per D51.
- **`runClean({ lockDir })`** from the CLI's clean command runs on main-process boot before spawning utilities (D44). Stale locks from crashed prior sessions are pruned automatically.

## Renderer integration

The editor renderer is the existing `packages/app/` Vite bundle, loaded through `webPreferences.additionalArguments` which injects `window.okDesktop.config` at preload-exposure time. The app's `useCollabUrl` hook (`packages/app/src/lib/use-collab-url.ts`) short-circuits on `window.okDesktop?.config.collabUrl` and skips the `/api/config` poll path used by the web/CLI distribution. When `mode === 'navigator'`, `packages/app/src/main.tsx` mounts `NavigatorApp` instead of the editor shell.

## Testing

| File                                                         | What it covers                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/m1-smoke.test.ts`                         | End-to-end Definition of Done: dev loop, keyring round-trip, parent-death exit, server.lock acquire/release         |
| `tests/integration/no-loosely-typed-webcontents-ipc.test.ts` | D19 rule asserts on a seeded violation and passes on current code                                                   |
| `tests/main/shell-allowlist.test.ts`                         | D47 scheme allowlist: accepts `https:`/`http:`/`mailto:`/`openknowledge:`, rejects `ms-msdt:`/`file:`/`javascript:` |
| `tests/main/state-store.test.ts`                             | electron-store shape — recents cap 20, window-bounds persistence, corrupt-file recovery                             |
| `tests/main/window-manager.test.ts`                          | Spawning + tracking + collision-dialog dispatch                                                                     |
| `tests/preload/bridge.test.ts`                               | `window.okDesktop` config parsing, subscription wrapper correctness                                                 |
| `tests/utility/server-entry.test.ts`                         | IPC handshake, graceful shutdown drain, parent-death exit                                                           |
| `tests/unit/scaffold.test.ts`                                | Smoke: `OK_DIR` (core) and `bootServer` (server) imports resolve from desktop                                       |

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

Expected output matches `targetFuses` in `scripts/target-fuses.mjs` (shared source of truth imported by both `afterPack.mjs` and `afterSign.mjs`): RunAsNode=Disabled, EnableCookieEncryption=Enabled, EnableNodeOptionsEnvironmentVariable=Disabled, EnableNodeCliInspectArguments=Enabled, EnableEmbeddedAsarIntegrityValidation=Enabled, OnlyLoadAppFromAsar=Enabled.

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

## Scope boundary

This package is M1 + M2-scaffolding. Work that belongs to M3–M7 is explicitly out of scope — see [`specs/2026-04-11-electron-desktop-app/SPEC.md §14`](../../specs/2026-04-11-electron-desktop-app/SPEC.md) for the milestone definitions and promote triggers. Do not wire `electron-updater` (M3), do not implement the `openknowledge://` protocol handler (M4), do not implement the CLI-on-PATH menu item (M6), and do not populate the MCP first-launch consent dialog (M6) until the spec for the relevant milestone is open.
