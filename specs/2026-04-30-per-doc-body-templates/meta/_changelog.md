# Changelog

## 2026-04-30 — Initial spec drafted

- Branch: `spec/per-doc-body-templates`
- Baseline commit: 0a28681a
- Grounding research: `reports/per-doc-body-templates-karpathy-journals/` (3 evidence files + REPORT.md, ~600 lines)
- Workflow: Auto mode + headless. Light intake (user direction in initial prompt + research report's locked decisions). Worldmodel built from grounding report + code investigation. SPEC.md written in one pass.
- Scope decisions:
  - 19 decisions logged (D1-D19), most LOCKED
  - 4 open questions (Q1-Q4), all P2 — deferred or delegated
  - 5 assumptions (A1-A5), 2 verified, 3 to verify at implementation
  - 9 non-goals (NG1-NG9), 3 NEVER + 5 NOT NOW + 1 NOT UNLESS
- Key spec-time finding: `folders[].frontmatter` is currently a virtual read-time overlay in MCP tools (`exec`, `read-document`, `search`), NOT materialized to disk. The grounding report's d3 evidence had this wrong — corrected in §10 D2 + §11 Q1 + §8 Current State. The asymmetry between virtual-frontmatter and materialized-body is documented; spec deliberately does NOT migrate frontmatter (1-way door, future spec).
- Key code-investigation findings written to `evidence/code-investigation.md` and `evidence/_init_worldmodel.md`.

## 2026-04-30 — Audit + design-challenge applied

- Subprocess audit via `claude --dangerously-skip-permissions` was DENIED (auto mode doesn't authorize that flag). Performed self-audit + self-challenge with cold-reader discipline.
- Findings written to `meta/audit-findings.md` (1 HIGH, 4 MED, 4 LOW) and `meta/design-challenge.md` (7 challenges).
- Surgical fixes applied to SPEC.md:
  - **A-H1** (HIGH): FR-10 + D12 frontmatter merge direction inverted — was "rule wins"; corrected to "template body wins" per existing OK file-frontmatter-wins-per-scalar rule.
  - **A-M1**: FR-9 wording aligned with D11 (display name, not UUID).
  - **A-M2**: D5 expanded to cover frontmatter-only-no-body agent payload edge case.
  - **A-M3**: NEW FR-13 — 64KB template max; reject + warn + fall back.
  - **A-M4**: D2 reworded — "LOCKED for this spec's scope," dual-truth gap explicitly surfaced.
  - **A-L1**: §5 P1 journey example drops the `-·` trailing-space convention for readability.
  - **C3**: D4 rationale clarified — "empty body is the agent's opt-OUT mechanism."
  - **C4**: Q1 elevated from P2-deferred to P0-needs-user-direction with three options (a/b/c). **Recommendation (b)** — narrow materialization for templated rules only.
  - **C6**: D11 tightened — `{{user}}` resolves ONLY to principal display name (no agent-name leak); falls back to empty + warn for non-principal writers.
  - **C7**: FR-4 acceptance gains "single-pass substitution" note.
- Status changed from "Draft" to "Draft — pending user direction on Q1."

## 2026-04-30 — Skill update added (per user direction)

- User flagged that the bundled OK skill (`packages/server/assets/skills/open-knowledge/SKILL.md`) needs to teach agents about body-template behavior, or as something that "could happen or we could change."
- Spec amended:
  - **NEW FR-14**: skill update extending existing "Folder structure + metadata" section with body-template mechanism (trigger, opt-out, variable inventory). Mechanism only — concrete templates stay in `config.yml` per skill-vs-policy split.
  - **NEW D20** (LOCKED): skill update is in scope; rationale = without it, agents are surprised when empty-body create returns populated files.
  - **NEW D21** (LOCKED): skill update bundled in same PR as server-side implementation (no documentation gap window).
  - §9 UX surfaces gains a "Bundled OK skill" bullet.
  - §13 In Scope next-actions extended (item 7 = skill update; renumbered).
  - §16 Agent constraints SCOPE adds the skill file path.
  - §16 STOP_IF gains a guard against blowing past the 1024-char SKILL.md description limit or adding a new top-level section.

## 2026-04-30 — Nested-folder semantics locked (per user question)

- User asked "how does it work with nested folders." Spec had a real gap: FR-8 / D10 said "last-match-wins" but didn't define behavior when a more-specific child rule set some fields but not others.
- Two readings were possible: per-rule (later rule provides everything; missing fields = no template) vs per-field (each field merges independently). Existing OK `frontmatter:` semantics are per-field — chose to match.
- Spec amended:
  - **FR-8 expanded** with explicit per-field semantics, including the "explicit empty string = intentional clear" escape hatch and the rule that `body`+`bodyPath` are ONE logical field for merge purposes.
  - **D10 expanded** with reasoning + footgun analysis.
  - **§9 NEW subsection "Nested folders — how multiple matching rules compose"** with 6-case truth table covering: single-rule-deep-glob, parent+child both with body, child narrows for tags only, body/bodyPath mixed across rules, explicit clear, tags+body interaction.

## 2026-04-30 — Stacking + shared resolver locked (per user direction)

- User asked: "can they stack somehow? like parent then child is lower than parent? or should they what do you think. ah yeah we should follow same spec as frontmatter maybe we can have some generic inheritance code that is used in all the same places so if we want to change inheritance structure easier we can"
- Two architectural calls locked:
  - **D22 LOCKED**: body templates do NOT stack across nested matching rules. Last-match-wins per D10. Stacking would require meta-merge of `---` frontmatter blocks, has no obvious ordering answer, and isn't done by any prior-art tool. Future-additive shape (`bodyPrepend:` / `bodyAppend:`) is opt-in, not implicit.
  - **D23 LOCKED**: shared `resolveEffectiveFolderRule(path, rules)` resolver in `packages/core/src/config/folder-rule-resolver.ts`. Body templates are its FIRST consumer. Existing MCP virtual-overlay sites can migrate to it later (NG11) — single source of truth for folder-rule inheritance lets future merge-rule changes apply uniformly. Implementer MUST go through the resolver; inlining merge logic at the call site is now a STOP_IF.
- Spec amended:
  - **NEW D22, D23** in §10
  - **NEW NG10** (no implicit stacking; opt-in additive shape recommended) and **NG11** (defer existing-site migration)
  - §9 Architecture overview gains the resolver as the inheritance source of truth
  - §13 Next-actions gains the resolver as a separate step (step 2); body-template module (step 3) consumes it instead of re-implementing
  - §15 Future Work gains two Identified items: existing-site migration, opt-in stacking shape
  - §16 SCOPE gains the new resolver path
  - §16 STOP_IF gains a guard against inlined merge logic at the body-template call site

## 2026-04-30 — Resolver scope expanded to layered files+folders primitives (per user direction)

- User asked: "should it be a folder only resolver or should it be something with files and folders too?"
- Answer locked: **both — as layered composable primitives, not a monolithic function.**
- D23 reworked from a single `resolveEffectiveFolderRule(path, rules)` function to three layered primitives:
  - **L1** `resolveFolderRulesForPath(filePath, rules)` — folder-rule layer only. What body templates need (no file at create-time).
  - **L2** `mergeWithFileFrontmatter(folderRule, fileFm)` — composes L1 with the file's own frontmatter.
  - **L3** `resolveEffectiveForFile(filePath, rules, fileFm)` — convenience wrapper for read-time consumers.
- Why layered:
  - Body-template materialization at create-time genuinely has no file to merge — a monolithic "optional file frontmatter" API makes one function pretend to be three.
  - Different consumers want different layer compositions; separate primitives = no branching.
  - **Q1's three options become call-site decisions, not resolver changes.** Option (a) virtual: body site uses L1, virtual-overlay sites use L3. Option (b) narrow: body site uses L1 + materializes folder frontmatter when rule has both fields. Option (c) full migration: body site always materializes L1's frontmatter. The resolver doesn't change in any of the three; only call patterns do.
- §9 Architecture overview, §13 next-actions step 2, and §15 NG11 description all updated to reflect the layered design.

## 2026-04-30 — Override-direction rationale added to D10

- User asked whether file+folder should concat with parent-over-child precedence.
- Walked through the three field shapes (lists / scalars / body) and the two readings of "parent over child" (general beats specific, or folder beats file). Both readings invert user intent.
- D10 expanded with an inline rationale paragraph explaining the override direction (file > specific folder > general folder for non-combinable fields; tags concat for combinable fields) and why specific-wins / file-wins is the only direction that doesn't invert user intent. Cites CSS specificity, Hugo archetype lookup, Obsidian folder-rule semantics as prior-art alignment.
- No behavior change — locked the rationale so future readers don't re-litigate the direction.

## Pending

- User direction on Q1 (a / b / c) for the frontmatter dual-truth case.
- Step 8: Verify + finalize after Q1 resolves.
