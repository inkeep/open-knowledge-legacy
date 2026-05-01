# Changelog

## 2026-05-01 — §7 live-render-with-descriptor-state survey
**Update type:** Additive
**Why this pass happened:** The dom-environment-alternatives report's library-level conclusion ("the library family is orthogonal, not alternative") raised the parallel question at the editor-pattern level: does §4's claim ("No surveyed editor uses runtime `getComputedStyle()` against the live editor DOM as a copy-emission strategy") hold across a wider editor survey beyond the original four (Lexical / Obsidian / Plate / BlockNote)?

### Scope (delta only)
- §7 added: live-render-with-descriptor-state survey covering Notion, Linear, Outline, Tiptap core, Tiptap Pro, CKEditor 5, TinyMCE, Slate, Plate, Lexical, Quill 2.0, Editor.js, GrapesJS, Trix (13 distinct editor surfaces).
- Closes the question raised by the dom-environment-alternatives report's follow-up.

### What changed (current-state)
- REPORT.md — sections touched: 2026-04-30 amendment "CSS-to-inline-style techniques for cross-app HTML emission" gained §7 between §6 and the next 2026-04-30 amendment ("Live-DOM walker for cross-app HTML emission — prior art and gotchas"). Frontmatter `updatedAt` bumped to 2026-05-01.
- Evidence — added: `evidence/live-render-descriptor-state-survey-2026-05-01.md` (~9KB, 12 source-cited findings, 1 synthesis, 4 negative-search blocks, 4 follow-up gaps).

### Notes on confidence / contradictions
- §4's claim STRENGTHENED, not revised. Outcome A: 10 of 13 editors confirmed via primary-source code reads to NOT use `getComputedStyle()` at copy time. The remaining 3 (Notion + Linear closed-source; GrapesJS internal-only) are UNCERTAIN-but-leans-confirming based on structural inference from underlying tech and absence of published tear-downs.
- Closest analog discovered: Editor.js's `block.holder.innerHTML` snapshot (Pattern C) — it DOES read live DOM at copy time, but via innerHTML-as-string only, NOT `getComputedStyle` cascade resolution. This is the only editor pattern that even partially overlaps OK's walker; the pattern matrix (A model / B clone-inline / C innerHTML-snapshot / D internal-or-unfurler) cleanly separates them.
- §6 recommendation unchanged: Pattern X (the live-DOM walker via `clipboardSerializer` capturing `view`) remains the recommended approach.

### Open questions / gaps
- Empirical clipboard inspection of Notion and Linear cross-app paste would tighten the closed-source findings from UNCERTAIN to CONFIRMED. Worth a future targeted probe if the §7 conclusion is later challenged.
- Tiptap Pro Cloud-only extensions (auth-gated) couldn't be fully audited; the Tiptap Pro `Conversion` Export Markdown disclaimer is the strongest negative signal.
- Mobile editor surfaces (Bear, iA Writer, Obsidian mobile) and GitBook / Notion clones (AppFlowy, Anytype) not surveyed — out of priority scope.
