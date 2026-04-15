# Audit Findings (v2 -- fresh cold read)

**Artifact:** `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md`
**Audit date:** 2026-04-14
**Total findings:** 7 (2 High, 3 Medium, 2 Low)

---

## High Severity

### [H1] Crash-taxonomy count inconsistency: spec says "21" but evidence file says "26"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** SPEC.md lines 20, 25 (problem statement); line 90 (R6); line 117 (M6); line 574 (A3). vs. `evidence/crash-taxonomy.md` line 29.
**Issue:** The spec refers to "21 residual crash classes" in four places (problem statement twice, M6, A3), but R6 at line 90 says "Handles 26 residual crash classes per `evidence/crash-taxonomy.md`." The evidence file itself was updated: "Updated from 21 to 26 after P4 source verification surfaced 4 additional `crash()` sites." The spec was partially updated (R6 says 26) but the other four references still say 21. An implementer reading the problem statement or M6 gets the stale count; an implementer reading R6 gets the corrected count.
**Current text (problem statement):** "21 residual crash classes catalogued in `evidence/crash-taxonomy.md`"
**Current text (R6):** "Handles 26 residual crash classes per `evidence/crash-taxonomy.md`"
**Evidence:** `evidence/crash-taxonomy.md` line 29: "Updated from 21 to 26 after P4 source verification"
**Status:** INCOHERENT
**Suggested resolution:** Update all four stale references (lines 20, 25, 117, 574) from "21" to "26" to match R6 and the evidence file.

---

### [H2] Two evidence files referenced in the spec header do not exist

**Category:** COHERENCE
**Source:** L7 (inline source attribution), T1 (filesystem)
**Location:** SPEC.md line 13 (Links block)
**Issue:** The spec's Links block references four evidence files. Two exist (`evidence/y-prosemirror-failure-modes.md`, `evidence/crash-taxonomy.md`). Two do not exist: `evidence/block-level-fallback.md` and `evidence/current-architecture.md`. The directory contains only 4 files: `crash-taxonomy.md`, `observability-pattern.md`, `P3-source-trace.md`, `y-prosemirror-failure-modes.md`. Neither of the missing files appears anywhere else in the spec body, so it is unclear whether they were planned but never written, or renamed but the header not updated.
**Current text:** "Evidence: [...], [evidence/block-level-fallback.md](evidence/block-level-fallback.md), [evidence/current-architecture.md](evidence/current-architecture.md)"
**Evidence:** `ls evidence/` returns 4 files, none matching the two missing names.
**Status:** CONTRADICTED
**Suggested resolution:** Either create the missing evidence files, or update the Links block to reference the files that actually exist (the two existing files plus `observability-pattern.md` and `P3-source-trace.md`, which ARE referenced elsewhere in the spec body but NOT in the header Links block).

---

## Medium Severity

### [M1] Status line says "Draft" but the spec is described as "Ready for Implementation"

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** SPEC.md line 3
**Issue:** The spec header says `Status: Draft (pre-merge)`. The user context describes this as a spec that has been through "4+ iteration rounds" and is "Ready for Implementation." If the spec is finalized and implementation-ready, the status should reflect that. An implementer seeing "Draft" may treat decisions as provisional.
**Current text:** "**Status:** Draft (pre-merge)"
**Status:** INCOHERENT
**Suggested resolution:** Update to "Ready for Implementation" or equivalent post-audit status label.

---

### [M2] Evidence file `y-prosemirror-failure-modes.md` Finding 6 patch differs from spec R13 patch

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** SPEC.md line 470-490 (R13 patch body) vs. `evidence/y-prosemirror-failure-modes.md` lines 138-157
**Issue:** The evidence file's Finding 6 shows a patch that uses `rawMdxInlineFallback` as the inline fallback type name:
```
+  const fallbackType = isInline ? 'rawMdxInlineFallback' : 'rawMdxFallback'
```
The spec's R13 patch (and the self-audit's decision to cut `rawMdxInlineFallback`) uses a different approach: inline-context gets log + skip (no fallback node), not a `rawMdxInlineFallback` substitution. The evidence file was not updated to reflect this design decision, so it shows a stale patch body that would fail (the schema has no `rawMdxInlineFallback` type after the self-audit cut).
**Status:** STALE
**Suggested resolution:** Update `evidence/y-prosemirror-failure-modes.md` Finding 6 patch to match the spec's final R13 design (log + `mapping.delete(el)` + `return null` for inline context; `rawMdxFallback` substitution for block context only). Or add a note in the evidence file that the spec's R13 supersedes Finding 6's original patch.

---

### [M3] `handlers.mdxjsEsm` line reference is off by 3

**Category:** FACTUAL
**Source:** T1 (codebase spot-check)
**Location:** SPEC.md line 88 (R4 acceptance), line 273 (§9 R4 cleanup), line 589 (§13 Commit A)
**Issue:** R4 says "Remove `handlers.mdxjsEsm` at `index.ts:447`." The actual handler registration is at `index.ts:447-450` (the handler assignment spans lines 447-450). The §13 scope list says "index.ts:447" as well. This is close enough for navigation but the line number 447 points to the `handlers.mdxjsEsm =` line itself, which is correct. On closer inspection this is accurate.
**Status:** CONFIRMED (withdrawing this finding on re-check -- 447 is the correct line)

*Replacing with:*

### [M3] R4 references `pipeline.ts:26` for remark-directive import but actual line is 26

**Category:** FACTUAL
**Source:** T1 (codebase spot-check)
**Location:** SPEC.md line 88 (R4)
**Issue:** R4 says "Remove `remark-directive` from `pipeline.ts:26`." The actual `remarkDirective` import is at `pipeline.ts:26`. This reference is correct. However, R4 does not mention the `pipeline.ts:142` serialize path also uses `.use(remarkDirective)` at line 143. The spec's Commit A scope list at line 588 says "swap `remarkMdx` ... at `:114` AND `:142`" but the directive removal on the serialize side is not explicitly called out in R4 or Commit A scope. A reader removing directives from the parse side but missing the serialize side would leave a dangling `.use(remarkDirective)` at line 143.
**Current text (R4):** "Remove `remark-directive` from `pipeline.ts:26`"
**Current text (Commit A, line 588):** mentions pipeline.ts for remarkMdx swap but not explicitly for directive removal on serialize side
**Evidence:** `pipeline.ts:143` — `.use(remarkDirective)` on the serialize processor
**Status:** INCOHERENT
**Suggested resolution:** Extend R4 and/or Commit A scope to explicitly call out removing `.use(remarkDirective)` from BOTH `pipeline.ts:115` (parse) and `pipeline.ts:143` (serialize), matching how R1 explicitly addresses both sites.

---

## Low Severity

### [L1] "Four gaps" list in §16 is now correctly counted but citations are imprecise

**Category:** COHERENCE
**Source:** L1, Phase-2 reader pass
**Location:** SPEC.md line 701-708 (§16 "Migration spec")
**Issue:** The prior audit (H2/L2) flagged "three gaps" as actually four items. The current text says "This spec closes four gaps:" with four numbered items. However, item 2 references "Block-in-inline caveat (`migration SPEC.md:637`)" -- the prior audit finding L3 noted this citation is imprecise (no R8(h) exists in the migration spec). The current text now says "Block-in-inline caveat (`migration SPEC.md:637`)" which is an improvement but still cites a line number in a spec that may not be at that line after its own edits. Minor since it is a relative-path link that resolves.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Verify the migration SPEC.md line 637 reference is still accurate, or replace the line number with a section reference.

---

### [L2] y-prosemirror-failure-modes.md has duplicate Finding 5 numbering

**Category:** COHERENCE
**Source:** L1 (within evidence file)
**Location:** `evidence/y-prosemirror-failure-modes.md` lines 103, 169
**Issue:** The evidence file has two headings labeled "Finding 5": "Finding 5 (CORRECTED by P3 source trace)" at line 103, and "Finding 5: updateYFragment Y.Item identity under atom-node replacement" at line 169. The second appears to be the original Finding 5 that was superseded by the corrected version, but both remain with the same number. Finding 6 at line 134 sits between the two Finding 5s. This makes citation by finding number ambiguous.
**Status:** INCOHERENT
**Suggested resolution:** Renumber the second Finding 5 (line 169) to "Finding 5 (original, superseded)" or delete it since its content is fully covered by the corrected version + P3-source-trace.md.

---

## Confirmed Claims (summary)

- **Line numbers**: `pipeline.ts:114` (remarkMdx parse), `pipeline.ts:142` (remarkMdx serialize), `index.ts:122-139` (parseSafe), `index.ts:447` (handlers.mdxjsEsm), `position-slice.ts:192-194` (directive cases), `pipeline.ts:26` (remarkDirective import) -- all confirmed accurate against codebase.
- **R23 guard is 301 lines**: confirmed (`wc -l autolink-void-html-guard.ts` = 301).
- **jsxComponent is `atom: true, group: 'block'` with `content` attr**: confirmed from `jsx-component.ts`.
- **parseSafe has three tiers**: confirmed from `index.ts:122-139`.
- **AGENTS.md and CLAUDE.md are identical**: confirmed (zero diff).
- **R1-R14 sequential, no gaps**: confirmed in §6.
- **D1-D14 sequential, no gaps**: confirmed in §10.
- **All R-numbers are Must priority**: confirmed in §6 table (all 14 requirements are "Must").
- **Every R has acceptance criteria**: confirmed (each row in §6 has a populated fourth column).
- **Every D has rationale**: confirmed (each row in §10 has a populated fourth column).
- **Evidence files `crash-taxonomy.md`, `P3-source-trace.md`, `observability-pattern.md`, `y-prosemirror-failure-modes.md` exist and substantively match spec claims**: confirmed with content reads.
- **§13 scope covers all R-numbers**: R1 (Commit A), R2 (implicit retain), R3/R5/R9/R10 (Commit B), R4 (Commit A), R6/R7/R8/R11/R12/R13/R14 (Commit C). All 14 requirements have scope entries.

## Unverifiable Claims

- **Mike's PR #105 spec content**: still on an unmerged branch, not readable from this worktree. The spec now says "load-bearing content inlined in §16" which partially addresses the prior H3 audit finding -- the mapping IS inline, but the original spec text is not quotable.
- **Predecessor and downstream spec links** (lines 11-12): point to other spec directories. Not verified whether those SPEC.md files exist in this worktree.
