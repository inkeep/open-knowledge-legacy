# FU-2: Packaged-build regression taxonomy

**Parent report:** electron-ai-coding-agent-development
**Extends:** §D4 (dev ↔ packaged parity gates) + §E3 (integration test depth)
**Date:** 2026-04-15
**Depth:** Moderate
**Confidence on frequency estimates:** UNCERTAIN/INFERRED — directional, not statistical

## Summary

Surveyed ~65 issues across `electron-userland/electron-builder`, `electron/forge`, and `electron/electron` (date range 2024-04-15 → 2026-04-15) matching strings like "packaged", "works in dev", "production", "native module", "asarUnpack", "fuses", "code sign", "ESM", and "extraResources". The distribution of dev-green/prod-red regressions clusters into roughly nine classes. The single largest class is **native-module resolution inside asar** (~25-30% of surveyed issues) — `Cannot find module 'sharp'`, `better-sqlite3`, `canvas`, `@napi-rs/*` dominating. The second-largest is **dependency-collection / tree-shaking regressions in the packager itself** (~15-20%), where electron-builder drops nested transitive deps from `app.asar` across minor versions. **Code-signing and notarization failures** (~15%) are the third-largest class but are the one class the `--dir` smoke gate does NOT catch — they require full sign+notarize. **Fuses × signing divergence** (Windows signtool undoing fuses post-packaging) is a small but load-bearing class (~3-5%) with severe security consequences.

**Headline for the parent report:** a minimal `electron-builder --dir + Playwright smoke` gate catches an estimated **~65-75% of the surveyed dev-green/prod-red regressions** (asar packing, `extraResources`, path resolution, ESM/CJS boundary, native-ABI-via-`@electron/rebuild`, preload-script-missing). It does NOT catch: code-sign-induced failures, notarization/Gatekeeper blocks, auto-update URL/path divergence once published, and fuses-clobbered-by-signtool. Those require a second, slower gate (full sign+notarize on a schedule, not per-PR). Typed approaches measurably reduce ~3 classes; the other ~6 are environmental.

## Methodology

**Repos queried via `gh search issues`:**
- `electron-userland/electron-builder` — primary source, ~50 issues reviewed
- `electron/forge` — ~12 issues reviewed
- `electron/electron` — queried but returned very few hits matching our strings (upstream issues are mostly not worded as "works in dev, fails in prod")
- `microsoft/vscode`, `desktop/desktop`, `logseq/logseq`, `AFFiNE/AFFiNE`, `obsidianmd/obsidian-releases` — none surfaced matches via the string filters; large-app repos filter regressions into internal labels

**Query strings used:** `works in dev`, `packaged`, `only in production`, `native module`, `asarUnpack`, `fuses`, `extraResources`, `code sign`, `notariz`, `ESM`, `auto-update production`

**Date range:** 2024-04-15 → 2026-04-15 (24-month window to capture a representative sample)

**Selection-bias caveats (explicit):**
- Only reported issues — silent/fixed-in-dev regressions are invisible.
- Skewed toward electron-builder vs. electron-forge (~6x issue volume in the date range).
- Popular native modules (sharp, better-sqlite3, canvas, keytar) dominate because they break most loudly; long-tail native modules undercounted.
- electron-builder 26.0.x → 26.4.x shipped many packaging regressions in 2025-Q4/2026-Q1; this inflates the "dependency-collection regression" class vs. a normal year.
- Excluded: how-to questions, pure NSIS/dmg installer cosmetic bugs.

**Sample size:** ~65 issues surveyed with URL evidence; representative not exhaustive.

## Failure class taxonomy (ranked by observed frequency)

### Class 1: Native-module runtime failure in packaged app — ~25-30%

Symptoms: `Cannot find module '<native>'`, `dlopen` failure, or native binding present on disk but unloadable. Root causes: (a) `@electron/rebuild` not run / run against wrong target, (b) native binding packed inside asar where `.node` binaries can't be `dlopen`'d, (c) pnpm/yarn-workspace hoisting placing the module where the packager doesn't look.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/8970 — "Cannot find module 'sharp'" on Windows only after upgrading to 26.0.11
- https://github.com/electron-userland/electron-builder/issues/8824 — Native Dependency loading Error for package `sqlite-vec`
- https://github.com/electron-userland/electron-builder/issues/9258 — CI=true breaks native module packaging on MacOS
- https://github.com/electron/forge/issues/3902 — Works in dev but errors in prod (sharp + sequelize fails at preload in packaged `.app`)
- https://github.com/electron/forge/issues/3733 — Cannot run packaged app with tedious or mssql package
- https://github.com/electron/forge/issues/3818 — Error occurs when using electron rebuilt with "electron-rebuild"

**Smoke gate catches?** Yes (near-100%) if the smoke scenario exercises the import path.
**Typed approach mitigates?** Partial — typed list of "natives that must be asarUnpacked" helps, but the ABI rebuild step itself is environmental.

### Class 2: Packager dependency-collection / pruning regressions — ~15-20%

electron-builder's own dependency-walk logic drops transitive deps between minor versions. App's `package.json` unchanged, but a nested module is no longer present in `app.asar`.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/9378 — Missing nested dependencies in `app.asar` (`json-schema-traverse` removed, causing runtime crash). Regression 26.2.0 → 26.3.0. Quoted: "The app crashes immediately on macOS… The issue appears only at runtime after packaging — development mode works fine."
- https://github.com/electron-userland/electron-builder/issues/9580 — pnpm hoisted mode: aliased dependencies not resolved after v26.3.1
- https://github.com/electron-userland/electron-builder/issues/9490 — [Regression] Some packages installed via bun no longer get packaged
- https://github.com/electron-userland/electron-builder/issues/9621 — Application entry file missing in app.asar after upgrading to electron-builder@26.8.1
- https://github.com/electron-userland/electron-builder/issues/9641 — Bun node-modules traversal ignores overridden dependency resolution
- https://github.com/electron-userland/electron-builder/issues/9394 — builds broken since v26.3.0

**Smoke gate catches?** Yes — the app literally won't start. This is exactly the bug class `--dir + smoke` is designed for.
**Typed approach mitigates?** No — packager-internal regression, out of app's control. Mitigation is version-pinning the packager and running the smoke gate on lockfile/packager bumps.

### Class 3: Code-signing failure OR post-signing behavior change — ~15%

Works as `--dir` (unsigned), fails after signtool/codesign/notarytool pass. The single class that most evades the cheap smoke gate.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/9529 — macOS Camera & Microphone broken with ad-hoc signing since v26.0.13 (works unsigned, broken post-sign)
- https://github.com/electron-userland/electron-builder/issues/9272 — Windows code signing fails for non-ASCII executable names (Korean)
- https://github.com/electron-userland/electron-builder/issues/9421 — Can't create a build from GitHub Actions with macOS signing
- https://github.com/electron-userland/electron-builder/issues/9065 — Azure Trusted Signing fails for NSIS portable
- https://github.com/electron-userland/electron-builder/issues/9190 — Cannot code sign on Windows arm64
- https://github.com/electron/forge/issues/3754 — Packaged MacOS app fails to ask for permission (misconfigured code signature resources)

**Smoke gate catches?** **No** — requires full sign+notarize to reproduce. Motivating evidence for the parent report's two-gate recommendation.
**Typed approach mitigates?** No — environmental (certificate chain, entitlements, signtool integration).

### Class 4: asarUnpack miss / smartUnpack disagreement — ~10%

Fonts, workers, binary assets, `.node` files, or runtime-loaded resources end up inside asar where native code can't read them.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/9321 — asarUnpack does not respect ignore glob
- https://github.com/electron-userland/electron-builder/issues/9242 — Some files are flagged as `unpack: true` in asar
- https://github.com/electron-userland/electron-builder/issues/9049 — Unable to Replace app.asar.unpacked at Runtime for Versions Above 25.0.0
- https://github.com/electron/forge/issues/3934 — @electron-forge/plugin-auto-unpack-natives does not unpack natives
- https://github.com/electron/forge/issues/4142 — unpack native modules 7.11.1

**Smoke gate catches?** Yes, if the smoke scenario exercises the resource-loading path. If smoke only verifies "window opens", a lazily-loaded font or worker miss escapes.
**Typed approach mitigates?** Partial — typed manifest of runtime-loaded assets catches omissions at build time.

### Class 5: `extraResources` / `extraFiles` misconfiguration — ~8-10%

User-declared extra assets (binaries, scripts, templates) don't land at the expected path in the packaged app, or are missing entirely.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/9004 — extraResources not being packaged if path ends with glob pattern `/**/*`
- https://github.com/electron-userland/electron-builder/issues/8935 — Issue including a custom folder in the Electron installer
- https://github.com/electron-userland/electron-builder/issues/9161 — Application entry file "electron-main.js" not found (`files` glob misses entry)
- https://github.com/electron/forge/issues/3621 — image cannot be resolved when application is packed

**Smoke gate catches?** Yes — any smoke test that exercises the resource path fails immediately.
**Typed approach mitigates?** **Yes (strong fit)** — typed resource manifest (keys → packaged paths) plus typed `getResourcePath(key)` helper means a missing declaration is a TypeScript error. One of the two most typed-mitigable classes.

### Class 6: Path resolution / `app.isPackaged` branch divergence — ~5-8%

`__dirname`, `app.getAppPath()`, and `process.resourcesPath` resolve differently dev vs. packaged. Auto-updater URLs, sentry DSNs, logging paths, user-data paths, and env-dependent config drift.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/8917 — electron-updater uses incorrect user path in packaged application. Striking case: `process.env.USERNAME` still contained the *builder machine's* username after packaging, so the packaged app on an end-user machine tried to write to `C:\Users\aviation\...` instead of `C:\Users\aviationEnjoyer\...`. Pure dev-green/prod-red caused by env-var snapshot leaking into the asar.
- https://github.com/electron-userland/electron-builder/issues/8977 — package.json imports fails after build but works in dev
- https://github.com/electron/forge/issues/3613 — Packaged OSX or Ubuntu app doesn't work correctly if started from another app (cwd/env differ)
- https://github.com/electron-userland/electron-builder/issues/9525 — TypeError: Cannot read properties of undefined (reading 'doLog') — packaged-only

**Smoke gate catches?** Yes for pure path issues. **No** for env-var/user-identity issues (CI machine ≠ real user machine).
**Typed approach mitigates?** **Yes (strong fit)** — typed `Paths` module exposing only explicit keys (`getUserDataPath()`, `getResourcePath()`, `getLogPath()`) plus a lint rule banning raw `__dirname` / `process.env.FOO` in app code collapses the branch-drift class. Second most typed-mitigable class.

### Class 7: ESM / CJS boundary divergence — ~5%

Dev resolves via bundler magic (Vite/webpack), packaged resolves via Node's ESM loader inside asar. `package.json` `"imports"` subpath maps, `"exports"` conditions, top-level-await all behave differently.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/8977 — package.json imports fails after build but works in dev
- https://github.com/electron-userland/electron-builder/issues/9483 — FYI/PSA: ESM-only + Node >22 `engine` upcoming in v27
- https://github.com/electron/forge/issues/3738 — Forge make combined with vite is creating an incomplete asar
- https://github.com/electron/forge/issues/3599 — Optional dependencies excluded with plugin-vite

**Smoke gate catches?** Yes, typically — `import` statements fire at module-load time.
**Typed approach mitigates?** Partial — `verbatimModuleSyntax: true` + strict `exports`/`imports` catches most authoring errors. Bundler-vs-native-ESM divergence is a resolver-level mismatch, not a type-level one.

### Class 8: Fuses × code-sign interaction — ~3-5%

`@electron/fuses` writes security-relevant bits (RunAsNode, EnableNodeCliInspectArguments, OnlyLoadAppFromAsar, EnableEmbeddedAsarIntegrityValidation). Windows signtool post-processing can silently clobber them, leaving a signed binary with insecure fuses.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/9428 — electronFuses corrupted by windows codeSign [unpacked only]. Verified security regression: user shows `@electron/fuses read` before signing (correct fuses) vs. after (fuses flipped back to insecure defaults including `RunAsNode: Enabled`, `EnableEmbeddedAsarIntegrityValidation: Disabled`, `OnlyLoadAppFromAsar: Disabled`). A malicious `app.asar` replacement executes successfully.
- https://github.com/electron-userland/electron-builder/issues/9662 — Electron Fuses via app-builder-lib is v1.8.0, causes mismatch with available Fuses (`strictlyRequireAllFuses`)
- https://github.com/electron/forge/issues/3896 — [MacOS] Notifications not working in packaged app when using FusesPlugin

**Smoke gate catches?** **No** — requires signed build + post-sign fuse verification. Mitigation is a nightly `@electron/fuses read` assertion step.
**Typed approach mitigates?** Partial — typed fuses config ensures the intended state is declared, but doesn't detect clobbering. Requires a post-sign verification step.

### Class 9: Platform/arch cross-build regressions — ~3-5%

Cross-compiling x64 → arm64, universal macOS builds, or Windows-on-arm. Native modules or binaries get the wrong slice.

**Example issues:**
- https://github.com/electron-userland/electron-builder/issues/9298 — Linux build fails with ENOENT, incorrectly seeking `@napi-rs/canvas-android-arm64`
- https://github.com/electron-userland/electron-builder/issues/8677 — ARM64 rebuild package not working - always deploys X86
- https://github.com/electron-userland/electron-builder/issues/9366 — Universal macOS build fails silently when run via pnpm in monorepo workspace
- https://github.com/electron-userland/electron-builder/issues/9636 — Codesign not supporting windows x64 builds on arm64 platform

**Smoke gate catches?** Partial — only if smoke runs on the target arch.
**Typed approach mitigates?** Partial — typed matrix of `(os, arch)` tuples forces explicit declaration, but the rebuild/bundle step is environmental.

### Long-tail classes (<3% each)

- **Auto-updater in packaged-only:** https://github.com/electron-userland/electron-builder/issues/9207 (403s fetching latest.yml), https://github.com/electron-userland/electron-builder/issues/8436 (inconsistent behavior)
- **Preload script missing/wrong path:** https://github.com/electron/forge/issues/3964
- **Silent packaged failures (no console, process exits):** https://github.com/electron-userland/electron-builder/issues/9387, https://github.com/electron-userland/electron-builder/issues/9602 — devastating for debugging; motivates the parent report's logging-to-disk-in-packaged recommendation
- **Entitlements/sandboxing:** https://github.com/electron-userland/electron-builder/issues/9442 (system-extension.install entitlement crashes app)
- **Symlink handling in packager:** https://github.com/electron-userland/electron-builder/issues/8858

## What the packaged-smoke CI gate catches vs. misses

| Class                             | ~Share | Caught by `--dir` + Playwright smoke?     | Requires full sign+notarize? |
| --------------------------------- | ------ | ----------------------------------------- | ---------------------------- |
| 1. Native-module runtime          | 25-30% | Yes                                       | No                           |
| 2. Packager dep-collection        | 15-20% | Yes                                       | No                           |
| 3. Code-signing / post-sign break | 15%    | **No**                                    | **Yes**                      |
| 4. asarUnpack miss                | 10%    | Yes (if smoke exercises resource)         | No                           |
| 5. extraResources misconfigured   | 8-10%  | Yes                                       | No                           |
| 6. Path / isPackaged branch       | 5-8%   | Mostly yes; env-user issues slip          | Partial                      |
| 7. ESM/CJS boundary               | 5%     | Yes                                       | No                           |
| 8. Fuses × signtool clobber       | 3-5%   | **No**                                    | **Yes** (+ fuse verify step) |
| 9. Cross-arch builds              | 3-5%   | Partial (must run on target arch)         | No                           |
| Long-tail (updater, preload, …)  | ~10%   | Varies                                    | Updater: partial             |

**Aggregate:** the cheap `--dir + smoke` gate catches an estimated **~65-75%** of surveyed dev-green/prod-red regressions. The remaining ~25-35% splits across signing, fuses-post-sign, auto-update-at-runtime, cross-arch-on-wrong-host, and env-user divergence — all requiring either a full signed build or a real end-user environment.

## What typed approaches mitigate

Ranked by leverage:

1. **Class 5 (extraResources) — HIGH leverage.** Typed resource manifest (keys → packaged paths) + typed `getResourcePath(key)` helper means every app-code path must have a corresponding declaration. Missing-resource bugs become compile-time errors.

2. **Class 6 (path / isPackaged) — HIGH leverage.** Typed `Paths` module exposing only named keys (`userData`, `logs`, `resources`, `appRoot`) + typed `env` loader (with `isPackaged`-branched defaults) + lint rule banning raw `__dirname` / `process.env.FOO` structurally prevents divergence.

3. **Class 7 (ESM/CJS) — MEDIUM.** TypeScript `verbatimModuleSyntax: true` + strict `exports` / `imports` catches most authoring errors. Doesn't prevent bundler-vs-Node-resolver divergence.

4. **Class 1 (native modules) — LOW/partial.** Typed enumeration of native deps documents intent, but ABI rebuild is a build-step concern; types don't reach into `@electron/rebuild`.

5. **Class 4 (asarUnpack) — LOW/partial.** Typed "must-unpack" list helps, but smartUnpack heuristic remains opaque.

**Classes 2, 3, 8, 9 are fundamentally environmental** — packager internals, signtool behavior, OS entitlements, cross-arch runtimes. Types don't help; version-pinning and runtime verification (post-sign fuse read, post-build asar contents audit) do.

## Implications for parent §D4 and §E3

**Proposed replacement text for the "~majority" claim in §D4:**

> Surveyed ~65 issues across `electron/electron`, `electron-userland/electron-builder`, and `electron/forge` in the 2024-04 → 2026-04 window identifies nine recurring failure classes causing dev-green/prod-red regressions (see FU-2). A minimal `electron-builder --dir + Playwright smoke-test` CI gate catches roughly two-thirds to three-quarters of these classes: native-module resolution, packager dep-collection regressions, asarUnpack misses, extraResources misconfig, most path-resolution drift, and ESM/CJS boundary failures. The remaining quarter — code-signing failures, Gatekeeper / notarization blocks, post-sign fuse clobber, auto-update at runtime, and cross-arch build drift — requires a second, slower gate that runs a full sign+notarize and a `@electron/fuses read` verification. This motivates the two-gate recommendation: a cheap per-PR smoke gate that catches the majority of regressions, and a nightly/pre-release signed-gate for the residual class that only appears after notarization.

**Add to §E3 (integration test depth):**

The load-bearing smoke scenarios are NOT "window opens, renders splash." They are: (a) a code path that `require`s one of the app's native modules, (b) a code path that loads a non-trivial `extraResources` asset, (c) a code path that reads `app.getPath('userData')`. A smoke failing to exercise all three misses regressions in Classes 1, 4, 5, and 6.

Typed config + typed paths + typed resource manifest structurally prevents ~25-30% of surveyed regressions (Classes 5 + 6 + partial 7). Combined with a two-gate CI setup, this leaves a narrow residual (fuses clobber, notarization) that is genuinely environmental and must be monitored rather than prevented.

## UNRESOLVED / NOT FOUND

- **VS Code / Logseq / GitHub Desktop internal labels:** their "regression" / "packaged-only" labels don't surface via `gh search` string filters the same way electron-builder issues do. A direct scan of their release notes / triage labels would refine Class 3-5 frequencies — not pursued within scope.
- **Electron upstream (`electron/electron`):** the string filters returned ~zero hits in range. Upstream doesn't frame bugs as "works in dev / fails in prod"; ABI-break-in-packaged regressions are tracked as general bugs. Class 1 frequency is under-estimated if upstream fixes are counted.
- **Share-of-total precision:** all percentages are directional from a ~65-issue sample. A rigorous count would require full labeling of issue bodies against a fixed taxonomy. The ranking is robust; the absolute shares are not.
- **Blog post-mortems:** not pursued — issue-tracker evidence was denser and more primary-source.
- **Obsidian / AFFiNE release notes:** not scanned — release notes rarely catalog dev-green/prod-red bugs (they're fixed before release).

## References

See the issue URLs inline under each class above. Report written 2026-04-15.
