# Audit Findings (Pass 2)

**Artifact:** specs/2026-04-11-markdown-source-text-fidelity/SPEC.md
**Audit date:** 2026-04-12
**Total findings:** 6 (1 high, 3 medium, 2 low)

**Context:** This is pass 2. Pass 1 (`meta/audit-findings.md`) found 11 issues (2H, 5M, 4L). Since then, 3 requirements were added (R18-R20), D8 was partially reopened, LOC totals were updated, and 3 pass-1 findings were accepted. This pass focuses on consistency issues introduced by the incremental edits.

---

## High Severity

### [H1] R4 not updated for T2-8 (tight/loose list preservation)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §6 Requirements, R4
**Issue:** R4 says "Tier 2 attribute preservation (7 items)" with "~275 LOC across 7 extension overrides per I4 sketches." Phase 2 in §9 lists 8 items (T2-1 through T2-8) at ~325 LOC. R16 added T2-8 separately but R4 was not updated to reflect the new count or LOC.
**Current text:** "Bullet marker, ordered delim, emphasis delim, fence delim, heading style, HR raw, link style — all stored as node/mark attributes extracted from `token.raw`. Fallback to CommonMark canonical when attr missing. ~275 LOC across 7 extension overrides per I4 sketches."
**Evidence:** Phase 2 box in §9 lists 8 items including "Tight/loose list (T2-8, ~50 LOC)." R16 exists as a separate Must requirement for this item. The enumeration in R4 doesn't include tight/loose, and the LOC/count are both stale.
**Status:** INCOHERENT
**Suggested resolution:** Update R4 to "8 items" and "~325 LOC across 8 extension overrides" and add "tight/loose list" to the enumeration. Alternatively, note R4 covers T2-1 through T2-7 and R16 covers T2-8 — making the split explicit.

---

## Medium Severity

### [M1] §1 Problem Statement has stale path matrix numbers and mechanism description

**Category:** COHERENCE
**Source:** L1, L5 (contradiction, summary coherence)
**Location:** §1 Complication paragraph, §1 Resolution paragraph
**Issue:** Three stale items in the problem statement:
1. Complication says "77 TRIVIAL + 14 N/A + 8 VARIANT" — should be 82 TRIVIAL + 9 N/A + 8 VARIANT per pass-1 H2 correction
2. Resolution says "Option D prototype monkey-patch" — should be `bun patch` per D4 update
3. Resolution says "Option D prototype monkey-patch on `@tiptap/markdown`" — mechanism changed to `bun patch @tiptap/markdown@3.22.3` per challenger H2 acceptance
**Current text:** (Complication) "the path matrix collapses to 77 TRIVIAL + 14 N/A + 8 VARIANT" / (Resolution) "Option D prototype monkey-patch on `@tiptap/markdown`"
**Evidence:** Changelog §2026-04-11: "H2: Path matrix corrected (82 TRIVIAL, not 77; 9 N/A, not 14)" and "Challenger H2 → D4 mechanism switched: prototype monkey-patch → `bun patch`"
**Status:** INCOHERENT
**Suggested resolution:** Update §1 Complication to "82 TRIVIAL + 9 N/A + 8 VARIANT" and Resolution to "`bun patch` on `@tiptap/markdown`."

---

### [M2] G3 has stale TRIVIAL count

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §2 Goals, G3
**Issue:** G3 says "77 TRIVIAL cells" — should be 82 per the pass-1 correction.
**Current text:** "77 TRIVIAL cells covered implicitly by Layer A ≡ Layer B test equivalence"
**Evidence:** Same as M1 — changelog H2 correction.
**Status:** INCOHERENT
**Suggested resolution:** Update G3 to "82 TRIVIAL cells."

---

### [M3] Non-functional section references "Option D monkey-patch" — stale mechanism

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §6 Non-functional, Performance bullet
**Issue:** Says "Option D monkey-patch adds zero runtime cost beyond a no-op function call at module load." With `bun patch`, the mechanism is a compile-time source patch — there is no "no-op function call at module load." The performance claim (zero runtime cost) is still correct but the description of how it achieves that is wrong.
**Current text:** "Option D monkey-patch adds zero runtime cost beyond a no-op function call at module load."
**Evidence:** D4 changed to `bun patch` — patches apply at install time, not runtime. No module-load hook.
**Status:** INCOHERENT
**Suggested resolution:** Change to "`bun patch` applies at install time with zero runtime cost (source is patched before compilation)."

---

## Low Severity

### [L1] A1 assumption cites stale LOC total

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction)
**Location:** §12 Assumptions, A1
**Issue:** A1 says "~2400 LOC single-PR review" but actual total is now ~635 prod + ~1165 test = ~1800 LOC.
**Current text:** "Team has bandwidth for ~2400 LOC single-PR review"
**Evidence:** §9 totals line says "~635 LOC production + ~1165 LOC test code"
**Status:** INCOHERENT
**Suggested resolution:** Update A1 to "~1800 LOC single-PR review." Note: the original ~2400 figure predated the D8 cascade that reduced Tier 4 scope and multiple LOC corrections.

---

### [L2] I6 evidence file has stale matrix totals

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** evidence/i6-path-matrix.md, line 50
**Issue:** Evidence file says "77 TRIVIAL, 8 VARIANT, 9 N/A" in its totals line. The spec body was corrected to 82 TRIVIAL + 9 N/A in the first audit, but the evidence file itself was not updated.
**Current text:** (i6-path-matrix.md line 50) "**Totals: 77 TRIVIAL, 8 VARIANT, 9 N/A (5 not shown — IN4 is row-level N/A)**"
**Evidence:** The actual matrix grid in I6 shows more T cells than 77 when counted. The changelog corrected the spec to 82. Evidence file was not updated in the cascade.
**Status:** STALE
**Suggested resolution:** Recount the T cells in the I6 matrix grid and update the totals line to match.

---

## Confirmed Claims (summary)

**T1 (own codebase):**
- `encodeHtmlEntities` at `@tiptap/core/src/utilities/htmlEntities.ts` — CONFIRMED, 26 lines
- `encodeTextForMarkdown` at line 905-911 (R1 says "line 910" for the return statement) — CONFIRMED, return at line 910
- `parseInlineTokens` has no explicit `escape` token handler — CONFIRMED, handles `text`, `html`, and generic `token.type` only
- Frontmatter regex `FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/` at line 8 of frontmatter.ts — CONFIRMED, uses `\n` not `\r?\n`
- No `clipboardTextParser` in codebase — CONFIRMED
- Pino logger at `packages/server/src/logger.ts` — CONFIRMED
- Link href serialized from attrs, bypasses `encodeTextForMarkdown` — CONFIRMED at `@tiptap/extension-link/src/link.ts:347`

**T2 (OSS repos / dependencies):**
- `@tiptap/markdown` version 3.22.3 — CONFIRMED
- marked version 17.0.6 (within `^17.0.1` range) — CONFIRMED
- `clipboardTextParser` is a first-class ProseMirror EditorProps — CONFIRMED at `prosemirror-view/src/index.ts:714`

## Unverifiable Claims

- **D9 "95%+ catch rate at 1000 runs"** — stated without evidence file. The /analyze session likely produced this estimate but it's not persisted in evidence/. Low impact — the 1000-run default is a pragmatic choice regardless.
- **"marked tokens expose `.raw` field preserving source text"** — marked 17.0.6 source is compiled (.cjs), not inspectable as .ts. Claim is supported by I4's code sketches extracting `token.raw` successfully, but not directly verified against marked source in this audit. HIGH confidence from I4 evidence.
