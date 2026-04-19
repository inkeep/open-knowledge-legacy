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
 * Conversion-tier coverage in THIS file — describe blocks:
 *
 *   Chain A: parseMd → updateYFragment                — covers ops (1), (4)
 *                                                        (any md → PM → fragment)
 *   Chain B: serializeFragment → applyFastDiff /      — covers op (2)
 *            applyIncrementalDiff / mergeThreeWay       (any fragment → serialized → Y.Text diff,
 *                                                        the three Observer A conversion functions)
 *   Chain C: paired updateYFragment + applyFastDiff    — covers ops (3), (5)
 *                                                        (applyExternalChange's inner transact,
 *                                                        including stripFrontmatter + parseWithFallback)
 *   Chain D: frontmatter strip/prepend round-trip      — Observer B → Observer A frontmatter path
 *                                                        (the conversion primitives; metadata-map
 *                                                        plumbing stays in integration tests)
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
  MarkdownManager,
  mergeThreeWay,
  prependFrontmatter,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
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

  test('STRESS_FIDELITY=1 bumps NUM_RUNS to ≥1000 (self-documenting contract)', () => {
    // Guards against a future contributor bumping the default NUM_RUNS floor
    // without remembering the stress-mode multiplier documented in helpers.ts.
    if (process.env.STRESS_FIDELITY === '1') {
      expect(NUM_RUNS).toBeGreaterThanOrEqual(1000);
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
// invariant documented in AGENTS.md precedent #11(b) + CLAUDE.md STOP rule.
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
