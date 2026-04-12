/**
 * Layer A: Observer stress suite — S2 (concurrent user typing + agent write).
 *
 * Split from observers.stress.test.ts for turbo-based parallel sharding.
 * Contains S2 ASCII (all 4 tiers) + S2 Unicode (3 realistic tiers).
 */

import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
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

// ---------- S2: Concurrent user typing + agent write ----------

describe('S2: concurrent typing + agent write', () => {
  function runS2(tier: Tier, content: string, userMarker: string, label: string) {
    return async () => {
      const start = performance.now();
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

      try {
        // Agent writes large content
        doc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, content);
        }, 'agent-write');

        // Small wait for Observer B debounce to start
        await wait(100);

        // User types concurrently — markUserTyping keeps Observer B deferred
        markUserTyping(doc);
        const userPara = new Y.XmlElement('paragraph');
        const userText = new Y.XmlText();
        userText.applyDelta([{ insert: userMarker }]);
        userPara.insert(0, [userText]);
        fragment.push([userPara]);

        // Simulate typing window (300ms+ so Observer B defers)
        const typingInterval = setInterval(() => markUserTyping(doc), 50);
        await wait(400);
        clearInterval(typingInterval);

        // Let observers fully settle after typing stops
        await wait(600);

        assertBridgeInvariant(ytext, fragment, label);
        expect(ytext.toString()).toContain(userMarker);
        expect(ytext.toString()).toContain('Section 1');

        const elapsed = Math.round(performance.now() - start);
        logTiming('S2', tier.name, elapsed, true);
      } catch (e) {
        const elapsed = Math.round(performance.now() - start);
        logTiming('S2', tier.name, elapsed, false);
        throw e;
      } finally {
        cleanup();
      }
    };
  }

  // ASCII variants — all 4 tiers (adversarial is probe-only)
  // NOTE: the probe path (`test.todo`) must not evaluate `stabilize(generateMarkdown(50000))`
  // at module load. JavaScript evaluates function arguments eagerly, so calling `runS2(tier,
  // stabilize(...), ...)` inline inside `testFn(...)` would run the stabilize even when
  // `testFn === test.todo`. On a 50000-line adversarial input this costs ~176s per shard
  // load — nearly 95% of s2's wall clock on M-series. Split the probe branch out and call
  // `test.todo(name)` with no body so no content is computed for the never-run test.
  for (const tier of ALL_TIERS) {
    const name = `ASCII ${tier.name} (${tier.lines}L)`;
    if (tier.probe) {
      test.todo(name);
      continue;
    }
    test(
      name,
      runS2(tier, contentFor(tier), `USER-S2-${tier.name.toUpperCase()}`, `S2-ascii/${tier.name}`),
      tier.timeout,
    );
  }

  // Unicode variants — 3 realistic tiers only
  for (const tier of REALISTIC_TIERS) {
    test(
      `Unicode ${tier.name} (${tier.lines}L)`,
      runS2(tier, contentFor(tier, true), `USER-S2-UNICODE-\u{1F680}`, `S2-unicode/${tier.name}`),
      tier.timeout,
    );
  }
});
