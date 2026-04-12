/**
 * D6: Multi-client concurrent construct fidelity probe.
 *
 * Tests whether two Yjs clients editing the same markdown construct
 * concurrently (via CRDT merge) produce different fidelity outcomes
 * than the single-client Layer B path documented in D1.
 *
 * Architecture:
 *   - Two Y.Doc instances (clientA, clientB) with manual sync via
 *     Y.encodeStateAsUpdate / Y.applyUpdate — NO Hocuspocus server.
 *   - Each construct goes through:
 *     Phase 1: Load construct into clientA, sync to clientB
 *     Phase 2: Both clients make concurrent edits (no sync during edits)
 *     Phase 3: Bidirectional sync (A→B, B→A) — CRDT merge
 *     Phase 4: Serialize from both clients, verify convergence
 *     Phase 5: Compare merged output to single-client baseline
 *
 * Classification:
 *   IDENTICAL_TO_SINGLE_CLIENT — multi-client fidelity == single-client
 *   ADDITIONAL_LOSS — CRDT merge introduces new corruption beyond single-client
 *   CONVERGES_DIFFERENTLY — both clients see different final state (CRDT divergence)
 *
 * Run: bun d6-multi-client-probe.ts (from packages/server/ or with correct import paths)
 */

import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from '/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/test-isolation-parallelism/packages/core/src/extensions/shared.ts';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

// ─── Types ────────────────────────────────────────────────────────────────

type Category =
  | 'entity-corruption'
  | 'backslash-escape'
  | 'structural'
  | 'non-idempotent'
  | 'char-content'
  | 'custom-extension'
  | 'gfm-extension'
  | 'commonmark-block'
  | 'commonmark-inline';

type Construct = {
  name: string;
  category: Category;
  input: string;
  /** Describes what each client does concurrently */
  editA: string;
  editB: string;
};

type MultiClientClass =
  | 'IDENTICAL_TO_SINGLE_CLIENT'
  | 'ADDITIONAL_LOSS'
  | 'CONVERGES_DIFFERENTLY'
  | 'ERROR';

// ─── Construct subset (30 cases) ──────────────────────────────────────────
// Selection rationale: all 10 ENTITY_CORRUPTION cases (P0 worst), all 4
// backslash-escape cases (P0 content loss), structural/complex constructs
// (tables, nested lists, blockquotes), non-idempotent cases, and a sample
// of passing constructs for regression baseline.

const CONSTRUCTS: Construct[] = [
  // ─── ENTITY_CORRUPTION (10 — all P0 cases) ───
  {
    name: 'ampersand-in-heading',
    category: 'entity-corruption',
    input: '# H&M Store\n',
    editA: '# H&M Store updated\n',
    editB: '# H&M Store revised\n',
  },
  {
    name: 'ampersand-in-paragraph',
    category: 'entity-corruption',
    input: 'Foo & Bar & Baz.\n',
    editA: 'Foo & Bar & Baz. Extended.\n',
    editB: 'Foo & Bar & Baz. Modified.\n',
  },
  {
    name: 'lt-gt-in-paragraph',
    category: 'entity-corruption',
    input: 'If a < b and b > c then a < c.\n',
    editA: 'If a < b and b > c then a < c. QED.\n',
    editB: 'If a < b and b > c then a < c. Proved.\n',
  },
  {
    name: 'ampersand-in-link-text',
    category: 'entity-corruption',
    input: 'See [A & B](https://example.com).\n',
    editA: 'See [A & B Corp](https://example.com).\n',
    editB: 'See [A & B Inc](https://example.com).\n',
  },
  {
    name: 'ampersand-in-table-cell',
    category: 'entity-corruption',
    input: '| Name | Desc |\n|---|---|\n| A & B | test |\n',
    editA: '| Name | Desc |\n|---|---|\n| A & B | test alpha |\n',
    editB: '| Name | Desc |\n|---|---|\n| A & B | test beta |\n',
  },
  {
    name: 'html-block-div',
    category: 'entity-corruption',
    input: '<div class="box">HTML block</div>\n',
    editA: '<div class="box">HTML block alpha</div>\n',
    editB: '<div class="box">HTML block beta</div>\n',
  },
  {
    name: 'html-inline-span',
    category: 'entity-corruption',
    input: 'Text with <span>inline</span> HTML.\n',
    editA: 'Text with <span>inline</span> HTML. Added.\n',
    editB: 'Text with <span>inline</span> HTML. Changed.\n',
  },
  {
    name: 'html-br',
    category: 'entity-corruption',
    input: 'Line one<br>Line two.\n',
    editA: 'Line one<br>Line two. More.\n',
    editB: 'Line one<br>Line two. Extra.\n',
  },
  {
    name: 'named-entity-copy',
    category: 'entity-corruption',
    input: '&copy; 2026 Example Inc.\n',
    editA: '&copy; 2026 Example Inc. All rights reserved.\n',
    editB: '&copy; 2026 Example Inc. Licensed.\n',
  },
  {
    name: 'named-entity-mdash',
    category: 'entity-corruption',
    input: 'She said &mdash; wait, no.\n',
    editA: 'She said &mdash; wait, no. Really.\n',
    editB: 'She said &mdash; wait, no. Truly.\n',
  },

  // ─── BACKSLASH ESCAPE (4 — P0 content loss) ───
  {
    name: 'backslash-escape-asterisk',
    category: 'backslash-escape',
    input: 'Literal \\*not italic\\*.\n',
    editA: 'Literal \\*not italic\\*. Done.\n',
    editB: 'Literal \\*not italic\\*. End.\n',
  },
  {
    name: 'backslash-escape-underscore',
    category: 'backslash-escape',
    input: 'Literal \\_not italic\\_.\n',
    editA: 'Literal \\_not italic\\_. Done.\n',
    editB: 'Literal \\_not italic\\_. End.\n',
  },
  {
    name: 'backslash-escape-bracket',
    category: 'backslash-escape',
    input: 'Literal \\[not link\\].\n',
    editA: 'Literal \\[not link\\]. Done.\n',
    editB: 'Literal \\[not link\\]. End.\n',
  },
  {
    name: 'backslash-escape-hash',
    category: 'backslash-escape',
    input: '\\# Not a heading.\n',
    editA: '\\# Not a heading. Done.\n',
    editB: '\\# Not a heading. End.\n',
  },

  // ─── STRUCTURAL / COMPLEX ───
  {
    name: 'nested-list-2-levels',
    category: 'structural',
    input: '- Outer 1\n  - Nested 1a\n  - Nested 1b\n- Outer 2\n',
    editA: '- Outer 1\n  - Nested 1a ALPHA\n  - Nested 1b\n- Outer 2\n',
    editB: '- Outer 1\n  - Nested 1a\n  - Nested 1b BETA\n- Outer 2\n',
  },
  {
    name: 'nested-list-3-levels',
    category: 'structural',
    input: '- L1\n  - L2\n    - L3\n',
    editA: '- L1\n  - L2 alpha\n    - L3\n',
    editB: '- L1\n  - L2\n    - L3 beta\n',
  },
  {
    name: 'list-containing-code',
    category: 'structural',
    input: '- Item with code\n\n  ```\n  code inside list\n  ```\n\n- Next item\n',
    editA: '- Item with code\n\n  ```\n  code inside list alpha\n  ```\n\n- Next item\n',
    editB: '- Item with code\n\n  ```\n  code inside list\n  ```\n\n- Next item beta\n',
  },
  {
    name: 'blockquote-with-heading',
    category: 'structural',
    input: '> # Heading in quote\n>\n> And text.\n',
    editA: '> # Heading in quote alpha\n>\n> And text.\n',
    editB: '> # Heading in quote\n>\n> And text beta.\n',
  },
  {
    name: 'heading-then-paragraph',
    category: 'structural',
    input: '# Heading\n\nParagraph text.\n',
    editA: '# Heading Alpha\n\nParagraph text.\n',
    editB: '# Heading\n\nParagraph text beta.\n',
  },

  // ─── GFM ───
  {
    name: 'gfm-table-simple',
    category: 'gfm-extension',
    input: '| H1 | H2 |\n|---|---|\n| c1 | c2 |\n',
    editA: '| H1 | H2 |\n|---|---|\n| c1 alpha | c2 |\n',
    editB: '| H1 | H2 |\n|---|---|\n| c1 | c2 beta |\n',
  },
  {
    name: 'gfm-task-list',
    category: 'gfm-extension',
    input: '- [x] Done\n- [ ] Todo\n',
    editA: '- [x] Done alpha\n- [ ] Todo\n',
    editB: '- [x] Done\n- [ ] Todo beta\n',
  },

  // ─── NON-IDEMPOTENT (from D5) ───
  {
    name: 'inline-code-with-backticks',
    category: 'non-idempotent',
    input: 'Use `` `backtick` `` here.\n',
    editA: 'Use `` `backtick` `` here. Alpha.\n',
    editB: 'Use `` `backtick` `` here. Beta.\n',
  },

  // ─── CUSTOM EXTENSIONS ───
  {
    name: 'wikilink-bare',
    category: 'custom-extension',
    input: 'See [[TargetPage]] for details.\n',
    editA: 'See [[TargetPage]] for more details.\n',
    editB: 'See [[TargetPage]] for all details.\n',
  },
  {
    name: 'wikilink-with-alias',
    category: 'custom-extension',
    input: 'See [[TargetPage|the target]] for details.\n',
    editA: 'See [[TargetPage|the target]] for more details.\n',
    editB: 'See [[TargetPage|the target]] for all details.\n',
  },

  // ─── COMMONMARK BLOCK (regression baseline) ───
  {
    name: 'atx-heading-h2',
    category: 'commonmark-block',
    input: '## Heading 2\n',
    editA: '## Heading 2 Alpha\n',
    editB: '## Heading 2 Beta\n',
  },
  {
    name: 'code-block-with-lang',
    category: 'commonmark-block',
    input: '```javascript\nconst x = 1;\n```\n',
    editA: '```javascript\nconst x = 1;\nconst y = 2;\n```\n',
    editB: '```javascript\nconst x = 1;\nconst z = 3;\n```\n',
  },
  {
    name: 'code-block-with-ampersand',
    category: 'commonmark-block',
    input: '```\nfoo & bar\nx < y > z\n```\n',
    editA: '```\nfoo & bar alpha\nx < y > z\n```\n',
    editB: '```\nfoo & bar\nx < y > z beta\n```\n',
  },

  // ─── COMMONMARK INLINE ───
  {
    name: 'emphasis-nested',
    category: 'commonmark-inline',
    input: 'This is **bold with *italic* inside**.\n',
    editA: 'This is **bold with *italic* inside** alpha.\n',
    editB: 'This is **bold with *italic* inside** beta.\n',
  },
  {
    name: 'link-reference',
    category: 'commonmark-inline',
    input: 'See [docs][ref].\n\n[ref]: https://example.com\n',
    editA: 'See [docs][ref]. Alpha.\n\n[ref]: https://example.com\n',
    editB: 'See [docs][ref]. Beta.\n\n[ref]: https://example.com\n',
  },

  // ─── CHAR-CONTENT (regression baseline) ───
  {
    name: 'unicode-emoji',
    category: 'char-content',
    input: 'Launch 🚀 success!\n',
    editA: 'Launch 🚀 success! Alpha.\n',
    editB: 'Launch 🚀 success! Beta.\n',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeTrailing(s: string): string {
  return s.replace(/\n+$/, '').replace(/[ \t]+$/gm, '');
}

/** Single-client round-trip (Layer B from D1) */
function singleClientRoundTrip(input: string): string {
  const doc = new Y.Doc();
  try {
    const fragment = doc.getXmlFragment('default');
    const json = mdManager.parse(input);
    const pmNode = schema.nodeFromJSON(json);
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, fragment, pmNode, meta);
    const resultJson = yXmlFragmentToProsemirrorJSON(fragment);
    return mdManager.serialize(resultJson);
  } finally {
    doc.destroy();
  }
}

/** Apply markdown content to a client's Y.Doc XmlFragment */
function applyToClient(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  md: string,
): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
}

/** Serialize a client's XmlFragment to markdown */
function serializeClient(fragment: Y.XmlFragment): string {
  const json = yXmlFragmentToProsemirrorJSON(fragment);
  return mdManager.serialize(json);
}

/** Sync two Y.Docs bidirectionally */
function syncDocs(docA: Y.Doc, docB: Y.Doc): void {
  const stateA = Y.encodeStateAsUpdate(docA);
  const stateB = Y.encodeStateAsUpdate(docB);
  Y.applyUpdate(docB, stateA);
  Y.applyUpdate(docA, stateB);
}

// ─── Main probe ───────────────────────────────────────────────────────────

interface Result {
  name: string;
  category: Category;
  singleClientOutput: string;
  mergedOutputA: string;
  mergedOutputB: string;
  converged: boolean;
  classification: MultiClientClass;
  singleClientNorm: string;
  mergedNormA: string;
  notes: string;
}

const results: Result[] = [];

for (const c of CONSTRUCTS) {
  let singleClientOutput = '';
  let mergedOutputA = '';
  let mergedOutputB = '';
  let classification: MultiClientClass = 'ERROR';
  let notes = '';

  try {
    // Phase 0: Single-client baseline (Layer B from D1)
    singleClientOutput = singleClientRoundTrip(c.input);

    // Phase 1: Create two clients, load construct into clientA, sync to B
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const fragA = docA.getXmlFragment('default');
    const fragB = docB.getXmlFragment('default');

    applyToClient(docA, fragA, c.input);
    syncDocs(docA, docB);

    // Verify initial sync — both should have same content
    const initA = serializeClient(fragA);
    const initB = serializeClient(fragB);
    if (normalizeTrailing(initA) !== normalizeTrailing(initB)) {
      notes = 'WARN: initial sync diverged before concurrent edits';
    }

    // Phase 2: Concurrent edits — each client applies its edit WITHOUT syncing
    // This simulates two users editing while disconnected (network partition)
    applyToClient(docA, fragA, c.editA);
    applyToClient(docB, fragB, c.editB);

    // Phase 3: Bidirectional sync — CRDT merge
    syncDocs(docA, docB);

    // Phase 4: Serialize from both clients
    mergedOutputA = serializeClient(fragA);
    mergedOutputB = serializeClient(fragB);

    // Phase 5: Classify
    const converged = normalizeTrailing(mergedOutputA) === normalizeTrailing(mergedOutputB);

    if (!converged) {
      classification = 'CONVERGES_DIFFERENTLY';
      notes += ` A≠B after merge`;
    } else {
      // Compare merged output to single-client baseline behavior
      // The key question: does the CRDT merge introduce corruption BEYOND
      // what single-client already produces?
      //
      // We do single-client round-trips of BOTH editA and editB individually,
      // and check if the merged output's fidelity characteristics are worse.
      const singleA = singleClientRoundTrip(c.editA);
      const singleB = singleClientRoundTrip(c.editB);

      // The merged output should contain elements from both edits.
      // Since CRDT merge is content-union, the merged result won't match
      // either single-client output exactly. Instead, check if the merged
      // output has entity corruption or structural loss that single-client
      // doesn't exhibit on the same content.

      const mergedNorm = normalizeTrailing(mergedOutputA);

      // Check: does merged output have &amp; / &lt; / &gt; that input didn't?
      const inputHasEntities = /&amp;|&lt;|&gt;/.test(normalizeTrailing(c.input));
      const singleHasEntities = /&amp;|&lt;|&gt;/.test(normalizeTrailing(singleA));
      const mergedHasEntities = /&amp;|&lt;|&gt;/.test(mergedNorm);

      // Check: character-level content preservation
      // Extract non-syntax, non-whitespace tokens
      const extractWords = (s: string) =>
        (s.match(/[a-zA-Z0-9\u00C0-\u024F\u4E00-\u9FFF\u0600-\u06FF🚀]+/gu) ?? []).sort().join(',');

      const mergedWords = extractWords(mergedNorm);
      const singleAWords = extractWords(normalizeTrailing(singleA));
      const singleBWords = extractWords(normalizeTrailing(singleB));

      // CRDT merge should have union of both edits' words
      // Check if merged has fewer words than either single-client
      const mergedWordSet = new Set(mergedNorm.match(/\w{2,}/g) ?? []);
      const singleAWordSet = new Set(normalizeTrailing(singleA).match(/\w{2,}/g) ?? []);
      const singleBWordSet = new Set(normalizeTrailing(singleB).match(/\w{2,}/g) ?? []);

      // Words from singleA that are missing in merged
      const missingFromA = [...singleAWordSet].filter((w) => !mergedWordSet.has(w));
      const missingFromB = [...singleBWordSet].filter((w) => !mergedWordSet.has(w));

      if (mergedHasEntities && !singleHasEntities && !inputHasEntities) {
        // Merge introduced entities that single-client didn't have
        classification = 'ADDITIONAL_LOSS';
        notes += ' entity corruption introduced by merge';
      } else if (missingFromA.length > 2 || missingFromB.length > 2) {
        // Significant word loss beyond what CRDT merge naturally resolves
        // (Allow 2 missing words for natural conflict resolution)
        classification = 'ADDITIONAL_LOSS';
        notes += ` words lost: fromA=[${missingFromA.join(',')}] fromB=[${missingFromB.join(',')}]`;
      } else {
        classification = 'IDENTICAL_TO_SINGLE_CLIENT';
      }
    }

    docA.destroy();
    docB.destroy();
  } catch (err) {
    classification = 'ERROR';
    notes = err instanceof Error ? err.message : String(err);
  }

  const singleNorm = normalizeTrailing(singleClientOutput);
  const mergedNormA = normalizeTrailing(mergedOutputA);

  results.push({
    name: c.name,
    category: c.category,
    singleClientOutput,
    mergedOutputA,
    mergedOutputB,
    converged: normalizeTrailing(mergedOutputA) === normalizeTrailing(mergedOutputB),
    classification,
    singleClientNorm: singleNorm,
    mergedNormA,
    notes: notes.trim(),
  });
}

// ─── Report ───────────────────────────────────────────────────────────────

// TSV header
const TSV_COLS = [
  'name',
  'category',
  'classification',
  'converged',
  'singleClientOutput',
  'mergedOutputA',
  'mergedOutputB',
  'notes',
];
console.log(TSV_COLS.join('\t'));

for (const r of results) {
  console.log(
    [
      r.name,
      r.category,
      r.classification,
      r.converged ? 'Y' : 'N',
      JSON.stringify(r.singleClientOutput),
      JSON.stringify(r.mergedOutputA),
      JSON.stringify(r.mergedOutputB),
      r.notes,
    ].join('\t'),
  );
}

// Summary to stderr
const counts: Record<string, number> = {};
for (const r of results) {
  counts[r.classification] = (counts[r.classification] ?? 0) + 1;
}

console.error('');
console.error('=== D6: Multi-client construct fidelity summary ===');
console.error(`Total constructs tested: ${results.length}`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${k}: ${v}`);
}

const diverged = results.filter((r) => !r.converged);
console.error('');
console.error(`Convergence failures (A ≠ B after merge): ${diverged.length}`);
for (const r of diverged) {
  console.error(`  ${r.name}: ${r.notes}`);
}

const additionalLoss = results.filter((r) => r.classification === 'ADDITIONAL_LOSS');
console.error('');
console.error(`ADDITIONAL_LOSS (multi-client worse than single-client): ${additionalLoss.length}`);
for (const r of additionalLoss) {
  console.error(`  ${r.name}: ${r.notes}`);
}

const errors = results.filter((r) => r.classification === 'ERROR');
if (errors.length > 0) {
  console.error('');
  console.error(`ERRORS: ${errors.length}`);
  for (const r of errors) {
    console.error(`  ${r.name}: ${r.notes}`);
  }
}
