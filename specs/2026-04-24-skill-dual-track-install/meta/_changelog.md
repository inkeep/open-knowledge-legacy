# Changelog

Append-only. Latest entries last.

## 2026-04-24 — Intake + scaffold

- Created SPEC.md skeleton following template shape.
- Captured problem (SCR), 5 stress-test probes passed, personas (P1 Cowork user, P2 Team+ admin, P3 `ok init` user).
- Stamped baseline commit `46751128`.
- Initial scope hypothesis: wedge-only (CI ZIP + `ok init` hint). Electron button → Future Work.
- Investigated codebase touch-points:
  - `.github/workflows/release.yml` lines 215-234 — vanilla `gh release create` with no assets today. `id-token: write` permission already granted → attestations available if we want them later.
  - `packages/server/src/skill-install.ts` — `installUserSkill()` already handles Claude Code via `npx skills add`. No change needed.
  - `packages/cli/src/commands/init.ts:603-604` — calls `installUserSkill` unconditionally, no prompt, no Desktop detection. Summary section is where the hint would land.
  - `packages/server/assets/skills/open-knowledge/SKILL.md` — single 20KB file, no `scripts/` / `references/` / `assets/` subdirs. `metadata.version` presence unknown (OQ2).
  - `@inkeep/open-knowledge-server` current version: `0.2.0`.
- 7 open questions carried forward to iteration loop; 3 are gated on user judgment (scope, naming, URL form).

## 2026-04-24 — Scope resolution (user responses to Q1-Q5)

- **Q1 (scope):** C — full plan (wedge + Electron button + Team+ plugin marketplace). D1 → DIRECTED.
- **Q2 (filename):** A — `openknowledge.skill.zip`. D2 → LOCKED.
- **Q3 (URL form):** A — pinned `v${version}` release URL in `ok init` hint. D7 → LOCKED.
- **Q4 (OS coverage):** B — macOS + Windows + Linux. D10 → LOCKED.
- **Q5 (description rewrite):** A — defer. D11 → DIRECTED.
- Three new open questions surfaced by the scope expansion (OQ8 phasing, OQ9 plugin marketplace shape, OQ10 Electron button placement).

## 2026-04-24 — Iteration pass (resolved OQ3, OQ4, OQ8-OQ10)

Autonomous resolutions (Auto mode):

- **OQ3 (Desktop detection OS paths):** RESOLVED. Reuse existing `EDITOR_TARGETS['claude-desktop'].detectPath` (D12). No new detection code. Evidence: `evidence/claude-desktop-detection-existing.md`.
- **OQ4 (CI-only vs local):** RESOLVED. Single script at `scripts/build-skill-zip.ts` (D17), invokable from CI and `bun run build:skill-zip`.
- **OQ8 (phasing):** RESOLVED. Three phased ships (D15) — wedge / Electron button / plugin marketplace.
- **OQ9 (plugin marketplace shape):** RESOLVED. Inline in `inkeep/open-knowledge` root (D13). Matches `anthropics/knowledge-work-plugins` pattern. Evidence: `evidence/plugin-marketplace-schema.md`.
- **OQ10 (Electron button placement):** RESOLVED. Standalone modal with menu + EditorArea CTA entry points (D16). Matches SeedDialog precedent.

New open questions from the scope expansion:
- **OQ11:** `plugin.json` schema — needs second WebFetch before Phase 3.
- **OQ12:** Symlink resolution through GitHub/Claude plugin pull — needs dry-run.
- **OQ13:** Walkthrough screenshots — stock or re-shot? [Phase 2 decision, user input eventually needed]
- **OQ14:** Post-install verification — poll or trust-the-user? [Phase 2 decision]

Scope triple-expanded. SPEC now organized around three phases (15.1/15.2/15.3), with per-phase Agent Constraints in §16.

Spec status: ready to enter Audit once OQ11/12 are resolved OR marked Phase-3-gated (not Phase-1 blocking).

## 2026-04-24 — OQ11 resolved; OQ12/13/14 phase-gated

- **OQ11 (plugin.json schema):** RESOLVED. Minimal 4-field shape (`name`, `version`, `description`, `author.name`). Skills auto-discovered from `skills/` subdir by convention — no explicit declaration. Evidence: `evidence/plugin-json-schema.md`.
- **OQ12, OQ13, OQ14:** marked phase-gated (Phase 2 or Phase 3 start). Not blocking for Phase 1 audit.

Spec ready for Audit + Challenger gates on Phase 1 scope. Phase 2/3 audit can happen at phase kickoff.

## 2026-04-24 — Audit + challenger completed; scope contracted (Option A)

**Audit results:** 16 findings (5H/5M/3L/3E). Routed:
- 10 corrections applied to SPEC.md (detection-path prose, URL count reconcile, byte count, stale quote, editorial).
- 1 correction applied to docs page (`install-claude-cowork.mdx` Card href → direct-download URL).
- 1 correction applied to evidence file (description quote — point to live source instead of quoting stale text).
- 5 decision-implicating findings resolved via scope contraction + my recommendations.

**Challenger results:** 7 findings (4H/2M/1L). Routed:
- H1 (Phase 3 regressive), H4 (minimum ship framing) — user chose Option A (wedge only). Phase 2 → FW1; Phase 3 → FW4.
- H2 (symlink) — moot, Phase 3 dropped.
- H3 (Electron CTA placement) — moot, Phase 2 deferred to FW1's own spec.
- M5 (D13 repo-root) — moot, Phase 3 dropped.
- M6 (D8 commit-time) — ACCEPTED → D8 LOCKED at commit-time.
- L7 (D3 Bun vs bash) — ACCEPTED → D3 pivoted to bash smoke-test.

**Decisions resolved by this pass:**
- D1 → DIRECTED (wedge scope, Phase 2/3 → FW).
- D3 → DIRECTED (bash smoke-test, not Bun port).
- D4 → DIRECTED (expanded SKILL.md per Dim 8 — license, compatibility, LICENSE.txt).
- D5 → DIRECTED (cli/package.json as source of truth + CI assertion).
- D8 → LOCKED (commit-time metadata.version injection).
- D10 → LOCKED with corrected detection paths (config-dir, not .app bundle).
- D13, D14, D16, D17 → marked MOOT (Phase 2/3 out of scope).
- OQ9-OQ14 → marked MOOT (captured for FW1/FW4 pickup).

**SPEC.md restructured:**
- §2 Goals reduced to G1-G3 (wedge only).
- §3 Non-goals restored NG1 (Electron modal) and NG2 (plugin marketplace) with trigger conditions.
- §6 Requirements collapsed to FR1-FR8 (wedge only; FR9-FR15 removed).
- §13 Future Work promoted Electron modal (FW1) + plugin marketplace (FW4) to [Explored] / [Identified] tiers with revisit triggers.
- §15 Rollout rewritten as four micro-ship sequence (1a/1b/1c/1d) per Challenger H4.
- §16 Agent Constraints collapsed to one set (Phase 2/3 sections removed).
- Added resolution-status glossary.

Spec ready for finalize. All P0 OQs resolved; all decisions have status; Agent Constraints defined; Future Work tiered.

## 2026-04-24 — Scope re-expansion: install dialog restored on Electron + web

User flagged that the install dialog was meant to be on BOTH Electron and web app. My prior contraction (moving Phase 2 entirely to FW1) was too aggressive — the challenger's H3 was about placement, not about whether to build.

**Changes:**
- Restored install dialog to in-scope — new G4 + G5 goals.
- Added FR9-FR15 covering the dialog, IPC, Settings row, first-run toast, shared detection helper.
- Added Ship 1e for the dialog work (~1 week, separate from the infra ships 1a-1d).
- NG1 (Electron modal) removed — now in scope.
- NG4 (web parity) removed — web dialog is in scope with degraded browser-only flow.
- FW1 deleted — was specifically the dialog, now in scope.
- New NG5: CTA adjacent to "Initialize LLM brain" in EditorArea — challenger H3 rejection honored.
- New D13 (placement: Settings panel + first-run toast), D14 (shared component), D16 (web mode doesn't launch Claude).
- OQ13/OQ14 restored as active (Ship 1e product decisions); OQ15 added (toast trigger).
- §16 Agent Constraints split into Ships 1a-1d scope and Ship 1e scope.

Plugin marketplace (FW4) stays deferred — challenger H1 evidence on #39400 + #38429 holds.

## 2026-04-24 — Resolved Ship 1e product decisions (OQ13/14/15)

- **OQ13 (screenshots):** RESOLVED → stock from claude.com (D18). Re-shoot is a reversible follow-up.
- **OQ14 (verification):** RESOLVED → trust-the-user (D19). No polling API exists.
- **OQ15 (toast trigger):** RESOLVED → editor first mount + marker file (D20). Simplest trigger; mirrors `mcp-status.json` pattern.

Spec complete: all P0 OQs resolved; all decisions LOCKED or DIRECTED; Agent Constraints split into Ship 1a-1d + Ship 1e scopes. Resolution completeness gate passes for G1-G5.

## 2026-04-24 — Major pivot: `.skill` file association discovered

Verified `/Applications/Claude.app/Contents/Info.plist` via `plutil`: Claude.app registers `.skill` as a `CFBundleDocumentType` on macOS. Anthropic's own `package_skill.py` outputs `.skill` files (renamed ZIPs).

**Reverses prior research/spec claims:**
- Research report `mcp-server-auto-install-harnesses/evidence/cowork-skills-surface-update-2026-04-24.md` said no `.skill.zip` file association. TRUE but missed that `.skill` (no `.zip` suffix) IS registered.
- SPEC NG9 said `.skill` is wrong format — FALSE, it's Anthropic's canonical format.
- Research report `agent-skills-zip-distribution-ux` Dim 4 (In-product install hand-off) said Claude Desktop has zero automation hooks for Skills — FALSE, Category B (file-association double-click) works.

**Changes to SPEC.md:**
- NG9 removed; replaced with corrigendum pointer.
- D21 added (LOCKED): install artifact is `openknowledge.skill`, not `.skill.zip`.
- FR11 simplified: Electron dialog uses `shell.openPath(skillPath)` instead of `showItemInFolder` + `openExternal`. One IPC channel (`ok:skill:download-and-open`) replaces two.
- FR12 simplified: web mode triggers browser download of `.skill`; user double-clicks; OS file association does the rest. "You'll need to open Claude Desktop yourself" framing removed.
- FR14 IPC channel list trimmed.
- §5 P1 journey rewritten: "download + double-click" replaces the 3-click walkthrough.
- `openknowledge.skill.zip` → `openknowledge.skill` globally.

**Changes to docs page:**
- `install-claude-cowork.mdx` simplified: "two clicks" install flow. Walkthrough goes from 4 steps + verify to 3 steps.
- Title + description updated.

**Still to do (follow-up, out of this session's scope):**
- Corrigendum in `reports/mcp-server-auto-install-harnesses/evidence/cowork-skills-surface-update-2026-04-24.md` noting the `.skill` file association was missed.
- Corrigendum in `reports/agent-skills-zip-distribution-ux/REPORT.md` Dim 4 updating "zero automation hooks" → "Category B file-association works via `.skill`".

Spec is materially simpler now. Ship 1e shrinks (no walkthrough screenshots needed — cuts OQ13 open time). Confidence high on the pivot.
