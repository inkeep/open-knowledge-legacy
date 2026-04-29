/**
 * NG byte-identity pinning tests (R7 / US-013).
 *
 * Pins byte-identical serialize(parse(x)) output for two irreducible gaps in
 * CLAUDE.md's NG catalog that were previously untested:
 *
 *   NG1  — Blank-line count between blocks normalizes to a single blank line
 *   NG11 — Documents whose mdast consists solely of ignore-typed nodes
 *          (yaml / toml / footnoteDefinition) get an empty paragraph
 *          synthesized by `ensureNonEmptyDoc` so PM's `doc.content: 'block+'`
 *          validation doesn't throw.
 *
 * **STRICT BYTE-IDENTITY: no normalize() helpers, no trailing-whitespace
 * stripping — direct `===` against observed canonicals.** A well-intentioned
 * refactor that silently changes either output would fail loudly here,
 * preventing the class of CRDT-permanent / multi-peer-broadcast data loss
 * called out in CLAUDE.md's architectural precedent #9.
 *
 * Canonicals observed via direct probe on `MarkdownManager` with
 * `sharedExtensions`; see
 * `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/ng-pinned-canonicals.md`.
 *
 * ─── NG10 vs NG11 correction ────────────────────────────────────────────
 * An earlier draft cited `---\n\n---` as the NG11 test input. That is
 * **incorrect** — it parses as two `thematicBreak` nodes (both renderable,
 * neither ignore-typed), so `ensureNonEmptyDoc` does NOT fire on that input.
 * The `---` → `***` normalization observed on that input is **NG10**
 * (doc-start thematicBreak rename to defeat empty-YAML ambiguity under
 * `remark-frontmatter`) and is already pinned by three existing tests
 * (`to-markdown-handlers.test.ts`, `doc-start-thematic-fix.test.ts`,
 * `mark-rename-verification.test.ts`).
 *
 * The real NG11 trigger is an input whose mdast is solely ignore-typed
 * nodes — e.g. yaml frontmatter alone. That's what this file pins.
 */

import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { loadNgPinnedCases } from '../../../core/src/markdown/fixtures/index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

describe('NG1 — blank-line count normalization (byte-identity)', () => {
  test('four newlines between blocks collapse to one blank line', () => {
    // CommonMark semantics: any ≥1 blank line between blocks = 1 paragraph
    // break. ProseMirror's schema has no representation of multi-blank-line
    // runs. Normalization is both correct per CommonMark and irreducible
    // under the PM model.
    const input = '# H\n\n\n\nP\n';
    const output = mdManager.serialize(mdManager.parse(input));
    expect(output).toBe('# H\n\nP\n');
  });
});

describe('NG11 — ignore-typed-only doc triggers ensureNonEmptyDoc synthesis (byte-identity)', () => {
  test('yaml frontmatter alone → PM doc has one empty paragraph; serializes to empty string', () => {
    // `---\ntitle: X\n---\n` parses to `[yaml]` at mdast, which is in the
    // ignore set at `pipeline.ts:82` ({yaml, toml, footnoteDefinition}).
    // Without `ensureNonEmptyDoc`, PM would throw `Invalid content for node
    // doc: <>` when validating against `doc.content: 'block+'`. The synthesis
    // emits a single empty paragraph so PM validation passes, which then
    // serializes to the empty string via the default paragraph handler.
    const input = '---\ntitle: X\n---\n';
    const pm = mdManager.parse(input);

    // Intermediate PM doc must have exactly one child, a paragraph with no
    // content — verifies ensureNonEmptyDoc fired.
    expect(pm).toMatchObject({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    // `content` is the paragraph's own content; absent means empty.
    const onlyChild = (pm as { content: Array<{ type: string; content?: unknown[] }> }).content[0];
    expect(onlyChild.type).toBe('paragraph');
    expect(onlyChild.content ?? []).toEqual([]);

    // Serialized output is exactly the empty string. Frontmatter round-trip
    // is a separate concern handled via Y.Map('metadata') in the observer
    // sync bridge, not the PM-canonical path; pure parse/serialize loses it.
    const output = mdManager.serialize(pm);
    expect(output).toBe('');
  });
});

describe('NG12 — edited-node quoting normalization (idempotence probe)', () => {
  // 10 probe cases lifted from
  // `specs/2026-04-14-component-blocks-v2/evidence/serialize-roundtrip-probe.md`.
  // Each case asserts idempotence: serialize(parse(serialize(parse(x)))) ===
  // serialize(parse(x)). Cases where `expectedOutput` is non-null also assert
  // that canonical shape as a byte-identity pin. Four cases are highlighted —
  // they have the highest drift risk profile (library-specific quoting,
  // member-access, flush-left handler contract) and a silent change would
  // surface an architectural regression, not just a cosmetic one.
  //
  // STRICT byte-identity: `===` only. No normalize() helpers. Any silent
  // change to the canonical output fails loudly here.
  const cases = loadNgPinnedCases();

  for (const c of cases) {
    const label = c.highlighted ? `${c.id} ⭐ ${c.name}` : `${c.id} ${c.name}`;
    test(`${label} — idempotent ${c.expectedOutput ? '+ pinned' : ''}`, () => {
      const firstOutput = mdManager.serialize(mdManager.parse(c.input));
      const secondOutput = mdManager.serialize(mdManager.parse(firstOutput));
      if (c.idempotent) {
        expect(secondOutput).toBe(firstOutput);
      }
      if (c.expectedOutput !== null) {
        expect(firstOutput).toBe(c.expectedOutput);
      }
    });
  }
});
