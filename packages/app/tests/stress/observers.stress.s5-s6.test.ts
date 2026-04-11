/**
 * Layer A: Observer stress suite — S5 (rapid sequential writes),
 * S5b (high-throughput burst).
 *
 * Split from observers.stress.test.ts for turbo-based parallel sharding.
 * Note: the original file had no S6 describe block; this shard covers the
 * rapid-write family (S5/S5b) which are the heaviest scenarios after S3
 * was moved to the s1-s8-s9 shard for balance.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from '../../src/editor/extensions/shared';
import { __resetCoordinationState, setupObservers } from '../../src/editor/observers';
import { generateMarkdown } from './synthetic';

// ---------- shared setup ----------

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

beforeEach(() => {
  __resetCoordinationState();
});

// ---------- helpers ----------

function wait(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripTrailingWhitespace(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
}

function stabilize(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function assertBridgeInvariant(ytext: Y.Text, fragment: Y.XmlFragment, label: string) {
  const textSide = stripTrailingWhitespace(ytext.toString());
  const treeSide = stripTrailingWhitespace(serializeFragment(fragment));

  if (textSide !== treeSide) {
    const textLines = textSide.split('\n');
    const treeLines = treeSide.split('\n');
    let firstDiff = 0;
    while (
      firstDiff < textLines.length &&
      firstDiff < treeLines.length &&
      textLines[firstDiff] === treeLines[firstDiff]
    ) {
      firstDiff++;
    }
    const snippet = (lines: string[]) =>
      lines
        .slice(firstDiff, firstDiff + 10)
        .map((l, i) => `  ${firstDiff + i + 1}: ${l}`)
        .join('\n');

    throw new Error(
      `[${label}] Bridge invariant violated at line ${firstDiff + 1}\n` +
        `Y.Text (${textLines.length} lines):\n${snippet(textLines)}\n` +
        `XmlFragment (${treeLines.length} lines):\n${snippet(treeLines)}`,
    );
  }
}

function logTiming(scenario: string, tier: string, elapsed: number, pass: boolean) {
  console.log(
    `[stress] scenario=${scenario} tier=${tier} elapsed=${elapsed}ms result=${pass ? 'pass' : 'FAIL'}`,
  );
}

// ---------- scale tiers ----------

interface Tier {
  name: string;
  lines: number;
  probe?: boolean;
  timeout: number;
}

const TIERS: Record<string, Tier> = {
  small: { name: 'small-realistic', lines: 500, timeout: 10_000 },
  medium: { name: 'medium-realistic', lines: 2000, timeout: 30_000 },
  large: { name: 'large-realistic', lines: 10000, timeout: 60_000 },
  adversarial: { name: 'adversarial', lines: 50000, probe: true, timeout: 120_000 },
};

const REALISTIC_TIERS = [TIERS.small, TIERS.medium, TIERS.large];

const CONTENT = {
  small: stabilize(generateMarkdown(TIERS.small.lines)),
  medium: stabilize(generateMarkdown(TIERS.medium.lines)),
  large: stabilize(generateMarkdown(TIERS.large.lines)),
  smallUnicode: stabilize(generateMarkdown(TIERS.small.lines, { unicode: true })),
  mediumUnicode: stabilize(generateMarkdown(TIERS.medium.lines, { unicode: true })),
  largeUnicode: stabilize(generateMarkdown(TIERS.large.lines, { unicode: true })),
};

function contentFor(tier: Tier, unicode = false): string {
  const key =
    tier === TIERS.small
      ? unicode
        ? 'smallUnicode'
        : 'small'
      : tier === TIERS.medium
        ? unicode
          ? 'mediumUnicode'
          : 'medium'
        : tier === TIERS.large
          ? unicode
            ? 'largeUnicode'
            : 'large'
          : 'small';
  return CONTENT[key as keyof typeof CONTENT];
}

// ---------- S5: Rapid sequential writes ----------

describe('S5: rapid sequential writes', () => {
  const variants: Array<{ label: string; unicode: boolean }> = [
    { label: 'ASCII', unicode: false },
    { label: 'Unicode', unicode: true },
  ];

  for (const { label, unicode } of variants) {
    for (const tier of REALISTIC_TIERS) {
      test(
        `${label} ${tier.name} (${tier.lines}L, N=5 at 100ms)`,
        async () => {
          const start = performance.now();
          const doc = new Y.Doc();
          const fragment = doc.getXmlFragment('default');
          const ytext = doc.getText('source');
          const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

          try {
            for (let i = 0; i < 5; i++) {
              const content = contentFor(tier, unicode);
              doc.transact(() => {
                ytext.delete(0, ytext.length);
                ytext.insert(0, `${content}\n\n## Rapid write ${i + 1}\n`);
              }, 'agent-write');
              await wait(100);
            }

            await wait(600);

            assertBridgeInvariant(ytext, fragment, `S5/${label}/${tier.name}`);
            expect(ytext.toString()).toContain('Rapid write 5');

            const elapsed = Math.round(performance.now() - start);
            logTiming(`S5-${label}`, tier.name, elapsed, true);
          } catch (e) {
            const elapsed = Math.round(performance.now() - start);
            logTiming(`S5-${label}`, tier.name, elapsed, false);
            throw e;
          } finally {
            cleanup();
          }
        },
        tier.timeout,
      );
    }
  }
});

// ---------- S5b: High-throughput burst ----------

describe('S5b: high-throughput burst', () => {
  test('small-realistic (100 writes at ~1ms)', async () => {
    const start = performance.now();
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');
    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

    try {
      for (let i = 0; i < 100; i++) {
        doc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, `## Burst write ${i + 1}\n\nContent line for burst ${i + 1}.\n`);
        }, 'agent-write');
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      await wait(1000);

      assertBridgeInvariant(ytext, fragment, 'S5b/small-realistic');
      expect(ytext.toString()).toContain('Burst write 100');

      const elapsed = Math.round(performance.now() - start);
      logTiming('S5b', 'small-realistic', elapsed, true);
    } catch (e) {
      const elapsed = Math.round(performance.now() - start);
      logTiming('S5b', 'small-realistic', elapsed, false);
      throw e;
    } finally {
      cleanup();
    }
  }, 30_000);
});
