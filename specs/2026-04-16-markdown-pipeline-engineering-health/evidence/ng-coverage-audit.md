# Evidence: NG (Irreducible Gap) Test Coverage Audit

**Dimension:** Byte-identity test coverage for documented irreducible gaps
**Date:** 2026-04-16
**Sources:** CLAUDE.md §"Irreducible gaps", existing test files in `packages/app/tests/fidelity/` and `packages/core/src/markdown/`
**Method:** Measured via `/assess-findings` P0-6 investigation subagent

---

## NG definitions (CLAUDE.md lines 674-684)

- **NG1:** Blank-line count between blocks normalizes (ProseMirror schema limitation)
- **NG2:** GFM table column widths normalize
- **NG3:** Math `$$`, footnotes, alerts NOT semantically preserved
- **NG4:** No storage-layer HTML sanitization — raw HTML passes through
- **NG5:** HTML entities decoded to literals on first parse
- **NG6:** Non-ambiguous backslash escapes lose the backslash; only CommonMark §2.4 structurally-ambiguous escapes preserved via `escapeMark`
- **NG7:** MDX `---` inside a JSX block parses as `thematicBreak` (MDX-specific, depends on tolerant parsing's agnostic mode)
- **NG8:** Block-level GFM inside inline `<Note>` flattens to inline text (MDX-specific)
- **NG9:** Unicode PUA U+E000-E004 reserved as R23 guard sentinels
- **NG10:** Thematic break at doc-start normalized `---` → `***`
- **NG11:** Documents of only ignore-typed nodes get synthesized empty paragraph

## Test coverage — scope this spec

**NG1 — blank-line normalization: ✗ UNTESTED**
- No test file explicitly asserts that `# H\n\n\n\nP\n` serializes to `# H\n\nP\n`.
- I3 (normalization canonicality) uses a `markdownDoc` arbitrary that always joins blocks with `\n\n` — so multi-blank-line inputs never reach the test.
- `normalize()` helper in `packages/app/tests/fidelity/helpers.ts` trims trailing whitespace per line + trailing newlines, but does NOT collapse blank-line runs. So even if a test did generate multi-blank inputs, the assertion would not catch regression.

**NG5 — HTML entity decoding: ✓ PINNED**
- `packages/app/tests/fidelity/p0-entity-escape.test.ts` lines 38-62. Example: `test('ampersand in heading: # H&M Store')` verifies `H&M` survives byte-identically.
- `packages/core/src/markdown/to-markdown-handlers.test.ts` "NG5 fidelity" describe block.

**NG6 — backslash escape preservation: ✓ PINNED**
- `packages/app/tests/fidelity/escape-mark-roundtrip.test.ts` lines 19-58. Examples: `\\#`, `\\*`, etc. tested byte-identically for structurally-ambiguous escapes.
- `packages/app/tests/fidelity/p0-entity-escape.test.ts` lines 67-90.

**NG9 — PUA sentinel handling: ✓ PINNED**
- `packages/core/src/markdown/autolink-void-html-guard.consistency.test.ts` lines 40-79. Property-based: 1000+ runs, seed 42. Asserts `restoreString(protectFromMdx(s)) === s` for non-PUA strings.

**NG10 — doc-start thematic break: ✓ PINNED**
- `packages/core/src/markdown/to-markdown-handlers.test.ts` line 56: `test('doc-start --- normalizes to *** (NG10 serialize-side)')`
- `packages/core/src/markdown/doc-start-thematic-fix.test.ts` line 37: `test('empty yaml round-trip is idempotent')`
- `packages/app/tests/fidelity/mark-rename-verification.test.ts`: `test('doc-start --- normalizes to *** (NG10)')`

**NG11 — ensureNonEmptyDoc synthesis: ✗ UNTESTED**
- `packages/app/tests/fidelity/invariant-i8.test.ts` includes `'---\n\n---'` as an input but the test is crash-resistance focused.
- No test explicitly verifies the output of `---\n\n---` contains the synthesized empty paragraph.

## Tolerant-parsing dependency

Each NG classified by whether tolerant parsing affects it:

| NG | Independent of tolerant parsing? | Why |
|----|----|-----|
| NG1 | YES | ProseMirror schema + remark-stringify normalization — unchanged by agnostic MDX mode |
| NG5 | YES | mdast parse layer — unaffected by MDX mode |
| NG6 | YES | `escapeMark` mark — unaffected |
| NG7 | NO — MDX-specific | `---` inside JSX block is parsed by remark-mdx; behavior may shift under agnostic mode |
| NG8 | NO — MDX-specific | JSX inline node's `content: 'inline*'` constraint interacts with block GFM children |
| NG9 | YES | R23 guard explicitly retained by tolerant parsing R2 |
| NG10 | YES | `docStartThematicFixPlugin` is post-parse, not MDX-specific |
| NG11 | YES | `ensureNonEmptyDoc` runs post-parse on mdast |

## Scope implication

Only **NG1 and NG11** are in-scope for this spec (untested AND independent of tolerant parsing). NG7 and NG8 are MDX-dependent and should be added by the tolerant parsing spec (or as a future spec after agnostic mode lands on main).
