import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { loadMdxCrashTaxonomy } from '../../../core/src/markdown/fixtures/index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

const entries = loadMdxCrashTaxonomy();

describe('crash-class coverage probe (M6)', () => {
  const results: Array<{
    id: string;
    class: string;
    outcome: 'clean-parse' | 'block-fallback' | 'whole-doc-fallback' | 'error';
    pass: boolean;
  }> = [];

  for (const entry of entries) {
    test(`${entry.id}: ${entry.class}`, () => {
      let outcome: 'clean-parse' | 'block-fallback' | 'whole-doc-fallback' | 'error';

      try {
        const result = mdManager.parseWithFallback(entry.input);
        const types = (result.content as Array<{ type: string }>)?.map((n) => n.type) ?? [];

        if (types.includes('rawMdxFallback')) {
          const hasStructure = types.some(
            (t) => t === 'heading' || t === 'paragraph' || t === 'codeBlock',
          );
          outcome = hasStructure ? 'block-fallback' : 'whole-doc-fallback';
        } else {
          outcome = 'clean-parse';
        }
      } catch {
        outcome = 'error';
      }

      const pass =
        outcome === 'clean-parse' ||
        outcome === 'block-fallback' ||
        (outcome === 'whole-doc-fallback' && entry.expectedOutcome.includes('whole-doc'));

      results.push({ id: entry.id, class: entry.class, outcome, pass });

      expect(outcome).not.toBe('error');

      if (entry.expectedOutcome === 'clean-parse') {
        expect(outcome).toBe('clean-parse');
      } else if (entry.expectedOutcome === 'block-fallback') {
        expect(['block-fallback', 'clean-parse']).toContain(outcome);
      }
    });
  }

  test('≥95% of crash classes degrade gracefully', () => {
    const total = results.length;
    const passing = results.filter((r) => r.pass).length;
    const rate = total > 0 ? passing / total : 0;
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });
});
