---
"@inkeep/open-knowledge-desktop": minor
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat(desktop): M3 — Auto-update (electron-updater + install-on-quit).

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
