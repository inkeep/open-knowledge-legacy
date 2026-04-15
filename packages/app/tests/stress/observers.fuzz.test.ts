/**
 * Layer D: Randomized fuzz harness for the observer bridge.
 *
 * Runs seeded-PRNG mutator sequences against a single Y.Doc with observers.
 * Catches interleaving bugs that deterministic tests don't imagine.
 *
 * NOT the Yjs applyRandomTests pattern (multi-user network simulation) —
 * this is a local mutator-ordering loop against the single-doc bridge.
 *
 * Failure attribution: seeded PRNG + per-op log + replay mode + snapshot dump.
 * Env vars: STRESS_FUZZ_SEED, STRESS_FUZZ_MAX_ITER, STRESS_FUZZ_VERBOSE
 */

import { describe, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import { AGENT_WRITE_ORIGIN } from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from '../../src/editor/extensions/shared';
import { markUserTyping, setupObservers } from '../../src/editor/observers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

// ---------- seeded PRNG ----------

/** Simple xorshift32 PRNG for reproducibility */
function createPRNG(seed: number) {
  let state = seed | 0 || 1; // Ensure non-zero
  return {
    /** Returns a number in [0, 1) */
    next(): number {
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    },
    /** Returns an integer in [0, max) */
    nextInt(max: number): number {
      return Math.floor(this.next() * max);
    },
    seed: seed,
  };
}

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

/**
 * Applies one parse→serialize round-trip to normalize NG1 (blank-line-count
 * between blocks). Used in `bridgeInvariantHolds` to compare Y.Text (which can
 * contain raw multi-blank-line content from concatenation or paste) against
 * XmlFragment (which represents blocks without encoding between-block blank
 * counts). A real bridge divergence still produces a mismatch here because
 * both sides must end up at the same canonical form.
 */
function stabilize(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function bridgeInvariantHolds(
  ytext: Y.Text,
  fragment: Y.XmlFragment,
): { ok: boolean; textSide: string; treeSide: string } {
  // NG1 normalization: factor out blank-line-count-between-blocks via stabilize()
  // so Y.Text and XmlFragment are compared under pipeline-equivalent representation.
  const textSide = stripTrailingWhitespace(stabilize(ytext.toString()));
  const treeSide = stripTrailingWhitespace(serializeFragment(fragment));
  return { ok: textSide === treeSide, textSide, treeSide };
}

const VERBOSE = process.env.STRESS_FUZZ_VERBOSE === '1';

// ---------- mutators ----------

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

function randomContent(prng: ReturnType<typeof createPRNG>, lines: number): string {
  const result: string[] = [];
  for (let i = 0; i < lines; i++) {
    const wordCount = prng.nextInt(6) + 3;
    const words: string[] = [];
    for (let w = 0; w < wordCount; w++) {
      words.push(WORDS[prng.nextInt(WORDS.length)]);
    }
    result.push(words.join(' '));
  }
  return result.join('\n');
}

type Mutator = (ctx: FuzzContext) => void;

interface FuzzContext {
  doc: Y.Doc;
  fragment: Y.XmlFragment;
  ytext: Y.Text;
  undoManager: Y.UndoManager;
  prng: ReturnType<typeof createPRNG>;
}

const mutators: Array<{ name: string; fn: Mutator }> = [
  {
    name: 'pushXmlParagraph',
    fn: (ctx) => {
      const content = randomContent(ctx.prng, 1);
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText(content);
      paragraph.insert(0, [text]);
      ctx.fragment.insert(ctx.fragment.length, [paragraph]);
    },
  },
  {
    name: 'deleteXmlParagraph',
    fn: (ctx) => {
      if (ctx.fragment.length > 0) {
        const idx = ctx.prng.nextInt(ctx.fragment.length);
        ctx.fragment.delete(idx, 1);
      }
    },
  },
  {
    name: 'insertYText',
    fn: (ctx) => {
      // Full replacement (like production agent writes) — random position
      // inserts produce unparseable markdown that breaks the bridge invariant.
      const lines = ctx.prng.nextInt(5) + 1;
      const content = `## Fuzz heading\n\n${randomContent(ctx.prng, lines)}\n`;
      let stabilized = mdManager.serialize(mdManager.parse(content));
      // Randomly omit trailing newline to exercise gap 2 code path
      if (ctx.prng.next() < 0.3) {
        stabilized = stabilized.replace(/\n$/, '');
      }
      ctx.doc.transact(() => {
        ctx.ytext.delete(0, ctx.ytext.length);
        ctx.ytext.insert(0, stabilized);
      }, AGENT_WRITE_ORIGIN);
    },
  },
  {
    name: 'agentUndo',
    fn: (ctx) => {
      if (ctx.undoManager.canUndo()) {
        ctx.undoManager.undo();
      }
    },
  },
  {
    name: 'agentRedo',
    fn: (ctx) => {
      if (ctx.undoManager.canRedo()) {
        ctx.undoManager.redo();
      }
    },
  },
  {
    name: 'flushObservers',
    fn: (_ctx) => {
      // No-op mutator — the wait() after each iteration cycle flushes.
      // This mutator exists to vary the timing pattern (an extra wait
      // between other mutators).
    },
  },
  {
    name: 'markTyping',
    fn: (ctx) => {
      markUserTyping(ctx.doc);
    },
  },
  {
    name: 'agentRewriteParagraph',
    fn: (ctx) => {
      // Pick a random paragraph from the current Y.Text content and rewrite
      // ~50% of its characters. This forces Path B (DMP three-way merge) when
      // Observer A fires next, exercising Match_Threshold=0.5 under randomized
      // divergence levels.
      const currentText = ctx.ytext.toString();
      const lines = currentText.split('\n');
      // Find non-empty lines that look like paragraph content (not headings, etc.)
      const paraLines = lines
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => line.length > 0 && !line.startsWith('#') && !line.startsWith('---'));
      if (paraLines.length === 0) return; // null-safe

      const target = paraLines[ctx.prng.nextInt(paraLines.length)];
      // Mutate ~50% of the characters
      const chars = target.line.split('');
      for (let c = 0; c < chars.length; c++) {
        if (ctx.prng.next() < 0.5) {
          chars[c] = WORDS[ctx.prng.nextInt(WORDS.length)][0]; // replace with a random letter
        }
      }
      const newLine = chars.join('');
      lines[target.idx] = newLine;
      const newContent = lines.join('\n');

      ctx.doc.transact(() => {
        ctx.ytext.delete(0, ctx.ytext.length);
        ctx.ytext.insert(0, newContent);
      }, AGENT_WRITE_ORIGIN);
    },
  },
];

// ---------- fuzz runner ----------

async function runFuzz(iterations: number, seedOverride?: number): Promise<void> {
  const seed = seedOverride ?? (Number(process.env.STRESS_FUZZ_SEED) || Date.now());
  const maxIter = Number(process.env.STRESS_FUZZ_MAX_ITER) || iterations;
  const effectiveIter = Math.min(iterations, maxIter);

  const prng = createPRNG(seed);

  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  const undoManager = new Y.UndoManager(ytext, {
    trackedOrigins: new Set([AGENT_WRITE_ORIGIN]),
    captureTimeout: 0,
  });
  const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

  const ctx: FuzzContext = { doc, fragment, ytext, undoManager, prng };

  try {
    for (let i = 0; i < effectiveIter; i++) {
      const mutatorIdx = prng.nextInt(mutators.length);
      const { name, fn } = mutators[mutatorIdx];

      if (VERBOSE) {
        console.log(`[fuzz] iter=${i} seed=${seed.toString(16)} op=${name}`);
      }

      fn(ctx);

      // Flush observers after EVERY mutator — the interleaving of mutators
      // is the stress, not timing races (those are covered by S5b).
      await wait(500);

      // Only check bridge invariant periodically (every 5 iterations)
      // to avoid excessive serialization overhead
      if (name === 'flushObservers' || i % 5 === 4) {
        const result = bridgeInvariantHolds(ytext, fragment);
        if (!result.ok) {
          const snapshotPath = `/tmp/fuzz-failure-${Date.now()}.ydoc`;
          writeFileSync(snapshotPath, Y.encodeStateAsUpdate(doc));

          const textLines = result.textSide.split('\n');
          const treeLines = result.treeSide.split('\n');
          let firstDiff = 0;
          while (
            firstDiff < textLines.length &&
            firstDiff < treeLines.length &&
            textLines[firstDiff] === treeLines[firstDiff]
          ) {
            firstDiff++;
          }

          throw new Error(
            `Fuzz bridge invariant violated at iter=${i}, seed=${seed.toString(16)}\n` +
              `Replay:  STRESS_FUZZ_SEED=${seed.toString(16)} STRESS_FUZZ_MAX_ITER=${i} bun test observers.fuzz\n` +
              `Snapshot: ${snapshotPath}\n` +
              `Manual bisect: halve STRESS_FUZZ_MAX_ITER until it passes\n` +
              `First divergence at line ${firstDiff + 1}\n` +
              `Y.Text (${textLines.length}L):\n${textLines.slice(firstDiff, firstDiff + 5).join('\n')}\n` +
              `XmlFragment (${treeLines.length}L):\n${treeLines.slice(firstDiff, firstDiff + 5).join('\n')}`,
          );
        }
      }
    }

    // Final flush and check
    await wait(500);
    const finalResult = bridgeInvariantHolds(ytext, fragment);
    if (!finalResult.ok) {
      const snapshotPath = `/tmp/fuzz-failure-${Date.now()}.ydoc`;
      writeFileSync(snapshotPath, Y.encodeStateAsUpdate(doc));
      throw new Error(
        `Fuzz bridge invariant violated at final check, seed=${seed.toString(16)}\n` +
          `Replay:  STRESS_FUZZ_SEED=${seed.toString(16)} bun test observers.fuzz\n` +
          `Snapshot: ${snapshotPath}`,
      );
    }

    console.log(
      `[fuzz] completed ${effectiveIter} iterations, seed=${seed.toString(16)}, bridge invariant holds`,
    );
  } finally {
    undoManager.destroy();
    cleanup();
  }
}

// ---------- test cases (scale ladder) ----------

describe('Layer D: fuzz harness', () => {
  test('fuzz 10 iterations (smoke)', () => runFuzz(10, 0xdeadbeef), 15_000);

  test('fuzz 50 iterations (baseline)', () => runFuzz(50, 0xcafebabe), 30_000);

  // 200+ iteration probes — opt-in via STRESS_FUZZ_NIGHTLY=1
  const runNightly = process.env.STRESS_FUZZ_NIGHTLY === '1' ? test : test.todo;
  runNightly('fuzz 200 iterations (deep)', () => runFuzz(200, 0x12345678), 120_000);
  runNightly('fuzz 500 iterations (nightly probe)', () => runFuzz(500, 0xfeedface), 300_000);
});
