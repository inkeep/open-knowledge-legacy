/**
 * Comprehensive markdown construct fidelity probe.
 *
 * Tests every category of markdown construct we can identify from CommonMark 0.31.2
 * plus GFM extensions plus our custom extensions (wiki-link, jsx-component, frontmatter)
 * plus edge-case content (HTML entities, Unicode, punctuation, whitespace).
 *
 * For each construct, runs TWO round-trips:
 *   Layer A (mdManager only):
 *     input → mdManager.parse → mdManager.serialize → output
 *   Layer B (full Y.Doc path — what production actually runs):
 *     input → mdManager.parse → nodeFromJSON → updateYFragment → yXmlFragmentToProsemirrorJSON → mdManager.serialize → output
 *
 * Classifies each result:
 *   BYTE_IDENTICAL — input === output (trimmed)
 *   WHITESPACE_DIFF — only whitespace/trailing-newline differences
 *   ENTITY_CORRUPTION — &, <, > got HTML-entity-encoded
 *   SEMANTIC_LOSS — content characters dropped, structure changed
 *   COSMETIC — normalized but equivalent (e.g., `-` → `*` for bullets, `1)` → `1.` for ordered)
 *
 * Emits a TSV-formatted report to stdout for post-processing.
 */

import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from '/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/test-isolation-parallelism/packages/core/src/extensions/shared.ts';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

type Category =
  | 'commonmark-block'
  | 'commonmark-inline'
  | 'gfm-extension'
  | 'char-content'
  | 'custom-extension'
  | 'structural'
  | 'edge-case';

type Construct = {
  name: string;
  category: Category;
  input: string;
  notes?: string;
};

// ─── COMMONMARK BLOCK CONSTRUCTS ─────────────────────────────────────────

const CONSTRUCTS: Construct[] = [
  // ─── Headings ───
  { name: 'atx-heading-h1', category: 'commonmark-block', input: '# Heading 1\n' },
  { name: 'atx-heading-h2', category: 'commonmark-block', input: '## Heading 2\n' },
  { name: 'atx-heading-h3', category: 'commonmark-block', input: '### Heading 3\n' },
  { name: 'atx-heading-h4', category: 'commonmark-block', input: '#### Heading 4\n' },
  { name: 'atx-heading-h5', category: 'commonmark-block', input: '##### Heading 5\n' },
  { name: 'atx-heading-h6', category: 'commonmark-block', input: '###### Heading 6\n' },
  { name: 'atx-heading-trailing-hashes', category: 'commonmark-block', input: '## Heading ##\n' },
  { name: 'setext-heading-h1', category: 'commonmark-block', input: 'Heading 1\n=========\n' },
  { name: 'setext-heading-h2', category: 'commonmark-block', input: 'Heading 2\n---------\n' },

  // ─── Thematic breaks ───
  { name: 'hr-dashes', category: 'commonmark-block', input: '---\n' },
  { name: 'hr-asterisks', category: 'commonmark-block', input: '***\n' },
  { name: 'hr-underscores', category: 'commonmark-block', input: '___\n' },

  // ─── Paragraphs ───
  { name: 'paragraph-plain', category: 'commonmark-block', input: 'A simple paragraph.\n' },
  { name: 'paragraph-with-soft-break', category: 'commonmark-block', input: 'Line one.\nLine two continues.\n' },
  { name: 'paragraph-with-hard-break-spaces', category: 'commonmark-block', input: 'Line one.  \nLine two.\n', notes: 'Two trailing spaces = hard break' },
  { name: 'paragraph-with-hard-break-backslash', category: 'commonmark-block', input: 'Line one.\\\nLine two.\n', notes: 'Backslash at end of line = hard break' },
  { name: 'paragraph-multiple-blank-lines', category: 'commonmark-block', input: 'First.\n\n\n\nSecond.\n', notes: 'Multiple blanks between paragraphs' },

  // ─── Block quotes ───
  { name: 'blockquote-simple', category: 'commonmark-block', input: '> A blockquote.\n' },
  { name: 'blockquote-multiline', category: 'commonmark-block', input: '> Line one.\n> Line two.\n' },
  { name: 'blockquote-nested', category: 'commonmark-block', input: '> Outer.\n>\n> > Inner.\n' },
  { name: 'blockquote-with-heading', category: 'commonmark-block', input: '> # Heading in quote\n>\n> And text.\n' },

  // ─── Lists — bullet ───
  { name: 'list-bullet-dash', category: 'commonmark-block', input: '- Item 1\n- Item 2\n- Item 3\n' },
  { name: 'list-bullet-asterisk', category: 'commonmark-block', input: '* Item 1\n* Item 2\n* Item 3\n' },
  { name: 'list-bullet-plus', category: 'commonmark-block', input: '+ Item 1\n+ Item 2\n+ Item 3\n' },
  { name: 'list-bullet-single-item', category: 'commonmark-block', input: '- Solo item\n' },

  // ─── Lists — ordered ───
  { name: 'list-ordered-period', category: 'commonmark-block', input: '1. First\n2. Second\n3. Third\n' },
  { name: 'list-ordered-paren', category: 'commonmark-block', input: '1) First\n2) Second\n3) Third\n' },
  { name: 'list-ordered-start-at-5', category: 'commonmark-block', input: '5. Five\n6. Six\n7. Seven\n', notes: 'Non-1-start — should preserve the start number' },

  // ─── Lists — tight/loose ───
  { name: 'list-tight', category: 'commonmark-block', input: '- Item 1\n- Item 2\n- Item 3\n', notes: 'No blank lines between items' },
  { name: 'list-loose', category: 'commonmark-block', input: '- Item 1\n\n- Item 2\n\n- Item 3\n', notes: 'Blank lines between items' },

  // ─── Lists — nested ───
  { name: 'list-nested-2-levels', category: 'commonmark-block', input: '- Outer 1\n  - Nested 1a\n  - Nested 1b\n- Outer 2\n' },
  { name: 'list-nested-3-levels', category: 'commonmark-block', input: '- L1\n  - L2\n    - L3\n' },
  { name: 'list-nested-mixed', category: 'commonmark-block', input: '- Bullet\n  1. Nested ordered 1\n  2. Nested ordered 2\n- Another bullet\n' },

  // ─── Code blocks ───
  { name: 'code-block-fenced-backticks', category: 'commonmark-block', input: '```\nplain code\n```\n' },
  { name: 'code-block-fenced-tildes', category: 'commonmark-block', input: '~~~\nplain code\n~~~\n' },
  { name: 'code-block-with-lang', category: 'commonmark-block', input: '```javascript\nconst x = 1;\n```\n' },
  { name: 'code-block-with-info-string', category: 'commonmark-block', input: '```ts title="foo.ts"\nconst x = 1;\n```\n' },
  { name: 'code-block-indented', category: 'commonmark-block', input: '    indented code\n    second line\n', notes: '4-space indent = code block' },
  { name: 'code-block-empty-lang', category: 'commonmark-block', input: '```\n\nempty lines preserved\n\n```\n' },
  { name: 'code-block-contains-ampersand', category: 'commonmark-block', input: '```\nfoo & bar\nx < y > z\n```\n', notes: 'Code blocks should NOT entity-encode' },

  // ─── Inline code ───
  { name: 'inline-code-simple', category: 'commonmark-inline', input: 'Use `code` here.\n' },
  { name: 'inline-code-with-ampersand', category: 'commonmark-inline', input: 'Use `a & b` here.\n', notes: 'Code span should preserve literal &' },
  { name: 'inline-code-with-brackets', category: 'commonmark-inline', input: 'Use `foo[1]` here.\n' },
  { name: 'inline-code-with-backticks', category: 'commonmark-inline', input: 'Use `` `backtick` `` here.\n', notes: 'Double-backtick wrapping' },

  // ─── Emphasis ───
  { name: 'emphasis-bold-asterisks', category: 'commonmark-inline', input: 'This is **bold** text.\n' },
  { name: 'emphasis-bold-underscores', category: 'commonmark-inline', input: 'This is __bold__ text.\n' },
  { name: 'emphasis-italic-asterisks', category: 'commonmark-inline', input: 'This is *italic* text.\n' },
  { name: 'emphasis-italic-underscores', category: 'commonmark-inline', input: 'This is _italic_ text.\n' },
  { name: 'emphasis-bold-italic-combined', category: 'commonmark-inline', input: 'This is ***bold italic*** text.\n' },
  { name: 'emphasis-nested', category: 'commonmark-inline', input: 'This is **bold with *italic* inside**.\n' },

  // ─── Links ───
  { name: 'link-inline', category: 'commonmark-inline', input: 'See [docs](https://example.com).\n' },
  { name: 'link-with-title', category: 'commonmark-inline', input: 'See [docs](https://example.com "title").\n' },
  { name: 'link-reference', category: 'commonmark-inline', input: 'See [docs][ref].\n\n[ref]: https://example.com\n' },
  { name: 'link-collapsed-reference', category: 'commonmark-inline', input: 'See [docs][].\n\n[docs]: https://example.com\n' },
  { name: 'link-shortcut-reference', category: 'commonmark-inline', input: 'See [docs].\n\n[docs]: https://example.com\n' },
  { name: 'link-autolink', category: 'commonmark-inline', input: 'Visit <https://example.com>.\n' },
  { name: 'link-with-ampersand-in-url', category: 'commonmark-inline', input: 'See [docs](https://example.com?a=1&b=2).\n', notes: '& in URL — should survive literally' },
  { name: 'link-with-ampersand-in-text', category: 'commonmark-inline', input: 'See [A & B](https://example.com).\n', notes: '& in link text' },

  // ─── Images ───
  { name: 'image-inline', category: 'commonmark-inline', input: '![Alt text](https://example.com/img.png)\n' },
  { name: 'image-with-title', category: 'commonmark-inline', input: '![Alt](https://example.com/img.png "title")\n' },

  // ─── Raw HTML ───
  { name: 'html-block-div', category: 'commonmark-block', input: '<div class="box">HTML block</div>\n' },
  { name: 'html-inline-span', category: 'commonmark-inline', input: 'Text with <span>inline</span> HTML.\n' },
  { name: 'html-br', category: 'commonmark-inline', input: 'Line one<br>Line two.\n' },

  // ─── GFM EXTENSIONS ───
  { name: 'gfm-table-simple', category: 'gfm-extension', input: '| H1 | H2 |\n|---|---|\n| c1 | c2 |\n' },
  { name: 'gfm-table-aligned', category: 'gfm-extension', input: '| Left | Center | Right |\n|:---|:---:|---:|\n| a | b | c |\n', notes: 'Alignment in header row' },
  { name: 'gfm-table-with-ampersand', category: 'gfm-extension', input: '| Name | Desc |\n|---|---|\n| A & B | test |\n', notes: '& in cell' },
  { name: 'gfm-task-list-unchecked', category: 'gfm-extension', input: '- [ ] Todo item\n- [ ] Another todo\n' },
  { name: 'gfm-task-list-checked', category: 'gfm-extension', input: '- [x] Done\n- [ ] Todo\n' },
  { name: 'gfm-strikethrough', category: 'gfm-extension', input: 'This is ~~struck~~ text.\n' },
  { name: 'gfm-autolink-bare-url', category: 'gfm-extension', input: 'Visit https://example.com directly.\n', notes: 'Bare URL autolink (GFM extension)' },

  // ─── CHARACTER / TEXT CONTENT EDGE CASES ───
  { name: 'ampersand-literal-in-heading', category: 'char-content', input: '# H&M Store\n', notes: 'THE KNOWN BUG — literal & in heading' },
  { name: 'ampersand-literal-in-paragraph', category: 'char-content', input: 'Foo & Bar & Baz.\n' },
  { name: 'lt-gt-in-paragraph', category: 'char-content', input: 'If a < b and b > c then a < c.\n' },
  { name: 'already-encoded-amp', category: 'char-content', input: 'Author wrote &amp; explicitly.\n', notes: 'What if user literally typed &amp;?' },
  { name: 'already-encoded-lt-gt', category: 'char-content', input: 'Author wrote &lt;tag&gt; explicitly.\n' },
  { name: 'numeric-entity-decimal', category: 'char-content', input: 'Copyright &#169; 2026.\n' },
  { name: 'numeric-entity-hex', category: 'char-content', input: 'Bullet &#x2022; item.\n' },
  { name: 'named-entity-copy', category: 'char-content', input: '&copy; 2026 Example Inc.\n' },
  { name: 'named-entity-mdash', category: 'char-content', input: 'She said &mdash; wait, no.\n' },
  { name: 'backslash-escape-asterisk', category: 'char-content', input: 'Literal \\*not italic\\*.\n' },
  { name: 'backslash-escape-underscore', category: 'char-content', input: 'Literal \\_not italic\\_.\n' },
  { name: 'backslash-escape-bracket', category: 'char-content', input: 'Literal \\[not link\\].\n' },
  { name: 'backslash-escape-hash', category: 'char-content', input: '\\# Not a heading.\n' },

  // ─── Punctuation and common patterns ───
  { name: 'punctuation-mixed', category: 'char-content', input: "It's a \"quoted\" string; with: punctuation!\n" },
  { name: 'single-char-words', category: 'char-content', input: 'A cat; I saw it on TV.\n' },
  { name: 'two-char-words', category: 'char-content', input: 'It is an IT system on my OS.\n' },
  { name: 'numbers-in-text', category: 'char-content', input: 'Version 1.2.3 released on 2026-04-11.\n' },
  { name: 'math-operators', category: 'char-content', input: 'Formula: x = (a + b) * c / d\n' },

  // ─── Unicode ───
  { name: 'unicode-emoji', category: 'char-content', input: 'Launch 🚀 success!\n' },
  { name: 'unicode-cjk', category: 'char-content', input: '你好世界\n' },
  { name: 'unicode-rtl-arabic', category: 'char-content', input: 'مرحبا بالعالم\n' },
  { name: 'unicode-accented-latin', category: 'char-content', input: 'Café résumé naïve über\n' },
  { name: 'unicode-combining', category: 'char-content', input: 'n\u0303 combining tilde\n' },
  { name: 'unicode-zwj-emoji', category: 'char-content', input: '👨‍👩‍👧‍👦 family emoji\n' },

  // ─── Whitespace ───
  { name: 'whitespace-trailing-spaces-paragraph', category: 'char-content', input: 'Has trailing spaces.   \n' },
  { name: 'whitespace-tab-in-paragraph', category: 'char-content', input: 'Col1\tCol2\n' },
  { name: 'whitespace-leading-spaces', category: 'char-content', input: '   Indented paragraph start.\n' },
  { name: 'whitespace-nbsp', category: 'char-content', input: 'Two\u00A0words joined by non-breaking space.\n' },

  // ─── CUSTOM EXTENSIONS ───
  { name: 'wikilink-bare', category: 'custom-extension', input: 'See [[TargetPage]] for details.\n' },
  { name: 'wikilink-with-alias', category: 'custom-extension', input: 'See [[TargetPage|the target]] for details.\n' },
  { name: 'wikilink-with-section', category: 'custom-extension', input: 'See [[TargetPage#Section]] for details.\n' },
  { name: 'wikilink-with-section-and-alias', category: 'custom-extension', input: 'See [[TargetPage#Section|label]] for details.\n' },
  { name: 'wikilink-inside-list', category: 'custom-extension', input: '- See [[Page A]]\n- See [[Page B]]\n' },
  { name: 'jsx-component-simple', category: 'custom-extension', input: '```jsx-component name=Callout\n{"variant": "info", "children": "Hello"}\n```\n', notes: 'Our custom fenced-code JSX pattern' },

  // ─── Frontmatter ───
  { name: 'frontmatter-yaml', category: 'custom-extension', input: '---\ntitle: My Doc\ntags: [a, b]\n---\n\n# Content\n', notes: 'Frontmatter handled by stripFrontmatter before mdManager' },

  // ─── STRUCTURAL COMBINATIONS ───
  { name: 'heading-then-paragraph', category: 'structural', input: '# Heading\n\nParagraph text.\n' },
  { name: 'list-containing-code', category: 'structural', input: '- Item with code\n\n  ```\n  code inside list\n  ```\n\n- Next item\n' },
  { name: 'list-containing-heading', category: 'structural', input: '- Item 1\n\n  ## Subheading in list\n\n- Item 2\n', notes: 'Headings inside list items' },
  { name: 'paragraph-with-bold-italic-code', category: 'structural', input: 'Mix **bold** _italic_ `code` together.\n' },
  { name: 'heading-with-bold', category: 'structural', input: '## Heading with **bold** part\n' },
  { name: 'heading-with-inline-code', category: 'structural', input: '## Heading with `code` part\n' },
  { name: 'heading-with-link', category: 'structural', input: '## See [the docs](https://example.com)\n' },

  // ─── STRESS / EDGE CASES ───
  { name: 'empty-document', category: 'edge-case', input: '' },
  { name: 'only-whitespace', category: 'edge-case', input: '   \n  \n' },
  { name: 'single-character', category: 'edge-case', input: 'A\n' },
  { name: 'very-long-paragraph', category: 'edge-case', input: `${'word '.repeat(200).trim()}.\n` },
  { name: 'trailing-newlines', category: 'edge-case', input: 'Text.\n\n\n\n' },
  { name: 'no-trailing-newline', category: 'edge-case', input: 'Text without trailing newline' },
];

// ─── helpers ───────────────────────────────────────────────────────────────

function normalizeTrailing(s: string): string {
  return s.replace(/\n+$/, '').replace(/[ \t]+$/gm, '');
}

type Classification =
  | 'BYTE_IDENTICAL'
  | 'WHITESPACE_DIFF'
  | 'ENTITY_CORRUPTION'
  | 'SEMANTIC_LOSS'
  | 'STRUCTURE_CHANGE'
  | 'COSMETIC_NORMALIZATION'
  | 'ERROR';

function classify(input: string, output: string): Classification {
  if (input === output) return 'BYTE_IDENTICAL';

  const ni = normalizeTrailing(input);
  const no = normalizeTrailing(output);
  if (ni === no) return 'WHITESPACE_DIFF';

  // Check for entity corruption
  const hasLiteralAmp = /(?<!&amp;|&lt;|&gt;|&quot;)&(?!amp;|lt;|gt;|quot;|#)/.test(ni);
  const hasLiteralLt = /(?<!&)(?:^|[^&])</.test(ni);
  const hasLiteralGt = /(?<!&)(?:^|[^&])>/.test(ni);

  const outputHasAmpEscaped = /&amp;/.test(no);
  const outputHasLtEscaped = /&lt;/.test(no);
  const outputHasGtEscaped = /&gt;/.test(no);

  if (
    (hasLiteralAmp && outputHasAmpEscaped && !/&amp;/.test(ni)) ||
    (hasLiteralLt && outputHasLtEscaped && !/&lt;/.test(ni)) ||
    (hasLiteralGt && outputHasGtEscaped && !/&gt;/.test(ni))
  ) {
    return 'ENTITY_CORRUPTION';
  }

  // Character-level content check — are the non-whitespace tokens still there?
  const tokens = (s: string) => s.replace(/\s+/g, '');
  if (tokens(ni) === tokens(no)) return 'WHITESPACE_DIFF';

  // Check semantic tokens (length difference of > 20% likely semantic loss)
  const lenRatio = Math.min(tokens(ni).length, tokens(no).length) / Math.max(tokens(ni).length, tokens(no).length);
  if (lenRatio < 0.8) return 'SEMANTIC_LOSS';

  // Check if markdown syntax characters changed (structure indicator)
  const syntaxChars = (s: string) => s.replace(/[^#*_\-+>`~|\[\]()!]/g, '');
  if (syntaxChars(ni) !== syntaxChars(no)) return 'STRUCTURE_CHANGE';

  return 'COSMETIC_NORMALIZATION';
}

function roundTripA(input: string): { output: string; error?: string } {
  try {
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    return { output };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

function roundTripB(input: string): { output: string; error?: string } {
  const doc = new Y.Doc();
  try {
    const fragment = doc.getXmlFragment('default');
    const json = mdManager.parse(input);
    const pmNode = schema.nodeFromJSON(json);
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, fragment, pmNode, meta);
    const resultJson = yXmlFragmentToProsemirrorJSON(fragment);
    const output = mdManager.serialize(resultJson);
    return { output };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  } finally {
    doc.destroy();
  }
}

// ─── main ───────────────────────────────────────────────────────────────

interface Row {
  name: string;
  category: Category;
  input: string;
  notes: string;
  aOutput: string;
  aClass: Classification;
  bOutput: string;
  bClass: Classification;
  idempotent: boolean;
}

const rows: Row[] = [];

for (const c of CONSTRUCTS) {
  const a = roundTripA(c.input);
  const b = roundTripB(c.input);

  const aClass: Classification = a.error ? 'ERROR' : classify(c.input, a.output);
  const bClass: Classification = b.error ? 'ERROR' : classify(c.input, b.output);

  // Idempotence: second round-trip should match first
  const a2 = roundTripA(a.output);
  const idempotent = a2.output === a.output;

  rows.push({
    name: c.name,
    category: c.category,
    input: c.input,
    notes: c.notes ?? '',
    aOutput: a.output,
    aClass,
    bOutput: b.output,
    bClass,
    idempotent,
  });
}

// ─── report ───────────────────────────────────────────────────────────────

// TSV for machine-parseable output
const TSV_COLS = ['name', 'category', 'aClass', 'bClass', 'idempotent', 'aMatchesB', 'input', 'aOutput', 'bOutput', 'notes'];
console.log(TSV_COLS.join('\t'));
for (const r of rows) {
  const aMatchesB = r.aOutput === r.bOutput;
  const line = [
    r.name,
    r.category,
    r.aClass,
    r.bClass,
    r.idempotent ? 'Y' : 'N',
    aMatchesB ? 'Y' : 'N',
    JSON.stringify(r.input),
    JSON.stringify(r.aOutput),
    JSON.stringify(r.bOutput),
    r.notes,
  ].join('\t');
  console.log(line);
}

// Summary to stderr
const counts: Record<string, number> = {};
for (const r of rows) {
  counts[r.aClass] = (counts[r.aClass] ?? 0) + 1;
}
console.error('');
console.error(`=== Summary (Layer A — mdManager only) ===`);
console.error(`Total: ${rows.length}`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${k}: ${v}`);
}

const countsB: Record<string, number> = {};
for (const r of rows) {
  countsB[r.bClass] = (countsB[r.bClass] ?? 0) + 1;
}
console.error('');
console.error(`=== Summary (Layer B — full Y.Doc path) ===`);
console.error(`Total: ${rows.length}`);
for (const [k, v] of Object.entries(countsB).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${k}: ${v}`);
}

const diffAB = rows.filter((r) => r.aOutput !== r.bOutput);
console.error('');
console.error(`Layer A ≠ Layer B: ${diffAB.length} cases`);
if (diffAB.length > 0) {
  for (const r of diffAB.slice(0, 10)) {
    console.error(`  ${r.name}: A=${JSON.stringify(r.aOutput.slice(0, 40))} B=${JSON.stringify(r.bOutput.slice(0, 40))}`);
  }
}

const nonIdempotent = rows.filter((r) => !r.idempotent && r.aClass !== 'ERROR');
console.error('');
console.error(`Non-idempotent (A round-trip 2 ≠ A round-trip 1): ${nonIdempotent.length} cases`);
for (const r of nonIdempotent.slice(0, 10)) {
  console.error(`  ${r.name}`);
}
