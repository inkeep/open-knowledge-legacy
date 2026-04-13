/**
 * Layer A: Observer stress suite — S1 (single agent write), S8 (unicode-heavy),
 * S9 (observer init from restored doc), S3 (undo chain).
 *
 * Split from observers.stress.test.ts for turbo-based parallel sharding.
 * S3 is placed here for shard balance (S3-large is ~66s, and S5/S6 shard
 * is already the heaviest without it).
 */

import { describe, expect, test } from 'bun:test';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from '../../src/editor/extensions/shared';
import { setupObservers } from '../../src/editor/observers';
import { generateMarkdown } from './synthetic';

// ---------- shared setup ----------

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

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
  // NG1 normalization: factor out blank-line-count-between-blocks via stabilize()
  // so Y.Text and XmlFragment are compared under pipeline-equivalent representation.
  const textSide = stripTrailingWhitespace(stabilize(ytext.toString()));
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
  small: { name: 'small-realistic', lines: 500, timeout: 20_000 },
  medium: { name: 'medium-realistic', lines: 2000, timeout: 60_000 },
  large: { name: 'large-realistic', lines: 10000, timeout: 120_000 },
  adversarial: { name: 'adversarial', lines: 50000, probe: true, timeout: 240_000 },
};

const REALISTIC_TIERS = [TIERS.small, TIERS.medium, TIERS.large];
const ALL_TIERS = [...REALISTIC_TIERS, TIERS.adversarial];

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

// ---------- S1: Single agent write propagation ----------

describe('S1: single agent write propagation', () => {
  for (const tier of ALL_TIERS) {
    const testFn = tier.probe ? test.todo : test;
    testFn(
      `${tier.name} (${tier.lines}L)`,
      async () => {
        const start = performance.now();
        const doc = new Y.Doc();
        const fragment = doc.getXmlFragment('default');
        const ytext = doc.getText('source');
        const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

        try {
          const content = tier.probe ? stabilize(generateMarkdown(tier.lines)) : contentFor(tier);

          doc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, content);
          }, 'agent-write');

          await wait(500);

          assertBridgeInvariant(ytext, fragment, `S1/${tier.name}`);
          expect(ytext.toString()).toContain('Section 1');

          const elapsed = Math.round(performance.now() - start);
          logTiming('S1', tier.name, elapsed, true);
        } catch (e) {
          const elapsed = Math.round(performance.now() - start);
          logTiming('S1', tier.name, elapsed, false);
          throw e;
        } finally {
          cleanup();
        }
      },
      tier.timeout,
    );
  }
});

// ---------- S8: Unicode-heavy propagation ----------

describe('S8: unicode-heavy propagation', () => {
  for (const tier of REALISTIC_TIERS) {
    test(
      `${tier.name} (${tier.lines}L)`,
      async () => {
        const start = performance.now();
        const doc = new Y.Doc();
        const fragment = doc.getXmlFragment('default');
        const ytext = doc.getText('source');
        const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

        try {
          const content = contentFor(tier, true);

          doc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, content);
          }, 'agent-write');

          await wait(500);

          assertBridgeInvariant(ytext, fragment, `S8/${tier.name}`);
          expect(ytext.toString()).toContain('\u{1F680}');

          const elapsed = Math.round(performance.now() - start);
          logTiming('S8', tier.name, elapsed, true);
        } catch (e) {
          const elapsed = Math.round(performance.now() - start);
          logTiming('S8', tier.name, elapsed, false);
          throw e;
        } finally {
          cleanup();
        }
      },
      tier.timeout,
    );
  }
});

// ---------- S9: Observer init from applyUpdate-restored doc ----------

describe('S9: observer init from restored doc', () => {
  test(
    `${TIERS.medium.name} (${TIERS.medium.lines}L)`,
    async () => {
      const start = performance.now();
      const tier = TIERS.medium;

      // Step 1: Create and populate source doc
      const sourceDoc = new Y.Doc();
      const sourceFragment = sourceDoc.getXmlFragment('default');
      const sourceYtext = sourceDoc.getText('source');
      const sourceCleanup = setupObservers({
        doc: sourceDoc,
        xmlFragment: sourceFragment,
        ytext: sourceYtext,
        mdManager,
        schema,
      });

      const content = contentFor(tier);
      sourceDoc.transact(() => {
        sourceYtext.delete(0, sourceYtext.length);
        sourceYtext.insert(0, content);
      }, 'agent-write');
      await wait(500);
      sourceCleanup();

      // Step 2: Encode source doc state, then release it — Y.Doc instances hold
      // internal state (event listeners, update handlers) that should be
      // explicitly released in tests rather than relying on V8 GC.
      const stateUpdate = Y.encodeStateAsUpdate(sourceDoc);
      sourceDoc.destroy();

      // Step 3: Apply to fresh doc (simulates reconnect)
      const freshDoc = new Y.Doc();
      Y.applyUpdate(freshDoc, stateUpdate);
      const freshFragment = freshDoc.getXmlFragment('default');
      const freshYtext = freshDoc.getText('source');

      // Step 4: Run setupObservers on the pre-populated fresh doc (production reconnect path)
      const freshCleanup = setupObservers({
        doc: freshDoc,
        xmlFragment: freshFragment,
        ytext: freshYtext,
        mdManager,
        schema,
      });

      try {
        // Step 5: Perform additional operations on restored doc
        freshDoc.transact(() => {
          freshYtext.insert(freshYtext.length, '\n\n## Post-restore addition\n');
        }, 'agent-write');
        await wait(500);

        // Step 6: Assert bridge invariant on restored doc
        assertBridgeInvariant(freshYtext, freshFragment, `S9/${tier.name}`);
        expect(freshYtext.toString()).toContain('Section 1');
        expect(freshYtext.toString()).toContain('Post-restore addition');

        const elapsed = Math.round(performance.now() - start);
        logTiming('S9', tier.name, elapsed, true);
      } catch (e) {
        const elapsed = Math.round(performance.now() - start);
        logTiming('S9', tier.name, elapsed, false);
        throw e;
      } finally {
        freshCleanup();
      }
    },
    TIERS.medium.timeout,
  );
});

// ---------- S3: Undo chain: N agent writes, N undos ----------

/** Extra ms for `test()` timeout on CI — runners are often 2–3× slower than dev laptops. */
const S3_CI_TIMEOUT_SLACK_MS = process.env.CI ? 120_000 : 0;

describe('S3: undo chain', () => {
  const configs = [
    { tier: TIERS.small, N: 5 },
    { tier: TIERS.medium, N: 5 },
    { tier: TIERS.large, N: 3 },
  ];

  for (const { tier, N } of configs) {
    test(
      `${tier.name} (${tier.lines}L, N=${N})`,
      async () => {
        const start = performance.now();
        const doc = new Y.Doc();
        const fragment = doc.getXmlFragment('default');
        const ytext = doc.getText('source');
        const undoManager = new Y.UndoManager(ytext, {
          trackedOrigins: new Set(['agent-write']),
          captureTimeout: 0,
        });
        const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

        try {
          const initialText = ytext.toString();

          for (let i = 0; i < N; i++) {
            const content = stabilize(generateMarkdown(tier.lines));
            // Stabilize the composed payload so NG1 (blank-line-count
            // normalization) does not produce false bridge-invariant diffs
            // from concatenating stabilized content (trailing \n) with \n\n.
            const payload = stabilize(`${content}\n\n## Write ${i + 1}\n`);
            doc.transact(() => {
              ytext.delete(0, ytext.length);
              ytext.insert(0, payload);
            }, 'agent-write');
            await wait(200);
          }

          expect(undoManager.canUndo()).toBe(true);

          for (let i = 0; i < N; i++) {
            undoManager.undo();
            await wait(200);
          }

          expect(undoManager.canUndo()).toBe(false);
          await wait(500);

          assertBridgeInvariant(ytext, fragment, `S3/${tier.name}`);
          expect(stripTrailingWhitespace(ytext.toString())).toBe(
            stripTrailingWhitespace(initialText),
          );

          const elapsed = Math.round(performance.now() - start);
          logTiming('S3', tier.name, elapsed, true);
        } catch (e) {
          const elapsed = Math.round(performance.now() - start);
          logTiming('S3', tier.name, elapsed, false);
          throw e;
        } finally {
          undoManager.destroy();
          cleanup();
        }
      },
      // N*10s bonus accounts for per-iteration undo + re-sync overhead, doubled
      // from the original 5s to match the 2x CI timeout multiplier below.
      // S3-large can exceed 150s wall time on slow GHA runners without slack.
      tier.timeout + N * 10_000 + S3_CI_TIMEOUT_SLACK_MS,
    );
  }
});
