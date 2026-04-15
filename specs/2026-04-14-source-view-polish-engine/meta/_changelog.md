# Changelog

## 2026-04-14 — Session start

- Problem frame captured (SCR format, stress-tested)
- Baseline commit: f17ad00
- World model pre-loaded from prior research: `reports/codemirror-markdown-source-view-rendering/`, `reports/markdown-source-view-constructs/`, `reports/markdown-table-rendering-in-prose-columns/`
- `/analyze` self-assessment done — 9 of original 26 suggestions revised per discipline of "don't be distracting"
- No fresh `/worldmodel` dispatch needed — research is exhaustive for this surface

## 2026-04-14 — Preference simplification

- Dropped `polishLevel: 'off' | 'minimal' | 'full' | 'custom'` 4-tier enum
- Adopted `sourcePolish: boolean` binary model
- Rationale: no evidence for `minimal` persona; `custom` required per-construct UI complexity without clear user intent
- Exposure simplified to keyboard shortcut + localStorage only; no settings UI in Phase 1-5
- Transient toast (`Polish: On` / `Polish: Off`) on shortcut press for feedback
- Cascaded: SPEC.md §9 Preferences UX rewritten; no other sections affected (engine Compartment mechanism unchanged)

## 2026-04-14 — Further simplification: always-on, no toggle

**User decisions landed:**
- Q1 (default): `sourcePolish: true`, no user config, no peek
- Q2 (task checkbox): Future Work
- Q4 (highlight): deferred

**Cascades:**
- Dropped `sourcePolish: boolean` preference entirely. Engine is unconditional.
- Dropped Compartment wiring. Engine goes directly in the extension array.
- Dropped keyboard shortcut, localStorage, transient toast.
- Dropped hardbreak glyph opt-in path entirely (not a Phase 1-5 concern).
- Added implicit revisit trigger: ≥3 unique distracting-complaints → re-evaluate.
- Updated SPEC.md §6.1 architecture topology diagram, §6.5 extension wiring, §9 preferences UX.

**Still open:** Q3 (preserve-source-indent). User pushed for more context; /spec explains the technique + precedent and represents the decision with better framing.

## 2026-04-14 — Technical validation subagents (4 parallel opus)

**Validation scope:** pre-implementation verification against @lezer/markdown source, CM6 API source, y-codemirror.next local clone, CSS feature support, and 1P Open Knowledge state.

**Evidence files written:**
- `evidence/technical-validation-primitives.md`
- `evidence/technical-validation-crossscan-perf-yjs.md`
- `evidence/technical-validation-css-browser-support.md`
- `evidence/open-knowledge-1p-state.md`

**Spec corrections applied:**

*Node-name corrections (Subagent 1):*
- `LinkReferenceDefinition` → `LinkReference` (same node name, disambiguate by context)
- `ImageReference` → `Image` (reuses Image node with LinkReference child)
- `StrongMark` → `EmphasisMark` (single mark node for both * and **)
- `EscapeMark` → `Escape`
- `TableMarker` → `TableDelimiter`
- `markdown({ htmlParser })` → `markdown({ htmlTagLanguage })`

*API / prerequisites (Subagent 4):*
- Added §5b PR1 prerequisite: enable GFM on CM6 side via `markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages: languages, htmlTagLanguage: htmlLanguage })`. Currently bare. Blocks Phase 1.
- Added §5b PR2: `syntaxTreeAvailable()` gate convention for all syntax-tree consumers
- Added dependencies to install: `@codemirror/language-data`, `@codemirror/lang-html` (direct)
- Deferred: `@codemirror/lang-yaml` (to Phase 4 / Future Work)
- YAML frontmatter Phase 2 scope reduced to line-tint only (no nested YAML highlighting)

*Performance + StateField (Subagent 2):*
- §6.4 updated: group ViewPlugins by trigger profile; mandatory `!tr.docChanged` early-return in StateField; full rescan is idiomatic; syntaxTreeAvailable gate
- §14 risk row: y-codemirror.next interaction RESOLVED to NONE (source-verified)
- Block widgets (`Decoration.widget({ block: true })`) excluded from v1 per cursor-bug caveat

*CSS (Subagent 3):*
- Tables Tier 2 CSS mandates dual-write `-webkit-box-decoration-break: clone` + unprefixed
- All CSS features (color-mix oklab, oklch, custom props in inline style, calc with vars) confirmed in Vite 8 baseline-widely-available target
- No fallback needed beyond `-webkit-` prefix

*Scope additions (Subagent 1 + 4):*
- §16b new section: "Constructs without native @lezer/markdown nodes — detection strategy." Frontmatter + WikiLink via `customDetect` (regex, matches existing plugin pattern). No new lezer extensions required for v1.
- WikiLink §7.3: Path A (regex, matching existing wiki-link-source.ts) chosen over Path B (lezer extension, deferred)

*Preserve-source-indent (Subagent 1):*
- Removed UX validation gate (prior assessment overcautious; pattern is community-standard)
- Replaced with rectangular-selection caveat + note on composing with other line decorations
- Phase 1 exit gate updated with concrete benchmarks

*Assumptions refreshed (§17):*
- A1, A3, A4, A6 → CONFIRMED from source
- A2 → REFUTED → FIXED IN PR1
- A5 → UNCERTAIN (no published ceiling)
- Added A7-A12: packages missing/confirmed, version-support, CSS feature support, Tailwind v4 convention

**No new decisions required from user — all changes are corrections based on verified facts.**

## 2026-04-14 — Live DOM verification pass

**Verified live in dev server** (localhost:5180, PROJECT.md in source mode):

- Base @lezer/markdown grammar DOES tokenize (headings → `ͼ4l`/`ͼ4m`; bold → `ͼ4g`; inline code → `ͼ4p`). Verified via span-class inspection.
- Tables: confirmed `classSet: []` on pipe lines. Zero tokens. 100% plain text. Drift confirmed.
- Strikethrough: confirmed absent from span list. Inside a line containing `~~**content**~~`, only the `**...**` portion tokenizes (base grammar); `~~` is absorbed into plain-text runs. Drift confirmed.
- Frontmatter: PROJECT.md doesn't have one; known behavior of base grammar: would fire spurious `HorizontalRule` on the `---` fences.
- MDX components: not in PROJECT.md; base HTML grammar partial-recognizes `<Tag>` but no MDX semantic.
- Wiki-links: **existing `wiki-link-source.ts` regex ViewPlugin is already decorating wikilinks in source mode.** Not a gap.

**Scope reductions:**
- §7.3 WikiLink section: polish engine registry SKIPS wikilinks (existing plugin stays). Future Work tracks optional consolidation.
- §11 Phase 4: drop "WikiLink color-only styling" from phase scope.
- §12 Future Work: add "Consolidate wiki-link-source.ts into polish engine registry" with triggers.

Screenshot: `/tmp/source-view-table-area.png` captured showing the table-pipe wall.

## 2026-04-14 — /assess-findings routing of audit + design-challenge

**Corrections applied silently (14 items):**

From audit-findings.md:
- H1 (Compartment + toggle contradiction across §4/§6.5/§7.3/§9/§11/§14) — stripped all toggle/Compartment language from §4 In Scope + §7.3 trade-off + §14 mitigation + Phase 5 scope; §4 now matches §9 (engine always-on, no user toggle).
- H2 (YAML fold in Phase 2 exit gate) — removed "fold works" from Phase 2; now matches §7.2 (fold deferred to Phase 4+).
- H3 (§7.4 LinkReferenceDefinition + wikilink in cross-scan) — rewrote §7.4: uses correct `LinkReference` node with parent-node disambiguation; wikilinks excluded per §7.3 decision; cross-links to Design Challenge #3 for open consolidation question.
- H4 (htmlTagLanguage type error in §6.5 wiring) — replaced `htmlLanguage` with `html({ matchClosingTags: false })`; updated import to use `html` factory; added explanatory comment.
- M2 (§6.5 extension-array placeholder) — inlined full current extensions array with DELTA FROM CURRENT annotation; implementer can't accidentally drop agent-flash-source / wiki-link-source / md-link-source / theme block.
- M3 ("polish on vs off" acceptance) — reframed as "engine present vs engine removed from extensions array" (test-fixture distinction, no runtime toggle).
- M4 (§14 opacity cross-ref) — added numerical ceilings to §3 Must-pass directly; §14 cross-ref now accurate.
- L1 (unused import cascade) — resolved with H4 fix.
- L2 (Phase 5 P1 label) — Phase 5 rescoped and relabeled (P0), no longer about preferences.
- L3 (evidence file stale numbering) — noted but not fixed (evidence files are historical; not a blocker).

From design-challenge.md:
- M6 (rectangular-selection threshold) — added measurable criterion to §3 Must-pass AND §11 Phase 1 exit gate: "selection rectangle visually tracks the selected source text across ≥3 wrapped lines; copied text matches selected source exactly; visually imperfect rendering acceptable IF copy-text is correct."
- L7 (≥3 complaints trigger) — dropped the false-precision number; reframed as qualitative user-feedback trigger.

Plus: §4 "User preferences: none" sentence added to match §9.

**Surfaced for user judgment (5 design challenges):**
- H1: internal Compartment + auto-bail predicate (no user UI) — decision-implicating
- H2: PR1 first-class with own acceptance criteria — decision-implicating
- H3: WikiLink consolidate vs skip (broken-wikilink gap) — decision-implicating
- M4: Rainbow-HTML NEVER → NOT NOW with A/B test — process consistency
- M5: "cursor-addressable" framing instead of "source always visible" — invariant tightening

Presented to user as numbered batch in next message.

**Dismissed after assessment (1 item):**
- Audit M1 — auditor self-dismissed on re-read; `codeLanguages: languages` IS present.

**Informational only (no action):**
- Audit "Overconfident attributions" (Marijn Haverbeke framing) — evidence supports the underlying patterns; attribution is defensible in spirit but worth softening in a future polish pass. Not blocking.

## 2026-04-14 — Design-challenge cascade applied (5 resolutions)

Per /analyze of each of the 5 outstanding design challenges, all 5 adopted. Cascade order chosen to minimize re-read churn:

**#5 — Invariant reframe: "source always visible" → "source always addressable"** (HIGH confidence, 1-paragraph rewrite)
- §1 Resolution closing sentence rewritten: characters remain in document, cursor-reachable, select-copy-replaceable, find-replaceable. Pixel-visibility reduction permitted IFF addressability preserved.
- §3 Must-pass "No source hidden" → "Source addressability preserved" with explicit criteria.
- §5 NEVER row #1 updated: framing is "removes characters from document" (breaks addressability), not "hides source visually."
- §5 Obsidian Live Preview row: "Mode-switching friction" framing (was "violates source always visible").
- §7.3 thematic break: added addressability note — the `color: transparent` treatment is the worked example that motivated the invariant reframe; Phase 3 A/B tests transparent vs `opacity: 0.3` (both addressability-preserving).

**#1 — Internal Compartment + auto-bail predicate** (HIGH confidence, ~5 LOC architectural insurance)
- §6.4 decoration-count ceiling risk: cross-linked to §6.6 auto-bail.
- §6.5 extension wiring: engine now wrapped in `polishCompartment.of(...)`. Preserves every existing extension. Internal-only; no user UI.
- §6.6 NEW SECTION: auto-bail triggers = `doc.lines > 5000` OR `first-paint > 200ms`. On trigger → `compartment.reconfigure([])`. Silent; per-doc; not reversible in-session.
- §9 "Compartment is NOT used" language removed; replaced with "no user-facing Compartment surface" — internal-only one wired for auto-bail.
- §14 ceiling risk: impact downgraded MEDIUM → LOW (auto-bail is the mitigation).

**#2 — PR1 split into PR1a (first-class) + PR1b (convention)** (HIGH confidence, +1 PR cycle)
- §5b rewritten: PR1 → PR1a + PR1b. PR1a enables GFM AND provides explicit 12-entry `codeLanguages` allowlist (lang-javascript, lang-json, lang-yaml, lang-css, lang-html, lang-python, lang-rust, legacy-modes/bash, legacy-modes/go, lang-markdown, variants for ts/tsx). NOT `import { languages } from '@codemirror/language-data'` — that import emits 150+ lazy chunks regardless of usage (confirmed: mdx-editor/editor#896).
- PR1a exit gate: bundle-delta ≤20 chunks; regression pass (manual + Playwright `ux-interactions.e2e.ts`) on existing source-view UX (wiki-link chip, md-link-source, agent-flash); GFM tokenization spot-check.
- §6.5 wiring: `codeLanguages` is the allowlist from PR1a, not `languages`.
- §13 ASK_FIRST extended: "any change to `markdown()` call in SourceEditor.tsx beyond PR1a's specified allowlist" + "any change to `wiki-link-source.ts` beyond the Phase 4 broken-state addition."
- §14 NEW RISK row: PR1a blast radius (LIKELIHOOD MEDIUM, IMPACT MEDIUM, mitigated by own acceptance gates).
- §17 A7 updated: language-data NOT added; explicit packages used instead.

**#3 — Broken-wikilink added to existing plugin, not engine** (HIGH confidence, ~30 LOC in `wiki-link-source.ts`)
- Pivot from challenger's Option B (consolidate) to Option C (add to plugin). /analyze revealed `wiki-link-source.ts` is 243 LOC — completion, navigation, async cache are core to the plugin and have no home in engine registry schema.
- §7.3 WikiLink section fully rewritten: plugin stays construct-owner; ~30 LOC added to reuse existing `pagesCache` for broken-state detection; wavy-red underline class; handles cache-cold first-paint correctly.
- §7.4 cross-scan StateField: owns `LinkReference` only. Note updated to cite Design Challenge #3 option C.
- §11 Phase 4: scope adjusted — broken-wikilink is an addition to the plugin, not the engine. Exit gate adds broken-wikilink spot-check.
- §12 Future Work: "Consolidate wiki-link-source.ts" item REMOVED (explicitly not consolidating; plugin owns wikilinks).
- §14 NEW RISK row: "Broken-wikilink indicator not shipped in v1" → RESOLVED (Phase 4 adds it in plugin).

**#4 — Rainbow-HTML NEVER → NOT NOW with Phase 3 A/B** (HIGH confidence process; MEDIUM outcome)
- §5 non-goal row: NEVER → NOT NOW. Rationale: process consistency (other visual decisions get Phase 3 A/B; this one shouldn't be exempt from that discipline).
- §7.2 HTML block section: DROPPED → DEFERRED to Phase 3 A/B with clear resolution path — ship rainbow if testers prefer, reclassify as NEVER with evidence if plain wins.
- §11 Phase 3 scope: A/B test added. Exit gate: outcome recorded (ship or reclassify-NEVER).
- §12 Future Work: placeholder entry for Rainbow-HTML until A/B resolves.
- §4 Deferred list: updated to reflect NOT NOW posture, not "dropped per /analyze."

**Front-matter:**
- `Last updated` field reflects the cascade.
- Status remains Draft but annotated with "post 5-challenge cascade."

**Net outcome:** Spec is now internally consistent across §1 / §3 / §5 / §6 / §7 / §9 / §11 / §12 / §13 / §14 / §17. Every architectural decision has evidence backing and/or a resolution path (A/B test, benchmark, or plugin-owner clarification). No open contradictions. No items silently deferred.

**Next step:** Step 8 (verify + finalize) per /spec workflow.

## 2026-04-14 — Verification layer added (§10.7 / §10.7b / §10.8 / §10.9)

**User directive:** acceptance criteria can't be code-inspection only; some portions must be browser-based via /qa skill. Explicit guardrail: LLMs must NOT make aesthetic judgments; they MAY catch "clearly erroneous" objective issues.

**Three-bucket framing adopted:**
1. **Code-verifiable** — bundle manifest, TS compile, grep for required calls (existing, unchanged).
2. **Browser-automated (/qa + Playwright)** — objective DOM / selection / clipboard / timing / error assertions. NEW.
3. **Human-subjective** — aesthetic calls. NEW explicit prohibition on agent verdicts.

**Risk surface mapped (R1–R14):** CRDT regression, PR1a regression, Cmd+A corruption, auto-bail misfires, uncaught errors, cursor-walk, find/replace parity, multi-cursor / rectangular, perf, decoration classes + nested composition, theme swap, agent-write sync, WCAG contrast, box-decoration-break across wrap.

**Spec additions:**
- **§3 Must-pass** — "editing parity" bullet rewritten to point at §10.7 test matrix; added zero-console-errors must-pass bullet.
- **§10.7 NEW** — Automated browser verification (/qa + Playwright). Full R1–R14 test matrix with fixture / assertion / threshold / gating-phase columns. Every row is an objective boolean an agent can execute without aesthetic judgment.
- **§10.7b NEW** — Artifact capture: cropped screenshots per construct × both themes → `tmp/qa-screenshots/<date>-phase-<N>/` with `MANIFEST.md` index. /qa captures for human review; does NOT grade images. (Per user's "would be neat to just review.")
- **§10.8 NEW** — Human-only judgments (NO LLM aesthetic calls). Explicit prohibited-to-agent list: 3-meter test, glance test, "reads natural," "feels busy," Phase 3 A/B winners.
- **§10.9 NEW** — Error surface (zero tolerance). `page.on('pageerror')` + console-error capture → any non-empty list = test failure. Enumerates specific must-fail signatures: uncaught exceptions, React hydration, Yjs delete warnings, y-prosemirror schema-throw fallbacks, CM6 requestMeasure loops, CSS parse errors.
- **§11 phase exit gates** — every phase's exit gate rewritten to name specific R-rows from §10.7 plus human-only §10.8 items where relevant. Phase cannot exit without named rows green.

**Philosophical anchor for future agents:** this spec distinguishes "work or broken" (agents CAN check) from "looks right" (humans ONLY). The boundary is load-bearing. Agents that drift toward aesthetic verdicts MUST be corrected.

**Open items deferred to implementation:** specific fixture file paths (`fixtures/construct-<name>.md` convention), Playwright helper extraction for the R1 two-client harness, the `two-client Playwright harness` itself (build during Phase 1). These are implementation details, not spec decisions.

## 2026-04-14 — Step 8 finalize

**Resolution completeness gate: ✓.** §16 Decision Log populated with 27 entries (D1–D27), each tagged LOCKED / DIRECTED / DELEGATED. Every P0 decision has a resolution status; no decision sits unresolved.

**Pressure-test applied bidirectionally:**
- Every LOCKED decision challenged with "does this truly need to be locked?" — all 14 LOCKED entries represent either a 1-way architectural door (D1, D4, D10, D11), a load-bearing invariant (D9, D16, D17), a user-directive scope boundary (D2, D5), or an externally-determined constraint (D12, D13, D18, D23, D24, D27). None over-locked.
- Every DIRECTED / DELEGATED decision challenged with "could this safely be LOCKED?" — all 13 represent either bounded latitude within a named envelope (D3, D7, D8, D14, D15, D19, D25, D26) or empirical-oracle questions (D20, D21, D22) that cannot be pre-answered without benchmark or tester data. None under-locked.

**§15 Open Questions = none.** What would have been open questions are enumerated as DIRECTED/DELEGATED in §16 with explicit resolution paths (Phase 1 benchmark, Phase 3 A/B, tester verdict).

**Baseline drift check: ✓.** HEAD = f17ad00 at finalize. Files the spec analyzes — `packages/app/src/editor/SourceEditor.tsx`, `packages/app/src/editor/plugins/wiki-link-source.ts`, `packages/app/src/globals.css`, `package.json` — unchanged on working tree. Unrelated modifications (PROJECT.md, bun.lock, CATALOGUE.md, other specs) do not affect spec claims.

**UNRESOLVED/UNCERTAIN labels audited:**
- §6.4 "Decoration count ceiling — UNRESOLVED" — resolved by D3 auto-bail (DIRECTED). Label retained as honest acknowledgment that no maintainer-published number exists; Phase 1 benchmark produces the calibrated threshold.
- §17 A5 "Cross-scan perf UNCERTAIN" — explicit Phase 4 exit-gate expiry. Label retained as honest statement of pre-benchmark unknown.

Both are acceptable: they label data we do not have yet but have a resolution path for, not unresolved decisions.

**Status change:** Draft → Finalized. Spec is ready for implementation. PR1a is the first actionable change.

**Meta:** total session produced:
- 3 research reports (codemirror-markdown-source-view-rendering, markdown-source-view-constructs, markdown-table-rendering-in-prose-columns)
- 4 evidence files (primitives, crossscan-perf-yjs, css-browser-support, 1P-state)
- 1 nested investigation (agents-manage-ui skills-editor comparison)
- 2 audit subprocesses (audit-findings, design-challenge) with 18 total findings — 14 cascaded silently, 5 surfaced as design challenges, all resolved
- 27 formally-tagged decisions
- 14 browser-automated verification rows (§10.7 R1–R14)
- 0 open questions remaining at finalize
