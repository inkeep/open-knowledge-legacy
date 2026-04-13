# I2: Property-Based Testing Tooling for Markdown Fidelity Invariants

**Investigation:** I2 — PBT tooling + invariant-driven TDD approach
**Date:** 2026-04-11

---

## Recommended tooling: fast-check + bun:test

**fast-check** is the only serious choice. It has [official bun:test integration docs](https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-bun-test-runner/), works with zero config (`bun install -D fast-check`), and shrinks out of the box. jsverify is unmaintained (last publish 2018). `@fast-check/vitest` adds vitest-specific wrappers we don't need — raw `fc.assert(fc.property(...))` inside `bun:test` is the recipe.

**Performance:** 10k runs of a string-property test completes in <2s on M-series. The bottleneck will be parse/serialize per iteration (~0.5ms each), so budget ~10s for 10k at the markdown layer. Acceptable for `turbo run test:fidelity` with cache.

## CommonMark + GFM test corpora

**CommonMark:** [`commonmark.json`](https://github.com/wooorm/commonmark.json) (npm: `commonmark.json`) exports the full spec as `Array<{markdown, html, section, example}>`. 652 examples for CommonMark 0.31.2. Use as a regression corpus — parse each `markdown` through our pipeline, assert I1 (identity) or I2 (char preservation) per example.

**GFM:** The [GFM spec](https://github.github.com/gfm/) extends CommonMark with ~30 examples for tables, strikethrough, autolinks, task lists. [`github/cmark-gfm`](https://github.com/github/cmark-gfm) ships `spec.txt` with extractable examples. No single npm package; extract once into a `fixtures/gfm-examples.json` at setup.

## How prosemirror-markdown tests fidelity

prosemirror-markdown's test suite (`test/test-parse.ts`) uses a `same(text, doc)` helper: parse markdown to ProseMirror node, assert structural match against a hand-built doc, then serialize back and assert string identity. ~50 cases, all explicit fixtures — **no PBT, no arbitrary generators**. Invariants tested: round-trip identity for supported constructs, escaping correctness, whitespace normalization, list tightness, fence adaptation. This is our Tier 2 (explicit catalog) pattern, not Tier 4 (generative).

## TipTap's own tests

`@tiptap/markdown` tests follow the same pattern: `setContent(md, {contentType: 'markdown'})` then `getMarkdown()` and assert equality. Fixture-driven, no PBT. Their test surface is small (~20 cases) and doesn't cover entity encoding or escape consumption — exactly our P0 gap.

## Markdown arbitrary generator: structured, not string-soup

Don't generate random strings — they're almost never valid markdown and shrinking is useless. Build a **structured generator** that composes CommonMark constructs:

```typescript
import fc from 'fast-check';

// Leaf generators
const heading = fc.tuple(
  fc.integer({ min: 1, max: 6 }),
  fc.stringOf(fc.char().filter(c => c !== '\n'), { minLength: 1, maxLength: 40 })
).map(([level, text]) => `${'#'.repeat(level)} ${text}`);

const paragraph = fc.stringOf(
  fc.char().filter(c => c !== '\n'), { minLength: 1, maxLength: 80 }
).map(text => text.trim() || 'x');

const codeBlock = fc.tuple(
  fc.constantFrom('', 'js', 'ts', 'python', 'markdown'),
  fc.stringOf(fc.char().filter(c => c !== '`'), { minLength: 0, maxLength: 60 })
).map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``);

const fidelityChars = fc.constantFrom('&', '<', '>', '"', "'", '\\', '*', '_', '`', '~', '[', ']');

const paragraphWithFidelityChars = fc.tuple(
  fc.stringOf(fc.oneof(fc.char(), fidelityChars), { minLength: 1, maxLength: 60 })
).map(([t]) => t.replace(/\n/g, ' ').trim() || 'x');

// Block-level document
const block = fc.oneof(heading, paragraph, codeBlock, paragraphWithFidelityChars);

const markdownDoc = fc.array(block, { minLength: 1, maxLength: 8 })
  .map(blocks => blocks.join('\n\n') + '\n');
```

**Shrinking:** fast-check shrinks structured arbitraries by reducing array lengths, then simplifying each element. A failed 8-block doc shrinks to the single block that triggers the bug. This is far more useful than character-level string shrinking. No custom shrinker needed.

## Invariant encoding: one file per invariant, shared generator

```
packages/app/tests/fidelity/
  arbitraries.ts          # markdownDoc, block, heading, etc.
  invariant-i1.test.ts    # Identity: serialize(parse(md)) === md
  invariant-i2.test.ts    # Char preservation: every literal char in input appears in output
  invariant-i3.test.ts    # Normalization canonicality: serialize(parse(serialize(parse(md)))) === serialize(parse(md))
  invariant-i4.test.ts    # Idempotence: serialize(parse(X)) applied twice is stable
  invariant-i5.test.ts    # Layer A===B equivalence
  invariant-i6.test.ts    # Multi-client preservation (2-client via Y.Doc merge)
  invariant-i7.test.ts    # Cross-path consistency
  corpus-commonmark.test.ts  # 652 CommonMark spec examples as regression
  corpus-gfm.test.ts         # GFM extension examples
  fixtures/
    commonmark-examples.json  # Extracted from commonmark.json
    gfm-examples.json         # Extracted from cmark-gfm spec.txt
```

**One file per invariant** is correct — each invariant has a different assertion shape and different generator needs. The shared `arbitraries.ts` provides the generators; each test file imports what it needs.

## Concrete sketch: I2 (every literal char preserved)

```typescript
// invariant-i2.test.ts
import { describe, test, expect } from 'bun:test';
import fc from 'fast-check';
import { markdownDoc, paragraphWithFidelityChars } from './arbitraries';
import { mdRoundTrip } from './helpers'; // serialize(parse(md))

describe('I2: every literal character preserved', () => {
  test('paragraph text chars survive round-trip', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (input) => {
        const output = mdRoundTrip(input + '\n');
        // Every non-whitespace char in input must appear in output
        for (const ch of input) {
          if (ch.trim()) {
            expect(output).toContain(ch);
          }
        }
      }),
      { numRuns: 5000 }
    );
  });

  test('fidelity chars &<>"\'\\*_`~[] not entity-encoded', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('&', '<', '>', '"', "'", '\\'),
        (ch) => {
          const input = `Text with ${ch} inside.\n`;
          const output = mdRoundTrip(input);
          // Must NOT contain HTML entities
          expect(output).not.toMatch(/&amp;|&lt;|&gt;|&quot;/);
          expect(output).toContain(ch);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

## Integration with existing turbo setup

Add to `turbo.json`:
```json
"test:fidelity": {
  "dependsOn": [],
  "cache": true,
  "inputs": [
    "tests/fidelity/**/*.ts",
    "src/editor/**/*.ts",
    "../core/src/**/*.ts"
  ]
}
```

Add to `packages/app/package.json`:
```json
"test:fidelity": "bun test tests/fidelity/"
```

Wire into `bun run check` alongside `test:conversion`:
```
"check": "bun run lint && turbo run typecheck test test:integration test:conversion test:fidelity"
```

This keeps PBT tests in their own turbo cache lane — editing a fidelity test reruns only fidelity, not stress/fuzz/e2e.

## Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PBT library | fast-check | Only maintained JS PBT lib; official bun:test docs; built-in shrinking |
| Generator strategy | Structured (compose blocks) | String-soup produces invalid markdown; structured shrinks to minimal failing block |
| Custom shrinker | Not needed | fast-check's built-in tuple/array shrinking reduces to single-block minimal repro |
| CommonMark corpus | `commonmark.json` npm package | 652 examples, machine-readable, covers full spec |
| GFM corpus | Extract from cmark-gfm `spec.txt` | One-time extraction into JSON fixture |
| File structure | One file per invariant + shared arbitraries | Each invariant has distinct assertion shape; shared generators prevent duplication |
| Turbo integration | New `test:fidelity` task | Independent cache key; doesn't slow existing test tiers |
