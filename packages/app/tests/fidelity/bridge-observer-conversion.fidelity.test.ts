/**
 * bridge-observer-conversion.fidelity.test.ts
 *
 * FR-1 of specs/2026-04-19-ci-signal-quality/SPEC.md — deterministic PBT
 * coverage for the conversion paths invoked INSIDE the bridge observers.
 *
 * Why this file exists
 * --------------------
 * Under the dual-CRDT (Y.XmlFragment + Y.Text) topology, bridge-convergence
 * fuzz failures surface two unrelated bug classes as indistinguishable red:
 *
 *   (a) Conversion bugs — md ⇄ PM → XmlFragment / XmlFragment → Y.Text.
 *       These are deterministic, always-fail-on-replay, and the md ⇄ PM
 *       path is design-goal lossless.
 *
 *   (b) Architectural residual — three-way CRDT merge races that are
 *       Khanna-Kunal-Pierce-foundational under the current topology and
 *       can be made rare but not zero. Non-deterministic on replay.
 *
 * This file covers class (a) deterministically at the fidelity tier, so a
 * conversion regression is caught at PR time with a clean signal rather than
 * being conflated with architectural flake. Class (b) is no longer in CI at
 * all — see `bun run measure:fuzz` / `measure:stress` for ad-hoc sampling.
 *
 * Coverage map vs the fuzz op vocabulary
 * --------------------------------------
 * The bridge-convergence fuzzer has a 9-op vocabulary documented in
 * `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`:
 *
 *   1. wysiwyg-type          — user typing into the WYSIWYG surface
 *   2. source-type           — user typing into the source (Y.Text) surface
 *   3. agent-write           — full-document agent write via applyExternalChange
 *   4. agent-patch           — targeted agent edits via mdManager find/replace
 *   5. external-change       — disk-driven applyExternalChange
 *   6. sync-pause            — simulate client disconnect
 *   7. sync-resume           — simulate reconnect + catch-up
 *   8. wait                  — idle tick for debounce settling
 *   9. chunked-source-paste  — large Y.Text insert across chunk boundaries
 *
 * Conversion-tier coverage in THIS file:
 *
 *   Chain A: parseMd → updateYFragment                — covers ops (1), (4)
 *                                                        (any md → PM → fragment)
 *   Chain B: serializeFragment → applyFastDiff         — covers ops (2), (9)
 *                                                        (any fragment → serialized → Y.Text diff)
 *   Chain C: paired updateYFragment + applyFastDiff    — covers ops (3), (5)
 *                                                        (applyExternalChange's inner transact)
 *
 * Ops (6)/(7)/(8) are timing/network scheduling — not conversion — so they
 * have no fidelity-tier analogue; they remain the exclusive domain of
 * integration/stress tests.
 *
 * Deterministic design
 * --------------------
 * Every test in this file runs in a SINGLE PROCESS with a SINGLE Y.Doc and
 * NO networking — it exercises only the pure conversion + in-memory CRDT
 * mutation. No Hocuspocus, no WebSocket, no multi-client. This is what makes
 * the test deterministic on replay and appropriate for PBT: seeded fast-check
 * runs reproduce byte-for-byte. A shrunk counterexample points at a pure
 * conversion bug, never at a merge race.
 *
 * Corresponding production code paths (for reviewers)
 * ---------------------------------------------------
 *   - `updateYFragment`   — `@tiptap/y-tiptap` (third-party, but driven here
 *                           via MarkdownManager.parse + schema.nodeFromJSON)
 *   - `applyFastDiff`     — `packages/core/src/bridge/apply-diff.ts`
 *   - `applyExternalChange` — `packages/server/src/external-change.ts`
 *     (inner pattern — `doc.transact(() => { updateYFragment(...);
 *      applyFastDiff(ytext, ytext.toString(), fullContent); }, ORIGIN)` —
 *     is replicated here WITHOUT the Hocuspocus plumbing)
 *
 * Invariant oracle definitions
 * ----------------------------
 *   I1-via-fragment:    Round-trip through the fragment preserves md content
 *                       after normalization (trailing-whitespace trim + final
 *                       newline handling per helpers.normalize).
 *   fragment↔text-sync: After applyFastDiff, ytext.toString() exactly equals
 *                       the serialized fragment used as the diff target.
 *   content-preservation: Non-whitespace tokens present in the input markdown
 *                       survive the full chain (both in fragment and in ytext).
 *   handler-specific:   wikiLink/jsxComponent/rawMdxFallback markdown survives
 *                       the chains under their respective extensions.
 */

import { describe, expect, test } from 'bun:test';
import { applyFastDiff, MarkdownManager } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';

import { sharedExtensions } from '../../src/editor/extensions/shared';

import {
  blockquote,
  codeBlock,
  heading,
  paragraph,
  paragraphWithFidelityChars,
  paragraphWithMarks,
} from './arbitraries';
import { assertAcrossSeeds, NUM_RUNS, normalize, PBT_TIMEOUT_MS } from './helpers';

// ── Shared setup (module scope — no per-test allocation cost) ──────────────

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

// ── Helper types + functions ───────────────────────────────────────────────

/**
 * The paired-write transaction origin used in production by
 * `applyExternalChange`. Replicating the exact shape ensures the
 * isPairedWriteOrigin detection path is exercised correctly — `paired: true`
 * is the semantic marker that Observer A/B short-circuit on.
 */
const TEST_PAIRED_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'fidelity-test', paired: true },
} as const;

/** Build a fresh Y.Doc + XmlFragment + Y.Text trio. No shared state. */
function freshDoc(): { doc: Y.Doc; fragment: Y.XmlFragment; ytext: Y.Text } {
  const doc = new Y.Doc();
  return {
    doc,
    fragment: doc.getXmlFragment('default'),
    ytext: doc.getText('source'),
  };
}

/**
 * Drive `parseMd → updateYFragment` without any observers — this is the pure
 * conversion chain the observers invoke internally when they apply a parsed
 * ProseMirror node to the shared XmlFragment.
 */
function applyMdToFragment(doc: Y.Doc, fragment: Y.XmlFragment, md: string): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  // `meta` matches the shape @tiptap/y-tiptap expects for fresh syncs.
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => {
    updateYFragment(doc, fragment, pmNode, meta);
  });
}

/**
 * The paired-write pattern from `applyExternalChange`: update the fragment
 * from parsed markdown AND apply a character-level diff to Y.Text, all in
 * one transaction with PairedWriteOrigin semantics.
 */
function applyPairedExternalChange(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  ytext: Y.Text,
  md: string,
): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => {
    updateYFragment(doc, fragment, pmNode, meta);
    const currentText = ytext.toString();
    if (currentText !== md) {
      applyFastDiff(ytext, currentText, md);
    }
  }, TEST_PAIRED_ORIGIN);
}

/** Serialize the fragment back to markdown. */
function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
}

/**
 * Normalize both sides of a bridge comparison the same way `assertBridgeInvariant`
 * does: trim trailing whitespace per line, collapse trailing newlines. Cross-CRDT
 * equivalence is defined modulo this normalization because the ProseMirror schema
 * has limited expressiveness for blank-line counts between blocks.
 */
function bridgeNorm(s: string): string {
  return normalize(s);
}

/**
 * Extract "content tokens" — alphanumeric runs of length ≥2 — from a markdown
 * input. These are the survivable payload that MUST appear in both the
 * serialized fragment and ytext after conversion. Markdown syntax (`#`, `*`,
 * leading `> `, etc.) is NOT part of this set because it can be normalized or
 * re-emitted by the serializer.
 */
function contentTokens(md: string): string[] {
  const tokens = md.match(/[A-Za-z0-9]{2,}/g) ?? [];
  // Deduplicate so the assertion doesn't get confused by a repeated token
  // appearing only once downstream (e.g., list marker normalization).
  return Array.from(new Set(tokens));
}

// ── Composite arbitraries used across chains ───────────────────────────────

/**
 * A "mixed document" arbitrary covering several block kinds. Intentionally
 * limited in size (2–4 blocks) to keep a single PBT run fast; the fidelity
 * coverage we need is about per-kind conversion invariants, not arbitrarily
 * deep nesting (which corpus-commonmark / corpus-gfm already exercise).
 */
const mixedDocument = fc
  .array(fc.oneof(heading, paragraph, paragraphWithFidelityChars, codeBlock, blockquote), {
    minLength: 2,
    maxLength: 4,
  })
  .map((blocks) => `${blocks.join('\n\n')}\n`);

const paragraphsOnly = fc
  .array(fc.oneof(paragraph, paragraphWithMarks, paragraphWithFidelityChars), {
    minLength: 1,
    maxLength: 3,
  })
  .map((blocks) => `${blocks.join('\n\n')}\n`);

// ═══════════════════════════════════════════════════════════════════════════
// Chain A: parseMd → updateYFragment
// ═══════════════════════════════════════════════════════════════════════════
//
// This is the chain Observer B (paired-write) and every agent-write path
// invokes: take raw markdown, parse to a ProseMirror JSON node, and apply via
// updateYFragment to the shared XmlFragment. The invariant is that the
// fragment now round-trips (via serialize) to the same semantic content the
// input would have produced under pure md ⇄ PM — i.e., going through the
// CRDT tree must not lose information.

describe('Chain A — parseMd → updateYFragment preserves content', () => {
  test(
    'heading blocks round-trip through fragment',
    () => {
      assertAcrossSeeds(
        fc.property(heading, (md) => {
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          expect(bridgeNorm(serialized)).toBe(bridgeNorm(mdManager.serialize(mdManager.parse(md))));
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'paragraph blocks round-trip through fragment',
    () => {
      assertAcrossSeeds(
        fc.property(paragraph, (md) => {
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          expect(bridgeNorm(serialized)).toBe(bridgeNorm(mdManager.serialize(mdManager.parse(md))));
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'paragraph with fidelity chars (& < >) survives fragment round-trip',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphWithFidelityChars, (md) => {
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          const expected = bridgeNorm(mdManager.serialize(mdManager.parse(md)));
          expect(bridgeNorm(serialized)).toBe(expected);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mixed documents (heading + paragraph + code + blockquote) round-trip',
    () => {
      assertAcrossSeeds(
        fc.property(mixedDocument, (md) => {
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          const expected = bridgeNorm(mdManager.serialize(mdManager.parse(md)));
          expect(bridgeNorm(serialized)).toBe(expected);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'content tokens from input survive in the fragment',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, (md) => {
          const tokens = contentTokens(md);
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          for (const token of tokens) {
            expect(serialized.includes(token)).toBe(true);
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Chain B: serializeFragment → applyFastDiff
// ═══════════════════════════════════════════════════════════════════════════
//
// This is the chain Observer A runs: given that the fragment is the source
// of truth, produce the canonical serialization and diff it into Y.Text via
// DMP. Observer A's behavior is to preserve as many CRDT Items as possible
// (precedent #11), but its correctness contract is simpler: after the diff,
// Y.Text MUST equal the target. Any divergence is a conversion bug in
// applyFastDiff, not an architectural race.

describe('Chain B — serializeFragment → applyFastDiff aligns Y.Text to target', () => {
  test(
    'fragment→text produces ytext === serialized fragment (empty ytext start)',
    () => {
      assertAcrossSeeds(
        fc.property(mixedDocument, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          doc.transact(() => {
            applyFastDiff(ytext, ytext.toString(), serialized);
          });
          expect(ytext.toString()).toBe(serialized);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'fragment→text converges from arbitrary pre-populated ytext',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, paragraphsOnly, (initialMd, targetMd) => {
          const { doc, fragment, ytext } = freshDoc();
          // Seed ytext with the initial md so applyFastDiff exercises the
          // delete+insert path, not just a clean insert.
          doc.transact(() => {
            ytext.insert(0, initialMd);
          });
          applyMdToFragment(doc, fragment, targetMd);
          const serialized = serializeFragment(fragment);
          doc.transact(() => {
            applyFastDiff(ytext, ytext.toString(), serialized);
          });
          expect(ytext.toString()).toBe(serialized);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'applyFastDiff is idempotent when ytext already matches target',
    () => {
      assertAcrossSeeds(
        fc.property(paragraph, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyMdToFragment(doc, fragment, md);
          const serialized = serializeFragment(fragment);
          doc.transact(() => {
            applyFastDiff(ytext, ytext.toString(), serialized);
          });
          const beforeLen = ytext.length;
          doc.transact(() => {
            applyFastDiff(ytext, ytext.toString(), serialized);
          });
          // Same content + same length implies no mutations were made.
          expect(ytext.toString()).toBe(serialized);
          expect(ytext.length).toBe(beforeLen);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Chain C: paired updateYFragment + applyFastDiff (applyExternalChange inner)
// ═══════════════════════════════════════════════════════════════════════════
//
// This is the chain `applyExternalChange` runs: atomically update BOTH the
// fragment AND Y.Text from a single markdown input, inside one transaction
// with PairedWriteOrigin semantics. This is the highest-value test in the
// file because the paired path is what eliminates the Observer A→B
// round-trip race during external agent writes.

describe('Chain C — paired external-change preserves bridge invariant', () => {
  test(
    'paired write: ytext matches serialized fragment after external change',
    () => {
      assertAcrossSeeds(
        fc.property(mixedDocument, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
          // Bridge invariant: normalized Y.Text === normalized serialized fragment.
          // We compare via normalization because trailing whitespace and final
          // newline handling can differ between the md input and the
          // fragment-serializer's output, but the bridge invariant runtime uses
          // the same normalization.
          expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'paired write: sequential external changes each leave invariant holding',
    () => {
      assertAcrossSeeds(
        fc.property(fc.array(mixedDocument, { minLength: 2, maxLength: 4 }), (sequence) => {
          const { doc, fragment, ytext } = freshDoc();
          for (const md of sequence) {
            applyPairedExternalChange(doc, fragment, ytext, md);
            expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('paired write transaction origin is correctly tagged as paired', () => {
    // Sanity check: the transaction we run in applyPairedExternalChange
    // must use TEST_PAIRED_ORIGIN so isPairedWriteOrigin(origin) returns
    // true. If a future refactor drops the paired marker, this test
    // fails loudly.
    const { doc, fragment, ytext } = freshDoc();
    let observedOrigin: unknown = null;
    doc.on('afterTransaction', (tx: Y.Transaction) => {
      observedOrigin = tx.origin;
    });
    applyPairedExternalChange(doc, fragment, ytext, '# Hello\n\nworld\n');
    doc.off('afterTransaction', () => {
      /* noop — cleanup is best-effort; Y.Doc is GC'd at test end */
    });
    expect(observedOrigin).toBe(TEST_PAIRED_ORIGIN);
    const contextMarker = (observedOrigin as { context?: { paired?: boolean } } | null)?.context
      ?.paired;
    expect(contextMarker).toBe(true);
  });

  test(
    'paired write: content tokens from source md appear in BOTH fragment and ytext',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, (md) => {
          const tokens = contentTokens(md);
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
          const fragText = serializeFragment(fragment);
          const source = ytext.toString();
          for (const token of tokens) {
            expect(fragText.includes(token)).toBe(true);
            expect(source.includes(token)).toBe(true);
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Handler-specific sanity checks — wikiLink, JSX component, rawMdxFallback
// ═══════════════════════════════════════════════════════════════════════════
//
// These are NOT fast-check PBTs — they are concrete snapshot-style tests that
// confirm the handler-specific markdown survives the same three chains above.
// PBT over arbitrary wikilink/JSX input is high-return-on-investment noise
// (most generated cases are syntactically invalid); we cover the representative
// shapes and lean on corpus tests for broader coverage.

describe('Handler-specific survivability (chains A+C)', () => {
  const handlerCases: Array<{ label: string; md: string }> = [
    {
      label: 'wikiLink — simple target',
      md: 'See [[OtherPage]] for details.\n',
    },
    {
      label: 'wikiLink — with display text',
      md: 'Read [[OtherPage|the other page]].\n',
    },
    {
      label: 'jsxComponent — self-closing attribute',
      md: '<Callout variant="info">important</Callout>\n',
    },
    {
      label: 'jsxComponent — block with children',
      md: 'Before\n\n<Note>\ninner content\n</Note>\n\nAfter\n',
    },
    {
      label: 'rawMdxFallback — malformed JSX trailing',
      md: 'Paragraph\n\n<Bad attr=\n',
    },
  ];

  for (const { label, md } of handlerCases) {
    test(`Chain A survives ${label}`, () => {
      const { doc, fragment } = freshDoc();
      applyMdToFragment(doc, fragment, md);
      const serialized = serializeFragment(fragment);
      // Must be deterministic and lossless through the chain: content tokens
      // from the input (alphanumeric runs ≥2 chars) appear in the serialized
      // fragment. Exact formatting may differ — the assertion is on meaning.
      for (const token of contentTokens(md)) {
        expect(serialized.includes(token)).toBe(true);
      }
    });

    test(`Chain C (paired) keeps bridge invariant for ${label}`, () => {
      const { doc, fragment, ytext } = freshDoc();
      applyPairedExternalChange(doc, fragment, ytext, md);
      expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
      for (const token of contentTokens(md)) {
        expect(ytext.toString().includes(token)).toBe(true);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Smoke: NUM_RUNS calibration check
// ═══════════════════════════════════════════════════════════════════════════
//
// The file's PBT_TIMEOUT_MS (from helpers.ts) is 30s at standard NUM_RUNS
// and 90s under STRESS_FIDELITY=1. If the default NUM_RUNS were ever set
// to 0 or NaN, every test above would pass vacuously — this test ensures
// the PBT harness actually ran a non-trivial number of cases.
describe('Meta — PBT harness is live', () => {
  test('NUM_RUNS is a positive integer ≥100', () => {
    expect(Number.isFinite(NUM_RUNS)).toBe(true);
    expect(NUM_RUNS).toBeGreaterThanOrEqual(100);
  });
});
