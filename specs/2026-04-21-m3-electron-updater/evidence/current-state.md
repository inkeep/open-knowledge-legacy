---
title: Current state — M3 surface area
description: Factual findings from code traces at baseline commit 91ae79c4. What exists, what's missing, what's decided.
tags: [evidence, m3, desktop, electron]
sources:
  - packages/desktop/package.json
  - packages/desktop/electron-builder.yml
  - .github/workflows/desktop-build.yml
  - .github/workflows/release.yml
  - packages/desktop/README.md
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/main/window-manager.ts
  - packages/desktop/src/main/navigator-window.ts
---
# Current state — M3 surface area

Baseline: commit `91ae79c4` on `main` (2026-04-21).

## What exists (M1 + M2 scaffolding shipped)

### `packages/desktop/package.json`

- `name: "@inkeep/open-knowledge-desktop"`, `private: true`, `version: "0.0.0"`.
- Dependencies: `@inkeep/open-knowledge-core` (workspace), `@inkeep/open-knowledge-server` (workspace), `@napi-rs/keyring@^1.2.0`.
- devDependencies include: `@electron/fuses@^2.1.1`, `@electron/notarize@^3.1.1`, `electron@41.2.1`, `electron-builder@^26.9.0`, `electron-vite@^5.0.0`.
- **`electron-updater` is NOT present.** No dep, no devDep.
- Scripts: `dev`, `build:desktop`, `build:dir`, `build:mac`, `build:mac:unsigned`, `postinstall`, `rebuild:native`, `typecheck`, `test`. No `release:*` scripts.

### `packages/desktop/electron-builder.yml`

- `appId: com.inkeep.open-knowledge`
- `mac.target: [{ target: dmg, arch: [universal] }]`
- `hardenedRuntime: true`, `entitlements: build/entitlements.mac.plist`
- `afterPack: scripts/afterPack.mjs` (fuses flip)
- `afterSign: scripts/afterSign.mjs` (notarize + staple + fuse verify)
- **`publish` block IS already configured:**
  ```yaml
  publish:
    - provider: github
      owner: inkeep
      repo: open-knowledge
  ```
- `protocols:` declares `openknowledge` URL scheme (for M4, unused today).

### `.github/workflows/desktop-build.yml`

- Trigger: `workflow_dispatch` only.
- Runner: `macos-14` (Apple Silicon). Timeout: 45 min.
- Signed-vs-unsigned detection via `CSC_LINK` presence; gates all APPLE\_\* creds on `signmode == 'signed'`.
- Uploads DMG + `latest-mac.yml` + `.dmg.blockmap` as a workflow artifact (14-day retention), name encodes `signed`/`unsigned` and SHA.
- **Does NOT publish to GitHub Releases.** No `gh release upload`, no `release_id` passed to electron-builder.
- **No tag trigger.** No `push.tags: ['desktop-v*']` or similar.
- `GH_TOKEN` explicitly NOT passed — comment says "Release automation is M7."

### `.github/workflows/release.yml`

- Trigger: `workflow_dispatch` OR `push.branches: [main]` with path filter on `.changeset/**` + `packages/**`.
- Quality gates: `lint` + `test` matrix (typecheck, test, test:integration, test:conversion, test:fidelity).
- `release` job: changesets publishes npm packages (OIDC trusted publishing), then creates GitHub Release via `gh release create "v${VERSION}"`.
- **Private packages (`private: true`) have their `package.json` version + `CHANGELOG.md` updated by `changeset version`, but are skipped by `changeset publish` (no npm upload).** Per [changesets config-file-options docs](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md), default `version: true` updates private packages. Verified on `origin/changeset-release/main`: `packages/desktop/package.json` → `"version": "0.3.0"`, `packages/desktop/CHANGELOG.md` → `## 0.3.0`. A private package in a `fixed` group gets bumped lockstep with peers (F9 audit corrected earlier draft claim).
- Release title format: `YYYY-MM-DD`. Tag format: `v${VERSION}` (SemVer from npm's changeset).
- **No DMG attachment step.** The created Release has no macOS assets.

### `packages/desktop/src/main/index.ts`

- App lifecycle: single-instance lock, menu bar, `runClean` on boot, window-manager + navigator-window wiring.
- **No `autoUpdater` import, no `checkForUpdates`, no `update-downloaded` handler.**

### `packages/desktop/README.md:209`

> This package is M1 + M2-scaffolding. Work that belongs to M3–M7 is explicitly out of scope — see [`specs/2026-04-11-electron-desktop-app/SPEC.md §14`](../../specs/2026-04-11-electron-desktop-app/SPEC.md) for the milestone definitions and promote triggers. **Do not wire `electron-updater` (M3)**, do not implement the `openknowledge://` protocol handler (M4), do not implement the CLI-on-PATH menu item (M6), and do not populate the MCP first-launch consent dialog (M6) until the spec for the relevant milestone is open.

Fence explicitly reserved for M3.

## What's missing (M3 surface)

| Surface                                                                                | Status        |
| -------------------------------------------------------------------------------------- | ------------- |
| `electron-updater` npm dep                                                             | NOT installed |
| Main-process autoUpdater wiring (setFeedURL / event handlers / install-on-quit enable) | NOT written   |
| Release pipeline attaching DMG + `latest-mac.yml` to a GitHub Release                  | NOT wired     |
| Tag-triggered build workflow                                                           | NOT present   |
| Desktop version bootstrap (0.0.0 → 0.1.0)                                              | NOT done      |
| Update-downloaded toast in renderer                                                    | NOT written   |
| "What's new" post-update toast                                                         | NOT written   |
| IPC channels for update events                                                         | NOT defined   |
| Dev-mode dry-run smoke harness                                                         | NOT written   |
| J7a failure-mode handler code                                                          | NOT written   |
| Structured `[updater]` logging                                                         | NOT written   |

## What's blocked (upstream gate)

| Blocker                                                                      | Source     | Impact on M3                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer Program + Developer ID cert + notary creds in GitHub secrets | M2 §7 FU-2 | M3 end-state smoke (real silent upgrade) cannot run without two signed+notarized DMGs.                                                                                           |
| `@napi-rs/keyring` prebuilt-binary universal-merge SHA-parity gap            | M2 §6 FU-1 | `build:mac` (signed, universal) fails at `@electron/universal.makeUniversalApp`. Per-arch DMG workaround produces a non-universal artifact — not shippable for mixed-chip users. |

## What's decided in parent spec (inherited LOCKED)

From `specs/2026-04-11-electron-desktop-app/SPEC.md` §8.10 + §6 J6 + §14 M3:

- `autoUpdater.autoDownload = true` (D-implicit via J6 step 2 "downloader starts in background").
- `autoUpdater.autoInstallOnAppQuit = true` (D-explicit in §8.10).
- `autoUpdater.channel = 'latest'` (D-explicit in §8.10; beta channel is NG3).
- Provider: GitHub Releases (`provider: github, owner: inkeep, repo: open-knowledge`).
- No dialog, no nag (D-explicit in §6 J6: "Not Slack's 'Restart now' nag").
- On update-downloaded: silent. Install on next quit via `before-quit` hook.
- Failure J7a: download fails / installer corrupts → log, retry next launch, no user-visible breakage.
