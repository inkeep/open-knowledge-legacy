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
  // No-trailing-newline variants for S4b (gap 2 regression trigger)
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
          : 'small'; // adversarial generated on-the-fly
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

// ---------- S2: Concurrent user typing + agent write ----------

describe('S2: concurrent typing + agent write', () => {
  /**
   * Scenario: agent writes large content to Y.Text while the user simultaneously
   * types into XmlFragment. After observers settle, both user content and agent
   * content must be present (content preservation) and the bridge invariant holds.
   *
   * Flow:
   *   1. Agent writes content to Y.Text with origin 'agent-write'
   *   2. User types marker text into XmlFragment (simulated via Y.XmlElement push)
   *   3. markUserTyping() called to activate the typing-defer window
   *   4. Wait for all observers to settle
   *   5. Assert bridge invariant + content preservation
   */
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
        markUserTyping();
        const userPara = new Y.XmlElement('paragraph');
        const userText = new Y.XmlText();
        userText.applyDelta([{ insert: userMarker }]);
        userPara.insert(0, [userText]);
        fragment.push([userPara]);

        // Simulate typing window (300ms+ so Observer B defers)
        const typingInterval = setInterval(() => markUserTyping(), 50);
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
  for (const tier of ALL_TIERS) {
    const testFn = tier.probe ? test.todo : test;
    testFn(
      `ASCII ${tier.name} (${tier.lines}L)`,
      runS2(
        tier,
        tier.probe ? stabilize(generateMarkdown(tier.lines)) : contentFor(tier),
        `USER-S2-${tier.name.toUpperCase()}`,
        `S2-ascii/${tier.name}`,
      ),
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

// ---------- S4: Agent undo during active user typing ----------

describe('S4: agent undo during active typing', () => {
  /**
   * Scenario: agent writes content, user begins typing, server-side undo fires
   * while user is still typing. After observers settle, user content must be
   * preserved and agent content must be removed.
   *
   * Flow:
   *   1. Agent writes content to Y.Text with origin 'agent-write'
   *   2. Wait for Observer B to propagate → XmlFragment has agent content
   *   3. User begins typing (markUserTyping + XmlFragment mutation)
   *   4. UndoManager.undo() fires (reverses agent write in Y.Text)
   *   5. Observer B defers because typing is active
   *   6. User stops typing → observers settle
   *   7. Assert: user content preserved, agent content gone, bridge invariant holds
   */
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
        markUserTyping();
        const userPara = new Y.XmlElement('paragraph');
        const userText = new Y.XmlText();
        userText.applyDelta([{ insert: userMarker }]);
        userPara.insert(0, [userText]);
        fragment.push([userPara]);

        const typingInterval = setInterval(() => markUserTyping(), 50);

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
  /**
   * Scenario: exercises the applyUserDelta oldPadded/prefix-trim code path
   * (gap 2 fix) at scale. Content is generated WITHOUT a trailing newline so
   * the diffLines alignment padding logic is exercised.
   *
   * Flow:
   *   1. Agent writes content (no trailing newline) to Y.Text
   *   2. Wait for Observer B propagation
   *   3. User types a marker into XmlFragment (triggers Observer A → applyUserDelta)
   *   4. Observer A runs applyUserDelta with oldXmlMd lacking trailing newline
   *   5. Wait for observers to settle
   *   6. Assert bridge invariant + content preservation
   */
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
          markUserTyping();
          const userPara = new Y.XmlElement('paragraph');
          const userText = new Y.XmlText();
          const marker = `USER-S4B-${tier.name.toUpperCase()}`;
          userText.applyDelta([{ insert: marker }]);
          userPara.insert(0, [userText]);
          fragment.push([userPara]);

          // Keep typing briefly then stop
          const typingInterval = setInterval(() => markUserTyping(), 50);
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

// ---------- S3: Undo chain: N agent writes, N undos ----------

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
            doc.transact(() => {
              ytext.delete(0, ytext.length);
              ytext.insert(0, `${content}\n\n## Write ${i + 1}\n`);
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
      tier.timeout + N * 5_000,
    );
  }
});

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
