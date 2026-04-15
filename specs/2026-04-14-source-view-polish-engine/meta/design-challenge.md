# Design Challenge Findings

**Artifact:** `specs/2026-04-14-source-view-polish-engine/SPEC.md`
**Challenge date:** 2026-04-14
**Total findings:** 7 (3 high, 3 medium, 1 low)

Lenses applied: DC1 (simpler alternative), DC2 (stakeholder gap), DC3 (framing validity).

---

## High Severity

### [H] Finding 1: No-toggle ship + no performance bailout is a single-point-of-failure for source view usability

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE/customer-facing)
**Location:** §9 Preferences UX; §6.4 Performance characteristics; §14 Risks (row "Unpublished decoration-count ceiling")
**Issue:** §9 commits to "always-on, no toggle, no Compartment" *and* §6.4 admits the decoration-count ceiling is UNRESOLVED with no maintainer-published number. §14 lists this as MEDIUM/MEDIUM with mitigation "introduce a 'pause polish above N lines' fallback" — but no fallback is in §11 phase exit gates, and §9 explicitly removes the runtime-reconfigurable Compartment that would make per-doc bail trivial. The combination means: a user opens a pathological doc (long generated CHANGELOG, vendored minified file masquerading as `.md`, AI-dumped multi-MB transcript), the engine bogs, and the user has *no* escape — they cannot disable polish, they cannot fall back to plain CM6, and the editor is the only path to that file.
**Current design:** "The engine ships always-on. No user-facing toggles. … Compartment is NOT used. … pre-emptive Compartment wiring is unneeded complexity."
**Alternative:** Keep the engine unconditional in the default extension array, **but wire it inside a Compartment from day one** with an internal-only auto-bail predicate (e.g., `doc.lines > 5000` or first-paint benchmark > threshold → `compartment.reconfigure([])`). No user UI, no preference surface. Compartment cost is ~5 lines of code; auto-bail is the safety net that §14 already says we'll need.
**Trade-off:** Adds ~5 LOC and a single threshold constant now. Removes the 1-way-door risk of a future user complaint becoming "this product is broken on doc X" with no in-product remediation. The "Compartment is unneeded complexity" rationale conflates user-facing toggle (correctly rejected) with internal reconfigurability (different decision).
**Status:** CHALLENGED
**Suggested resolution:** Reopen §9's "Compartment is NOT used" subdecision. Keep the no-user-toggle stance. Add an auto-bail Compartment as belt-and-suspenders, gated by the Phase 1 benchmark numbers.

---

### [H] Finding 2: PR1 (engine prerequisite) is bundled with a system-wide GFM/HTML/language-data enablement that has blast radius beyond this spec

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE/maintainer); DC3 (framing validity)
**Location:** §5b PR1; §6.5 Extension wiring; §13 Agent Constraints
**Issue:** PR1 enables `GFM` extension on `@codemirror/lang-markdown`, switches to `markdownLanguage` base, adds `codeLanguages: languages` (loads the entire `@codemirror/language-data` bundle on demand), and wires `htmlTagLanguage: htmlLanguage`. This changes:
  1. Bundle size — `@codemirror/language-data` is not free; `codeLanguages: languages` enables every language CM ships, lazy-loaded.
  2. Tokenization of every existing source-view session — strikethrough, tables, tasklists, GFM autolinks now tokenize as syntax-tree nodes where they were plain text before. Existing `wiki-link-source.ts` and `md-link-source.ts` regex-scan over `view.visibleRanges` and may now collide with GFM autolink ranges (the spec's own §6.5 note acknowledges "plugin-pattern coexistence" but doesn't trace this specific interaction).
  3. y-codemirror.next is decoration-blind (§14 confirms), but `basicSetup` and other built-in extensions consume the syntax tree — auto-indent, bracket-matching, and `markdown` language-pack commands change behavior when the grammar gains nodes.
PR1 is justified as "5-10 line change" but the load-bearing claim is the tokenization/bundle change, not LOC count. §13 ASK_FIRST gates "y-codemirror.next integration" but not "lang-markdown configuration changes" — so an implementer could ship PR1 without the cross-cutting review it warrants.
**Current design:** "It's a 5-10 line change in `SourceEditor.tsx` + `package.json`, but it's load-bearing." PR1 is described as a prerequisite, not as a separately-validated change with its own exit criteria.
**Alternative:** Split PR1 from the engine PR with its own validation: (a) bundle-size delta measured and accepted; (b) `codeLanguages: languages` swapped for an explicit allowlist (mdx, ts, tsx, js, json, yaml, css, html, bash, py — covers ~95% of code blocks at a fraction of the bundle); (c) a regression pass on existing source-view behavior (typing in tables before/after GFM, autolink tokenization vs `md-link-source.ts` regex precedence). Promote "PR1 lands cleanly without regressing existing source-view UX" to an explicit gate before Phase 1 starts engine work.
**Trade-off:** Slows the engine work by one PR cycle. Buys a clean factoring where engine bugs and grammar bugs don't co-mingle, and bundle cost is consciously chosen rather than transitively inherited.
**Status:** CHALLENGED
**Suggested resolution:** Treat PR1 as a first-class change with its own §3-style success criteria (no bundle bloat beyond X KB, no regression in existing source-view behaviors, explicit `codeLanguages` allowlist).

---

### [H] Finding 3: WikiLink "skip" decision creates two persistent decoration systems with no consolidation trigger — sets the precedent

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §7.3 WikiLink (SCOPE REDUCED); §12 Future Work (Explored — Consolidate `wiki-link-source.ts`)
**Issue:** The spec explicitly leaves `wiki-link-source.ts` as a regex-scanning ViewPlugin outside the engine, with consolidation in Future Work. CLAUDE.md architectural precedent #4 ("Shared computation, per-surface rendering. Logic that determines *what* to render lives in one shared module … prevents divergence-by-copy-paste") is the exact opposite of what this spec ratifies. By the time Phase 4 ships, the source view will have:
  - `wiki-link-source.ts` (regex, own ViewPlugin)
  - `md-link-source.ts` (regex, own ViewPlugin)
  - `agent-flash-source.ts` (existing)
  - `constructPolishEngine` (registry, ViewPlugin + StateField)
  - and no broken-wikilink path inside the engine because the engine "skips" wikilinks (§11 Phase 4 explicitly carves wikilink broken-state out: "wikilink broken-state is the existing plugin's concern")
The engine's broken-ref cross-scan handles `[text][missing-label]` but not `[[Missing Page]]`, and the existing plugin doesn't do broken-state at all today (verified in §7.3 — current plugin's "visual treatment is whatever it is today"). **Net effect: the engine's signature feature (cross-scan broken-ref) ships with a hole the user will notice immediately** — link refs flash wavy red, wikilinks don't, even though wikilinks are the Open Knowledge-native primitive.
**Current design:** "Decision for Phase 4: do not include WikiLink in the polish engine registry. The existing plugin covers this construct. Double-decoration would just pile style on style."
**Alternative:** Consolidate `wiki-link-source.ts` into the registry as a `customDetect` entry in Phase 4 (the spec already documents §16b's pattern for regex-based detection). Cost: porting ~50 LOC from a standalone plugin to a registry entry, deleting the standalone file. Benefit: one decoration source per construct, broken-wikilink cross-scan ships as a unified feature, the architectural precedent holds.
**Trade-off:** ~1 day of refactor risk on a working file, vs. years of "two systems, which one decorates this?" cognitive cost and the hole in cross-scan coverage. The "engine fills gaps, doesn't re-decorate" framing sounds right but the gap (broken wikilink indicator) is exactly what cross-scan was built for.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) promote the consolidation into Phase 4, scoped tight; or (b) explicitly accept that broken-wikilink will not ship in v1 and document why a user seeing wavy-red on `[ref]` but not `[[Page]]` is acceptable. Don't punt to Future Work without naming the gap.

---

## Medium Severity

### [M] Finding 4: Rainbow-HTML "self-assessed as distracting" without a validation step contradicts the spec's own validation discipline

**Category:** DESIGN
**Source:** DC1 (simpler alternative); DC3 (framing validity)
**Location:** §5 Non-goals (last row); §7.2 HTML block (Rainbow-HTML DROPPED)
**Issue:** Rainbow-HTML (alternating attribute background colors) is dropped as NEVER with the rationale "Self-assessed as distracting, not clarifying; conventional HTML syntax highlighting supersedes." Yet §3 mandates a "composition-page test" with subjective tester verdicts for *other* visual decisions (preserve-source-indent in §10.6, thematic-break opacity in §7.3, highlight Option A vs B in §7.3) — but Rainbow-HTML is killed pre-test. The asymmetry is that conventional HTML syntax highlighting (token colors per attribute name, value, tag) and rainbow grouping (alternating bg per attribute *pair*) solve different problems: token coloring tells you "this is an attribute name vs a value"; rainbow grouping tells you "this attribute belongs to *that* tag" in a multi-line wrapped HTML element. The spec's product position is multi-line wrapped HTML blocks (no h-scroll), which is the exact case rainbow grouping helps with.
**Current design:** "Rainbow-HTML alternating-color pairs NOT used (judged distracting in /analyze)" — judgment without a tested artifact.
**Alternative:** Phase 3 includes HTML block in the composition-page test. Add a one-line A/B: same fixture with conventional-only vs conventional+rainbow. If testers can't tell the difference or prefer plain, ship plain. Cost: ~30 minutes of tester time. Benefit: the NEVER classification becomes evidence-backed instead of self-assessed.
**Trade-off:** A tiny extra Phase 3 task. The risk of testing it and finding it useful is worth more than the certainty of having ruled it out.
**Status:** CHALLENGED
**Suggested resolution:** Demote NEVER to NOT NOW; include in Phase 3 composition-page A/B; document the test outcome as the rationale.

---

### [M] Finding 5: S2-only commitment without a documented escape hatch for constructs where S3 (widget-replace) is obviously better

**Category:** DESIGN
**Source:** DC1 (simpler alternative); DC3 (framing validity)
**Location:** §1 Resolution; §5 Non-goals (rows 1, 3, 4); §6.3 Dispatch rules; §7.5
**Issue:** The S2-only stance is product-load-bearing for prose, code, blockquote, lists, links — all constructs where source readability matters and rendered form would mislead. The stance is *not* obviously load-bearing for: (a) `thematicBreak` — §7.3 already proposes `color: transparent` to fade the `---` text and let the rule dominate, which is functionally a partial S3 (source becomes invisible in the visual sense); (b) image markers — `![alt](url)` reads as noise no matter how it's polished and an inline thumbnail (currently NEVER) is the cited Out of Scope. The spec treats S2 as a categorical commitment, but `thematicBreak` already crosses the line (text rendered transparent ≈ hidden). The framing of "S2 vs S3" as a clean binary is therefore not as load-bearing as §1 implies; the real invariant is "characters remain selectable / find-replace-able / cursor-addressable," which a non-replacing widget on the side of an opaque-text region preserves.
**Current design:** "Source text always visible; no horizontal scroll; no cursor-entry mode switching." (§1)  / "Render any markdown construct as HTML in source view" → NEVER (§5).
**Alternative:** Reframe the invariant from "S2 only" to "characters always cursor-addressable and select-copy-replaceable." Under that framing, `Decoration.replace({ block: false })` with the original text preserved as accessible-only (or styled near-invisible) is permitted for narrow constructs where it provides obvious value. This doesn't open the floodgates — it's still per-construct registry decisions — but it removes a categorical NEVER that the spec is *already partially violating* with `color: transparent`.
**Trade-off:** Slight loss of architectural simplicity ("S2-only" is a one-sentence rule). Gain: the spec's own `thematicBreak` decision becomes coherent with the stated invariant rather than a quiet exception.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) accept that the invariant is "addressability not visibility" and rewrite §1 / §5 row 1 in those terms; or (b) explicitly defend why `color: transparent` on `---` is not a violation of "source always visible" (it's hidden visually but addressable).

---

### [M] Finding 6: Phase 1 exit gate accepts rectangular-selection visual quirk as "documented if known-quirk-only" — gives implementer no acceptance threshold

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — implementer/QA)
**Location:** §11 Phase 1 exit; §7.2 Fenced code (Preserve-source-indent caveat); §14 Risks (top row)
**Issue:** Three sections collectively lay out: preserve-source-indent has known rectangular-selection visual quirks (§7.2); Phase 1 exit gate says "Rectangular-selection behavior documented (not blocking if known-quirk-only)" (§11); risk row says "Accept as known; documented in §7.2. Future Work if users complain" (§14). What is NOT specified anywhere: how badly the quirk can manifest before it stops being "known-quirk-only" and starts being a regression. An implementer could ship visibly broken rectangular selection (selection rectangle drifts off the visual line, or shows ghost cells from the unindented baseline) and still pass the gate. The acceptance criterion is missing.
**Current design:** "Rectangular-selection behavior documented (not blocking if known-quirk-only)."
**Alternative:** Add a concrete acceptance criterion to §11 Phase 1 exit: "Rectangular selection across N≥3 wrapped fenced-code lines: selection rectangle visually corresponds to the selected text within ±X px; copied text matches selected source exactly." Implementer can then verify mechanically.
**Trade-off:** Implementer time to add a Playwright test. Cheap relative to shipping a regression on a power-user feature (rectangular selection is used by the exact "developer editing markdown source" persona in §2).
**Status:** CHALLENGED
**Suggested resolution:** Tighten §11 Phase 1 exit gate with a measurable rectangular-selection test, even if visually-imperfect-but-text-correct is the accepted bar.

---

## Low Severity

### [L] Finding 7: "≥3 user complaints" revisit trigger has no instrumentation behind it

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing)
**Location:** §9 last paragraph
**Issue:** "if ≥3 users file unique complaints that the polish is distracting / overwhelming, revisit in a dedicated follow-up" — but the spec doesn't say where complaints get filed (GitHub issue label? Linear tag? in-product feedback?), who watches, or how "unique" is judged. Without an instrumentation plan, the trigger condition is unobservable and won't fire.
**Current design:** "if ≥3 users file unique complaints…" — informal trigger, no observation channel.
**Alternative:** Either (a) attach a labeling convention (e.g., "GitHub issues with `source-view-polish` label") and an owner who scans monthly; or (b) downgrade to "if user feedback indicates polish is distracting, revisit" without the false-precision threshold.
**Trade-off:** None, just clarity.
**Status:** CHALLENGED
**Suggested resolution:** Pick (a) with a named label and owner, or (b) remove the numeric threshold.

---

## Confirmed Design Choices (summary)

The following held up under challenge:

- **DC1 — Declarative registry over per-construct files (SilverBullet pattern).** §6.2 schema is well-factored; per-construct-file approach (raised in user prompt #7) would duplicate dispatch wiring. Registry's overhead is a one-time learning cost that pays back at construct #4+. No challenge.
- **DC1 — Visual-only task checkbox in v1 (deferred toggle to Future Work).** The cursor + CRDT + IME interaction risks called out in §12 are real; phase split is correct. Click-to-toggle has known correctness traps (cursor-jump on rewrite, multi-cursor races). Defer is the right call.
- **DC3 — Problem framing (Complication: wrap-under-structure, no S2 prior art).** Evidence files corroborate the gap. PROJECT.md table at 2973 chars / 745 px is concrete pathology, not manufactured urgency.
- **DC3 — Phase sequencing (parse-prereqs → engine + pilots → block-completeness → inline → cross-scan → preferences).** The dependency direction is correct: GFM enablement is a hard prereq for tables; cross-scan is downstream of inline link decoration. Re-grouping (parse-first vs render-first per user prompt #8) would not unblock anything earlier — PR1 already isolates the parse work.
- **DC2 — y-codemirror.next interaction.** §14 source-verified that y-sync.js is decoration-blind. Holds up.
