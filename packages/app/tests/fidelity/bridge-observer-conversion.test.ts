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
  MarkdownManager,
  mergeThreeWay,
  prependFrontmatter,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as fc from 'fast-check';
import * as Y from 'yjs';

import {
  blockquote,
  codeBlock,
  heading,
  paragraph,
  paragraphWithFidelityChars,
  paragraphWithMarks,
} from './arbitraries';
import { assertAcrossSeeds, NUM_RUNS, normalize, PBT_TIMEOUT_MS } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

const TEST_PAIRED_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'fidelity-test', paired: true },
} as const;

function freshDoc(): { doc: Y.Doc; fragment: Y.XmlFragment; ytext: Y.Text } {
  const doc = new Y.Doc();
  return {
    doc,
    fragment: doc.getXmlFragment('default'),
    ytext: doc.getText('source'),
  };
}

function applyMdToFragment(doc: Y.Doc, fragment: Y.XmlFragment, md: string): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => {
    updateYFragment(doc, fragment, pmNode, meta);
  });
}

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

function serializeFragment(fragment: Y.XmlFragment): string {
  return mdManager.serialize(yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON());
}

function bridgeNorm(s: string): string {
  return normalize(s);
}

function presentInputTokens(md: string): string[] {
  const tokens = md.match(/[A-Za-z0-9]{2,}/g) ?? [];
  return Array.from(new Set(tokens));
}

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

const unicodeParagraph = fc
  .array(
    fc.oneof(
      fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/),
      fc.constantFrom('αβγ', 'Ωψφ', 'μνλ'),
      fc.constantFrom('Привет', 'Спасибо'),
      fc.constantFrom('🎉', '🚀', '💡', '🔥', '✨'),
      fc.constantFrom('👨‍💻', '🏳️‍🌈'),
      fc.constantFrom('café', 'naïve', 'résumé'),
    ),
    { minLength: 1, maxLength: 8 },
  )
  .map(
    (parts) =>
      `${parts
        .filter((p) => p.trim().length > 0)
        .join(' ')
        .trim()}\n`,
  );

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
          expect(ytext.toString()).toBe(serialized);
          expect(ytext.length).toBe(beforeLen);
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test(
    'applyIncrementalDiff converges Y.Text to target (in-sync baseline path)',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphsOnly, paragraphsOnly, (baseMd, nextMd) => {
          const { doc, ytext } = freshDoc();
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
      assertAcrossSeeds(
        fc.property(
          fc.array(paragraph, { minLength: 2, maxLength: 4 }),
          paragraph,
          paragraph,
          (baseLines, userReplacement, agentReplacement) => {
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
            for (const token of presentInputTokens(userReplacement)) {
              expect(result.includes(token)).toBe(true);
            }
            for (const token of presentInputTokens(agentReplacement)) {
              expect(result.includes(token)).toBe(true);
            }
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

describe('Chain C — paired external-change preserves bridge invariant', () => {
  test(
    'paired write: ytext matches serialized fragment after external change',
    () => {
      assertAcrossSeeds(
        fc.property(mixedDocument, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
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
    const { doc, fragment, ytext } = freshDoc();
    let observedOrigin: unknown = null;
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

  test(
    'paired write: fidelity characters (& < >) survive through both surfaces',
    () => {
      assertAcrossSeeds(
        fc.property(paragraphWithFidelityChars, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
          expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
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

  test(
    'paired write: Unicode + emoji (including ZWJ sequences) survive through both surfaces',
    () => {
      assertAcrossSeeds(
        fc.property(unicodeParagraph, (md) => {
          const { doc, fragment, ytext } = freshDoc();
          applyPairedExternalChange(doc, fragment, ytext, md);
          expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
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
      assertAcrossSeeds(
        fc.property(mdWithFrontmatter, (full) => {
          const { body } = stripFrontmatter(full);
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
          const { doc, fragment } = freshDoc();
          applyMdToFragment(doc, fragment, body);
          const bodyOut = serializeFragment(fragment);
          const fullOut = prependFrontmatter(frontmatter, bodyOut);
          const inputFmTokens = presentInputTokens(frontmatter);
          for (const token of inputFmTokens) {
            expect(fullOut.includes(token)).toBe(true);
          }
          const inputBodyTokens = presentInputTokens(body);
          for (const token of inputBodyTokens) {
            expect(fullOut.includes(token)).toBe(true);
          }
        }),
      );
    },
    PBT_TIMEOUT_MS,
  );

  test('empty-YAML frontmatter (---\\n---\\n) strips cleanly + body preserved', () => {
    const input = '---\n---\nParagraph body.\n';
    const { frontmatter, body } = stripFrontmatter(input);
    expect(body).toBe('Paragraph body.\n');
    const reconstituted = prependFrontmatter(frontmatter, body);
    expect(reconstituted.endsWith('Paragraph body.\n')).toBe(true);
  });

  test(
    'mdWithFrontmatterOrEmpty: round-trip preserves body tokens across both shapes',
    () => {
      assertAcrossSeeds(
        fc.property(mdWithFrontmatterOrEmpty, (full) => {
          const { frontmatter, body } = stripFrontmatter(full);
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
    {
      label: 'wikiLinkEmbed — image extension',
      md: '![[photo.png]]\n',
    },
    {
      label: 'wikiLinkEmbed — non-image renderable with anchor + alias',
      md: '![[draft.pdf#page=3|Draft]]\n',
    },
  ];

  for (const { label, md } of handlerCases) {
    test(`Chain A survives ${label}`, () => {
      const { doc, fragment } = freshDoc();
      applyMdToFragment(doc, fragment, md);
      const serialized = serializeFragment(fragment);
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

    const WRITE_ORIGIN = {
      source: 'local' as const,
      skipStoreHooks: true,
      context: { origin: 'fidelity-agent-write', paired: false },
    } as const;
    const um = new Y.UndoManager([ytext], { trackedOrigins: new Set([WRITE_ORIGIN]) });

    const initial = '# Initial heading\n\nSome body text.\n';
    applyPairedExternalChange(doc, fragment, ytext, initial);

    const md = '# Updated heading\n\nDifferent content.\n';
    const { body } = stripFrontmatter(md);
    const parsedJson = mdManager.parseWithFallback(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const meta = { mapping: new Map(), isOMark: new Map() };
    doc.transact(() => {
      updateYFragment(doc, fragment, pmNode, meta);
      applyFastDiff(ytext, ytext.toString(), md);
    }, WRITE_ORIGIN);

    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));

    applyUndoComposition(doc, fragment, ytext, um);

    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
  });

  test('undo with empty stack is a no-op that preserves bridge invariant', () => {
    const { doc, fragment, ytext } = freshDoc();
    const um = new Y.UndoManager([ytext], { trackedOrigins: new Set() });

    const md = '# Original content\n';
    applyPairedExternalChange(doc, fragment, ytext, md);

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

    applyPairedExternalChange(doc, fragment, ytext, 'Initial paragraph.\n');

    const crashMd = 'Some text with <Bad attr=\n';
    doc.transact(() => {
      const j = mdManager.parseWithFallback(crashMd);
      const n = schema.nodeFromJSON(j);
      const m = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(doc, fragment, n, m);
      applyFastDiff(ytext, ytext.toString(), crashMd);
    }, WRITE_ORIGIN2);

    expect(() => applyUndoComposition(doc, fragment, ytext, um)).not.toThrow();
    expect(bridgeNorm(ytext.toString())).toBe(bridgeNorm(serializeFragment(fragment)));
  });
});

describe('Meta — PBT harness is live', () => {
  test('NUM_RUNS matches default helper calibration (≥1000)', () => {
    expect(Number.isFinite(NUM_RUNS)).toBe(true);
    expect(NUM_RUNS).toBeGreaterThanOrEqual(1000);
  });

  test('STRESS_FIDELITY=1 bumps NUM_RUNS to ≥10_000 (self-documenting contract)', () => {
    if (process.env.STRESS_FIDELITY === '1') {
      expect(NUM_RUNS).toBeGreaterThanOrEqual(10_000);
    }
  });
});

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
