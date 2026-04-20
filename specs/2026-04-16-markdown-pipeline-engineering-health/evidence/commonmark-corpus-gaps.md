# Evidence: CommonMark Corpus Test Gaps

**Dimension:** Current-state fidelity test coverage gaps
**Date:** 2026-04-16
**Sources:** `packages/app/tests/fidelity/corpus-commonmark.test.ts` (current main), CommonMark spec 0.30
**Method:** Measured via `/assess-findings` P0-4 investigation subagent

---

## Corpus structure

`packages/app/tests/fidelity/corpus-commonmark.test.ts` imports 652 examples from the `commonmark.json` spec corpus and runs them through `mdRoundTrip`.

**Test disposition:**
- **2 SKIP_SECTIONS** (entirely outside our schema): Tabs, Indented code blocks
- **19 NORMALIZE_SECTIONS** (crash-free only, no idempotence)
- **5 sections test idempotence:** Blank lines, Inlines, Precedence, Soft line breaks, Textual content
- `KNOWN_CRASH_CEILING = 50` (actual crashes today: 0 — verified by running the suite)

## NORMALIZE sections — measured idempotence

Running `normalize(mdRoundTrip(mdRoundTrip(example)))` vs. `normalize(mdRoundTrip(example))`:

**100% idempotent (13 sections, ready to promote):**

| Section | Pass rate |
|---------|-----------|
| Paragraphs | 8/8 |
| Thematic breaks | 19/19 |
| Entity and numeric character references | 17/17 |
| Hard line breaks | 15/15 |
| Setext headings | 27/27 |
| Link reference definitions | 27/27 |
| ATX headings | 18/18 |
| Autolinks | 19/19 |
| Raw HTML | 20/20 |
| Fenced code blocks | 29/29 |
| Block quotes | 25/25 |
| List items | 48/48 |
| Code spans | 22/22 |

**Partial idempotence (6 sections, 91-98% pass rates — surfacing real bugs):**

| Section | Pass rate | Failure mode |
|---------|-----------|--------------|
| Emphasis and strong emphasis | 127/132 (96.2%) | Delimiter run instability — e.g., `***foo* bar**` → `***foo***** bar**` → `***foo***\*\* bar\*\*` (escaping grows on each round-trip) |
| Backslash escapes | 11/12 (91.7%) | Cumulative escaping — e.g., `\*not emphasized*` → Round1 adds escaping → Round2 adds more |
| Lists | 25/26 (96.2%) | Nested code block handling — `1. ` with nested code → first round normalizes nesting → second round destroys structure |
| HTML blocks | 43/44 (97.7%) | (Specific failure TBD during Iterate phase) |
| Links | 89/90 (98.9%) | (Specific failure TBD during Iterate phase) |
| Images | 21/22 (95.5%) | (Specific failure TBD during Iterate phase) |

## Stale references

**Line 48-49 (`corpus-commonmark.test.ts`):**
```typescript
// Update this count only when a known @tiptap/markdown upstream crash is resolved.
const KNOWN_CRASH_CEILING = 50;
```

**Verification:** `@tiptap/markdown` not in any `package.json`:
```
grep -r "@tiptap/markdown" packages/core/package.json packages/app/package.json
# returns empty
```

**PR #83 removed @tiptap/markdown:**
- Commit: `ee030b5` — "feat: markdown engine migration — marked + @tiptap/markdown → unified + remark + remark-prosemirror (#83)"
- Date: 2026-04-13
- Distance: 88 commits prior to current HEAD (2de299b) as of 2026-04-16

## Scope implication

13 sections promote directly (trivial — edit one Set). 6 sections need bug investigation. The escape cumulation bug (which manifests in both Emphasis and Backslash sections) is likely a single root cause surfacing in multiple places — fixing it may fix both sections simultaneously.
