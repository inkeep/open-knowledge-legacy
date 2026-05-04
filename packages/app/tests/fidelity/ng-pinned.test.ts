import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { loadNgPinnedCases } from '../../../core/src/markdown/fixtures/index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

describe('NG1 — blank-line count normalization (byte-identity)', () => {
  test('four newlines between blocks collapse to one blank line', () => {
    const input = '# H\n\n\n\nP\n';
    const output = mdManager.serialize(mdManager.parse(input));
    expect(output).toBe('# H\n\nP\n');
  });
});

describe('NG11 — ignore-typed-only doc triggers ensureNonEmptyDoc synthesis (byte-identity)', () => {
  test('yaml frontmatter alone → PM doc has one empty paragraph; serializes to empty string', () => {
    const input = '---\ntitle: X\n---\n';
    const pm = mdManager.parse(input);

    expect(pm).toMatchObject({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    const onlyChild = (pm as { content: Array<{ type: string; content?: unknown[] }> }).content[0];
    expect(onlyChild.type).toBe('paragraph');
    expect(onlyChild.content ?? []).toEqual([]);

    const output = mdManager.serialize(pm);
    expect(output).toBe('');
  });
});

describe('NG12 — edited-node quoting normalization (idempotence probe)', () => {
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
