# Design Challenge Findings — Convergence Pass (Final-2)

**Artifact:** `specs/2026-04-12-remark-prosemirror-migration/SPEC.md`
**Challenge date:** 2026-04-12
**Pass:** Convergence challenger — stress-tests ONLY the amendments introduced after `design-challenge-final.md` (D20 LOCKED, R23 P0, OQ1 OPEN, R21 expanded, G4 amended).
**Scope discipline:** prior-pass findings (`design-challenge.md`, `design-challenge-final.md`) verified as applied; not re-raised.
**Total findings:** 4 (1 HIGH, 2 MEDIUM, 1 LOW) + one meta-observation.

---

## High Severity

### [H] Finding 1: D20 `escapeMark` has unresolved ProseMirror semantics at text-run boundaries

**Category:** DESIGN
**Target:** D20 (LOCKED), R5(b)
**Location:** §10 D20, §6 R5

**Issue.** D20 picks `escapeMark` as a "zero-width mark applied to text runs whose source contained a backslash." In ProseMirror's model, marks attach to text nodes and are carried as an attribute set on each character of a run. Three concrete questions the rationale does not answer:

1. **Which character carries the mark?** mdast consumes the backslash, so after parse the PM text is `text # more`. Does `escapeMark` attach to the `#`? To a synthetic run boundary? If it attaches to the `#`, then `\#` and `#` (already-literal hash) become schema-indistinguishable unless the mark encodes "the preceding source had a `\`" — which is positional metadata, not a mark property.
2. **End-of-line / trailing escapes.** Source `foo\` at end of line, or a line-continuation escape. There is no character after the `\` for the mark to attach to. PM marks on an empty text node are discarded by most schemas.
3. **Mark boundary composition.** D20 acknowledges `**bold\*word**` as a "known limitation — verify in R16." But "verify" is not a design — if the position-walker emits `escapeMark` across the emphasis delimiter span, does it compose with `strong`? If not, serialization produces `**bold*word**` (wrong). The spec defers this to R16 test results, but R16 is acceptance, not design.

The argument that `escapeMark` "aligns with sourceDelimiter pattern" is not quite right. `sourceDelimiter` is an **attribute on an existing mark** (`emphasis.sourceDelimiter = '_'`). `escapeMark` is a **new mark type**, not an attribute on an existing one. The parallel is rhetorical, not structural.

**Alternative.** Two options with better-defined semantics:
- (a) Store escape metadata as a **boolean attribute on the `text` node** (PM permits node attrs on text — `HardBreak` etc. already demonstrate this pattern via `markup` attrs). A `text` node carrying `data-escaped-positions: [3, 7]` is unambiguous at all boundaries and doesn't fragment or require mark composition. Not "zero-width" — it's a property of the run.
- (b) Keep `escapedText` atom but only emit it when a backslash escape is structurally ambiguous (the `\#` case). For escapes that don't affect parsing (`\foo`), don't record — round-trip loses the slash, documented NG.

Option (a) is simpler than D20 and avoids the three edge cases above. Option (b) narrows scope.

**Status:** CHALLENGED
**Suggested resolution.** Either (i) amend D20 with answers to the three boundary questions (including a concrete rule for end-of-line escapes and cross-mark escapes), backed by a 1-hour PM-schema probe that prototypes the `\#` case and the `**bold\*word**` case; or (ii) switch to the text-attr approach in option (a); or (iii) narrow scope per option (b) and accept the single `\#` P0 miss as NG6-class documented limitation.

---

## Medium Severity

### [M] Finding 2: R23 option (iii) "document as limitation" is incompatible with G4 as now written

**Category:** DESIGN
**Target:** R23, G4
**Location:** §2 G4, §6 R23

**Issue.** G4 now says: *"zero cases in the `old-stack: pass / new-stack: fail` regression bucket."* R23 says the autolink + bare-HTML regression has three mitigation options and recommends (i) or (ii) but lists (iii) — "document as user-facing limitation with explicit escaping guidance (`\<`)" — as an option.

If R23 option (iii) is chosen, `<https://example.com>` goes from `old: pass (normalizes)` to `new: fail (ERROR)`. That puts a case in the regression bucket G4 forbids. R23 and G4 are logically inconsistent if (iii) is truly live.

R23's own gate text ("R1 probe re-run shows 0 cases in the `old: pass / new: ERROR` bucket") also contradicts option (iii) — documenting a limitation does not change the probe verdict.

**Alternative.** Remove option (iii) from R23 explicitly. Only options (i) preprocess and (ii) custom micromark extension are compatible with G4.

Additionally, option (i) — preprocess source before remark-mdx — has unstated complexity. Autolink-like content can appear **inside** JSX children (`<Callout>see <https://example.com></Callout>`), and a naive preprocessor would break valid MDX. A preprocessor that distinguishes autolink-position from JSX-child-position effectively reimplements the MDX tokenizer's dispatch logic. The probe did not exercise this; the wiki-link probe is not a comparable precedent (wiki-link `[[...]]` does not collide with valid MDX JSX syntax).

**Status:** CHALLENGED
**Suggested resolution.** (a) Drop R23 option (iii). (b) Add a 2-hour R23 sub-probe that implements option (ii) — micromark extension claiming `<url>` and void-HTML-tags before mdx-jsx claims `<`. The wiki-link probe result (20/20 tests, ~100 SLOC) is only a partial precedent — void-HTML vs MDX-JSX collision is a different hazard class because both start with `<` (wiki-link starts with `[[`, no collision). Expect 150-250 SLOC, not 100. (c) Lock the chosen option in R23 before implementation starts, not during.

---

### [M] Finding 3: OQ1 deferral to "R19 first commit" lacks a failure gate

**Category:** DESIGN
**Target:** OQ1, R19
**Location:** §11 OQ1, §6 R19

**Issue.** OQ1 is the only OPEN question in the spec and is marked "surfaces during R19 implementation." The mitigation is "scope keymap binding via `editor.isActive('listItem')` check; fall through to outer bindings otherwise. Verify with screen-reader testing."

Two problems:

1. **No acceptance gate.** "Verify with screen-reader testing" is an instruction, not a criterion. R19's acceptance (§6) mentions "Tab/Shift-Tab accessibility parity (OQ1 — scope Tab binding to list context only)" but does not say what "parity" means or what verdict blocks R19 from closing. If the keymap works for indent/outdent but hijacks Tab inside tables (the specific concern OQ1 raises), does R19 fail?
2. **"First commit" is not a phase boundary.** §9 phasing has 7 commits; R19 is implicit across commits 1-4 (dependency swap → scaffold → handlers → deletes). Commit 1 adds the dependency but can't exercise Tab because the input rules aren't wired. "First commit" is ambiguous.

A deferred a11y concern without an enforcement gate historically gets skipped — the implementer will make the keymap work, not verify a11y end-to-end.

**Alternative.** Convert OQ1 into an explicit R19 acceptance line: *"Tab inside a `listItem` indents the item; Tab inside a `tableCell` advances cells; Tab inside a `codeBlock` inserts a literal tab. Shift-Tab is the reverse in each case. Verified via Playwright keymap test (new, part of R16) + one screen-reader smoke pass (manual, noted in PR comment)."*

**Status:** CHALLENGED
**Suggested resolution.** Promote OQ1 mitigation from "path" to acceptance criterion on R19; add the three-surface keymap check (listItem / tableCell / codeBlock) as a required Playwright test in R16; require a PR-comment screen-reader smoke note before R19 marks done.

---

## Low Severity

### [L] Finding 4: R21's claim about `StarterKit.configure({ bold: false })` keys is asserted without a new probe

**Category:** EVIDENCE
**Target:** R21
**Location:** §6 R21, meta/_changelog.md "C-H2 StarterKit rename concern"

**Issue.** R21 now asserts — and the _changelog claims verified during amendment — that `StarterKit.configure({ bold: false })` keys are **extension names, not schema names**. The evidence cited is "confirmed" without a pointer to source or a new probe. The original design-challenge-final.md H2 flagged exactly this as needing a 30-min smoke test. The resolution was to expand R21's scope (which is good), but the underlying factual claim — "extension keys stay `bold`/`italic`/`horizontalRule` since StarterKit's internal extensions keep their original names" — is still asserted rather than demonstrated.

This is a low-severity factual-grounding gap rather than a design defect. The claim is almost certainly correct (it matches TipTap's StarterKit source convention), but R21's acceptance already includes "land smoke results as evidence" — that is the check. The gap is that the smoke test hasn't been run *pre-implementation*, so if the claim turns out wrong, R21's acceptance blocks discovery until mid-R19.

**Alternative.** A 15-minute local script: in the current app, import StarterKit, configure `{ bold: false }`, inspect what's in `editor.schema.marks` and `editor.extensionManager.extensions` — confirm which name the key matches. Land the snippet as `evidence/starterkit-disable-key-verification.md`.

**Status:** CHALLENGED (low)
**Suggested resolution.** Pre-flight the StarterKit disable-key verification as a 15-min evidence script before R21 lands. Or defer with awareness that R21's smoke-test acceptance is the gate.

---

## Meta-observation — spec weight

**Not a finding; a reviewer note.**

Question 5 asks: is the spec over-engineered? My read: **no, but at the ceiling of useful weight.** The artifact is large (23 R, 20 D, 18 Q + OQ1, 3 probes, §17-§19 grounding) for a library swap, but:

- Every LOCKED decision has a user-visible rationale or probe evidence.
- §17-§19 exist because the schema redesign (D15-D17) and MDX-sprint framing (D13) expanded the migration from "swap library" to "adopt mdast-canonical schema + new list model + MDX first-class." These are separate features riding on the migration commit; they justify the weight individually.
- §18 change manifest is genuine implementer-grounding, not ceremony (it names files, not concepts).

That said, one compression opportunity: §19 (implementation grounding) and §17 (schema adopted) both restate decisions already in §10. A pass merging overlap — e.g., moving §17.2 content into D15's evidence column — would reduce the artifact ~15% with no information loss. Non-blocking.

The probe gate (D3) earned its keep: the probe found the `\#` miss, the autolink regression, and the MDX #2533 convergence — three load-bearing facts that would otherwise have surfaced mid-implementation. The spec is heavy because the migration is genuinely multi-feature; I'd rather ship this heavy spec than a thinner one that defers D15-D17 schema work.

---

## Summary

| Finding | Severity | Status |
|---|---|---|
| F1 | D20 escapeMark semantics at PM text-run boundaries | HIGH |
| F2 | R23 option (iii) inconsistent with G4 | MEDIUM |
| F3 | OQ1 lacks failure gate | MEDIUM |
| F4 | R21 StarterKit key claim asserted not probed | LOW |

**Prior findings rechecked (not re-raised):**

- Final-pass H1 (list schema A-vs-B) → §19.6 + D15 now consistent per final _changelog. Not re-raised.
- Final-pass H2 (schema-rename smoke) → R21 expanded + smoke-test acceptance added. Underlying factual grounding weak (see F4 above), but the structural fix landed.
- Final-pass H3 (per-case regression bucket) → G4 + M1 + R1 + R23 now consistent; F2 flags only the R23 option (iii) residual.
- Final-pass M4-M7, L8 → all applied per _changelog; spot-check of resolutions confirms no regression.

**Verdict:** The design has substantially stabilized. All HIGH findings from prior passes were addressed structurally. The remaining HIGH (F1) concerns the *specifics* of the D20 locked choice, not the broader migration design. The two MEDIUM findings (F2, F3) are tightening asks on newly-introduced amendments, not new architectural concerns. F4 is an evidence grounding gap, not design. No new architectural concerns have emerged in this round.

Areas examined: D20 (PM semantics, Y.Doc interaction, boundary behavior, parallel-to-sourceDelimiter claim), R23 (three-option viability, G4 consistency, probe precedent transfer from wiki-link), OQ1 (gate definition, phase boundary, acceptance semantics), R21 (StarterKit key claim evidence chain), G4 (consistency with R23 options), overall spec weight vs. information density.
