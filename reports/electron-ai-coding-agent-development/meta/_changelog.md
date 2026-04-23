# Changelog — electron-ai-coding-agent-development

## 2026-04-17 — Audit-follow-up fanout (3 parallel research instances)

Three follow-up research instances dispatched in parallel (Opus subagents, Path A formal reports in headless mode) to close open risks + lock API shapes surfaced by the Electron desktop-app spec audit (`specs/2026-04-11-electron-desktop-app/meta/audit-findings.md`):

- **[T1 — @napi-rs/keyring in utilityProcess + Keychain UX](../fanout/2026-04-17-audit-followups/t1-keyring-utility-process/REPORT.md)** — Closes R15 (utility-process compat) and R16 (keychain UX) from the spec audit. 7 evidence files (D1/D1a/D2/D3/D4/D5/D6). Key correction: macOS keychain prompt uses app name from `CFBundleDisplayName`, not helper-process name — R16's earlier speculation was wrong. Confirms `@napi-rs/keyring` viable in `utilityProcess.fork()` on Electron ≥ 34 (PR #46380 fixed the asar+utility crash). Delete+recreate anti-pattern destroys ACL. Direct-DMG doesn't need keychain entitlement. Linux fail-loud is correct.
- **[T2 — Preload bridge patterns: typed config + subscription APIs](../fanout/2026-04-17-audit-followups/t2-preload-bridge-patterns/REPORT.md)** — Locks `OkDesktopBridge` API shape for the spec's D36. 6 evidence files (D1/D2/D3/D4/D5-D6/D7). Key finding: `contextBridge` wraps callbacks → `ipcRenderer.removeListener` with renderer cb reference silently fails ([electron/electron#33328](https://github.com/electron/electron/issues/33328)). Subscriptions MUST use preload-side wrapper. `shell.openExternal` under `sandbox: true` MUST be IPC-relay (not direct preload call). Surveyed VS Code, Mattermost Desktop, Logseq, GitHub Desktop preload source.
- **[T3 — Multi-window Electron per-window subprocess + crash recovery](../fanout/2026-04-17-audit-followups/t3-multi-window-subprocess-lifecycle/REPORT.md)** — Benchmarks our "one utility per BrowserWindow + file-based lock + runClean + collision-dialog" design against 9 production apps. 9 evidence files (D1-D9). Key findings: adopt VS Code's `windowLifecycleBound: true, windowLifecycleGraceTime: 6000`; add post-exit PID-liveness probe (1s + SIGTERM); switch drain gate from `before-quit` to `will-quit.preventDefault()`; adopt join pattern for shutdown; add budgeted auto-restart (3/5min) before modal. Collision dialog is divergent from industry (0/9 apps use one) — deliberate UX choice.

**Parent REPORT.md update (Path C surgical):**
- Added new section "Follow-up research (2026-04-17 audit follow-ups)" after the 2026-04-15 round 2 section, with brief per-report summaries linking to the three fanout REPORT.md files.
- No changes to the 13-dimension rubric or prior findings — these follow-ups extend scope rather than revise prior conclusions.

Dispatch pattern: Opus subagents via `Agent` tool with `model: "opus"`, `run_in_background: true`, explicit `/research --headless` protocol loading in each prompt. Each agent created evidence files successfully but could not write REPORT.md directly (subagent-write limitation); orchestrator assembled REPORT.md content from agent responses + verified spot-checks against actual source (VS Code issue #194477, electron/electron#33328, `@napi-rs/keyring` Electron ≥ 34 PR #46380).

## 2026-04-15 — Initial research pass + audit resolution

- Scoped with user; rubric: 13 dimensions (10 translated from rust-napi-rs-best-practices-2026, 3 Electron-specific: E1/E2/E3) across 5 clusters.
- Nested fanout mode (matches Rust report's approach). 5 parallel cluster workers, each with primary-source web + OSS-repo inspection (`~/.claude/oss-repos/desktop`, `/logseq`).
- Stance: factual / 3P.
- Consumer: `specs/2026-04-11-electron-desktop-app/SPEC.md` implementation phase.
- **Audit run** ( /eng:audit via nested Claude, findings in `meta/audit-findings.md`): 5 findings (H:1, M:2, L:2).
  - H1 (Playwright issue #11240 characterized as open; actually closed P3-collecting-feedback) — fixed in exec-summary + D7.
  - M1 ("experimental-but-stable" softened Playwright's own "experimental" label without citation) — rewritten to preserve upstream's experimental label while citing broad production usage as evidence.
  - M2 (prescriptive imperatives "Lock one…" and "Do not mix. Document…" drifted from declared factual stance) — reframed as conditional observations + moved under Decision Triggers with explicit trigger conditions.
  - L1 ("~80% of dev-green/prod-red regressions" unsourced quantitative claim) — softened to "majority."
  - L2 (D6 evidence link missing line-range anchor) — left as-is; section-level anchors match the convention other non-line-specific evidence references use.
- All 9 load-bearing external claims in the audit spot-check log passed primary-source verification.

## 2026-04-15 — Follow-up round 2 (4 parallel nested research instances)

User confirmed all 4 follow-up directions from the initial recap + stated strong preference for typed approaches (captured as durable user-memory feedback). Dispatched 4 parallel /research follow-up instances via Agent tool:

- **FU-1 (Utility-process hot-reload patterns)** — closes §E1 UNRESOLVED. Confirms no framework (electron-vite, electron-forge, electron-builder) ships utility-process-selective reload; documents electron-vite's `?modulePath` + multi-entry build primitive (rebuilds bundle, triggers whole-app hot-restart); catalogs niche watchers (all main-process only); provides a synthesized ~30-line chokidar + `kill()`+`fork()` supervisor pattern + the `child_process.fork` + `nodemon` escape hatch. Known landmines: electron #44013 (`.kill()` on killed), #42978 (dev/packaged divergence), #44265 (duplicate `'exit'`).
- **FU-2 (Packaged-build regression taxonomy)** — replaces §D4's soft "majority" claim with a 9-class taxonomy surveyed across ~65 issues from electron-builder/forge/electron 2024-04 → 2026-04. Classes ranked by frequency: native-module runtime (~25-30%), packager dep-collection regressions (~15-20%), code-signing failures (~15%), asarUnpack miss (~10%), extraResources misconfig (~8-10%), path/isPackaged drift (~5-8%), ESM/CJS boundary (~5%), fuses × signtool clobber (~3-5%, security-critical), cross-arch builds (~3-5%). Smoke gate catch rate: ~65-75%. Typed approaches measurably mitigate classes 5 + 6 + partial 7 (~25-30% of surveyed regressions).
- **FU-3 (Typed Electron IPC comparison)** — evaluates 7 libraries across 11 axes with reference implementations. Key finding: the real fork is observability (channel-name visibility), not type inference — all 7 give end-to-end typing. Two families: named-channel (GitHub Desktop hand-rolled, `@electron-toolkit/typed-ipc`, `@egoist/tipc`, `electron-typescript-ipc`) vs opaque-envelope (`electron-trpc`, `trpc-electron`). Scale-matched recommendation: hand-rolled for <20 channels, `@electron-toolkit/typed-ipc` for 20-100, `@egoist/tipc` for 100+, `electron-trpc` only when hard runtime validation is required. Decision matrix scores (out of 55): hand-rolled 48, `@electron-toolkit/typed-ipc` 46, `@egoist/tipc` 46, `electron-typescript-ipc` 43, `electron-trpc` 40, `trpc-electron` 39.
- **FU-4 (Agent-first Electron repo skeleton)** — synthesis of the above + existing templates (electron-vite-react, electron-vite-boilerplate, electron-react-boilerplate, electron-forge templates, `@electron-toolkit`, GitHub Desktop) into a reviewable greenfield skeleton. Typed by default at every boundary. Hand-rolled channel map baseline (per FU-3 scale-match). Directory layout, package.json, tsconfig project references, ESLint rules, preload bridge, logging, crash reporting, CI matrix, AGENTS.md / CLAUDE.md — each with primary-source citations.

**Parent REPORT.md consolidation (Path C surgical updates):**
- Exec summary: softened "majority" in packaged-smoke bullet → "~65-75% across 9-class taxonomy" with FU-2 link
- Added top-level "Follow-up research (2026-04-15 round 2)" section after exec summary listing all 4 FUs
- §D4 Decision triggers: added two-gate recommendation + typed-approach mitigation callouts + FU-2 link
- §D9 Decision triggers: replaced "three options" with scale-based table from FU-3 + opacity tax callout + runtime-validation-without-tRPC pattern
- §E1 Decision triggers: added FU-1 supervisor pattern reference + landmine list + dual-code-path escape hatch
- New section "Agent-first Electron repo skeleton (FU-4 synthesis)" inserted before Cross-cutting Patterns — includes directory layout, scripts, typing-discipline table, AGENTS.md template, 15 agent affordances, exclusions with revisit triggers
- References section extended with all 4 FU report links

**User-memory persisted:** Nick's preference for typed approaches saved to `~/.claude/projects/.../memory/feedback_prefer_typed_approaches.md`, indexed in MEMORY.md. Applies across future conversations.
