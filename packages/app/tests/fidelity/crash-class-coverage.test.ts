/**
 * M6: Crash-class coverage probe — pre-merge gate.
 *
 * Runs agnostic mode + R23 + parseWithFallback against the 26-class crash
 * taxonomy corpus. Asserts ≥95% degrade gracefully (clean parse or
 * block-level fallback with preserved surrounding structure).
 *
 * See SPEC §7 M6, §13, evidence/crash-taxonomy.md.
 */
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
          // Check if surrounding structure is preserved
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

      // Each entry should not throw
      expect(outcome).not.toBe('error');

      // Verify expected outcome matches actual
      if (entry.expectedOutcome === 'clean-parse') {
        expect(outcome).toBe('clean-parse');
      } else if (entry.expectedOutcome === 'block-fallback') {
        expect(['block-fallback', 'clean-parse']).toContain(outcome);
      }
      // For 'clean-or-fallback' and 'block-fallback-or-whole-doc', any non-error is acceptable
    });
  }

  test('≥95% of crash classes degrade gracefully', () => {
    const total = results.length;
    const passing = results.filter((r) => r.pass).length;
    const rate = total > 0 ? passing / total : 0;
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });
});
