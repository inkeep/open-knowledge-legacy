/**
 * Three-library markdown round-trip fidelity probe.
 *
 * Runs 118 constructs (same as the catalog probe) through three pipelines:
 *   1. @tiptap/markdown (marked v17 → TipTap JSON → markdown)
 *   2. prosemirror-markdown (markdown-it v14 → ProseMirror doc → markdown)
 *   3. marked-only (marked lexer → manual token-to-markdown reconstruction)
 *
 * Classifies each round-trip result and emits a TSV for comparison.
 *
 * Run from packages/server/:
 *   bun ../../reports/markdown-roundtrip-fidelity-tiptap/evidence/d2-three-library-probe.ts
 */

import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from '/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/test-isolation-parallelism/packages/core/src/extensions/shared.ts';
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import { marked } from 'marked';

// ─── Pipeline 1: @tiptap/markdown ───────────────────────────────────────
const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTripTiptap(input: string): { output: string; error?: string } {
  try {
    const json = mdManager.parse(input);
    const output = mdManager.serialize(json);
    return { output };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Pipeline 2: prosemirror-markdown ───────────────────────────────────
function roundTripPM(input: string): { output: string; error?: string } {
  try {
    const doc = defaultMarkdownParser.parse(input);
    if (!doc) return { output: '', error: 'parse returned null' };
    const output = defaultMarkdownSerializer.serialize(doc);
    return { output };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Pipeline 3: marked-only ────────────────────────────────────────────
// Parse with marked.lexer, then reconstruct markdown from tokens.
// This isolates marked's tokenization behavior from any editor wrapping.

function tokensToMarkdown(tokens: marked.Token[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'heading':
        parts.push('#'.repeat(t.depth) + ' ' + inlineTokensToMd(t.tokens ?? []) + '\n');
        break;
      case 'paragraph':
        parts.push(inlineTokensToMd(t.tokens ?? []) + '\n');
        break;
      case 'code':
        parts.push('```' + (t.lang || '') + '\n' + t.text + '\n```\n');
        break;
      case 'blockquote': {
        const inner = tokensToMarkdown(t.tokens ?? []);
        parts.push(inner.split('\n').map((l: string) => l === '' ? '>' : '> ' + l).join('\n') + '\n');
        break;
      }
      case 'list': {
        for (let i = 0; i < t.items.length; i++) {
          const item = t.items[i];
          const bullet = t.ordered ? `${(t.start || 1) + i}. ` : '- ';
          const checkbox = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
          const inner = tokensToMarkdown(item.tokens ?? []).replace(/\n$/, '');
          if (t.loose) {
            parts.push(bullet + checkbox + inner + '\n\n');
          } else {
            parts.push(bullet + checkbox + inner + '\n');
          }
        }
        break;
      }
      case 'hr':
        parts.push('---\n');
        break;
      case 'html':
        parts.push(t.text);
        break;
      case 'table': {
        // Reconstruct table
        const hdr = t.header.map((c: { text: string }) => c.text).join(' | ');
        const sep = t.align.map((a: string | null) => {
          if (a === 'left') return ':---';
          if (a === 'center') return ':---:';
          if (a === 'right') return '---:';
          return '---';
        }).join(' | ');
        parts.push('| ' + hdr + ' |\n| ' + sep + ' |\n');
        for (const row of t.rows) {
          parts.push('| ' + row.map((c: { text: string }) => c.text).join(' | ') + ' |\n');
        }
        break;
      }
      case 'space':
        parts.push('\n');
        break;
      default:
        // fallback: use raw if available
        if ('raw' in t && typeof t.raw === 'string') parts.push(t.raw);
        break;
    }
  }
  return parts.join('');
}

function inlineTokensToMd(tokens: marked.Token[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        parts.push(t.text);
        break;
      case 'strong':
        parts.push('**' + inlineTokensToMd(t.tokens ?? []) + '**');
        break;
      case 'em':
        parts.push('*' + inlineTokensToMd(t.tokens ?? []) + '*');
        break;
      case 'codespan':
        parts.push('`' + t.text + '`');
        break;
      case 'link':
        parts.push('[' + inlineTokensToMd(t.tokens ?? []) + '](' + t.href + (t.title ? ' "' + t.title + '"' : '') + ')');
        break;
      case 'image':
        parts.push('![' + t.text + '](' + t.href + (t.title ? ' "' + t.title + '"' : '') + ')');
        break;
      case 'del':
        parts.push('~~' + inlineTokensToMd(t.tokens ?? []) + '~~');
        break;
      case 'html':
        parts.push(t.raw ?? t.text ?? '');
        break;
      case 'br':
        parts.push('  \n');
        break;
      case 'escape':
        parts.push('\\' + t.text);
        break;
      default:
        if ('raw' in t && typeof t.raw === 'string') parts.push(t.raw);
        else if ('text' in t && typeof t.text === 'string') parts.push(t.text);
        break;
    }
  }
  return parts.join('');
}

function roundTripMarked(input: string): { output: string; error?: string } {
  try {
    const tokens = marked.lexer(input);
    const output = tokensToMarkdown(tokens).replace(/\n+$/, '');
    return { output };
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Classification ──────────────────────────────────────────────────────

function normalizeTrailing(s: string): string {
  return s.replace(/\n+$/, '').replace(/[ \t]+$/gm, '');
}

type Classification =
  | 'BYTE_IDENTICAL'
  | 'WHITESPACE_DIFF'
  | 'ENTITY_CORRUPTION'
  | 'BACKSLASH_ESCAPE_CONSUMED'
  | 'SEMANTIC_LOSS'
  | 'STRUCTURE_CHANGE'
  | 'COSMETIC_NORMALIZATION'
  | 'NOT_IN_SCHEMA'
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

  // Check backslash escape consumption
  if (/\\[*_\[\]#\\`]/.test(ni) && !/\\[*_\[\]#\\`]/.test(no)) {
    return 'BACKSLASH_ESCAPE_CONSUMED';
  }

  // Check for GFM constructs rendered as escaped text (prosemirror-markdown default schema issue)
  if (/\\~\\~/.test(no) || /\\\[.*\\\]/.test(no)) {
    return 'NOT_IN_SCHEMA';
  }

  // Token-level comparison (whitespace-insensitive)
  const tokens = (s: string) => s.replace(/\s+/g, '');
  if (tokens(ni) === tokens(no)) return 'WHITESPACE_DIFF';

  // Length-based semantic loss
  const lenRatio =
    Math.min(tokens(ni).length, tokens(no).length) /
    Math.max(tokens(ni).length, tokens(no).length);
  if (lenRatio < 0.8) return 'SEMANTIC_LOSS';

  // Syntax character diff
  const syntaxChars = (s: string) => s.replace(/[^#*_\-+>`~|\[\]()!]/g, '');
  if (syntaxChars(ni) !== syntaxChars(no)) return 'STRUCTURE_CHANGE';

  return 'COSMETIC_NORMALIZATION';
}

// ─── CONSTRUCTS (same 118 as catalog probe) ──────────────────────────────

type Category =
  | 'commonmark-block'
  | 'commonmark-inline'
  | 'gfm-extension'
  | 'char-content'
  | 'custom-extension'
  | 'structural'
  | 'edge-case';

type Construct = { name: string; category: Category; input: string; notes?: string };

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
  { name: 'paragraph-with-hard-break-spaces', category: 'commonmark-block', input: 'Line one.  \nLine two.\n' },
  { name: 'paragraph-with-hard-break-backslash', category: 'commonmark-block', input: 'Line one.\\\nLine two.\n' },
  { name: 'paragraph-multiple-blank-lines', category: 'commonmark-block', input: 'First.\n\n\n\nSecond.\n' },

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
  { name: 'list-ordered-start-at-5', category: 'commonmark-block', input: '5. Five\n6. Six\n7. Seven\n' },

  // ─── Lists — tight/loose ───
  { name: 'list-tight', category: 'commonmark-block', input: '- Item 1\n- Item 2\n- Item 3\n' },
  { name: 'list-loose', category: 'commonmark-block', input: '- Item 1\n\n- Item 2\n\n- Item 3\n' },

  // ─── Lists — nested ───
  { name: 'list-nested-2-levels', category: 'commonmark-block', input: '- Outer 1\n  - Nested 1a\n  - Nested 1b\n- Outer 2\n' },
  { name: 'list-nested-3-levels', category: 'commonmark-block', input: '- L1\n  - L2\n    - L3\n' },
  { name: 'list-nested-mixed', category: 'commonmark-block', input: '- Bullet\n  1. Nested ordered 1\n  2. Nested ordered 2\n- Another bullet\n' },

  // ─── Code blocks ───
  { name: 'code-block-fenced-backticks', category: 'commonmark-block', input: '```\nplain code\n```\n' },
  { name: 'code-block-fenced-tildes', category: 'commonmark-block', input: '~~~\nplain code\n~~~\n' },
  { name: 'code-block-with-lang', category: 'commonmark-block', input: '```javascript\nconst x = 1;\n```\n' },
  { name: 'code-block-with-info-string', category: 'commonmark-block', input: '```ts title="foo.ts"\nconst x = 1;\n```\n' },
  { name: 'code-block-indented', category: 'commonmark-block', input: '    indented code\n    second line\n' },
  { name: 'code-block-empty-lang', category: 'commonmark-block', input: '```\n\nempty lines preserved\n\n```\n' },
  { name: 'code-block-contains-ampersand', category: 'commonmark-block', input: '```\nfoo & bar\nx < y > z\n```\n' },

  // ─── Inline constructs ───
  { name: 'inline-code-simple', category: 'commonmark-inline', input: 'Use `code` here.\n' },
  { name: 'inline-code-with-ampersand', category: 'commonmark-inline', input: 'Use `a & b` here.\n' },
  { name: 'inline-code-with-brackets', category: 'commonmark-inline', input: 'Use `foo[1]` here.\n' },
  { name: 'inline-code-with-backticks', category: 'commonmark-inline', input: 'Use `` `backtick` `` here.\n' },

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
  { name: 'link-with-ampersand-in-url', category: 'commonmark-inline', input: 'See [docs](https://example.com?a=1&b=2).\n' },
  { name: 'link-with-ampersand-in-text', category: 'commonmark-inline', input: 'See [A & B](https://example.com).\n' },

  // ─── Images ───
  { name: 'image-inline', category: 'commonmark-inline', input: '![Alt text](https://example.com/img.png)\n' },
  { name: 'image-with-title', category: 'commonmark-inline', input: '![Alt](https://example.com/img.png "title")\n' },

  // ─── Raw HTML ───
  { name: 'html-block-div', category: 'commonmark-block', input: '<div class="box">HTML block</div>\n' },
  { name: 'html-inline-span', category: 'commonmark-inline', input: 'Text with <span>inline</span> HTML.\n' },
  { name: 'html-br', category: 'commonmark-inline', input: 'Line one<br>Line two.\n' },

  // ─── GFM ───
  { name: 'gfm-table-simple', category: 'gfm-extension', input: '| H1 | H2 |\n|---|---|\n| c1 | c2 |\n' },
  { name: 'gfm-table-aligned', category: 'gfm-extension', input: '| Left | Center | Right |\n|:---|:---:|---:|\n| a | b | c |\n' },
  { name: 'gfm-table-with-ampersand', category: 'gfm-extension', input: '| Name | Desc |\n|---|---|\n| A & B | test |\n' },
  { name: 'gfm-task-list-unchecked', category: 'gfm-extension', input: '- [ ] Todo item\n- [ ] Another todo\n' },
  { name: 'gfm-task-list-checked', category: 'gfm-extension', input: '- [x] Done\n- [ ] Todo\n' },
  { name: 'gfm-strikethrough', category: 'gfm-extension', input: 'This is ~~struck~~ text.\n' },
  { name: 'gfm-autolink-bare-url', category: 'gfm-extension', input: 'Visit https://example.com directly.\n' },

  // ─── Character content ───
  { name: 'ampersand-literal-in-heading', category: 'char-content', input: '# H&M Store\n' },
  { name: 'ampersand-literal-in-paragraph', category: 'char-content', input: 'Foo & Bar & Baz.\n' },
  { name: 'lt-gt-in-paragraph', category: 'char-content', input: 'If a < b and b > c then a < c.\n' },
  { name: 'already-encoded-amp', category: 'char-content', input: 'Author wrote &amp; explicitly.\n' },
  { name: 'already-encoded-lt-gt', category: 'char-content', input: 'Author wrote &lt;tag&gt; explicitly.\n' },
  { name: 'numeric-entity-decimal', category: 'char-content', input: 'Copyright &#169; 2026.\n' },
  { name: 'numeric-entity-hex', category: 'char-content', input: 'Bullet &#x2022; item.\n' },
  { name: 'named-entity-copy', category: 'char-content', input: '&copy; 2026 Example Inc.\n' },
  { name: 'named-entity-mdash', category: 'char-content', input: 'She said &mdash; wait, no.\n' },
  { name: 'backslash-escape-asterisk', category: 'char-content', input: 'Literal \\*not italic\\*.\n' },
  { name: 'backslash-escape-underscore', category: 'char-content', input: 'Literal \\_not italic\\_.\n' },
  { name: 'backslash-escape-bracket', category: 'char-content', input: 'Literal \\[not link\\].\n' },
  { name: 'backslash-escape-hash', category: 'char-content', input: '\\# Not a heading.\n' },
  { name: 'punctuation-mixed', category: 'char-content', input: "It's a \"quoted\" string; with: punctuation!\n" },
  { name: 'single-char-words', category: 'char-content', input: 'A cat; I saw it on TV.\n' },
  { name: 'two-char-words', category: 'char-content', input: 'It is an IT system on my OS.\n' },
  { name: 'numbers-in-text', category: 'char-content', input: 'Version 1.2.3 released on 2026-04-11.\n' },
  { name: 'math-operators', category: 'char-content', input: 'Formula: x = (a + b) * c / d\n' },
  { name: 'unicode-emoji', category: 'char-content', input: 'Launch 🚀 success!\n' },
  { name: 'unicode-cjk', category: 'char-content', input: '你好世界\n' },
  { name: 'unicode-rtl-arabic', category: 'char-content', input: 'مرحبا بالعالم\n' },
  { name: 'unicode-accented-latin', category: 'char-content', input: 'Café résumé naïve über\n' },
  { name: 'unicode-combining', category: 'char-content', input: 'n\u0303 combining tilde\n' },
  { name: 'unicode-zwj-emoji', category: 'char-content', input: '👨‍👩‍👧‍👦 family emoji\n' },
  { name: 'whitespace-trailing-spaces-paragraph', category: 'char-content', input: 'Has trailing spaces.   \n' },
  { name: 'whitespace-tab-in-paragraph', category: 'char-content', input: 'Col1\tCol2\n' },
  { name: 'whitespace-leading-spaces', category: 'char-content', input: '   Indented paragraph start.\n' },
  { name: 'whitespace-nbsp', category: 'char-content', input: 'Two\u00A0words joined by non-breaking space.\n' },

  // ─── Custom extensions ───
  { name: 'wikilink-bare', category: 'custom-extension', input: 'See [[TargetPage]] for details.\n' },
  { name: 'wikilink-with-alias', category: 'custom-extension', input: 'See [[TargetPage|the target]] for details.\n' },
  { name: 'wikilink-with-section', category: 'custom-extension', input: 'See [[TargetPage#Section]] for details.\n' },
  { name: 'wikilink-with-section-and-alias', category: 'custom-extension', input: 'See [[TargetPage#Section|label]] for details.\n' },
  { name: 'wikilink-inside-list', category: 'custom-extension', input: '- See [[Page A]]\n- See [[Page B]]\n' },
  { name: 'jsx-component-simple', category: 'custom-extension', input: '```jsx-component name=Callout\n{"variant": "info", "children": "Hello"}\n```\n' },
  { name: 'frontmatter-yaml', category: 'custom-extension', input: '---\ntitle: My Doc\ntags: [a, b]\n---\n\n# Content\n' },

  // ─── Structural ───
  { name: 'heading-then-paragraph', category: 'structural', input: '# Heading\n\nParagraph text.\n' },
  { name: 'list-containing-code', category: 'structural', input: '- Item with code\n\n  ```\n  code inside list\n  ```\n\n- Next item\n' },
  { name: 'list-containing-heading', category: 'structural', input: '- Item 1\n\n  ## Subheading in list\n\n- Item 2\n' },
  { name: 'paragraph-with-bold-italic-code', category: 'structural', input: 'Mix **bold** _italic_ `code` together.\n' },
  { name: 'heading-with-bold', category: 'structural', input: '## Heading with **bold** part\n' },
  { name: 'heading-with-inline-code', category: 'structural', input: '## Heading with `code` part\n' },
  { name: 'heading-with-link', category: 'structural', input: '## See [the docs](https://example.com)\n' },

  // ─── Edge cases ───
  { name: 'empty-document', category: 'edge-case', input: '' },
  { name: 'only-whitespace', category: 'edge-case', input: '   \n  \n' },
  { name: 'single-character', category: 'edge-case', input: 'A\n' },
  { name: 'very-long-paragraph', category: 'edge-case', input: `${'word '.repeat(200).trim()}.\n` },
  { name: 'trailing-newlines', category: 'edge-case', input: 'Text.\n\n\n\n' },
  { name: 'no-trailing-newline', category: 'edge-case', input: 'Text without trailing newline' },
];

// ─── MAIN ──────────────────────────────────────────────────────────────

interface Row {
  name: string;
  category: Category;
  tiptapOutput: string;
  tiptapClass: Classification;
  pmOutput: string;
  pmClass: Classification;
  markedOutput: string;
  markedClass: Classification;
}

const rows: Row[] = [];

for (const c of CONSTRUCTS) {
  const t = roundTripTiptap(c.input);
  const p = roundTripPM(c.input);
  const m = roundTripMarked(c.input);

  rows.push({
    name: c.name,
    category: c.category,
    tiptapOutput: t.output,
    tiptapClass: t.error ? 'ERROR' : classify(c.input, t.output),
    pmOutput: p.output,
    pmClass: p.error ? 'ERROR' : classify(c.input, p.output),
    markedOutput: m.output,
    markedClass: m.error ? 'ERROR' : classify(c.input, m.output),
  });
}

// ─── TSV output ──────────────────────────────────────────────────────────

const TSV_COLS = ['name', 'category', 'tiptapClass', 'pmClass', 'markedClass', 'tiptapOutput', 'pmOutput', 'markedOutput'];
console.log(TSV_COLS.join('\t'));
for (const r of rows) {
  console.log([
    r.name,
    r.category,
    r.tiptapClass,
    r.pmClass,
    r.markedClass,
    JSON.stringify(r.tiptapOutput),
    JSON.stringify(r.pmOutput),
    JSON.stringify(r.markedOutput),
  ].join('\t'));
}

// ─── Summary ──────────────────────────────────────────────────────────────

function countBy(arr: Classification[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const x of arr) c[x] = (c[x] ?? 0) + 1;
  return c;
}

console.error('\n=== @tiptap/markdown ===');
const tc = countBy(rows.map(r => r.tiptapClass));
for (const [k, v] of Object.entries(tc).sort((a, b) => b[1] - a[1]))
  console.error(`  ${k}: ${v}`);

console.error('\n=== prosemirror-markdown ===');
const pc = countBy(rows.map(r => r.pmClass));
for (const [k, v] of Object.entries(pc).sort((a, b) => b[1] - a[1]))
  console.error(`  ${k}: ${v}`);

console.error('\n=== marked-only ===');
const mc = countBy(rows.map(r => r.markedClass));
for (const [k, v] of Object.entries(mc).sort((a, b) => b[1] - a[1]))
  console.error(`  ${k}: ${v}`);

// ─── Head-to-head: where PM beats tiptap or vice versa ──────────────────

const pmBetter: string[] = [];
const tiptapBetter: string[] = [];
const markedBetter: string[] = [];

const severity: Record<Classification, number> = {
  BYTE_IDENTICAL: 0, WHITESPACE_DIFF: 1, COSMETIC_NORMALIZATION: 2,
  STRUCTURE_CHANGE: 3, NOT_IN_SCHEMA: 4, SEMANTIC_LOSS: 5,
  BACKSLASH_ESCAPE_CONSUMED: 6, ENTITY_CORRUPTION: 7, ERROR: 8,
};

for (const r of rows) {
  const ts = severity[r.tiptapClass];
  const ps = severity[r.pmClass];
  const ms = severity[r.markedClass];
  if (ps < ts) pmBetter.push(r.name);
  if (ts < ps) tiptapBetter.push(r.name);
  if (ms < ts && ms < ps) markedBetter.push(r.name);
}

console.error('\n=== PM better than tiptap (' + pmBetter.length + ' constructs) ===');
for (const n of pmBetter) console.error('  ' + n);
console.error('\n=== tiptap better than PM (' + tiptapBetter.length + ' constructs) ===');
for (const n of tiptapBetter) console.error('  ' + n);
console.error('\n=== marked-only best of all (' + markedBetter.length + ' constructs) ===');
for (const n of markedBetter) console.error('  ' + n);
