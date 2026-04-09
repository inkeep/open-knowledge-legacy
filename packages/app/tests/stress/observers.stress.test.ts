/**
 * Layer A: Observer unit stress suite
 *
 * Tests the bidirectional observer bridge (XmlFragment ↔ Y.Text) at graded
 * scales: small-realistic (500L), medium-realistic (2000L), large-realistic
 * (10KL), adversarial (50KL, probe-only).
 *
 * Convergence assertion (D13 two-tier):
 *   1. Bridge invariant: normalized Y.Text === serialized XmlFragment
 *   2. Content preservation: .toContain() for user keystrokes / agent content
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from '../../src/editor/extensions/shared';
import {
  __resetCoordinationState,
  markUserTyping,
  setupObservers,
} from '../../src/editor/observers';
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

function applyMarkdown(doc: Y.Doc, fragment: Y.XmlFragment, md: string) {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
}

function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
}

/**
 * Make markdown round-trip stable through parse → serialize. After an agent
 * write to Y.Text, Observer B parses to XmlFragment and Observer A doesn't
 * fire back (origin guard). The bridge invariant only holds when Y.Text
 * content is already in serialized form.
 */
function stabilize(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

/** Two-tier convergence assertion per D13. */
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
  /** If true, failure is informational (probe-only per D5/FR7) */
  probe?: boolean;
  /** Test timeout in ms */
  timeout: number;
}

const TIERS: Record<string, Tier> = {
  small: { name: 'small-realistic', lines: 500, timeout: 10_000 },
  medium: { name: 'medium-realistic', lines: 2000, timeout: 30_000 },
  large: { name: 'large-realistic', lines: 10000, timeout: 60_000 },
  adversarial: { name: 'adversarial', lines: 50000, probe: true, timeout: 120_000 },
};

const REALISTIC_TIERS = [TIERS.small, TIERS.medium, TIERS.large];
const ALL_TIERS = [...REALISTIC_TIERS, TIERS.adversarial];

// Pre-compute stabilized content for each tier (avoids counting parse→serialize
// time against test timeouts). Stabilized = round-trip through markdown parser,
// so the bridge invariant holds after Observer B propagates.
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
          : 'small'; // adversarial generated on-the-fly
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

      // Step 2: Encode source doc state
      const stateUpdate = Y.encodeStateAsUpdate(sourceDoc);

      // Step 3: Apply to fresh doc (simulates reconnect)
      const freshDoc = new Y.Doc();
      Y.applyUpdate(freshDoc, stateUpdate);
      const freshFragment = freshDoc.getXmlFragment('default');
      const freshYtext = freshDoc.getText('source');

      // Step 4: Run setupObservers on the pre-populated fresh doc (production reconnect path)
      __resetCoordinationState();
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
