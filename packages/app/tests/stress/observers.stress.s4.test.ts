/**
 * Layer A: Observer stress suite — S4 (agent undo during active user typing)
 * + S4b (unterminated-final-line gap 2 regression).
 *
 * Split from observers.stress.test.ts for turbo-based parallel sharding.
 */

import { describe, expect, test } from 'bun:test';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from '../../src/editor/extensions/shared';
import { markUserTyping, setupObservers } from '../../src/editor/observers';
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

const CONTENT = {
  small: stabilize(generateMarkdown(TIERS.small.lines)),
  medium: stabilize(generateMarkdown(TIERS.medium.lines)),
  large: stabilize(generateMarkdown(TIERS.large.lines)),
  smallUnicode: stabilize(generateMarkdown(TIERS.small.lines, { unicode: true })),
  mediumUnicode: stabilize(generateMarkdown(TIERS.medium.lines, { unicode: true })),
  largeUnicode: stabilize(generateMarkdown(TIERS.large.lines, { unicode: true })),
  smallNoNewline: stabilize(generateMarkdown(TIERS.small.lines, { noTrailingNewline: true })),
  mediumNoNewline: stabilize(generateMarkdown(TIERS.medium.lines, { noTrailingNewline: true })),
  largeNoNewline: stabilize(generateMarkdown(TIERS.large.lines, { noTrailingNewline: true })),
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

function contentForNoNewline(tier: Tier): string {
  const key =
    tier === TIERS.small
      ? 'smallNoNewline'
      : tier === TIERS.medium
        ? 'mediumNoNewline'
        : 'largeNoNewline';
  return CONTENT[key];
}

// ---------- S4: Agent undo during active user typing ----------

describe('S4: agent undo during active typing', () => {
  function runS4(tier: Tier, content: string, userMarker: string, label: string) {
    return async () => {
      const start = performance.now();
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

      // Local UndoManager mirroring server config
      const undoManager = new Y.UndoManager(ytext, {
        trackedOrigins: new Set(['agent-write']),
        captureTimeout: 0,
      });

      try {
        // Step 1: agent writes
        doc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, content);
        }, 'agent-write');

        // Step 2: wait for propagation
        await wait(500);
        expect(undoManager.canUndo()).toBe(true);

        // Step 3: user begins typing
        markUserTyping(doc);
        const userPara = new Y.XmlElement('paragraph');
        const userText = new Y.XmlText();
        userText.applyDelta([{ insert: userMarker }]);
        userPara.insert(0, [userText]);
        fragment.push([userPara]);

        const typingInterval = setInterval(() => markUserTyping(doc), 50);

        // Step 4: undo fires during typing
        await wait(100);
        undoManager.undo();

        // Step 5: keep typing to defer Observer B
        await wait(400);
        clearInterval(typingInterval);

        // Step 6: let observers settle
        await wait(600);

        // Step 7: assertions
        expect(ytext.toString()).toContain(userMarker);
        expect(ytext.toString()).not.toContain('Section 1');
        assertBridgeInvariant(ytext, fragment, label);

        const elapsed = Math.round(performance.now() - start);
        logTiming('S4', tier.name, elapsed, true);
      } catch (e) {
        const elapsed = Math.round(performance.now() - start);
        logTiming('S4', tier.name, elapsed, false);
        throw e;
      } finally {
        undoManager.destroy();
        cleanup();
      }
    };
  }

  // ASCII variants — 3 realistic tiers
  for (const tier of REALISTIC_TIERS) {
    test(
      `ASCII ${tier.name} (${tier.lines}L)`,
      runS4(tier, contentFor(tier), `USER-S4-${tier.name.toUpperCase()}`, `S4-ascii/${tier.name}`),
      tier.timeout,
    );
  }

  // Unicode variants — 3 realistic tiers
  for (const tier of REALISTIC_TIERS) {
    test(
      `Unicode ${tier.name} (${tier.lines}L)`,
      runS4(tier, contentFor(tier, true), `USER-S4-UNICODE-\u{1F680}`, `S4-unicode/${tier.name}`),
      tier.timeout,
    );
  }
});

// ---------- S4b: applyUserDelta unterminated-final-line regression ----------

describe('S4b: unterminated-final-line gap 2 regression', () => {
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
          const content = contentForNoNewline(tier);

          // Step 1: agent writes content without trailing newline
          doc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, content);
          }, 'agent-write');

          // Step 2: wait for Observer B to propagate to XmlFragment
          await wait(500);

          // Step 3: user types — triggers Observer A → applyUserDelta with
          // oldXmlMd that may lack trailing newline
          markUserTyping(doc);
          const userPara = new Y.XmlElement('paragraph');
          const userText = new Y.XmlText();
          const marker = `USER-S4B-${tier.name.toUpperCase()}`;
          userText.applyDelta([{ insert: marker }]);
          userPara.insert(0, [userText]);
          fragment.push([userPara]);

          // Keep typing briefly then stop
          const typingInterval = setInterval(() => markUserTyping(doc), 50);
          await wait(400);
          clearInterval(typingInterval);

          // Wait for observers to settle
          await wait(600);

          // Step 6: assert convergence
          assertBridgeInvariant(ytext, fragment, `S4b/${tier.name}`);
          expect(ytext.toString()).toContain(marker);
          expect(ytext.toString()).toContain('Section 1');

          const elapsed = Math.round(performance.now() - start);
          logTiming('S4b', tier.name, elapsed, true);
        } catch (e) {
          const elapsed = Math.round(performance.now() - start);
          logTiming('S4b', tier.name, elapsed, false);
          throw e;
        } finally {
          cleanup();
        }
      },
      tier.timeout,
    );
  }
});
