# Changelog

## 2026-04-13 — Spec scaffolded

- Created `SPEC.md` from template
- Created `evidence/current-init-cli-shape.md` capturing init.ts, start.ts, content-filter.ts current behavior
- Created `evidence/ed-4-status.md` documenting that `projects/day-0-editor-completeness/` referenced by the story split does not yet exist on disk
- Baseline commit stamped: `3d07f16`
- Intake confirmed by user: framing = legibility problem (not config defaults problem); scope = bundle R1+R2+R3
- Key findings during scaffold (changed framing from initial seed):
  - `start --open` already exists, partially built (macOS only) — R3 is now a fix, not an add
  - `start` auto-scaffolds `.open-knowledge/` on first run (mcp: false) — opens Q1 about preview consistency between two init paths
  - ED-4 is referenced in story split but project file doesn't exist on disk — convergence (R4/G4) reframed as "first consumer of shared API" not "alignment with existing code"
- Open Questions seeded: Q1 (start-path preview), Q2 (sample cap), Q3 (enum time cap), Q4 (dry-run + interactive prompt), Q5 (`.open-knowledge/` self-enumeration)

## 2026-04-13 — Iterate phase complete

- Q1-Q5 resolved; user confirmed all recommendations ("yes to all")
- A1 verified: `packages/cli/src/config/schema.ts:6-14` confirms defaults match assumption
- A3 deferred to implementation phase (verify perf during spike, add 10s cap if exceeded)
- Q5 resolved via investigation: ContentFilter indexes `.open-knowledge/` content; preview matches by reusing it (no special-casing)
- Decisions added: D6 (dry-run skips multiselect), D7 (preview in start auto-init path), D8 (preview enumerates `.open-knowledge/`)
- §9 updated to specify start auto-init preview placement (after URL, gated by `didAutoInit`)
- All P0 In Scope items now have decisions; ready for audit phase

## 2026-04-13 — Audit + design challenge complete; findings cascaded

### Audit findings (auto-applied)
- §8 line numbers corrected: `runInit` 170→171, `formatInitResult` 231→232
- §1 wording: "silently fails or errors" → "logs an error and prints no URL hint"
- Q5 wording sharpened: scaffolded subdirs noted as empty at fresh-init time
- §9 ordering specified: preview in start path renders after `ready.then()` resolves
- §6 acceptance criteria sharpened: R1 (integration test against tmpdir), R2 (hash check + replay test), R3 (stub `execFile`, assert per-platform args)
- A2 confidence downgraded from HIGH to MEDIUM (minimal/server images may lack `xdg-utils`)
- §6 NFR cross-references A3 inline
- A4 added: tsdown `alwaysBundle` verified at `tsdown.config.ts:11`. Original "devDependency" wording corrected: server module is bundled into `dist/cli.mjs`, not resolved at runtime
- §8 wording: now describes the bundling mechanism explicitly

### Design challenges (user-confirmed: yes to all)
- **F1 — NG6 reframe.** Original NG5 ("never auto-narrow") split into NG6 (forbid only hidden magic) + Future Work item "Smarter detected defaults" (legible explicit detection). D9 records the decision.
- **F2 — `previewContent()` moves CLI-local.** D2 reversed: helper now lives at `packages/cli/src/content/preview.ts`. `ContentFilter` import from server is unchanged. Speculative shared API removed. Audit MEDIUM finding (devDep wording) becomes moot — no new server export needed.
- **F4+F5 — `init --dry-run` superseded by `open-knowledge preview` verb.** R2 replaced. D6 records the decision. Q4 marked closed (superseded). Removes the editor-multiselect hack that D6 originally introduced. New persona P3 (Returning user / debugger) added; new journey for ongoing-use case.
- **Config snippet polish accepted.** R1 acceptance criteria now require the 3-line config snippet in the preview output.
- **F3 — bundling holds.** R3 stays in this spec; D1 amended to note "if R3's cross-platform testing blocks, split before merge."

### Sections changed
§1, §2, §3, §4, §5, §6, §8, §9, §10, §11, §12, §14, §15, §16 — substantial cascade. Net result: simpler CLI-local architecture, clearer verb taxonomy (`init` writes, `preview` reads), broader user-journey coverage (P1+P2+P3).

## 2026-04-13 — Finalized

- Status flipped Draft → Approved
- Baseline commit overwritten: `3d07f16` → `cafed34` (current HEAD)
- All 9 decisions resolved (LOCKED/DIRECTED); no ASSUMED or INVESTIGATING entries remain
- Resolution completeness gate passed for all In Scope items (R1, R2, R3, R5)
- Future Work tiered: 2 Identified (smarter detected defaults, `init --start --open` chain), 3 Noted
- No pending items carried forward
- Ready for `/implement` or hand-off to engineer

