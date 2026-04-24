---
title: M2 — Packaged + signed + notarized DMG (scaffolding + unsigned smoke)
description: Land every config, script, and CI piece so M2's signed-DMG path closes the moment Apple cert procurement finishes. Includes one end-to-end unsigned DMG as a build-pipeline smoke.
tags: [spec, desktop, electron, m2]
status: Implementation Complete — pending review + QA gates
---

# M2 — Packaged + signed + notarized DMG (scaffolding + unsigned smoke)

**Milestone:** M2 of the [Electron desktop app](../2026-04-11-electron-desktop-app/SPEC.md) (`specs/2026-04-11-electron-desktop-app/SPEC.md` §14). Parent spec is authoritative for all D-numbered decisions; this spec scopes the M2 scaffolding PR.

**Author:** Andrew (2026-04-20)
**Status:** Implementation complete, pending review + QA.
**Worktree:** `.claude/worktrees/m2-signed-dmg-scaffolding`.

---

## 1) Problem statement

M1 shipped the Electron dev loop (unsigned, local). M2's definition of done per parent §14 is a Developer-ID-signed, notarized, stapled, fuse-verified Universal DMG that installs on a fresh Mac with no Gatekeeper warning. Apple Developer Program enrollment + Developer ID cert + notary credentials are **in procurement** (1–6 weeks calendar). The gap: none of the signing, notarization, fuse-flip, fuse-verify, or CI infrastructure is wired up. The moment creds land in GitHub secrets, there is no green-ready pipeline to flip on — M2's DOD would sit open for however long that pipeline-build takes on top of the procurement wait.

## 2) Goals

- **G1.** Every piece of config, tooling, script, and CI for the signed-DMG path is in place and verified-where-possible, so M2 closes within minutes of cert arrival — not days.
- **G2.** The sign/notarize/staple/fuse-verify logic is **gated on env vars**: absent creds → graceful fallback to unsigned DMG so the pipeline stays visible and testable during procurement. Present creds → full signed path.
- **G3.** One end-to-end local unsigned DMG proves the build pipeline works up to the sign step (electron-vite build → afterPack fuse flip → electron-builder DMG pack).
- **G4.** Spec §8.9's exact fuse config (six fuses) and D17's paranoid post-sign read-verify are both implemented.
- **G5.** `bun run check` (canonical quality gate) stays green.

## 3) Non-goals

- **NG1.** Producing a **signed** DMG this session — certs not available.
- **NG2.** Closing the bottom two items of M2's DOD ("fresh-Mac install: no Gatekeeper warning", "first-launch Keychain prompt shows CFBundleDisplayName"). These are creds-gated and verified post-procurement.
- **NG3.** Fixing the universal-merge blocker (see §6 Known Gaps) — bun-workspace issue that predates M2 and is not M2-specific. Follow-up PR.
- **NG4.** M3 (auto-update), M4 (URL scheme), M5 (keyring), M6 (MCP wiring), M7 (design-partner build). Parent §14 defines their milestones.

## 4) Scope

One PR. Changes in:

- `packages/desktop/electron-builder.yml` — hook wiring, electron version pin.
- `packages/desktop/package.json` — two new devDeps, two new build scripts.
- `packages/desktop/scripts/afterPack.mjs` — NEW. Flip six fuses per §8.9.
- `packages/desktop/scripts/afterSign.mjs` — NEW. Notarize + staple + fuse verify, gated on env.
- `packages/desktop/README.md` — M2 operational runbook.
- `.github/workflows/desktop-build.yml` — NEW. `workflow_dispatch` mac-DMG build with graceful unsigned fallback.

## 5) Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | `bun run build:mac:unsigned` produces a Universal DMG locally when both native-module arches are present; produces a per-arch DMG with `--arm64` when only the host arch is installed (the current bun workspace state — see §6 Known Gaps). | Run locally; DMG at `packages/desktop/dist-desktop/*.dmg`. |
| AC2 | `afterPack.mjs` flips all six spec §8.9 fuses: RunAsNode=false, EnableCookieEncryption=true, EnableNodeOptionsEnvironmentVariable=false, EnableNodeCliInspectArguments=true, EnableEmbeddedAsarIntegrityValidation=true, OnlyLoadAppFromAsar=true. | `bunx --bun electron-fuses read --app "<path>.app"` on the packaged binary — all six match. |
| AC3 | `afterSign.mjs` gracefully skips notarization when any required env var is missing, logging `skipping notarize — no Apple credentials in env`. Build continues to a DMG. | Observed during local smoke. |
| AC4 | `afterSign.mjs` invokes `@electron/notarize` (which auto-staples), then `xcrun stapler validate`, then `getCurrentFuseWire` assertion against the `targetFuses` map. Any mismatch fails the build loud with a D17 paranoid-check error. | Code inspection. Creds-gated runtime verification deferred. |
| AC5 | The `afterPack` per-arch-temp guard (`appOutDir.endsWith('-temp')` → skip) prevents `@electron/universal` SHA-parity failures on universal builds. | Verified by log output during universal-arch build attempt. |
| AC6 | `electron-builder.yml` pins `electronVersion: "41.2.1"` (avoids bun-workspace "cannot compute electron version" error). | Config inspection + working local build. |
| AC7 | `packages/desktop/package.json` has `@electron/fuses@^2.1.1` + `@electron/notarize@^3.1.1` in devDependencies; has `build:mac` + `build:mac:unsigned` scripts. | Config inspection. |
| AC8 | `.github/workflows/desktop-build.yml` exists with `workflow_dispatch` trigger, `macos-14` runner, all five Apple secrets documented inline in comments, graceful unsigned fallback when secrets absent, DMG + `latest-mac.yml` uploaded as 14-day artifact. | Workflow inspection. CI smoke deferred until user opts to trigger. |
| AC9 | `packages/desktop/README.md` has a new M2 section documenting local smoke commands, signed-build env vars, the universal-merge gap, and the creds-gated DOD items. | Docs inspection. |
| AC10 | `bun run check` green — lint + typecheck + unit + integration + conversion + fidelity all pass. | `bun run check` exit 0. |
| AC11 | No breaking changes to M1 flows — `bun run dev --filter=@inkeep/open-knowledge-desktop` still launches the app end-to-end. | M1 integration tests (`tests/integration/m1-smoke.test.ts` — 78 tests) still pass as part of `bun run check`. |

## 6) Known gaps (documented, not fixed)

### Universal-merge blocker: bun workspace + arch-specific native modules

**Symptom.** `bun run build:mac:unsigned` (without `--arm64`) fails during `@electron/universal.makeUniversalApp`:

> Detected file `Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/keyring-darwin-arm64/keyring.darwin-arm64.node` that's the same in both x64 and arm64 builds and not covered by the x64ArchFiles rule

**Root cause.** `@napi-rs/keyring` distributes prebuilt binaries via optionalDependencies (`@napi-rs/keyring-darwin-arm64`, `@napi-rs/keyring-darwin-x64`, etc.). Bun installs only the host arch's variant. When electron-builder packs both arches for universal merge, each arch pack ends up with the same arm64 `.node` file. `@electron/universal`'s SHA-parity check refuses identical binaries across arches — arch-specific binaries shouldn't be bit-identical.

**Scope of blast.** Universal DMG path is blocked. Per-arch DMG path works (proven this session). `@parcel/watcher` doesn't trip this because `@electron/rebuild` compiles it from source per-arch during electron-builder's rebuild step; only `@napi-rs/keyring`'s prebuilt-binary pattern is affected.

**Why it's out of scope for M2 scaffolding.** Pre-existing bun-workspace issue — M1's `build:dir` would have hit the same wall if anyone had exercised the universal path. Not introduced by M2 changes. Tracked as a follow-up (§7).

**Workaround shipping in this PR.** README §M2 documents the `--arm64` per-arch local smoke workflow and calls out the gap in CI. CI workflow will hit the same blocker until the follow-up lands.

## 7) Follow-up work

| Ref | Work | Owner |
|---|---|---|
| FU-1 | Resolve universal-merge blocker. Options: (a) force-install both darwin arches of `@napi-rs/keyring` via package.json, (b) `scripts/prepare-universal.mjs` that extracts tarballs into `node_modules/@napi-rs/` without recording them in package.json. (b) is cleaner. | Andrew |
| FU-2 | Once certs land: add the five secrets to GitHub repo settings, trigger `desktop-build` workflow, verify signed+notarized+stapled+fuse-verified DMG uploads as artifact. No `mac.notarize` key needed — the custom `afterSign.mjs` hook handles notarization per D1. | Andrew + ops |
| FU-3 | Fresh-Mac install test against signed DMG — close bottom two items of parent §14 M2 DOD. | Andrew |
| FU-4 | Add path-gated `pull_request` trigger to `.github/workflows/desktop-build.yml` once the signed path has been green at least once (avoid burning macOS minutes on unrelated PRs). | Andrew |

## 8) Test plan

### Automated (part of `bun run check`)

- Lint + typecheck: surface any syntax / import issues in the new .mjs scripts.
- Unit tests: 78 existing desktop tests unchanged by this PR; verify they still pass.

### Local smoke (this session, required)

1. `bun install` — installs `@electron/fuses` + `@electron/notarize` devDeps.
2. `bun run --filter=@inkeep/open-knowledge-app build && bun run --filter=@inkeep/open-knowledge build` — populates `packages/cli/dist/public/` (extraResources source).
3. `cd packages/desktop && bunx electron-builder --mac --arm64 -c.mac.identity=null` — unsigned per-arch smoke.
4. `bunx --bun electron-fuses read --app "dist-desktop/mac-arm64/Open Knowledge.app"` — verify all six fuses match AC2.
5. Mount DMG, drag to Applications, `xattr -cr`, open — confirm M1 dev loop works in packaged mode.
6. `bun run check` — canonical gate green.

### CI smoke (deferred, user-triggered)

7. `gh workflow run desktop-build.yml` from the branch — expect unsigned DMG artifact upload.

### Signed-path verification (deferred, post-procurement)

8. Export the five Apple secrets, re-run `bun run build:mac` → signed DMG with notarization + stapler + fuse-verify success.
9. Add secrets to GitHub → re-run workflow → signed+notarized CI artifact.
10. Fresh-Mac install smoke (parent §14 DOD).

## 9) Decisions

- **D1.** Custom `afterSign` hook (not `mac.notarize: true` built-in) per parent §8.9 explicit prescription. Setting both would double-notarize.
- **D2.** `@electron/notarize` is called for notarization (it auto-staples); `xcrun stapler validate` added as explicit sanity check; `@electron/fuses.getCurrentFuseWire` for paranoid D17 read-verify. The three-call sequence is intentional.
- **D3.** `workflow_dispatch`-only trigger on the CI workflow. `pull_request` trigger deferred to FU-4 because macOS runner minutes cost ~10× ubuntu.
- **D4.** Fuses are flipped on the **merged universal app** only (skip per-arch temps). `@electron/fuses` v2 handles fat Mach-O binaries correctly; flipping per-arch perturbs `_CodeSignature/CodeResources` differently and breaks `@electron/universal`'s SHA-parity check.
- **D5.** `resetAdHocDarwinSignature: true` on `flipFuses` — Electron ships with an ad-hoc Darwin signature; flipping fuses invalidates it; this flag keeps the binary in a valid ad-hoc-signed state until electron-builder re-signs with Developer ID.
- **D6.** `electronVersion` pinned as exact string (not caret) — electron-builder's auto-version-detection fails under bun's workspace hoisting. Reference: [electron-userland/electron-builder#3984](https://github.com/electron-userland/electron-builder/issues/3984).
- **D7.** README flags universal-merge gap in the M2 section rather than silently leaving the command broken — future agents and humans need to know the workaround.

## 10) References

- Parent spec: [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../2026-04-11-electron-desktop-app/SPEC.md) — D17, D29, §8.9, §14 M2 definition.
- Parent §12 Assumptions — Apple Developer Program + cert + notary creds (in procurement).
- `@electron/fuses` v2: <https://github.com/electron/fuses>
- `@electron/notarize` v3: <https://github.com/electron/notarize>
- `@electron/universal` SHA-parity invariant: `node_modules/@electron/universal/src/index.ts:155` + `:181`.
