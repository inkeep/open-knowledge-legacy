// The 118 fidelity catalog from reports/markdown-construct-fidelity-catalog/evidence/probe-script.ts
export type Category =
  | 'commonmark-block'
  | 'commonmark-inline'
  | 'gfm-extension'
  | 'char-content'
  | 'custom-extension'
  | 'structural'
  | 'edge-case';

export type Construct = { name: string; category: Category; input: string; notes?: string };

export const CONSTRUCTS: Construct[] = [
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

  { name: 'hr-dashes', category: 'commonmark-block', input: '---\n' },
  { name: 'hr-asterisks', category: 'commonmark-block', input: '***\n' },
  { name: 'hr-underscores', category: 'commonmark-block', input: '___\n' },

  { name: 'paragraph-plain', category: 'commonmark-block', input: 'A simple paragraph.\n' },
  { name: 'paragraph-with-soft-break', category: 'commonmark-block', input: 'Line one.\nLine two continues.\n' },
  { name: 'paragraph-with-hard-break-spaces', category: 'commonmark-block', input: 'Line one.  \nLine two.\n' },
  { name: 'paragraph-with-hard-break-backslash', category: 'commonmark-block', input: 'Line one.\\\nLine two.\n' },
  { name: 'paragraph-multiple-blank-lines', category: 'commonmark-block', input: 'First.\n\n\n\nSecond.\n' },

  { name: 'blockquote-simple', category: 'commonmark-block', input: '> A blockquote.\n' },
  { name: 'blockquote-multiline', category: 'commonmark-block', input: '> Line one.\n> Line two.\n' },
  { name: 'blockquote-nested', category: 'commonmark-block', input: '> Outer.\n>\n> > Inner.\n' },
  { name: 'blockquote-with-heading', category: 'commonmark-block', input: '> # Heading in quote\n>\n> And text.\n' },

  { name: 'list-bullet-dash', category: 'commonmark-block', input: '- Item 1\n- Item 2\n- Item 3\n' },
  { name: 'list-bullet-asterisk', category: 'commonmark-block', input: '* Item 1\n* Item 2\n* Item 3\n' },
  { name: 'list-bullet-plus', category: 'commonmark-block', input: '+ Item 1\n+ Item 2\n+ Item 3\n' },
  { name: 'list-bullet-single-item', category: 'commonmark-block', input: '- Solo item\n' },

  { name: 'list-ordered-period', category: 'commonmark-block', input: '1. First\n2. Second\n3. Third\n' },
  { name: 'list-ordered-paren', category: 'commonmark-block', input: '1) First\n2) Second\n3) Third\n' },
  { name: 'list-ordered-start-at-5', category: 'commonmark-block', input: '5. Five\n6. Six\n7. Seven\n' },

  { name: 'list-tight', category: 'commonmark-block', input: '- Item 1\n- Item 2\n- Item 3\n' },
  { name: 'list-loose', category: 'commonmark-block', input: '- Item 1\n\n- Item 2\n\n- Item 3\n' },

  { name: 'list-nested-2-levels', category: 'commonmark-block', input: '- Outer 1\n  - Nested 1a\n  - Nested 1b\n- Outer 2\n' },
  { name: 'list-nested-3-levels', category: 'commonmark-block', input: '- L1\n  - L2\n    - L3\n' },
  { name: 'list-nested-mixed', category: 'commonmark-block', input: '- Bullet\n  1. Nested ordered 1\n  2. Nested ordered 2\n- Another bullet\n' },

  { name: 'code-block-fenced-backticks', category: 'commonmark-block', input: '```\nplain code\n```\n' },
  { name: 'code-block-fenced-tildes', category: 'commonmark-block', input: '~~~\nplain code\n~~~\n' },
  { name: 'code-block-with-lang', category: 'commonmark-block', input: '```javascript\nconst x = 1;\n```\n' },
  { name: 'code-block-with-info-string', category: 'commonmark-block', input: '```ts title="foo.ts"\nconst x = 1;\n```\n' },
  { name: 'code-block-indented', category: 'commonmark-block', input: '    indented code\n    second line\n' },
  { name: 'code-block-empty-lang', category: 'commonmark-block', input: '```\n\nempty lines preserved\n\n```\n' },
  { name: 'code-block-contains-ampersand', category: 'commonmark-block', input: '```\nfoo & bar\nx < y > z\n```\n' },

  { name: 'inline-code-simple', category: 'commonmark-inline', input: 'Use `code` here.\n' },
  { name: 'inline-code-with-ampersand', category: 'commonmark-inline', input: 'Use `a & b` here.\n' },
  { name: 'inline-code-with-brackets', category: 'commonmark-inline', input: 'Use `foo[1]` here.\n' },
  { name: 'inline-code-with-backticks', category: 'commonmark-inline', input: 'Use `` `backtick` `` here.\n' },

  { name: 'emphasis-bold-asterisks', category: 'commonmark-inline', input: 'This is **bold** text.\n' },
  { name: 'emphasis-bold-underscores', category: 'commonmark-inline', input: 'This is __bold__ text.\n' },
  { name: 'emphasis-italic-asterisks', category: 'commonmark-inline', input: 'This is *italic* text.\n' },
  { name: 'emphasis-italic-underscores', category: 'commonmark-inline', input: 'This is _italic_ text.\n' },
  { name: 'emphasis-bold-italic-combined', category: 'commonmark-inline', input: 'This is ***bold italic*** text.\n' },
  { name: 'emphasis-nested', category: 'commonmark-inline', input: 'This is **bold with *italic* inside**.\n' },

  { name: 'link-inline', category: 'commonmark-inline', input: 'See [docs](https://example.com).\n' },
  { name: 'link-with-title', category: 'commonmark-inline', input: 'See [docs](https://example.com "title").\n' },
  { name: 'link-reference', category: 'commonmark-inline', input: 'See [docs][ref].\n\n[ref]: https://example.com\n' },
  { name: 'link-collapsed-reference', category: 'commonmark-inline', input: 'See [docs][].\n\n[docs]: https://example.com\n' },
  { name: 'link-shortcut-reference', category: 'commonmark-inline', input: 'See [docs].\n\n[docs]: https://example.com\n' },
  { name: 'link-autolink', category: 'commonmark-inline', input: 'Visit <https://example.com>.\n' },
  { name: 'link-with-ampersand-in-url', category: 'commonmark-inline', input: 'See [docs](https://example.com?a=1&b=2).\n' },
  { name: 'link-with-ampersand-in-text', category: 'commonmark-inline', input: 'See [A & B](https://example.com).\n' },

  { name: 'image-inline', category: 'commonmark-inline', input: '![Alt text](https://example.com/img.png)\n' },
  { name: 'image-with-title', category: 'commonmark-inline', input: '![Alt](https://example.com/img.png "title")\n' },

  { name: 'html-block-div', category: 'commonmark-block', input: '<div class="box">HTML block</div>\n' },
  { name: 'html-inline-span', category: 'commonmark-inline', input: 'Text with <span>inline</span> HTML.\n' },
  { name: 'html-br', category: 'commonmark-inline', input: 'Line one<br>Line two.\n' },

  { name: 'gfm-table-simple', category: 'gfm-extension', input: '| H1 | H2 |\n|---|---|\n| c1 | c2 |\n' },
  { name: 'gfm-table-aligned', category: 'gfm-extension', input: '| Left | Center | Right |\n|:---|:---:|---:|\n| a | b | c |\n' },
  { name: 'gfm-table-with-ampersand', category: 'gfm-extension', input: '| Name | Desc |\n|---|---|\n| A & B | test |\n' },
  { name: 'gfm-task-list-unchecked', category: 'gfm-extension', input: '- [ ] Todo item\n- [ ] Another todo\n' },
  { name: 'gfm-task-list-checked', category: 'gfm-extension', input: '- [x] Done\n- [ ] Todo\n' },
  { name: 'gfm-strikethrough', category: 'gfm-extension', input: 'This is ~~struck~~ text.\n' },
  { name: 'gfm-autolink-bare-url', category: 'gfm-extension', input: 'Visit https://example.com directly.\n' },

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

  { name: 'wikilink-bare', category: 'custom-extension', input: 'See [[TargetPage]] for details.\n' },
  { name: 'wikilink-with-alias', category: 'custom-extension', input: 'See [[TargetPage|the target]] for details.\n' },
  { name: 'wikilink-with-section', category: 'custom-extension', input: 'See [[TargetPage#Section]] for details.\n' },
  { name: 'wikilink-with-section-and-alias', category: 'custom-extension', input: 'See [[TargetPage#Section|label]] for details.\n' },
  { name: 'wikilink-inside-list', category: 'custom-extension', input: '- See [[Page A]]\n- See [[Page B]]\n' },
  { name: 'jsx-component-simple', category: 'custom-extension', input: '```jsx-component name=Callout\n{"variant": "info", "children": "Hello"}\n```\n' },

  { name: 'frontmatter-yaml', category: 'custom-extension', input: '---\ntitle: My Doc\ntags: [a, b]\n---\n\n# Content\n' },

  { name: 'heading-then-paragraph', category: 'structural', input: '# Heading\n\nParagraph text.\n' },
  { name: 'list-containing-code', category: 'structural', input: '- Item with code\n\n  ```\n  code inside list\n  ```\n\n- Next item\n' },
  { name: 'list-containing-heading', category: 'structural', input: '- Item 1\n\n  ## Subheading in list\n\n- Item 2\n' },
  { name: 'paragraph-with-bold-italic-code', category: 'structural', input: 'Mix **bold** _italic_ `code` together.\n' },
  { name: 'heading-with-bold', category: 'structural', input: '## Heading with **bold** part\n' },
  { name: 'heading-with-inline-code', category: 'structural', input: '## Heading with `code` part\n' },
  { name: 'heading-with-link', category: 'structural', input: '## See [the docs](https://example.com)\n' },

  { name: 'empty-document', category: 'edge-case', input: '' },
  { name: 'only-whitespace', category: 'edge-case', input: '   \n  \n' },
  { name: 'single-character', category: 'edge-case', input: 'A\n' },
  { name: 'very-long-paragraph', category: 'edge-case', input: `${'word '.repeat(200).trim()}.\n` },
  { name: 'trailing-newlines', category: 'edge-case', input: 'Text.\n\n\n\n' },
  { name: 'no-trailing-newline', category: 'edge-case', input: 'Text without trailing newline' },
];
