# Cluster E: Electron toolchain readiness 2026

**Dimension:** D8
**Date:** 2026-04-15
**Worker:** e-toolchain-readiness

## Summary

The Electron 2026 toolchain has three load-bearing facts a spec author must internalize before picking dependencies:

1. **Electron 41 is stable as of 2026-03-10, current patch is 41.2.0 (2026-04-07).** Chromium 146 / Node.js 24.14.0 / V8 14.6. Supported majors per the 3-version policy are 41, 40, 39. Electron 38 reached EOL on 2026-03-10, simultaneous with 41 GA. 42 ships 2026-05-05.
2. **There are two viable Vite toolchains, not one.** `electron-vite` (community, Alex Wei) ships v5.0.0 stable (2024-12-07) with v6.0.0-beta.1 adding Rolldown support (2025-04-12). `@electron-forge/plugin-vite` is the official Electron-team path but remains marked experimental in Forge v7. Forge v8.0.0 is in alpha (Node 22 + ESM-only). This is the single most load-bearing choice for agent velocity: agents trained on older material will generate outdated configs for whichever is picked.
3. **CVE-2025-55305 (ASAR Integrity Bypass) shipped fixes in Electron 35.7.5 / 36.8.1 / 37.3.1 / 38.0.0-beta.6, and Electron 41 added an integrity-of-the-integrity-data digest that re-signing must regenerate via `@electron/asar` ≥ 4.1.0.** Any new 2026-Q2 app should enable `embeddedAsarIntegrityValidation` + `onlyLoadAppFromAsar` fuses from day one; four things must stay in sync (fuses, Info.plist dict, @electron/asar digest, re-sign).

Secondary findings: `electron-builder@26.9.0` (2025-04-14) has known `files:`/symlink gotchas in monorepos — globstar `**` does not traverse symlinks, and `asarUnpack` drops symlinks silently. The whole `@electron/*` suite (asar 4.2.0, fuses 2.1.1, rebuild 4.0.3, notarize 3.1.1, packager 19.1.0) now requires Node ≥ 22.12.0 and publishes SLSA v1 provenance. Playwright is at 1.59.1 (2025-04-01); `_electron` API stable, no 2025-2026 changes flagged.

Reference apps lag current stable by design: VS Code 1.115.0 runs Electron 39.8.5, GitHub Desktop dev branch pinned at 40.1.0, Notion at 40.8.5, Discord bumped to Electron 37 in Dec 2025. None on 41. Safe production target for a 2026-Q2 spec is **Electron 40.x**, with 41 as an explicit upgrade milestone once patch releases settle.

**Vendor-bias flag:** electron-vite docs and Forge docs both claim maturity; the Electron org's own FAQ positions electron-vite as "experimental testing ground we port from" — self-descriptive, not neutral ground truth.

## Current stable versions (as of 2026-04-15)

| Package | Version | Release date | Source | Confidence |
|---|---|---|---|---|
| Electron (current patch) | 41.2.0 | 2026-04-07 | releases.electronjs.org | CONFIRMED |
| Electron 41 GA | 41.0.0 | 2026-03-10 | electronjs.org/blog/electron-41-0 | CONFIRMED |
| Electron 40 latest | 40.8.5 | 2026-03-26 | releases.electronjs.org | CONFIRMED |
| Electron 39 latest | 39.8.7 | 2026-04-07 | releases.electronjs.org | CONFIRMED |
| Electron 42 (scheduled GA) | 42.0.0 | 2026-05-05 | releases.electronjs.org/schedule | CONFIRMED |
| electron-vite (stable) | 5.0.0 | 2024-12-07 | GitHub releases | CONFIRMED |
| electron-vite (Rolldown beta) | 6.0.0-beta.1 | 2025-04-12 | GitHub CHANGELOG | CONFIRMED |
| @electron-forge/cli (stable) | 7.11.1 | 2025-01-12 | GitHub releases | CONFIRMED |
| @electron-forge/cli (alpha) | 8.0.0-alpha.7 | — | GitHub releases | CONFIRMED |
| electron-builder | 26.9.0 | 2025-04-14 | GitHub releases | CONFIRMED |
| @electron/asar | 4.2.0 | — | registry.npmjs.org | CONFIRMED |
| @electron/fuses | 2.1.1 | — | registry.npmjs.org | CONFIRMED |
| @electron/rebuild | 4.0.3 | — | registry.npmjs.org | CONFIRMED |
| @electron/notarize | 3.1.1 | — | registry.npmjs.org | CONFIRMED |
| @electron/packager | 19.1.0 | — | registry.npmjs.org | CONFIRMED |
| Playwright | 1.59.1 | 2025-04-01 | GitHub releases | CONFIRMED |

**EOL schedule** (CONFIRMED from releases.electronjs.org/schedule):
- Electron 38: EOL 2026-03-10 (past)
- Electron 39: EOL 2026-05-05
- Electron 40: EOL 2026-06-30
- Electron 41: EOL 2026-08-25
- Electron 42: EOL 2026-09-22

### Finding: 3-version support policy creates a narrow production target window
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/docs/latest/tutorial/electron-timelines — "The latest three stable major versions are supported by the Electron team."

**Implications for agent-velocity:** Pin to N-1 (Electron 40) for production; N (41) carries early-patch risk — Electron's own blog recommends "install 41.0.2+ due to high-priority bug fixes post-launch."

## Framework-level landmines

### Finding: electron-vite v6 is a breaking rewrite introducing Rolldown dual-support
**Confidence:** CONFIRMED
**Evidence:** github.com/alex8088/electron-vite CHANGELOG v6.0.0-beta.1: `refactor!: simplify resolve config and isolate user config for sub-builds` + `fix!: compatible with rollupOptions and rolldownOptions`.

**Implications for agent-velocity:** Stable is still v5.0.0 from Dec 2024. Agents generating configs will produce v5 shapes; v6 changes the resolve-config contract. Pin to `^5.0.0` until v6 GA.

### Finding: @electron-forge/plugin-vite is still experimental and has shipped undocumented breaking changes
**Confidence:** CONFIRMED
**Evidence:** electronforge.io/config/plugins/vite marks it experimental. Forge v7.3.0 shipped an undocumented breaking change on Vite 5 upgrade (github.com/electron/forge/issues/3506). Plugin v0.7.5 broke ESM-only main-process builds (github.com/electron/forge/issues/3715) — workaround is to use `fileName: (format) => \`[name].${format}.js\`` instead of `[name].mjs`.

**Implications for agent-velocity:** The "official" Vite path has shipped undocumented breaking changes diagnosable only through the issue tracker. If Forge+Vite is chosen, lock the plugin minor, never float.

### Finding: electron-builder `files:` globs do not traverse symlinks; `asarUnpack` drops symlinked entries
**Confidence:** CONFIRMED
**Evidence:** electron.build/file-patterns docs + issues #956, #1376, #9025. Direct quote: "Globstar patterns (using **) do not crawl symlinked directories." #8345 documents v26 throwing errors on symlinks outside project root.

**Implications for agent-velocity:** pnpm/Bun/npm workspaces monorepos (typical for agent-first repos) rely on symlinked deps. Agent-written `files:` globs silently ship incomplete builds. Mitigation: explicit `FileSet` objects with filter arrays + CI assertion that `.asar` content matches expected file list.

### Finding: Azure Trusted Signing is the modern Windows path but US/Canada-only with 3-year-business requirement
**Confidence:** CONFIRMED
**Evidence:** Microsoft Trusted Signing docs + practitioner reports (hendrik-erz.de, trustzone.com). As of Oct 2025: ATS eligibility = US/Canada organizations with 3+ years verifiable history, or US/Canada individual developers. New EV certs require FIPS 140 Level 2 hardware — "cannot be simply downloaded onto a CI infrastructure."

**Implications for agent-velocity:** Agent CI flows that downloaded EV certs as GitHub secrets no longer work with new EV certs. Options: (a) ATS via `win.azureSignOptions` in electron-builder if eligible, (b) `jsign` from Linux/macOS against ATS, (c) hardware-backed signing service.

### Finding: ASAR integrity requires 4-thing-sync: fuses + Info.plist + @electron/asar ≥ 4.1.0 digest + re-sign
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog/electron-41-0 — "run a command with @electron/asar v4.1.0 and above, and you must re-sign your app afterwards. Support for this feature in Electron Forge is planned for the near future." CVE-2025-55305: fix requires both `embeddedAsarIntegrityValidation` AND `onlyLoadAppFromAsar` fuses — either alone does nothing.

**Implications for agent-velocity:** Package all four steps into a single `postPackage` hook. Agents generating these in isolation produce a broken chain.

## Regression history: 6 months of Electron majors

### Finding: 38 → 39 (2025-10-28) — low-risk; ASAR integrity GA; `--host-rules` deprecated
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog/electron-39-0. `window.open()` popups now always-resizable; macOS 14.2+ `desktopCapturer` audio requires `NSAudioCaptureUsageDescription`; offscreen paint event shape changed (`sharedTextureHandle`/`planes`/`modifier` merged into `handle`). Node stayed 22.20.0.

**Implications for agent-velocity:** Low-risk except for offscreen-rendering apps; paint-event reshape not discoverable without reading the blog.

### Finding: 39 → 40 (2026-01-13) — THE upgrade landmine (Node 22 → 24 ABI break)
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog/electron-40-0. Chromium 142 → 144, Node 22.20.0 → 24.11.1, V8 14.2 → 14.4. Renderer `clipboard` API deprecated (must move to `contextBridge` preload). macOS dsym format changed from `.zip` to `.tar.xz`.

**Implications for agent-velocity:** Every native module (`better-sqlite3`, `keytar`, `@parcel/watcher`, etc.) must be rebuilt against Node 24 ABI. CI must cache `@electron/rebuild` output keyed on Electron version. Agent-generated renderer code importing `clipboard` directly from `electron` must be lint-blocked.

### Finding: 40 → 41 (2026-03-10) — ASAR integrity digest; PDF iframe; cookie event reshape
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog/electron-41-0. Chromium 144 → 146, Node 24.11.1 → 24.14.0, V8 14.4 → 14.6. PDFs no longer spawn separate `WebContents` — render as out-of-process iframes. Cookie-change enum expanded: `inserted`, `inserted-no-change-overwrite`, `inserted-no-value-change-overwrite`. Wayland frameless windows get drop shadows + extended resize. MSIX auto-updating shipped.

**Implications for agent-velocity:** Code enumerating `webContents` and filtering PDFs breaks silently. Closed-enum switches on cookie `cause` miss new variants.

### Finding: Electron 41.0.0 had post-GA bugs; recommended floor is 41.0.2
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog/electron-41-0 — explicit recommendation to install 41.0.2+.

**Implications for agent-velocity:** Pin `electron` at `~41.0.2` minimum or `^41.2.0` (current); never accept 41.0.0 verbatim.

## Ecosystem stability signals

### Finding: December 2025 was an official Electron quiet period
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog 2025-11-28 post — "scheduled hiatus beginning December 1, 2025 through early January 2026."

**Implications for agent-velocity:** 39 shipped on schedule, 40 slipped ~2 weeks post-quiet-period, 41 resumed on-schedule. Cadence planning should assume a 6-week gap around December.

### Finding: macOS 26 Tahoe GPU compat bug affected production Electron apps in October 2025
**Confidence:** CONFIRMED
**Evidence:** appleinsider.com/articles/25/10/10 — Slack, Discord, Figma all affected; fixes rolled via app updates Oct 10 2025.

**Implications for agent-velocity:** macOS-version-specific bugs have precedent. CI matrices should include current macOS + one-version-back.

### Finding: `@electron/*` toolbox moved uniformly to Node ≥22.12.0 floor
**Confidence:** CONFIRMED
**Evidence:** All six core packages declare `"engines.node": ">=22.12.0"` per npm registry metadata; all publish SLSA v1 provenance.

**Implications for agent-velocity:** Agent-generated `package.json` with lower `engines.node` passes local install but fails fresh-clone CI. Set `engines.node: ">=22.12.0"` from day one.

### Finding: Renderer `clipboard` deprecation in 40 is the load-bearing deprecation of this window
**Confidence:** CONFIRMED
**Evidence:** electronjs.org/blog/electron-40-0. The `remote` module was removed in Electron 14 (predates this window).

**Implications for agent-velocity:** Agents trained on older material still suggest `import { clipboard } from 'electron'` in renderer. Block via ESLint rule.

## Reference app version audit

| App | Electron major.minor | Source | Confidence |
|---|---|---|---|
| VS Code 1.115.0 (2026-04-07) | 39.8.5 | github.com/ewanharris/vscode-versions | CONFIRMED |
| GitHub Desktop (dev branch) | 40.1.0 | github.com/desktop/desktop dev/package.json | CONFIRMED |
| Notion Desktop (Apr 2026) | 40.8.5 (Chromium 144) | releasebot.io/updates/notion | INFERRED |
| Discord Desktop (Dec 2025) | 37 | discord.com/blog/discord-patch-notes-december-8-2025 | INFERRED |
| Slack Desktop | not disclosed post-Tahoe-fix | slack.com/release-notes | NOT FOUND |
| Cursor | not publicly disclosed | forum.cursor.com threads | NOT FOUND |
| Claude Desktop | not publicly disclosed | no primary source | NOT FOUND |
| Linear | wrapped via ToDesktop | — | INFERRED |

**Pattern:** Median of disclosed apps is N-1 (Electron 40). VS Code deliberately tracks N-2 (39) for release-train stability. Discord on N-4 (37) suggests chat-app risk tolerance is lower than IDEs. None of the reference apps run 41.

**Implications for agent-velocity:** "Same as VS Code" = Electron 39 = 2026-05-05 EOL — not a stable anchor. "Same as GitHub Desktop" = 40.1.0 = EOL 2026-06-30. Supported-window floor for a 2026-Q2 spec is **Electron 40.8.5** (oldest still-supported patch of N-1) or **Electron 41.2.0** (current, accepts early-major risk).

## Toolchain-choice state of the art

### Finding: Canonical 2026 pairing is EITHER `electron-forge + @electron-forge/plugin-vite` (official, experimental Vite) OR `electron-vite + electron-builder` (community, mature Vite, separate packager)
**Confidence:** INFERRED (no single vendor-neutral primary)
**Evidence:** electron-vite.org positions itself as "Next Generation Electron Build Tooling" (vendor claim); electronforge.io markets Forge as turnkey (vendor claim). The Electron org's own FAQ at electron-vite.github.io/faq/electron-forge.html: "Electron⚡️Vite is doing some experimental features, and when the features are stable, they will be ported to @electron-forge/plugin-vite" — product-incentive self-description, not neutral. Practitioner reports converge: Forge for integrated packaging+signing+publish; electron-vite + electron-builder for Vite-native DX with bolted-on packaging.

**Implications for agent-velocity:** Two stacks, different config shapes and plugin APIs. Agents conflating them produce unusable configs. Lock one pairing in the spec and add a `CLAUDE.md`-grade hint making the choice unambiguous.

### Finding: Rolldown-based electron-vite exists only in beta
**Confidence:** CONFIRMED
**Evidence:** electron-vite v6.0.0-beta.1 (2025-04-12) "compatible with rollupOptions and rolldownOptions."

**Implications for agent-velocity:** Not yet load-bearing for a 2026-Q2 spec. Assume Rollup-based Vite for both paths; revisit when 6.x goes stable.

### Finding: No major new toolchain entrants in 2025-2026 — choice space is stable by saturation
**Confidence:** INFERRED
**Evidence:** No new Vite-based Electron toolchains surfaced in search. `vite-plugin-electron` exists as a minor variant of the electron-vite approach. ToDesktop remains a managed hosting service (not a toolchain).

**Implications for agent-velocity:** Agents should not invent new toolchain patterns.

## UNRESOLVED / NOT FOUND

- Claude Desktop exact Electron version — no primary source; Anthropic does not publish. Inferred N or N-1.
- Slack exact Electron version post-Tahoe-fix — release notes omit Electron version.
- Cursor exact Electron version — forum discussion of VS Code divergence only.
- Linear's underlying Electron version — abstracted behind ToDesktop.
- `@electron/packager` 19.1.0 release date — npm registry metadata didn't surface a publish date.
- Electron 41.0.0 / 41.0.1 / 41.0.2 exact release dates — only 41.0.0 GA (2026-03-10) and 41.2.0 (2026-04-07) primary-sourced.
- electron-builder v27 — no release in this window; 26.9.0 remains stable.
- Playwright Electron API changelog specifically — no 2025-2026 entries surfaced; assumed stable (UNCERTAIN).

## References

**Electron core:** releases.electronjs.org · releases.electronjs.org/schedule · electronjs.org/docs/latest/tutorial/electron-timelines · electronjs.org/blog/electron-39-0 · electronjs.org/blog/electron-40-0 · electronjs.org/blog/electron-41-0 · electronjs.org/blog (Dec 2025 quiet period).

**CVE:** github.com/advisories/GHSA-vmqv-hx8q-j7mg (CVE-2025-55305).

**npm registry (version truth):** registry.npmjs.org/@electron/asar/latest (4.2.0) · .../fuses/latest (2.1.1) · .../rebuild/latest (4.0.3) · .../notarize/latest (3.1.1) · .../packager/latest (19.1.0) · registry.npmjs.org/electron-vite/latest (5.0.0).

**GitHub tooling:** github.com/alex8088/electron-vite/releases · github.com/electron/forge/releases · github.com/electron/forge/issues/3506 · github.com/electron/forge/issues/3715 · github.com/electron/forge/issues/4082 · github.com/electron-userland/electron-builder/releases · issues #956, #1376, #9025, #8345.

**Reference apps:** github.com/ewanharris/vscode-versions · github.com/desktop/desktop/blob/development/package.json · discord.com/blog/discord-patch-notes-december-8-2025 · releasebot.io/updates/notion · appleinsider.com/articles/25/10/10.

**Vendor-incentive sources (flagged):** electron-vite.org · electronforge.io/templates/vite · electron-vite.github.io/faq/electron-forge.html · electron.build.

**Signing:** electronjs.org/docs/latest/tutorial/code-signing · electron.build/code-signing-win.html · hendrik-erz.de/post/code-signing-with-azure-trusted-signing-on-github-actions.

**Playwright:** github.com/microsoft/playwright/releases · playwright.dev/docs/api/class-electron.
