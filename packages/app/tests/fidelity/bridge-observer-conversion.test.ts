/**
 * bridge-observer-conversion.test.ts
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
 * The bridge-convergence fuzzer has a 10-op vocabulary documented in
 * `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`:
 *
 *   1. wysiwyg-type          — user typing into the WYSIWYG surface
 *   2. source-type           — user typing into the source (Y.Text) surface
 *   3. agent-write           — full-document agent write via applyExternalChange
 *   4. agent-patch           — targeted agent edits via mdManager find/replace
 *   5. agent-undo            — revert last agent write via applyAgentUndo
 *   6. external-change       — disk-driven applyExternalChange
 *   7. sync-pause            — simulate client disconnect
 *   8. sync-resume           — simulate reconnect + catch-up
 *   9. wait                  — idle tick for debounce settling
 *  10. chunked-source-paste  — large Y.Text insert across chunk boundaries
 *
 * Conversion-tier coverage in THIS file — describe blocks:
 *
 *   Chain A: parseMd → updateYFragment                — covers ops (1), (4)
 *                                                        (any md → PM → fragment)
 *   Chain B: serializeFragment → applyFastDiff /      — covers op (2)
 *            applyIncrementalDiff / mergeThreeWay       (any fragment → serialized → Y.Text diff,
 *                                                        the three Observer A conversion functions)
 *   Chain C: paired updateYFragment + applyFastDiff    — covers ops (3), (6)
 *                                                        (applyExternalChange's inner transact,
 *                                                        including stripFrontmatter + parseWithFallback)
 *   Chain D: frontmatter strip/prepend round-trip      — Observer B → Observer A frontmatter path
 *                                                        (the conversion primitives; metadata-map
 *                                                        plumbing stays in integration tests)
 *   Chain E: agent-undo composition                    — covers op (5)
 *                                                        (post-undo XmlFragment-authoritative
 *                                                        composition via parseWithFallback →
 *                                                        updateYFragment → applyFastDiff;
 *                                                        mirrors applyAgentUndo inner logic)
 *   Handler-specific survivability                     — wikiLink, jsxComponent, rawMdxFallback
 *                                                        run through Chain A + Chain C deterministically
 *   Meta — PBT harness is live                         — NUM_RUNS floor checks (default + stress mode)
 *   Error-path anchor                                  — BridgeMergeContentLossError importable,
 *                                                        assertContentPreservation throws on violation
 *                                                        (deep behavioral coverage lives in core's
 *                                                        merge-three-way.test.ts; this is the anchor)
 *
 * Ops (6)/(7)/(8) are timing/network scheduling — not conversion — so they
 * have no fidelity-tier analogue; they remain the exclusive domain of
 * integration/stress tests.
 *
 * Op (9) chunked-source-paste — the chunking-boundary behavior (>500KB
 * Y.Text inserts) is covered by `packages/core/src/utils/chunked-insert.test.ts`
 * and `packages/app/tests/stress/paste-fidelity.e2e.ts`; the generators in
 * this file stay below the chunking threshold, so op (9) is NOT directly
 * exercised here. This is deliberate — chunked-insert is a separate
 * conversion surface with its own dedicated coverage.
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
import {
  applyFastDiff,
  applyIncrementalDiff,
  assertContentPreservation,
  BridgeMergeContentLossError,
  getFrontmatter,
  getFrontmatterMap,
  MarkdownManager,
  mergeThreeWay,
  parseFrontmatterYaml,
  prependFrontmatter,
  serializeFrontmatterMap,
  setFrontmatterFromYaml,
  sharedExtensions,
  stripFrontmatter,
  unwrapFrontmatterFences,
  withFences,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';

// Import sharedExtensions + conversion functions from `@inkeep/open-knowledge-core`
// — the same source the server-side production path uses (see
// `packages/server/src/md-manager.ts`). CLAUDE.md "Key constraint:
// sharedExtensions MUST stay in sync between core, server, and app — drift
// causes silent data corruption" applies here: testing against core's
// canonical array is what would surface a future app-side divergence.
// Other fidelity tests in this directory follow the same convention.

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
 * The paired-write pattern from `applyExternalChange` — mirrors the exact
 * production sequence in `packages/server/src/external-change.ts`:
 *   1. `stripFrontmatter(content)` — body vs YAML frontmatter.
 *   2. `parseWithFallback(body)` — tolerant MDX parsing (unlike `parse`
 *      which throws on crash-class input; production uses fallback so the
 *      observer path degrades gracefully rather than aborting the write).
 *   3. `updateYFragment(doc, fragment, pmNode, meta)` — body only.
 *   4. `applyFastDiff(ytext, currentText, content)` — full original
 *      content including frontmatter; the Y.Text surface is the
 *      user-visible source markdown and must contain the frontmatter so
 *      round-trips via CodeMirror don't drop it.
 * All steps execute inside one `doc.transact(..., PairedWriteOrigin)`.
 *
 * The frontmatter metadata-map plumbing in production writes the parsed
 * frontmatter scalars to `doc.getMap('metadata').set('frontmatter', ...)`;
 * this fidelity-tier helper skips that branch because integration tests
 * (packages/app/tests/integration/c*.test.ts) cover the metadata map,
 * and the PBT focus here is on the conversion functions themselves.
 */
function applyPairedExternalChange(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  ytext: Y.Text,
  content: string,
): void {
  const { body } = stripFrontmatter(content);
  const parsedJson = mdManager.parseWithFallback(body);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => {
    updateYFragment(doc, fragment, pmNode, meta);
    const currentText = ytext.toString();
    if (currentText !== content) {
      applyFastDiff(ytext, currentText, content);
    }
  }, TEST_PAIRED_ORIGIN);
}

/** Serialize the fragment back to markdown. */
function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON());
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
 * Extract the set of distinct alphanumeric runs (≥2 chars) present in a
 * markdown input. These are the survivable payload that MUST appear at least
 * once in the converted output — markdown syntax (`#`, `*`, leading `> `) is
 * not part of this set because it can be normalized or re-emitted by the
 * serializer.
 *
 * Named `presentInputTokens` (not `contentTokens`) to make the semantic
 * explicit: this is a presence-preservation oracle, not a multiplicity-
 * preservation oracle. If a token appears N times in input and M times in
 * output, the assertion is satisfied for any M≥1. Multiplicity preservation
 * for individual markdown constructs is the domain of `invariant-i1.test.ts`
 * (identity round-trip) and the corpus tests — this file's oracle is
 * specifically about conversion-chain *content survival*.
 */
function presentInputTokens(md: string): string[] {
  const tokens = md.match(/[A-Za-z0-9]{2,}/g) ?? [];
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

/**
 * Unicode / emoji paragraph arbitrary. Exercises multi-byte code-point
 * handling through the conversion chains: the JS/TS stack is UTF-16 but
 * markdown parsers, mdast visitors, and Y.Text internals handle surrogate
 * pairs and grapheme clusters with various degrees of care. Any regression
 * that drops a surrogate half, mis-counts offsets around emoji, or
 * normalizes a combining mark should surface as a PBT failure here.
 *
 * Generated characters draw from four categories: BMP non-ASCII (Greek,
 * Cyrillic), supplementary-plane emoji (🎉 🚀 💡 etc.), combining marks
 * (e.g. `é` decomposed), and zero-width joiners / variation selectors.
 * Kept intentionally short (≤80 chars per paragraph) to keep PBT runs
 * fast; broader Unicode corpus testing lives in
 * `packages/app/tests/fidelity/corpus-commonmark.test.ts`.
 */
const unicodeParagraph = fc
  .array(
    fc.oneof(
      // Alphanumeric (no internal spaces — we control joining)
      fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/),
      // BMP non-ASCII (Greek letters)
      fc.constantFrom('αβγ', 'Ωψφ', 'μνλ'),
      // Cyrillic
      fc.constantFrom('Привет', 'Спасибо'),
      // Supplementary-plane emoji (surrogate pairs, single code-point each)
      fc.constantFrom('🎉', '🚀', '💡', '🔥', '✨'),
      // ZWJ sequences (family + flag-with-modifier). Verified to round-trip
      // correctly across 9 contexts via direct probe; the initial skip was
      // a mis-attribution of a leading-whitespace failure (see comment
      // below this arbitrary).
      fc.constantFrom('👨‍💻', '🏳️‍🌈'),
      // Combining marks (precomposed form — NFC-normalized by most parsers)
      fc.constantFrom('café', 'naïve', 'résumé'),
    ),
    { minLength: 1, maxLength: 8 },
  )
  // Trim leading/trailing whitespace before joining — markdown parsers
  // strip leading whitespace in a paragraph context, which would make
  // the XmlFragment (parser-normalized) diverge from the Y.Text (byte-
  // exact input). This is a test-harness constraint, not a production
  // constraint — real callers pass parser-ready markdown.
  .map(
    (parts) =>
      `${parts
        .filter((p) => p.trim().length > 0)
        .join(' ')
        .trim()}\n`,
  );

// Note on arbitrary design: the initial draft excluded ZWJ-sequence emoji
// (👨‍💻, 🏳️‍🌈) on the assumption they caused a bridge-invariant violation.
// Subsequent investigation proved that assumption wrong — ZWJ emoji
// round-trip correctly (verified via direct probe across 9 contexts:
// alone, in-sentence, multiple, flag, at-end, at-start, mixed,
// combining marks, Greek). The actual failing case was leading-
// whitespace-in-paragraph, which the markdown parser normalizes away
// (CommonMark-standard behavior). The arbitrary below therefore
// trims/filters whitespace and INCLUDES ZWJ sequences.

/**
 * Empty-YAML frontmatter arbitrary — `---\n---\n` with nothing between
 * the fences. This is NG11 class per AGENTS.md (Irreducible gaps); the parser
 * must not crash or corrupt the body. Used via `mdWithFrontmatterOrEmpty`
 * which mixes empty-YAML and populated cases under one property.
 */
const mdWithFrontmatterOrEmpty = fc
  .tuple(
    fc.oneof(
      fc.constant('---\n---\n'),
      fc
        .array(
          fc.tuple(
            fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/),
            fc.stringMatching(/^[A-Za-z0-9 \-_]{1,20}$/),
          ),
          { minLength: 1, maxLength: 3 },
        )
        .map((pairs) => {
          const body = pairs.map(([k, v]) => `${k}: ${v}`).join('\n');
          return `---\n${body}\n---\n`;
        }),
    ),
    paragraphsOnly,
  )
  .map(([fm, body]) => `${fm}${body}`);

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
          const tokens = presentInputTokens(md);
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

  // ─── applyIncrementalDiff — Observer A in-sync path (precedent #11(a)) ───
  //
  // When Observer A runs and Y.Text is already in sync with the XmlFragment
  // baseline, it takes the incremental path rather than the canonicalizing
  // path. This test exercises that branch directly via `applyIncrementalDiff`.
  // Regression here surfaces content-comparison-gate bugs (D7) where a
  // delete+insert replacement is skipped incorrectly.

  test(
    'applyIncrementalDiff converges Y.Text to target (in-sync baseline path)',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, paragraphsOnly, (baseMd, nextMd) => {
          const { doc, ytext } = freshDoc();
          // Seed Y.Text with baseline content so `currentText` matches ytext
          // at call time — the function's precondition.
          doc.transact(() => {
            ytext.insert(0, baseMd);
          });
          doc.transact(() => {
            applyIncrementalDiff(ytext, baseMd, nextMd);
          });
          expect(ytext.toString()).toBe(nextMd);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'applyIncrementalDiff is a no-op when current === next',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, (md) => {
          const { doc, ytext } = freshDoc();
          doc.transact(() => {
            ytext.insert(0, md);
          });
          const lenBefore = ytext.length;
          doc.transact(() => {
            applyIncrementalDiff(ytext, md, md);
          });
          expect(ytext.toString()).toBe(md);
          expect(ytext.length).toBe(lenBefore);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  // ─── mergeThreeWay — Observer A divergent path (precedent #11(b)/(c)) ───
  //
  // mergeThreeWay is the load-bearing conflict path: it merges three markdown
  // strings (baseline / userEdits / agentEdits) via line-level diff3 + DMP.
  // Its post-condition asserts content preservation; on failure it throws
  // `BridgeMergeContentLossError` (or in production, emits structured
  // telemetry + saves a rescue checkpoint). The tests below exercise the
  // common cases at fidelity tier so conversion regressions in the merge
  // algorithm surface as deterministic fidelity failures, not architectural
  // fuzz flake.

  test(
    'mergeThreeWay is identity when user and agent both equal baseline',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, (baseline) => {
          const result = mergeThreeWay(baseline, baseline, baseline);
          expect(result).toBe(baseline);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mergeThreeWay preserves user edits when agent leaves baseline unchanged',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, paragraphsOnly, (baseline, userEdit) => {
          const result = mergeThreeWay(baseline, userEdit, baseline);
          expect(result).toBe(userEdit);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mergeThreeWay preserves agent edits when user leaves baseline unchanged',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, paragraphsOnly, (baseline, agentEdit) => {
          const result = mergeThreeWay(baseline, baseline, agentEdit);
          expect(result).toBe(agentEdit);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'mergeThreeWay preserves both sides on non-overlapping line-level edits',
    () => {
      // Content preservation under non-overlapping edits is the tractable
      // invariant for mergeThreeWay at PBT scale. K-K-P 2007 impossibility
      // means overlapping edits on the same line cannot preserve all tokens
      // from both sides; the algorithm is only guaranteed to preserve
      // maximal-unique-line-substrings via its post-condition
      // (BridgeMergeContentLossError fires on violation). Non-overlapping
      // line-level edits ARE preserved without conflict — the common case
      // in production bridge traffic.
      //
      // Construction: baseline has N≥2 lines; user edits line 0;
      // agent edits the LAST line. Line indices are disjoint, so neither
      // edit touches the other's region.
      assertAcrossSeeds(
        fc.property(
          fc.array(paragraph, { minLength: 2, maxLength: 4 }),
          paragraph,
          paragraph,
          (baseLines, userReplacement, agentReplacement) => {
            // Skip if the random replacements happen to collide with baseline
            // content (generator noise) — we're testing the merge shape, not
            // the fast-check arbitraries' uniqueness.
            if (baseLines.includes(userReplacement) || baseLines.includes(agentReplacement)) {
              return;
            }
            const baseline = `${baseLines.join('\n\n')}\n`;
            const userLines = [...baseLines];
            userLines[0] = userReplacement;
            const userEdit = `${userLines.join('\n\n')}\n`;
            const agentLines = [...baseLines];
            agentLines[agentLines.length - 1] = agentReplacement;
            const agentEdit = `${agentLines.join('\n\n')}\n`;

            const result = mergeThreeWay(baseline, userEdit, agentEdit);
            // User's replacement survives.
            for (const token of presentInputTokens(userReplacement)) {
              expect(result.includes(token)).toBe(true);
            }
            // Agent's replacement survives.
            for (const token of presentInputTokens(agentReplacement)) {
              expect(result.includes(token)).toBe(true);
            }
            // Middle lines (untouched by either edit) survive.
            for (let i = 1; i < baseLines.length - 1; i++) {
              for (const token of presentInputTokens(baseLines[i])) {
                expect(result.includes(token)).toBe(true);
              }
            }
          },
        ),
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
    // Store the listener in a named variable so `doc.off` can remove it by
    // reference identity — Y.js `Observable.off` matches by listener
    // identity, so a fresh arrow passed to `.off` would be a structural
    // no-op (listener stays attached). Not load-bearing for this test
    // because the Y.Doc goes out of scope and is GC'd at test end, but the
    // pattern is copied into future bridge tests where it IS load-bearing
    // (reused docs, closures capturing non-trivial state).
    const onAfterTx = (tx: Y.Transaction) => {
      observedOrigin = tx.origin;
    };
    doc.on('afterTransaction', onAfterTx);
    applyPairedExternalChange(doc, fragment, ytext, '# Hello\n\nworld\n');
    doc.off('afterTransaction', onAfterTx);
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
          const tokens = presentInputTokens(md);
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

  // Fidelity-char coverage for Chain C — mirrors Chain A's fidelity-chars
  // coverage. Paired external-change must preserve & < > through both the
  // XmlFragment and Y.Text surfaces. A regression where `stripFrontmatter`
  // or `parseWithFallback` drops HTML-fidelity characters would fail here.
  test(
    'paired write: fidelity characters (& < >) survive through both surfaces',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphWithFidelityChars, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
          // Bridge invariant still holds.
          expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
          // Every fidelity character present in the input appears downstream.
          const fragText = serializeFragment(fragment);
          const yText = ytext.toString();
          for (const ch of ['&', '<', '>']) {
            if (md.includes(ch)) {
              expect(fragText.includes(ch)).toBe(true);
              expect(yText.includes(ch)).toBe(true);
            }
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  // Unicode / emoji coverage — exercises single-code-point emoji,
  // ZWJ-sequence emoji (family + flag-with-modifier), BMP non-ASCII
  // (Greek + Cyrillic), and precomposed combining marks through the
  // conversion chain. A regression that drops a surrogate half or
  // misnormalizes a combining mark fails here.
  test(
    'paired write: Unicode + emoji (including ZWJ sequences) survive through both surfaces',
    () => {
      assertAcrossSeeds(
        fc.property(unicodeParagraph, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
          // Bridge invariant still holds after Unicode/emoji round-trip.
          expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
          // Spot-check: emoji (including ZWJ sequences) survive in both
          // surfaces. Stronger than token-based checks because it
          // exercises surrogate-pair + ZWJ integrity specifically.
          const yText = ytext.toString();
          const fragText = serializeFragment(fragment);
          const emojis = ['🎉', '🚀', '💡', '🔥', '✨', '👨‍💻', '🏳️‍🌈'];
          for (const e of emojis) {
            if (md.includes(e)) {
              expect(yText.includes(e)).toBe(true);
              expect(fragText.includes(e)).toBe(true);
            }
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  // ZWJ-sequence point check. Verified ZWJ emoji round-trip correctly
  // across 9 contexts via direct probe — the earlier `test.skip` was a
  // mis-attribution of a leading-whitespace issue surfaced during review.
  // This test is deterministic (no PBT) because the concern is "does
  // parseMd + schema + updateYFragment + serializeFragment preserve the
  // exact ZWJ byte sequence" — a single canonical input per shape is
  // enough to detect regression.
  test('paired write: ZWJ-sequence emoji round-trip (family + flag)', () => {
    const cases = ['👨‍💻\n', '🏳️‍🌈\n', 'Hello 👨‍💻 world\n', '👨‍💻 and 🏳️‍🌈\n'];
    for (const md of cases) {
      const { doc, fragment, ytext } = freshDoc();
      applyPairedExternalChange(doc, fragment, ytext, md);
      const yText = ytext.toString();
      const fragText = serializeFragment(fragment);
      expect(yText, `ytext should equal input for ${JSON.stringify(md)}`).toBe(md);
      expect(fragText, `fragment should equal input for ${JSON.stringify(md)}`).toBe(md);
    }
  });
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

// ═══════════════════════════════════════════════════════════════════════════
// Chain D: frontmatter strip/prepend — Observer A/B's shared metadata path
// ═══════════════════════════════════════════════════════════════════════════
//
// Production Observer B reads `stripFrontmatter(md)` and writes the parsed
// frontmatter to `doc.getMap('metadata').set('frontmatter', ...)`. Production
// Observer A reads that map on serialize and prepends frontmatter back onto
// the body when the fragment is converted to markdown. The bridge invariant
// treats "full markdown" as `frontmatter + body`, so these two pure string
// functions are load-bearing for the round-trip — a bug in either breaks
// frontmatter preservation across the dual-CRDT boundary.
//
// This chain tests the two pure string functions (`stripFrontmatter`,
// `prependFrontmatter`) as the contract they expose to the observer path,
// plus a composed round-trip that mirrors Observer B-then-Observer-A.
// The metadata-map plumbing itself is covered by integration tests; this
// tier asserts the conversion primitives are correct.

/**
 * Arbitrary: YAML-style frontmatter with 1-3 scalar key-value pairs.
 * Deliberately limited to safe keys/values (no colons, quotes, or multiline)
 * to stay within stripFrontmatter's YAML-subset tolerance; broader YAML
 * compatibility is the domain of integration tests + corpus fixtures.
 */
const frontmatterBlock = fc
  .array(
    fc.tuple(
      fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/),
      fc.stringMatching(/^[A-Za-z0-9 \-_]{1,20}$/),
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map((pairs) => {
    const body = pairs.map(([k, v]) => `${k}: ${v}`).join('\n');
    return `---\n${body}\n---\n`;
  });

const bodyOnly = paragraphsOnly;

const mdWithFrontmatter = fc.tuple(frontmatterBlock, bodyOnly).map(([fm, body]) => `${fm}${body}`);

describe('Chain D — frontmatter strip/prepend conversion', () => {
  test(
    'stripFrontmatter returns empty frontmatter + unchanged body for body-only input',
    () => {
      assertAcrossSeeds(
        fc.property(bodyOnly, (body) => {
          const { frontmatter, body: stripped } = stripFrontmatter(body);
          expect(frontmatter).toBe('');
          expect(stripped).toBe(body);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'stripFrontmatter → prependFrontmatter round-trip is identity',
    () => {
      assertAcrossSeeds(
        fc.property(mdWithFrontmatter, (full) => {
          const { frontmatter, body } = stripFrontmatter(full);
          const reconstituted = prependFrontmatter(frontmatter, body);
          expect(reconstituted).toBe(full);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'stripFrontmatter output parses via the body through parseMd without error',
    () => {
      // Observer B feeds the stripped body into the markdown parser and the
      // fragment builder. Any syntactic artifact stripFrontmatter leaves
      // behind would surface here. The test asserts the parser accepts the
      // stripped body — not a specific AST shape, since parsing-stability
      // tests live at packages/core/tests/.
      assertAcrossSeeds(
        fc.property(mdWithFrontmatter, (full) => {
          const { body } = stripFrontmatter(full);
          // Should not throw; round-trip through parse+serialize is a
          // cheap sanity check that the body is well-formed markdown.
          const json = mdManager.parse(body);
          expect(json).toBeDefined();
          const serialized = mdManager.serialize(json);
          expect(typeof serialized).toBe('string');
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'Observer B→A composite: stripFrontmatter → body-through-fragment → prependFrontmatter preserves tokens',
    () => {
      assertAcrossSeeds(
        fc.property(mdWithFrontmatter, (full) => {
          const { frontmatter, body } = stripFrontmatter(full);
          // Simulate Observer B: body → fragment (metadata map set elsewhere)
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, body);
          // Simulate Observer A: fragment → markdown → prepend stored frontmatter
          const bodyOut = serializeFragment(fragment);
          const fullOut = prependFrontmatter(frontmatter, bodyOut);
          // Frontmatter scalars present in the input MUST survive.
          const inputFmTokens = presentInputTokens(frontmatter);
          for (const token of inputFmTokens) {
            expect(fullOut.includes(token)).toBe(true);
          }
          // Body tokens present in the input MUST survive.
          const inputBodyTokens = presentInputTokens(body);
          for (const token of inputBodyTokens) {
            expect(fullOut.includes(token)).toBe(true);
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  // Empty-YAML frontmatter is a real edge case (NG11 class per AGENTS.md, Irreducible gaps):
  // a spec file may ship with `---\n---\n` placeholder frontmatter that
  // the parser must not crash on and the round-trip must preserve body
  // content. This is a deterministic point-check (not PBT) — the edge
  // case is a single concrete shape, and fast-check over it would
  // generate only one value anyway.
  test('empty-YAML frontmatter (---\\n---\\n) strips cleanly + body preserved', () => {
    const input = '---\n---\nParagraph body.\n';
    const { frontmatter, body } = stripFrontmatter(input);
    // Body is exactly what followed the closing fence — no leading fence
    // bleed-through.
    expect(body).toBe('Paragraph body.\n');
    // Round-trip via prependFrontmatter. The serializer may either round-
    // trip empty frontmatter structurally (`---\n---\n<body>`) or
    // normalize it away (`<body>`); both are valid — the contract is
    // "no body content is lost."
    const reconstituted = prependFrontmatter(frontmatter, body);
    expect(reconstituted.endsWith('Paragraph body.\n')).toBe(true);
  });

  // Mixed arbitrary — sometimes empty-YAML, sometimes populated — so the
  // PBT exercises both shapes under a single property assertion.
  test(
    'mdWithFrontmatterOrEmpty: round-trip preserves body tokens across both shapes',
    () => {
      assertAcrossSeeds(
        fc.property(mdWithFrontmatterOrEmpty, (full) => {
          const { frontmatter, body } = stripFrontmatter(full);
          // The strip/prepend round-trip should always preserve body tokens.
          const reconstituted = prependFrontmatter(frontmatter, body);
          const bodyTokens = presentInputTokens(body);
          for (const token of bodyTokens) {
            expect(reconstituted.includes(token)).toBe(true);
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Chain D — per-key frontmatter equivalence (US-013, AC #7)
// ═══════════════════════════════════════════════════════════════════════════
//
// Under per-key Y.Map storage (US-001..US-005), the conversion path is:
//
//   Observer B reads Y.Text → stripFrontmatter → setFrontmatterFromYaml(doc, body)
//   Observer A reads metaMap → getFrontmatter(doc) → prependFrontmatter(fm, body)
//
// The original Chain D above proved the regex pair (stripFrontmatter +
// prependFrontmatter) is identity-correct on a single in-out string.
// This extension closes the loop with the per-key codec: a YAML body fed
// through `parseFrontmatterYaml → Y.Map → serializeFrontmatterMap → withFences`
// must reproduce a fenced string that, when fed back into prependFrontmatter
// against the original body, equates the original full markdown under the same
// normalization the bridge invariant uses.
//
// Why this matters: the substrate bridge invariant (D11) composes one side of
// the equality from `getFrontmatter(doc)` post per-key write. If the codec
// drifts (e.g. yaml@2 changes scalar-style defaults), the watcher would flap
// against per-key writes and integration tests would surface a noisy red.
// This deterministic PBT pins the codec contract at the same tier the
// observer conversion functions are tested.

// A codec-compatible YAML frontmatter arbitrary. The legacy Chain D arbitrary
// `mdWithFrontmatter` allows YAML that the per-key codec rejects (null values
// from `key: ` / `key: -` / `key: ~`) or normalizes (`00` → `0`, leading-zero
// integers). This arbitrary requires the value to start with a letter so:
//   - YAML 1.2 null sentinels (`-`, `~`, `?`, `!`) cannot lead → no null map
//   - The value cannot be parsed as a number (so the input token survives
//     re-serialization byte-for-byte, which the body-token survival test
//     in Chain D enforces).
const codecValue = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,19}$/);
const codecFrontmatterBlock = fc
  .array(fc.tuple(fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/), codecValue), {
    minLength: 1,
    maxLength: 3,
  })
  .map((pairs) => {
    // Dedup on key so the YAML doesn't have duplicate keys (yaml@2 keeps the
    // last; the test would compare against the first-write parse).
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const [k, v] of pairs) {
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(`${k}: ${v}`);
    }
    return `---\n${lines.join('\n')}\n---\n`;
  });
const mdWithCodecFrontmatter = fc
  .tuple(codecFrontmatterBlock, bodyOnly)
  .map(([fm, body]) => `${fm}${body}`);

describe('Chain D — per-key frontmatter equivalence (US-013)', () => {
  test(
    'parseFrontmatterYaml(strip(full).frontmatter) → serialize → withFences round-trips',
    () => {
      // The Observer B → Observer A path: strip the YAML body, parse it into
      // a per-key map, re-serialize, re-fence. The result must be identical
      // (modulo canonicalization) to what the original frontmatter expressed.
      assertAcrossSeeds(
        fc.property(mdWithCodecFrontmatter, (full) => {
          const { frontmatter } = stripFrontmatter(full);
          const yamlBody = unwrapFrontmatterFences(frontmatter);
          const { map } = parseFrontmatterYaml(yamlBody);
          // The codec arbitrary only emits valid YAML; map should never be null.
          expect(map).not.toBeNull();
          if (map === null) return;
          const reFenced = withFences(serializeFrontmatterMap(map));
          // The re-fenced string parses to the same logical map.
          const { map: roundTrippedMap } = parseFrontmatterYaml(unwrapFrontmatterFences(reFenced));
          expect(roundTrippedMap).toEqual(map);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'Observer B → Observer A composite: per-key write + getFrontmatter mirrors strip/prepend identity for body tokens',
    () => {
      // Simulate the full per-key path:
      //   1. strip frontmatter from input markdown (Observer B input)
      //   2. write the parsed YAML to per-key Y.Map via setFrontmatterFromYaml
      //   3. read back via getFrontmatter (Observer A composition source)
      //   4. prepend onto the body — this is what Observer A would yield
      // The composite output must contain every body token AND every YAML
      // value-token from the original input, the same survival contract the
      // legacy Chain D enforces — but routed through the per-key codec.
      assertAcrossSeeds(
        fc.property(mdWithCodecFrontmatter, (full) => {
          const { frontmatter, body } = stripFrontmatter(full);
          const yamlBody = unwrapFrontmatterFences(frontmatter);
          const doc = new Y.Doc();
          doc.transact(() => {
            const ok = setFrontmatterFromYaml(doc, yamlBody);
            expect(ok).toBe(true);
          });
          const composedFm = getFrontmatter(doc);
          const fullOut = prependFrontmatter(composedFm, body);

          // Every YAML value token in the input must survive (the codec must
          // not drop any key/value across parse → set → re-serialize).
          const inputFmTokens = presentInputTokens(frontmatter);
          for (const token of inputFmTokens) {
            expect(fullOut.includes(token)).toBe(true);
          }
          // Body tokens survive trivially because the body string is reused.
          const inputBodyTokens = presentInputTokens(body);
          for (const token of inputBodyTokens) {
            expect(fullOut.includes(token)).toBe(true);
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'getFrontmatterMap matches the raw parsed map for any per-key write',
    () => {
      // Pin the round-trip through Y.Map: the map you read back must equal
      // the map the codec produced from the raw YAML. This catches `Y.Text`
      // / `Y.Array<Y.Text>` unwrap regressions in `getFrontmatterMap`.
      assertAcrossSeeds(
        fc.property(mdWithCodecFrontmatter, (full) => {
          const { frontmatter } = stripFrontmatter(full);
          const yamlBody = unwrapFrontmatterFences(frontmatter);
          const { map: directParsed } = parseFrontmatterYaml(yamlBody);
          if (directParsed === null) return;
          const doc = new Y.Doc();
          doc.transact(() => setFrontmatterFromYaml(doc, yamlBody));
          expect(getFrontmatterMap(doc)).toEqual(directParsed);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('empty-YAML input via per-key path produces empty map', () => {
    // The arbitrary's empty-YAML branch (`---\n---\n`) must drive `setFrontmatterFromYaml`
    // to a no-op + return `true` (valid empty input is success), and the
    // resulting per-key map must be empty so getFrontmatter falls through to
    // the legacy slot (or empty when no slot either).
    const { frontmatter } = stripFrontmatter('---\n---\nBody.\n');
    const yamlBody = unwrapFrontmatterFences(frontmatter);
    expect(yamlBody).toBe('');
    const doc = new Y.Doc();
    doc.transact(() => {
      const ok = setFrontmatterFromYaml(doc, yamlBody);
      expect(ok).toBe(true);
    });
    expect(getFrontmatterMap(doc)).toEqual({});
    expect(getFrontmatter(doc)).toBe('');
  });
});

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
      for (const token of presentInputTokens(md)) {
        expect(serialized.includes(token)).toBe(true);
      }
    });

    test(`Chain C (paired) keeps bridge invariant for ${label}`, () => {
      const { doc, fragment, ytext } = freshDoc();
      applyPairedExternalChange(doc, fragment, ytext, md);
      expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
      for (const token of presentInputTokens(md)) {
        expect(ytext.toString().includes(token)).toBe(true);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Chain E: agent-undo composition path (US-027, FR-17, D18 gate)
// ═══════════════════════════════════════════════════════════════════════════
//
// applyAgentUndo (packages/server/src/agent-sessions.ts) traverses the same
// conversion functions as Chain C: stripFrontmatter → parseWithFallback →
// updateYFragment → applyFastDiff. The key difference is that the write
// comes from Y.UndoManager.undo() restoring a prior fragment state rather
// than from a disk or agent write. This Chain E exercises the composition
// path deterministically (no networking, single Y.Doc) so a regression in
// parseWithFallback / updateYFragment / applyFastDiff is caught at PR tier
// rather than buried in fuzz-residual noise. Matches the AGENTS.md STOP rule
// for V0-14 agent-undo.
//
// Note: the Y.UndoManager-based undo itself is not a conversion function;
// what IS tested here is the post-undo XmlFragment-authoritative composition
// (the core of applyAgentUndo's inner logic after um.undo() runs).

/**
 * Replicate the post-undo composition from applyAgentUndo without Hocuspocus.
 * After restoring the prior YText state via um.undo(), re-applies the content
 * to XmlFragment via parseWithFallback → updateYFragment → applyFastDiff
 * (the same conversion path applyAgentUndo uses in production).
 */
const UNDO_WRITE_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'fidelity-undo-test', paired: true },
} as const;

function applyUndoComposition(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  ytext: Y.Text,
  um: Y.UndoManager,
): void {
  doc.transact(() => {
    if (um.undoStack.length === 0) return;
    um.undo();

    // Post-undo XmlFragment-authoritative composition (mirrors applyAgentUndo)
    const fullMd = ytext.toString();
    const { body } = stripFrontmatter(fullMd);
    const parsedJson = mdManager.parseWithFallback(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, fragment, pmNode, meta);

    const canonicalBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON(),
    );
    const canonicalFull = prependFrontmatter('', canonicalBody);
    applyFastDiff(ytext, ytext.toString(), canonicalFull);
  }, UNDO_WRITE_ORIGIN);
}

describe('Chain E — agent-undo composition keeps bridge invariant (US-027)', () => {
  test('undo after agent-write: bridge invariant holds on restored state', () => {
    const { doc, fragment, ytext } = freshDoc();

    // Track a write origin that the UndoManager will track
    const WRITE_ORIGIN = {
      source: 'local' as const,
      skipStoreHooks: true,
      context: { origin: 'fidelity-agent-write', paired: false },
    } as const;
    const um = new Y.UndoManager([ytext], { trackedOrigins: new Set([WRITE_ORIGIN]) });

    // Write initial content (tracked by UM)
    const initial = '# Initial heading\n\nSome body text.\n';
    applyPairedExternalChange(doc, fragment, ytext, initial);

    // Write a second version that will be undone (tracked by UM)
    const md = '# Updated heading\n\nDifferent content.\n';
    const { body } = stripFrontmatter(md);
    const parsedJson = mdManager.parseWithFallback(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const meta = { mapping: new Map(), isOMark: new Map() };
    doc.transact(() => {
      updateYFragment(doc, fragment, pmNode, meta);
      applyFastDiff(ytext, ytext.toString(), md);
    }, WRITE_ORIGIN);

    // Verify state before undo
    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));

    // Apply undo composition (same path as applyAgentUndo)
    applyUndoComposition(doc, fragment, ytext, um);

    // Bridge invariant must hold after undo + composition
    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
  });

  test('undo with empty stack is a no-op that preserves bridge invariant', () => {
    const { doc, fragment, ytext } = freshDoc();
    const um = new Y.UndoManager([ytext], { trackedOrigins: new Set() });

    const md = '# Original content\n';
    applyPairedExternalChange(doc, fragment, ytext, md);

    // UM stack is empty — applyUndoComposition should be a no-op
    applyUndoComposition(doc, fragment, ytext, um);

    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
  });

  test('undo composition traverses parseWithFallback for crash-class MDX', () => {
    const { doc, fragment, ytext } = freshDoc();

    const WRITE_ORIGIN2 = {
      source: 'local' as const,
      skipStoreHooks: true,
      context: { origin: 'fidelity-agent-write-2', paired: false },
    } as const;
    const um = new Y.UndoManager([ytext], { trackedOrigins: new Set([WRITE_ORIGIN2]) });

    // Seed with valid content first
    applyPairedExternalChange(doc, fragment, ytext, 'Initial paragraph.\n');

    // Write crash-class MDX content (tracked)
    const crashMd = 'Some text with <Bad attr=\n';
    doc.transact(() => {
      const j = mdManager.parseWithFallback(crashMd);
      const n = schema.nodeFromJSON(j);
      const m = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, fragment, n, m);
      applyFastDiff(ytext, ytext.toString(), crashMd);
    }, WRITE_ORIGIN2);

    // Undo restores to the initial paragraph — composition must not throw
    expect(() => applyUndoComposition(doc, fragment, ytext, um)).not.toThrow();
    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
  });
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
  // Floors aligned with the actual `helpers.ts` calibration (1000 default,
  // 10000 under STRESS_FIDELITY=1). Using the real values — not a weaker
  // ≥100 / ≥1000 pair — so any future regression that halves NUM_RUNS
  // trips this assertion. A meta-test whose floor is an order of
  // magnitude below reality is a meta-test that doesn't actually guard
  // what it claims to.
  test('NUM_RUNS matches default helper calibration (≥1000)', () => {
    expect(Number.isFinite(NUM_RUNS)).toBe(true);
    expect(NUM_RUNS).toBeGreaterThanOrEqual(1000);
  });

  test('STRESS_FIDELITY=1 bumps NUM_RUNS to ≥10_000 (self-documenting contract)', () => {
    // Guards against a future contributor bumping the default NUM_RUNS floor
    // without remembering the stress-mode multiplier documented in helpers.ts.
    if (process.env.STRESS_FIDELITY === '1') {
      expect(NUM_RUNS).toBeGreaterThanOrEqual(10_000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Error-path anchor — BridgeMergeContentLossError wiring
// ═══════════════════════════════════════════════════════════════════════════
//
// `mergeThreeWay` calls `assertContentPreservation` internally; a violation
// throws `BridgeMergeContentLossError`. Deep behavioral coverage of the
// throw shape (which/side/missing fields, substring vs. order violations)
// lives in `packages/core/src/bridge/merge-three-way.test.ts` and runs at
// PR tier via `turbo run test`.
//
// This block is a minimal anchor at the fidelity tier asserting that (a)
// the error class is importable from the `@inkeep/open-knowledge-core`
// surface this test file builds on, and (b) constructing a synthetic
// content-loss scenario does throw. If a future refactor accidentally
// removes the throw (or changes the exported error class), fidelity tier
// fails loudly rather than silently degrading the one-permitted-catch-site
// invariant documented in PRECEDENTS.md precedent #11(b) + CLAUDE.md STOP rule.
describe('Error-path anchor — BridgeMergeContentLossError', () => {
  test('BridgeMergeContentLossError is exported and instantiable', () => {
    expect(typeof BridgeMergeContentLossError).toBe('function');
    const err = new BridgeMergeContentLossError({
      baseline: 'a',
      userText: 'b',
      agentText: 'c',
      result: 'd',
      lostSubstrings: ['xyz'],
      which: 'substring',
      side: 'user',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BridgeMergeContentLossError);
    expect(err.name).toBe('BridgeMergeContentLossError');
    expect(err.info.which).toBe('substring');
    expect(err.info.side).toBe('user');
    expect(err.info.lostSubstrings).toEqual(['xyz']);
  });

  test('assertContentPreservation throws when result drops a user-side line', () => {
    // Minimum repro: user added a unique line, result omits it.
    // Baseline "a\n", user added "user-only-line\n" → "a\nuser-only-line\n",
    // agent left baseline unchanged, but a buggy merger returns just "a\n".
    expect(() => {
      assertContentPreservation(
        /* baseline */ 'a\n',
        /* userText */ 'a\nuser-only-line\n',
        /* agentText */ 'a\n',
        /* result */ 'a\n',
      );
    }).toThrow(BridgeMergeContentLossError);
  });

  test('assertContentPreservation passes when result preserves both sides', () => {
    // Non-overlapping edit shape: user adds a line at the end, agent leaves
    // baseline unchanged — merge result contains both.
    expect(() => {
      assertContentPreservation(
        /* baseline */ 'a\n',
        /* userText */ 'a\nb\n',
        /* agentText */ 'a\n',
        /* result */ 'a\nb\n',
      );
    }).not.toThrow();
  });
});
