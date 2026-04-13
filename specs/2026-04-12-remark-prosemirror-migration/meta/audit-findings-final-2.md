# Audit Findings (Convergence — Round 3)

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/remark-prosemirror-migration/specs/2026-04-12-remark-prosemirror-migration/SPEC.md`
**Audit date:** 2026-04-12
**Scope:** Convergence audit — only new inconsistencies introduced by the amendments after `audit-findings-final.md`
**Total findings:** 5 (2 HIGH, 2 MEDIUM, 1 LOW)

> **Not CONVERGED** — one HIGH-severity schema-enumeration drift plus a cross-reference gap in D20's acceptance criteria need resolution. The other three findings are cleanup.

---

## High Severity

### [H] Finding 1: `escapeMark` is LOCKED in D20 but missing from §17.2 schema enumeration (count drift)

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction) + L5 (summary coherence)
**Location:** §17.2 vs D20 vs §18.1
**Issue:** D20 (LOCKED) adopts a new PM-level mark named `escapeMark`. §18.1 lists a test case for it. §17.2 "Adopted schema" still enumerates only 5 marks (`strong`, `emphasis`, `strikethrough`, `link`, `code`) and claims total "= 28 types." With D20 applied, the schema has 6 marks and 29 types. §17.2 header reads "17 blocks / 6 inline / 5 marks = 28 types" — both the marks count and the total are now wrong.
**Current text:** "### 17.2 Adopted schema (17 blocks / 6 inline / 5 marks = 28 types, full 1:1 mdast mapping) … **Marks (5):** **`strong`** … · `code`."
**Evidence:** D20 row (§10): "R5's fix for the P0 `\#` miss needed a decision. `escapeMark` — a zero-width mark applied to text runs whose source contained a backslash" — marked as LOCKED with "1-way door? Yes (schema)."
**Status:** INCOHERENT
**Suggested resolution:** Update §17.2 header to "17 blocks / 6 inline / 6 marks = 29 types" and add `escapeMark` to the Marks list with a note like "(attrs: none; a zero-width mark on text runs whose source contained a backslash escape — D20)." Also add a row to §17.3 "Changes from current schema" documenting the new mark.

---

### [H] Finding 2: D20 "Known limitation" cross-mark escape case is not covered by R16's enumerated tests

**Category:** COHERENCE
**Source:** L1 (cross-reference gap)
**Location:** D20 rationale vs R16(g)
**Issue:** D20's rationale explicitly flags a known limitation: "for escapes that span mark boundaries (e.g., `**bold\*word**`), `escapeMark` and the surrounding mark must compose — verify in R16 position-slice tests." R16(g) enumerates position-slice tests as "(`_emphasis_` stays `_` not `*`; `~~~` fences stay tildes; `+ item` stays `+`)" — none of which exercise the cross-mark escape composition case. D20 sends the reader to R16(g) for verification, but the test R16 describes does not cover it.
**Current text (D20):** "verify in R16 position-slice tests"
**Current text (R16(g)):** "position-slice delimiter recovery (`_emphasis_` stays `_` not `*`; `~~~` fences stay tildes; `+ item` stays `+`)"
**Evidence:** `**bold\*word**` requires `escapeMark` on the `*` character WITHIN a `strong` mark run — a composition scenario distinct from the bare-delimiter cases listed.
**Status:** INCOHERENT
**Suggested resolution:** Extend R16(g) (or add R16(i)) to explicitly enumerate the cross-mark escape test: `**bold\*word**` round-trips byte-identically with `escapeMark` composed inside `strong`. Mirror case for emphasis: `*em\*phasis*`. This makes D20's referenced acceptance concrete.

---

## Medium Severity

### [M] Finding 3: Pre-merge actions are scattered — no consolidated checklist for the implementer

**Category:** COHERENCE
**Source:** L5 (summary coherence) + reader-pass intuitive signal
**Location:** line 19 (Q15), §9 rollback rehearsal (line 247), R1 per-case delta (§6)
**Issue:** Three distinct pre-merge actions are now mandated — (1) Q15 tokenizer-comparison report on main; (2) §9 rollback-rehearsal scratch-revert + `bun run check`; (3) R1 per-case `old: pass / new: fail` delta being zero (enforced via R23 fixes) — but they're spread across three sections with no single "before merging, do these N things" list the implementer will see. The implementer following phasing commits 1-7 in §9 could plausibly finish commit 7 and open the PR without any of these surfacing.
**Current text:** Actions live in §1 link note, §9 rollback path, R1, R23, Q15.
**Evidence:** Comparable checklists in the same spec (e.g., STOP_IF in §16) are consolidated; these are not.
**Status:** INCOHERENT (scattering risk, not contradiction)
**Suggested resolution:** Add a "Pre-merge checklist" subsection in §9 (or at the end of §18) enumerating: (a) rollback rehearsal done, comment landed; (b) tokenizer-comparison report on main or copied; (c) R1 re-run showing zero `old: pass / new: fail` regressions (post-R23 fixes); (d) full `bun run check` + fidelity + stress green. Each item cross-references the governing requirement.

---

### [M] Finding 4: §16 SCOPE/EXCLUDE lists D15-D19 allowed schema changes but not D20

**Category:** COHERENCE
**Source:** L1 (cross-section)
**Location:** §16 EXCLUDE clause
**Issue:** §16 reads: "Any ProseMirror schema change **beyond** the specific renames (D16/D17) and unified-list adoption (D15) documented in §17" is EXCLUDED, and STOP_IF fires on "ProseMirror schema changes beyond D15-D17 scope." D20 adds `escapeMark`, a new mark on the schema — this is a schema change outside D15-D17. As written, an implementer adding `escapeMark` triggers STOP_IF.
**Current text:** "Any ProseMirror schema change **beyond** the specific renames (D16/D17) and unified-list adoption (D15)…" / "ProseMirror schema changes beyond D15-D17 scope — STOP, surface"
**Evidence:** D20 explicitly marked "1-way door? Yes (schema)" — unambiguous schema change.
**Status:** INCOHERENT
**Suggested resolution:** Update §16 EXCLUDE to "beyond the specific renames (D16/D17), unified-list adoption (D15), and the `escapeMark` mark (D20)" and update STOP_IF to "beyond D15-D17 or D20 scope."

---

## Low Severity

### [L] Finding 5: R23 option (ii) "custom micromark extension" has mild tension with D6's "not a custom micromark extension" framing

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** R23 option (ii) vs D6
**Issue:** D6 is titled "Use remark-mdx for MDX support (not a custom micromark extension)" — the rationale scopes the prohibition to MDX parsing, but the bare title reads as a general rule. R23 option (ii) proposes "register a custom micromark extension that runs before mdx-jsx to claim these [autolink/void-HTML] patterns" — technically compatible with D6 (it guards autolinks, not MDX), but a reader scanning the decision log could misread a conflict.
**Current text (D6):** "Use remark-mdx for MDX support (not a custom micromark extension)"
**Current text (R23):** "(ii) register a custom micromark extension that runs before mdx-jsx to claim these patterns"
**Status:** INCOHERENT (cosmetic — not a real contradiction)
**Suggested resolution:** Either re-title D6 to "Use remark-mdx for MDX parsing" (scoping the rule), OR add a note in R23 option (ii) like "(not in conflict with D6; D6 prohibits a custom tokenizer *replacing* remark-mdx's MDX parsing, not a guard extension)." The former is cleaner.

---

## Confirmed claims (convergence check)

These focus-area checks passed:

- **R23 → R16(a) cross-reference.** R8 references `R16(a)` for MDX test enumeration; that line in R16 does list MDX flow/text/expression/esm cases. R23 itself is cross-referenced from §18.1 tests and §6 M1 regression delta — those references resolve.
- **OQ1 references.** R19 and D15 both reference OQ1; OQ1 exists in §11 with OPEN status. Resolves.
- **§17.2 block/inline counts.** 17 blocks + 6 inline = 23 (correct given listed names); only the marks count is wrong (see Finding 1). Block enumeration itself is internally consistent.
- **R23 in §18.1.** Autolink + bare-HTML regression coverage is listed as a new test bullet. ✓
- **D20 traced.** D20 appears in R5, Q2 resolution, §18.1, §10 decision log. Only §16 and §17.2 are missing it (findings above).
- **D5 "Subsumed by D15" consistency.** §18.2 says `list-item-fidelity.ts` is subsumed (D5, R11, R19); D5's rationale mirrors this. Consistent.
- **Orphan decisions.** D1-D20 all trace to at least one requirement or section. No orphans.
- **G4 "zero regressions" vs M1/R1.** G4, M1(b), and R1 all agree: zero `old: pass / new: fail` cases. G8's "match-or-beat" is the aggregate floor, compatible with (not contradicting) G4's stricter per-case gate.
- **OQ1 prefix.** The "OQ" prefix is intentional (distinguishes still-OPEN from RESOLVED Q1-Q17) but the §11 header text doesn't explain the convention. Not worth a finding — the "OPEN" status column makes the distinction self-evident.
- **wikiLink as inline atom node (not mark).** §17.1, §17.2, R7 all consistent. ✓

## Unverifiable claims

None in the amendment scope. All claims traceable within the artifact.

---

## Summary

The amendments are coherent in spirit but leave one concrete schema drift: **D20's `escapeMark` is LOCKED but not reflected in §17.2's schema enumeration, §16's schema-change allow-list, or R16's test enumeration for the known cross-mark limitation**. These are tractable single-line fixes. The pre-merge action scattering and D6/R23 stance mismatch are polish.

After these five are addressed, the spec is implementation-ready.
