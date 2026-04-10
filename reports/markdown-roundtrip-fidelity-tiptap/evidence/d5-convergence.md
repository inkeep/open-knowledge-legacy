# Evidence: D5 — Convergence Property

**Dimension:** D5 — After N round-trips, does the output stabilize or drift?
**Date:** 2026-04-07
**Sources:** Live convergence tests on both @tiptap/markdown v3 and prosemirror-markdown

---

## Key files referenced

- `/private/tmp/tiptap-roundtrip-test/tiptap-official-test.mjs` — @tiptap/markdown convergence test
- `/private/tmp/tiptap-roundtrip-test/roundtrip-test.mjs` — prosemirror-markdown convergence test

---

## Findings

### Finding: Both systems converge to a stable canonical form after exactly 1 round-trip cycle
**Confidence:** CONFIRMED
**Evidence:** 5-cycle convergence tests on complex documents

#### @tiptap/markdown v3 convergence test

Test input: Complex document (609 chars) with headings, bold/italic, lists, code blocks, tables, blockquotes, images, links.

```
Cycle 1: CHANGED (40 chars length diff)  — normalization occurs
Cycle 2: STABLE
Cycle 3: STABLE
Cycle 4: STABLE
Cycle 5: STABLE
```

Original: 609 chars → Final: 649 chars (table padding added 40 chars)

#### prosemirror-markdown convergence test

Same input (480 chars, no tables in prosemirror-markdown test since tables not in default schema).

```
Cycle 1: CHANGED (1 char length diff)  — trailing newline removed
Cycle 2: STABLE
Cycle 3: STABLE
Cycle 4: STABLE
Cycle 5: STABLE
```

Original: 480 chars → Final: 479 chars

### Finding: No drift detected — the convergence is immediate and absolute
**Confidence:** CONFIRMED

After the first cycle, the output is byte-identical across subsequent cycles. This is fundamentally different from the remark-mdx multiline expression indentation drift (documented in the mdx-crdt-roundtrip-fidelity report, where each cycle added 2 spaces). The markdown round-trip through TipTap/ProseMirror is a genuine projection: it maps to a canonical form and stays there.

### Finding: The convergence property holds even for adversarial inputs
**Confidence:** INFERRED

The lossy patterns identified (reference links, indented code, loose lists, etc.) all normalize in a single pass:
- Reference links → inline links (stable form)
- Indented code → fenced code (stable form)
- Loose lists → tight lists (stable form in @tiptap/markdown v3)
- Extra blank lines → single blank lines (stable form)
- Table formatting → padded format (stable form)

None of these normalizations compound or interact in ways that could cause drift. Each is a many-to-one mapping where the "one" output form always round-trips to itself.

### Implication: "Normalize-on-first-load" is a viable architecture

Since the round-trip converges after 1 cycle:
1. On first open of a .md file, run parse→serialize to get the canonical form
2. Show a diff to the user (or auto-accept if formatting-only changes)
3. All subsequent saves produce identical output
4. The bidirectional sync between WYSIWYG↔markdown is stable after this initial normalization

This is exactly the pattern described in the source-toggle-architecture report as the "Option A: Serialize-on-toggle" approach.

---

## Negative searches

- Searched for drift bugs in prosemirror-markdown issue tracker: found tight list issues (#51, #57) but no drift
- Searched for convergence failure reports in TipTap markdown issues: found #7147 (blank lines) but this converges after 1 cycle
- No evidence of progressive degradation in either system

---

## Gaps / follow-ups

- Would benefit from testing with a larger corpus of real-world markdown files (100+ documents)
- Edge cases like deeply nested lists (4+ levels) or very long documents not tested
- Concurrent editing scenarios (where Yjs merges could introduce non-canonical forms) not tested
