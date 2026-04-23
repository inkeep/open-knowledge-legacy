# Meta changelog — M6 spec

Append-only process history. Substantive changes to SPEC.md, evidence, or scope.

## 2026-04-21 — Session routing + initial evidence (Andrew + spec pass)

- Entered `/spec` pass on pre-existing Draft spec (no prior artifacts).
- Scaffolded `evidence/` and `meta/`.
- Baseline commit stamped: `6fa2c104`.
- Persisted `evidence/editor-targets-and-scope.md` from `packages/cli/src/commands/editors.ts:258-327` and `init.ts:802-817`. Key finding: all 6 editor targets are `scope: 'global'`; `detectInstalledEditors(cwd, home?)` takes `cwd` but never uses it; current CLI already writes primary MCP configs to user-level paths. M6b's user-scoped framing is not a new write path — it matches current CLI behavior.
- Identified structural bug: `## 7) Known gaps / open questions` header was dropped when §6.5 was inserted; OQ-1..OQ-11 currently float bare. To be fixed in cascade.
- Identified stale references from D-M6-R1/R2 cascade gaps: G9, G10 (partially), G11, §4 Phase 2 `mcp-wiring.ts` description, §4 Phase 2 `window-manager.ts` hook, AC2.2, AC2.3, AC2.5, §8 Phase 2 step 5, §6.4 last paragraph. Fixed in cascade.
- Surfaced OQ-12 (dev-mode gating), OQ-13 (dialog lifecycle), OQ-14 (checkbox defaults), OQ-15 (path-spaces quoting), OQ-16 (merge semantics), OQ-17 (M4/M5 status), OQ-18 (auto-update interaction), OQ-19 (partial-failure recovery), OQ-20 (TCC/entitlements), OQ-21 (E2E HOME isolation), OQ-22 (extraResources filter glob).
- User-resolved decision batch (2026-04-21): OQ-17 RESOLVED (M4+M5 both shipped — PR #266, #267); OQ-16 RESOLVED (per-editor conditional force:true when npx-shape matches); OQ-13 RESOLVED (Navigator piggyback); OQ-8 RESOLVED (self-diagnosing wrapper).
- Agent-resolved by investigation: OQ-3 (detectInstalledEditors safe — cwd unused); OQ-12 (app.isPackaged gate).
- Added Decision Log entries D-M6-R3 through D-M6-R7 in §10.
- Added AC2.11 (merge semantics verification) and AC2.12 (self-diagnosing wrapper verification).

## 2026-04-22 — Audit + design challenge pass

- Spawned two parallel subagent reads: auditor (17 findings, 5H/6M/6L) + challenger (12 findings, 5H/4M/3L). Both wrote to `meta/`.
- **Agent-routed factual/coherence corrections auto-applied** (11 items): §8 missing header restored, OQ-14 moved into numerical sequence, AC2.6 stale "Install Command-Line Tools" step removed, three "first-project-open" references fixed (lines 100, 134, 171), Cursor detect wording corrected ("dir exists" not "mcp.json dir exists"), AC1.7 `echo -e` replaced with `printf`, §6.3 `.app/Contents/` trailing-slash comment fixed, §10 decision-count narrative rephrased, §6.1 D24 gloss added, parent §8.11 runInit-async-not-sync added to follow-ups, G7/OQ-14 reconciled to preselect-detected, §1 entry-point taxonomy downgraded (pointing at file paths, not uncited enumeration), §6.3 G5-mitigates-cliPath aspirational claim dropped.
- **Design-challenge resolutions (user decisions via AskUserQuestion)**:
  - H1 → split CLI surface: new `writeUserMcpConfigs` export (D-M6-R8 LOCKED). Replaces `runInit` in the M6b write path. Full cascade: G8, §4 scope rows (added new CLI row, removed duplicate), AC2.3, §6.3 rewrite, §8 Phase 2 steps 1-10 rewritten to front-load CLI surface change.
  - H4 → hybrid `cliPath` (D-M6-R9 LOCKED): symlink when M6a installed with ownership check, bundle-absolute fallback. §6.3 implementation sketch added; §6.5 runtime matrix expanded with 6 scenarios; AC2.4 updated to cover both branches.
  - H3 → whenRendererReady-style three-case dispatch (D-M6-R10 LOCKED): `McpConsentDialog` subscribed from both NavigatorApp and editor App.tsx — host-agnostic. New IPC channel `ok:mcp-wiring:renderer-ready` for the mount-ack handshake. §6.1 rewritten; AC2.13 new (F1 + F2 coverage).
  - M4 → keep "Blocks M7" framing (user confirmed M7 design-partners include P1 personas).
- **Refinement auto-applied** (challenger M1): D-M6-R4's exact-npx-shape gate replaced with `isCompatible(existing, installOptions)` reuse from `editors.ts:249` — catches `-y npx` variant + preserves user-augmented `env` fields. AC2.11 rewritten with 4 fixtures.
- **New decisions logged:** D-M6-R8 (writeUserMcpConfigs split), D-M6-R9 (hybrid cliPath), D-M6-R10 (whenRendererReady dispatch). Decision-log preamble updated to "Ten decisions" / R8-R10 tagged as "audit + design-challenge pass."
- **Not auto-applied (flagged for future):** challenger M2 (TCC dialog copy + fs.access probe), challenger M3 (passive repair-offer in main app), auditor M7 (extend design spike OR inline wrapper diff in SPEC §6). These are polish items that can land alongside implementation or in a follow-up PR.
