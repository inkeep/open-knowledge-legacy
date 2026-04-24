---
title: M3 spec — audit findings
description: Cold-reader audit of SPEC.md — coherence + factual verification. Findings only; does not propose fixes beyond suggested resolutions.
tags: [spec, meta, audit, m3]
---
# Audit Findings

**Artifact:** [[specs/2026-04-21-m3-electron-updater/SPEC]]
**Audit date:** 2026-04-21
**Total findings:** 18 (7 High, 8 Medium, 3 Low)

Related artifacts read: [[specs/2026-04-21-m3-electron-updater/evidence/current-state]], [[specs/2026-04-21-m3-electron-updater/evidence/electron-updater-api]], [[specs/2026-04-21-m3-electron-updater/meta/_changelog]], [[specs/2026-04-11-electron-desktop-app/SPEC]] (§6 J6, §7 J7a, §8.10, §14 M3, D40, D38, D47), [[specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC]].

Codebase traces confirmed against commit `91ae79c4` (main tip at baseline).

---

## High Severity

### [H] F1. Scope names wrong IPC file — should be `ipc-events.ts`, not `ipc-channels.ts`

**Category:** COHERENCE / FACTUAL
**Source:** L4 (evidence-synthesis) + T1 (own codebase)
**Location:** SPEC.md §4 Scope, bullet 4
**Current text:** "`packages/desktop/src/shared/ipc-channels.ts` — new channels: `update:downloaded`, `update:what-s-new`, `update:error` (if needed on renderer)."
**Issue:** The three update channels are main→renderer *events* (push/broadcast) — by the repo's own convention, those live in `ipc-events.ts`'s `EventChannels` map, not `ipc-channels.ts`'s `RequestChannels` map. `ipc-channels.ts` is the *request/response* surface (see its file header: "Typed IPC request channel map (renderer → main, request/response pattern)"). `ipc-events.ts` is the *event* surface (file header: "Typed IPC event channels (main → renderer, push/broadcast pattern)"). The existing `'ok:project:switched'` + `'ok:menu-action'` events live in `ipc-events.ts` for exactly this reason.
**Evidence:** `packages/desktop/src/shared/ipc-channels.ts:1-14` and `packages/desktop/src/shared/ipc-events.ts:1-24`. Also the SPEC's own channel names use the `ok:` prefix convention (`update:downloaded`, etc.) — this is main→renderer dispatch.
**Status:** INCOHERENT
**Suggested resolution:** Rename the §4 Scope bullet to `packages/desktop/src/shared/ipc-events.ts`. Also note that `EventChannels` entries don't use `args` — they use `payload`. The AC2 naming scheme `update:downloaded` / `update:what-s-new` / `update:error` should also be prefixed `ok:` per repo convention (e.g. `ok:update:downloaded`) to grep uniformly with existing channels.

### [H] F2. AC10 / D10 wire update check to `createNavigatorWindow()`, but Navigator doesn't always open

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction) + T1 (codebase)
**Location:** AC10, D10
**Current text:** "First check fires after `app.whenReady()` + `createNavigatorWindow()`." (AC10 / D10)
**Issue:** `packages/desktop/src/main/index.ts:405-421` boots Navigator only when Option is held OR `lastOpenedProject` is null/missing. On the common path (lastOpenedProject exists, no Option held), `openProjectOrFallbackToNavigator()` is called — Navigator is NOT created. Gating the update check on `createNavigatorWindow()` would skip the check entirely on the most common boot path.
**Evidence:** `packages/desktop/src/main/index.ts:416-420` — primary branch `if (appState.lastOpenedProject && !optionHeld && existsSync(appState.lastOpenedProject)) { void openProjectOrFallbackToNavigator(...) } else { openNavigator(); }`
**Status:** INCOHERENT
**Suggested resolution:** Reword AC10 + D10 to "First check fires after `app.whenReady()` once either Navigator or a project editor window has been requested — i.e. at the end of the `app.whenReady().then(...)` handler, not gated on Navigator specifically." Alternatively: "after initial window creation (Navigator OR project editor)." The point is: the updater check should be orthogonal to which window opens first, anchored to `whenReady` + "ready to serve real UI."

### [H] F3. AC6/AC7 depend on `electron-store`, which is not an installed dep and not in §4 Scope

**Category:** COHERENCE / FACTUAL
**Source:** L1 + T1 (codebase)
**Location:** AC6, AC7, D11
**Current text:** "tracked via `version-pending-install` key in `electron-store`" (AC6), "tracked via `last-seen-version` key in `electron-store`" (AC7), "tracked via version-pending-install key in electron-store" (D11).
**Issue:** `electron-store` is not installed — no entry in `packages/desktop/package.json`. The actual main-process persistence is a hand-rolled `state.json` atomic writer in `packages/desktop/src/main/state-store.ts` (despite CLAUDE.md + README.md mislabelling it as "electron-store wrapper" — pre-existing doc drift, not M3's bug). §4 Scope does NOT list `electron-store` as a dep to add, nor does it list `state-store.ts` as a file to extend. This leaves the persistence strategy ambiguous at implementation time.
**Evidence:** `packages/desktop/package.json:18-35` (no electron-store). `packages/desktop/src/main/state-store.ts:13-35` (AppState = `{ recentProjects, lastOpenedProject }` — no version state). `/Users/andrew/Documents/code/open-knowledge/CLAUDE.md` line \~690 "state-store.ts — electron-store wrapper for recents + window bounds" is inaccurate for the shipped M1 code.
**Status:** INCOHERENT (scope + dependency gap)
**Suggested resolution:** Either (a) add `electron-store` as a new runtime dep in §4 Scope + list state keys explicitly, OR (b) extend `AppState` in `state-store.ts` with `versionPendingInstall: string | null` + `lastSeenVersion: string | null` and list `state-store.ts` in §4 Scope. Option (b) is lower-risk and matches the existing pattern. The pre-existing README/CLAUDE.md "electron-store" language should also be surfaced as a corrigendum for later cleanup (not M3's fix).

### [H] F4. `bridge-contract.ts` changes are implied by preload updates but not listed in scope

**Category:** COHERENCE
**Source:** L1 (missing file in scope) + T1
**Location:** SPEC.md §4 Scope
**Issue:** The scope lists `packages/desktop/src/preload/index.ts — expose `onUpdateDownloaded`+`onWhatsNew` listener wrappers`. But those methods are typed on the `OkDesktopBridge` interface, which lives in TWO places per CLAUDE.md's deliberate-duplication pattern: `packages/core/src/desktop-bridge.ts` (documentation anchor) and `packages/desktop/src/shared/bridge-contract.ts` (runtime consumer). Adding methods to the preload bridge without updating either file fails type-check against `OkDesktopBridge`.
**Evidence:** `packages/desktop/src/preload/index.ts:23,52-90` (type-checked against `OkDesktopBridge`). CLAUDE.md section on Package: desktop: "desktop's runtime consumer is a duplicated copy in `packages/desktop/src/shared/bridge-contract.ts` (see Package: desktop for why the duplication is deliberate)."
**Status:** INCOHERENT
**Suggested resolution:** Add two scope bullets: `packages/desktop/src/shared/bridge-contract.ts — extend OkDesktopBridge with onUpdateDownloaded + onWhatsNew listener methods` AND `packages/core/src/desktop-bridge.ts — same (canonical documentation anchor).` These are paired per CLAUDE.md's duplication directive.

### [H] F5. Toast B copy contradicts itself across AC7 / D3 / D9 / D11

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + L5 (summary coherence)
**Location:** AC7, D3, D9, D11
**Current texts (all four variants):**

- AC7: `"Updated to v${VERSION} — see what's new"`
- D9: `"Updated to v${VERSION} — see what's new"` (matches AC7)
- D11: `"Updated to v\{X}"` (parenthetical comment in description)
- D3: `"What's new in v\{X}"` (in notification-layer description)

**Issue:** Four references to "Toast B" use three different strings. D3's `"What's new in v\{X}"` conflicts with the decision captured in D9/AC7.
**Evidence:** Lines 79 (AC7), 145 (D9), 153 (D11), 162 (D3) of SPEC.md.
**Status:** INCOHERENT
**Suggested resolution:** Pick one string (AC7/D9 text reads most naturally in English). Update D3 and D11 to match, or add a sentence "canonical Toast B copy is defined in D9 — other references are abbreviated." Also: D3's descriptor "auto-dismiss after N seconds (TBD via investigation)" is superseded by D11's `duration: Infinity` — D3 should note "superseded by D11" inline since that value never reached a TBD investigation; it was resolved in the same decision batch.

### [H] F6. Evidence file line numbers are systematically wrong for the declared electron-updater version

**Category:** FACTUAL
**Source:** T3 (3P dependencies — primary source verification via raw GitHub)
**Location:** `evidence/electron-updater-api.md` §1-§4
**Issue:** The evidence document claims source-line citations against "`electron-userland/electron-builder@master`" but the line numbers match no checkable version — not master, not v26.0.10 (closest to electron-builder `^26.9.0` in package.json). Spot-checking against v26.0.10 and master:

| Claim in evidence                                          | Evidence cites | master actual | v26.0.10 actual |
| ---------------------------------------------------------- | -------------- | ------------- | --------------- |
| `AppUpdaterEvents` type                                    | lines 50-59    | 31-40         | 29-37           |
| `autoDownload = true` default                              | line 72        | 44            | 52              |
| `isUpdaterActive` / `isPackaged` gate                      | lines 429-438  | 188-196       | 238-246         |
| `emit("checking-for-update")`                              | line 441       | —             | 312             |
| `emit("update-available")`                                 | line 463       | —             | 330             |
| `emit("update-not-available")`                             | line 454       | —             | 326             |
| `ERR_UPDATER_INVALID_CHANNEL`                              | lines 331, 335 | —             | 191, 194        |
| `ERR_UPDATER_INVALID_VERSION`                              | lines 261, 541 | —             | 157, 383        |
| `download-progress` listenerCount guard                    | line 808       | —             | 689-691         |
| `findFile(files, "zip", ["pkg", "dmg"])` (`MacUpdater.ts`) | line 89        | 134           | \~107           |
| `Cannot pipe` error                                        | \~195          | 171           | —               |

**Evidence:** Verified via `WebFetch` against both `blob/master/packages/electron-updater/src/AppUpdater.ts` and `raw.githubusercontent.com/.../v26.0.10/packages/electron-updater/src/AppUpdater.ts`. The facts themselves (events exist, codes exist, guards exist) are correct; the line numbers are load-bearing only as traceability aids.
**Status:** STALE / imprecise
**Suggested resolution:** Two paths: (a) re-run the evidence-gathering against the specific version the repo will pin to (AC1 requires an exact version, so this is mandatory once the version is chosen) — re-cite with v-prefixed URLs (`blob/v<X.Y.Z>/...`) so line numbers survive master churn. (b) Drop line numbers and cite file path + symbol name only (`AppUpdater.ts#AppUpdaterEvents`), which is more stable but less precise. SPEC.md §4 scope bullet for `electron-builder.yml` also cites `MacUpdater.ts:89` — same fix.

### [H] F7. "electron-builder publishes on GH_TOKEN alone" is an incomplete assumption (A1)

**Category:** FACTUAL
**Source:** T3 + T4 (primary source + web docs)
**Location:** SPEC.md §9 A1
**Current text:** "`electron-builder.yml`'s existing `publish: { provider: github, owner: inkeep, repo: open-knowledge }` entry is authoritative and sufficient — no additional `publish` config needed beyond a GH\_TOKEN in CI."
**Issue:** electron-builder uploads to GitHub Releases only when `--publish` is specified (CLI flag or configuration). Per [https://www.electron.build/publish](https://www.electron.build/publish): "Running via `npm run release` → publishes always", "Git tag detected in CI → publishes on tag", "CI environment detected → publishes to draft releases" — plus a deprecation notice: "This implicit publishing behavior is deprecated and will be disabled in electron-builder v27. Explicit publish configuration is now recommended." Neither the current `packages/desktop/package.json` `build:mac` script nor `electron-builder.yml` specifies `--publish`. An M3 release workflow must either (a) invoke `electron-builder --mac --publish always` explicitly, (b) set `CI=true` + rely on auto-detect until v27, or (c) invoke electron-builder without `--publish` and do a separate `gh release upload` pass. §4/AC5/D8 are silent on which strategy is chosen. A1 overclaims sufficiency.
**Evidence:** [https://www.electron.build/publish](https://www.electron.build/publish) ("How --publish Flags Work" section); `packages/desktop/package.json:7-17` (build:mac script has no publish flag); `.github/workflows/desktop-build.yml:160-168` (current M2 script).
**Status:** CONTRADICTED
**Suggested resolution:** Tighten A1 to name the mechanism, e.g. "A1. The release workflow invokes `electron-builder --mac --publish always` with `GH_TOKEN` set in env; this is sufficient to upload `.dmg`, `.dmg.blockmap`, `.zip`, `.zip.blockmap`, and `latest-mac.yml` to the GitHub Release matching `process.env.GITHUB_REF` tag without any additional `gh release upload` step." Or choose path (c) and cite the explicit `gh release upload` steps. Right now the spec is ambiguous between (a) and (c), which produces different workflow YAML.

---

## Medium Severity

### [M] F8. §4 Scope says tag shape is `desktop-v*`; AC5 and D8 say `v*`

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** SPEC.md §4 (line 64), AC5 (line 77), D8 (line 141)
**Current texts:**

- §4: "Tag-triggered (`desktop-v*`) workflow"
- AC5: "Trigger: `push.tags: ['v*']`"
- D8: "Fires on `push.tags: ['v*']` (matching the tag shape that `release.yml`'s `gh release create "v${VERSION}"` produces)"
  **Issue:** §4 Scope is stale. `release.yml` line 229 creates the tag as `v${VERSION}` (not `desktop-v${VERSION}`), so a `desktop-v*` trigger would never fire. D8's rationale is correct; §4 is wrong.
  **Evidence:** `.github/workflows/release.yml:229` — `gh release create "v${VERSION}"`.
  **Status:** INCOHERENT
  **Suggested resolution:** Update §4 line 64 to `v*` and drop the `desktop-v*` reference.

### [M] F9. D7 rationale assumes "changesets skips private packages" — evidence file says the same — but both misread the upstream behavior

**Category:** FACTUAL
**Source:** T3 + T4 (primary-source verification)
**Location:** `evidence/current-state.md` "`.github/workflows/release.yml`" section; D7 resolution reasoning
**Current text (evidence file):** "Private packages (`private: true`) are skipped by changesets. `@inkeep/open-knowledge-desktop` is `private: true`, so it is NOT versioned or published through this flow."
**Issue:** changesets by default VERSIONS private packages (it updates `package.json` + `CHANGELOG.md`) — it only skips npm publishing for them. The pending `origin/changeset-release/main` branch confirms this: `packages/desktop/CHANGELOG.md` is present with `## 0.3.0`, and `packages/desktop/package.json` was updated to `"version": "0.3.0"` in the Version Packages commit. D7's *intent* ("sync naturally via fixed group") is correct and aligns with what changesets actually does — but the rationale cited in `evidence/current-state.md` (that changesets "skips" private packages) is factually wrong, which is confusing on re-read.
**Evidence:** [https://github.com/changesets/changesets/blob/main/docs/config-file-options.md](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md) — "When `version` is set to `true`, Changesets will update the version for private packages" (default: true). Also verified directly: `git show origin/changeset-release/main:packages/desktop/package.json` → `"version": "0.3.0"`; `git show origin/changeset-release/main:packages/desktop/CHANGELOG.md` → `## 0.3.0`.
**Status:** CONTRADICTED (rationale) but CORRECT (decision)
**Suggested resolution:** Correct the evidence file's claim to "Private packages like `@inkeep/open-knowledge-desktop` have their `package.json` version + CHANGELOG.md updated by `changeset version`, but are skipped by `changeset publish` (no npm upload). A private package in a `fixed` group gets bumped in lockstep with its peers." D7's decision stands; its premise needs correcting.

### [M] F10. §1 Problem statement describes the `.zip` gap as "M2 deviated" but M2's choice predated M3's discovery

**Category:** COHERENCE / L4 (evidence-synthesis fidelity)
**Source:** L4 + cross-read of M2 SPEC
**Location:** `evidence/electron-updater-api.md` §3 ("M2 deviated") and `meta/_changelog.md` ("M2 deviated")
**Current text:** "electron-builder's documented default is `["dmg", "zip"]` — M2 deviated. SPEC §4 scope updated."
**Issue:** M2's [[specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC]] is about scaffolding the signed-DMG pipeline; auto-update was out of scope (NG4: "M3 (auto-update)... are not M2-specific"). M2 didn't "deviate" — it only needed DMG because M2's DOD is "fresh-Mac install works." Calling it a deviation implies M2 should have known; in context, M3 is the first consumer that needs `.zip`. This is a narrative-tone issue rather than a factual one, but it frames the fix as remediating M2 rather than completing M3's scope.
**Evidence:** M2 SPEC §4 lists only `electron-builder.yml` changes for fuses + afterSign + afterPack — no `.zip` target mention; M2 SPEC §3 NG3 defers to follow-up.
**Status:** INCOHERENT (characterization, not fact)
**Suggested resolution:** Reword "M2 deviated" to "M2 shipped `.dmg` only because auto-update was out-of-scope; M3 is the first consumer that needs `.zip`, so the scope delta lands here." The D6 rationale already phrases this more neutrally — the evidence/changelog language is the only mismatch.

### [M] F11. §1 claim "electron-updater signature-verifies every update against the installed `.app`'s signing identity" slightly misattributes the verification

**Category:** FACTUAL
**Source:** L4 (evidence-synthesis fidelity) + T3
**Location:** SPEC.md §1 Complication paragraph
**Current text:** "because electron-updater signature-verifies every update against the installed `.app`'s signing identity, the end-state smoke... requires **two** signed+notarized+released DMGs"
**Issue:** Per the evidence file's own §2: "`MacUpdater.ts` does **no** code-signature validation itself. All signature checks happen inside Electron's native `autoUpdater` (Squirrel.Mac)." The behavioral outcome is the same (two signed DMGs are needed), but attributing the check to electron-updater is imprecise. This matters because if a future reader grep's "electron-updater signature" looking for implementation hooks, they'll find none.
**Evidence:** `evidence/electron-updater-api.md` §2, "Key architectural fact" paragraph.
**Status:** CONTRADICTED (imprecise)
**Suggested resolution:** "because the native Squirrel.Mac framework signature-verifies every update against the installed `.app`'s signing identity..."

### [M] F12. OQ10 resolution on `app.getPath('userData')` missing reference to parent D40 `will-quit` ordering

**Category:** COHERENCE / L4
**Source:** L4 + cross-read of parent spec
**Location:** OQ10
**Current text:** "CC8 shutdown ordering (parent spec) flushes L1/L2 before quit. No open item; documented here for traceability."
**Issue:** The CC8 shutdown ordering is about server-side flushes on the `destroy()` path. On the desktop install-on-quit path, parent D40 is the governing decision: "Shutdown drain gate = `app.on('will-quit', e => e.preventDefault())`... After settled: save `userData/state.json`, run electron-updater staged installer (install-on-quit per J6)." OQ10 is actually gated on D40's `will-quit` ordering, not CC8 directly — because if electron-updater's install fires before `app.getPath('userData')` is safely not-being-written-to, you could get a userData write interrupted by the `.app` swap. OQ10's answer is correct (install swaps the .app bundle, not userData) but the traceability citation is to the wrong decision.
**Evidence:** Parent spec D40 LOCKED 2026-04-17: "After settled: save `userData/state.json`, run electron-updater staged installer"; parent J6 step 6 (line 227) says "On `app.on('before-quit')`, the pending installer is invoked" — this contradicts D40's `will-quit` ordering within the parent itself (see F17 below for pre-existing parent-spec drift).
**Status:** INCOHERENT (weak traceability)
**Suggested resolution:** Add reference to parent D40: "Per parent D40, the staged installer runs AFTER `will-quit` settles and AFTER `state.json` persistence, so userData is quiesced before the `.app` swap." Also consider surfacing parent-spec J6/D40 drift to the parent-spec author.

### [M] F13. AC1 "no caret" is a policy, not a specific version — risks `electron-updater@6.x` vs `@7.x` ambiguity

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** SPEC.md AC1
**Current text:** "`electron-updater` installed as a runtime `dependency` of `@inkeep/open-knowledge-desktop` at an exact version (no caret)."
**Issue:** electron-updater major-version is coupled to electron-builder major-version (both are in the same monorepo). electron-builder is pinned at `^26.9.0` in the desktop package.json. electron-updater's v26 line would be the match, but the spec doesn't name the version. Different major lines have different APIs (e.g. `setFeedURL` signature evolution, `channel` parsing). Leaving "exact version" unspecified means an implementer could pick v25, v26, v27 — and the evidence's line numbers become even more adrift.
**Evidence:** `packages/desktop/package.json:31` pins `electron-builder: ^26.9.0`. electron-updater releases parallel the builder major line. [https://github.com/electron-userland/electron-builder/releases](https://github.com/electron-userland/electron-builder/releases).
**Status:** INCOHERENT (loose conditionality)
**Suggested resolution:** Specify the exact version in AC1 (e.g. "`electron-updater@6.6.4` — paired with electron-builder v26.9.0 per the monorepo's tag alignment"). Also add to §9 Assumptions: "A4. electron-updater v<X.Y.Z> is API-compatible with electron-builder v26.9.0's `latest-mac.yml` shape; verified via the evidence document."

### [M] F14. AC5 workflow trigger expectation may fail because App-token tag-push may still not trigger

**Category:** FACTUAL
**Source:** T4 (web verification) + T1 (codebase reading)
**Location:** AC5 + D8
**Current claim:** `.github/workflows/desktop-release.yml` will trigger on `push.tags: ['v*']` when `release.yml` runs `gh release create "v${VERSION}"`.
**Issue:** `release.yml:229` uses a GitHub App token (`steps.app-token.outputs.token`) for the `gh release create` call, which is specifically designed to trigger downstream workflows — so this WILL likely fire. However, there's a subtle race: `gh release create` creates the release AND tag atomically. The `push.tags` event fires on tag push; `release` event fires on release publish. If the repo has any branch protection or webhook restrictions that intercept App-token pushes, the `push.tags` trigger could be skipped silently. The spec's wait-for-release poll-loop masks this failure mode ("poll `gh release view v${VERSION}` up to 2 min") only if the workflow does trigger. If it doesn't trigger, the poll-loop never runs.
**Evidence:** [https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/trigger-a-workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/trigger-a-workflow): "When you use the repository's `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN`, with the exception of `workflow_dispatch` and `repository_dispatch`, will not create a new workflow run." An App token bypasses this. `release.yml:179-184` creates the App token; `:234` passes it to `GITHUB_TOKEN` env for `gh release create`. This should work, but the spec doesn't call out the dependency on App-token-based tag-push triggering downstream workflows.
**Status:** UNVERIFIABLE at spec-time; load-bearing for AC5
**Suggested resolution:** Add a note to D8 explicitly calling out the dependency: "This trigger depends on `release.yml` using its App-token (not GITHUB\_TOKEN) for `gh release create` — verified at baseline `91ae79c4` (`.github/workflows/release.yml:179-202,229-234`). If that contract changes, the `desktop-release.yml` trigger must be changed to `release` event instead of `push.tags`." Alternatively, use `on: release: types: [published]` which responds to `gh release create` regardless of token source.

### [M] F15. §4 Scope does not list the `.changeset/m3-electron-updater.md` file that AC11 requires

**Category:** COHERENCE
**Source:** L1 + L5 (summary coherence)
**Location:** SPEC.md §4, AC11
**Issue:** AC11 requires `.changeset/m3-electron-updater.md` to exist with `@inkeep/open-knowledge-desktop: minor`. §4 Scope lists "files that change" but omits this file. Readers auditing scope-to-ACs alignment will flag this as either an AC without an implementation step, or a phantom scope miss.
**Evidence:** AC11 text references `.changeset/m3-electron-updater.md`; §4 Scope has no bullet for `.changeset/`.
**Status:** INCOHERENT
**Suggested resolution:** Add to §4 Scope: `.changeset/m3-electron-updater.md — NEW. Declares @inkeep/open-knowledge-desktop: minor (plus any other touched packages in the fixed group) for the changesets fixed-group version bump per D7.`

---

## Low Severity

### [L] F16. Table formatting drift in §8 Open Questions — stray pipe columns

**Category:** COHERENCE / style
**Source:** L5 (summary coherence — readability)
**Location:** SPEC.md §8 Open questions table, rows OQ7 and others
**Current text (row OQ7 — lines \~180):** Has a stray extra `|` column (the notes field got split oddly: "`err.code === 'ERR\_UPDATER\_\*'                                                                                                                                                                           |   | err.code?.startsWith('HTTP\_ERROR\_')`")
**Issue:** The table has 6 columns in the header but some rows render with 7-8 pipes due to escaped `|` inside code-quoted content not being read as text.
**Evidence:** SPEC.md §8 rendering.
**Status:** INCOHERENT (formatting only)
**Suggested resolution:** Rewrite OQ7's notes cell to avoid the literal `|` inside backticks, e.g. `"err.code === 'ERR_UPDATER_*' OR err.code?.startsWith('HTTP_ERROR_')"` with plain `OR`, or wrap the disjunction in a code block outside the table. Non-blocking for implementation but harms readability.

### [L] F17. Parent-spec §6 J6 step 6 references `before-quit`, but D40 supersedes to `will-quit` — and M3 SPEC AC10 says "Cleared on `app.on('before-quit')`"

**Category:** FACTUAL (parent-spec drift, inherited)
**Source:** T1 + cross-read of parent
**Location:** AC10 (M3 SPEC)
**Current text (M3 AC10):** "Cleared on `app.on('before-quit')`"
**Issue:** Parent spec's D40 (LOCKED 2026-04-17) says the shutdown drain uses `will-quit` (not `before-quit`) — and explicitly notes "NOT `before-quit` (fires too early — BrowserWindows still open)." For the update-check interval, clearing on `before-quit` is safe (`before-quit` always fires first), but the choice is inconsistent with the parent's canonical ordering. This is a Low finding because the actual-wrong case would be if M3 relied on `before-quit` happening ONLY AFTER drain — which it doesn't; clearing an interval is idempotent and cheap.
**Evidence:** Parent SPEC.md line 1051 (D40); M3 SPEC AC10. Parent §6 J6 step 6 also says `before-quit` — pre-existing parent-spec drift (J6 wasn't updated when D40 landed). Not M3's fix.
**Status:** INCOHERENT (inherited drift)
**Suggested resolution:** Either align AC10 to `will-quit` for consistency with D40, OR leave as-is with a note "clearing the interval is idempotent across `before-quit`/`will-quit`." Low-severity because the observable behavior is identical.

### [L] F18. "Optional What's new toast" in parent J6 was "optional" but M3 makes it In Scope — not flagged

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** SPEC.md §2 G2
**Issue:** Parent §6 J6 step 7 reads: "Optional 'What's new' toast on first launch post-update." M3 promotes this from "Optional" to "In Scope" (via D3 decision expansion). That's fine — scope can grow — but §2 G2 doesn't flag the delta: "Toast UX satisfies parent §6 J6 'no nag' invariant while giving P1 enough signal." A careful reader comparing M3 against parent J6 would find G2's framing reasonable, but "satisfies" overstates the relationship — the M3 design goes beyond J6's minimum (Toast A promotion from optional→required) rather than merely satisfying it.
**Evidence:** Parent SPEC.md line 228: "Optional 'What's new' toast"; M3 §2 G2 + D3.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Reword G2 slightly: "Toast UX satisfies parent §6 J6 'no nag' invariant and promotes the parent's *optional* 'What's new' toast to an always-shown affordance (D3)." Makes the scope delta explicit rather than implicit.

---

## Confirmed Claims (summary)

**Coherence (all 11 P0 decisions D1-D11 checked):**

- D1 scaffolding-tier scoping is internally consistent with §1 Problem statement resolution.
- D2 Obsidian-strict affordance level aligns with parent J6 "no nag" and with D3 toast design.
- D4 three-tier validation matches evidence §4's three approaches.
- D5 error-routing policy matches evidence §2's ERR\_UPDATER\_*/HTTP\_ERROR\_* catalog and correctly classifies bare Squirrel.Mac errors as silent-retry.
- D6 `.zip` target justification matches electron.build docs ("zip target for macOS is required for Squirrel.Mac").
- D8 tag-triggered workflow uses correct `v*` tag shape (matches `release.yml:229`).
- D9 bare-version-string + Release-body-fetch promotion path correctly cites 60/hr unauth GitHub API limit.
- D10 6h interval + singleton pattern internally consistent (though see F2).
- D11 permanent-until-clicked + show-once tracking internally consistent (but see F3 on electron-store and F5 on copy).

**Factual checks against primary sources:**

- `electron-builder` mac.target default = `dmg+zip` — confirmed at electron.build/mac and electron.build/auto-update.
- macOS auto-update requires signed `.app` — confirmed at electron.build/auto-update.
- `findFile(files, "zip", ["pkg", "dmg"])` exists and is the reason `.zip` is needed — confirmed (line number wrong per F6).
- GitHub API unauth rate limit is 60/hr/IP — confirmed at docs.github.com.
- changesets `fixed` group exists and lists `@inkeep/open-knowledge-desktop` — confirmed at `.changeset/config.json:6-10`.
- `release.yml` creates tag + release atomically with `gh release create "v${VERSION}"` — confirmed at `.github/workflows/release.yml:229`.
- App token used for `gh release create` to enable downstream workflow triggers — confirmed at `release.yml:179-202,233-234`.
- Pending `origin/changeset-release/main` branch has desktop CHANGELOG at 0.3.0 — confirms D7's natural-sync intent works today.
- `packages/desktop/src/main/index.ts` has no `autoUpdater` wiring today (M3 greenfield) — confirmed.
- `sonner` is already a dep of `packages/app` — confirmed at `packages/app/package.json:94`.

**Scope completeness (most items enumerated):**

- `package.json`, `auto-updater.ts`, `index.ts`, `preload/index.ts`, `UpdateToast.tsx`, `main.tsx`, `electron-builder.yml`, `desktop-release.yml`, `smoke-mock-update.mjs`, `auto-updater.test.ts`, `README.md` — all appropriate. Gaps: F1 (wrong IPC file), F4 (bridge-contract.ts), F3 (state-store.ts), F15 (.changeset file).

---

## Unverifiable Claims

- **"App-token tag push reliably triggers downstream workflows"** (F14). Stated behavior is widely documented but depends on the repo's App permissions config — can only be confirmed by test-firing a tag push after M3 lands.
- **"Tier 2 smoke with `setFeedURL(http://localhost:…)` + `forceDevUpdateConfig=true` exercises `GenericProvider`"** (D4, AC8). Plausible per primary sources but no end-to-end test pre-implementation; verified at implementation time.
- **Exact line numbers in v26.9.0** (the version electron-builder is pinned at in desktop/package.json, per `^26.9.0`). All WebFetch checks were against v26.0.10 or master; v26.9.0 tag is reachable on GitHub but we checked v26.0.10 as a conservative proxy. If the implementer pins `electron-updater@6.6.4` (or equivalent v26-aligned version), the correct line numbers must be re-cited from that exact version. F6 covers this.
