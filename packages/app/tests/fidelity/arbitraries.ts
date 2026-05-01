
import * as fc from 'fast-check';


const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,12}$/);

const phrase = fc.array(safeWord, { minLength: 1, maxLength: 5 }).map((words) => words.join(' '));

const fidelityText = fc.oneof(
  phrase.map((p) => `${p} & more`),
  phrase.map((p) => `${p} < less`),
  phrase.map((p) => `${p} > greater`),
  phrase.map((p) => `${p} & < >`),
);


export const heading = fc
  .tuple(fc.integer({ min: 1, max: 6 }), phrase)
  .map(([level, text]) => `${'#'.repeat(level)} ${text}`);

export const paragraph = phrase;

export const paragraphWithFidelityChars = fidelityText;

export const codeBlock = fc
  .tuple(
    fc.constantFrom('', 'js', 'typescript', 'python', 'markdown'),
    fc.array(safeWord, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(' = ')),
  )
  .map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``);

export const codeBlockTilde = fc
  .tuple(
    fc.constantFrom('', 'js'),
    fc.array(safeWord, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(' = ')),
  )
  .map(([lang, body]) => `~~~${lang}\n${body}\n~~~`);

export const blockquote = phrase.map((text) => `> ${text}`);

export const bulletList = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `- ${item}`).join('\n'));

export const bulletListStar = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `* ${item}`).join('\n'));

export const bulletListPlus = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `+ ${item}`).join('\n'));

export const orderedList = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n'));

export const orderedListParen = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item, i) => `${i + 1}) ${item}`).join('\n'));

export const thematicBreak = fc.constant('---');

export const thematicBreakStar = fc.constant('***');

export const thematicBreakUnderscore = fc.constant('___');

export const setextH1 = phrase.map((t) => `${t}\n${'='.repeat(Math.max(t.length, 3))}`);

export const setextH2 = phrase.map((t) => `${t}\n${'-'.repeat(Math.max(t.length, 3))}`);

export const hardBreakBackslash = fc.tuple(phrase, phrase).map(([a, b]) => `${a}\\\n${b}`);

export const hardBreakSpaces = fc.tuple(phrase, phrase).map(([a, b]) => `${a}  \n${b}`);

export const htmlBlock = fc.constantFrom(
  '<div>content</div>',
  '<details><summary>S</summary></details>',
);

export const linkRefDef = fc.constantFrom(
  '[example]: https://example.com "Title"',
  '[ref]: https://example.com',
);


const bold = phrase.map((text) => `**${text}**`);

const boldUnderscore = phrase.map((text) => `__${text}__`);

const italic = phrase.map((text) => `*${text}*`);

const italicUnderscore = phrase.map((text) => `_${text}_`);

const inlineCode = safeWord.map((text) => `\`${text}\``);

const link = fc
  .tuple(phrase, safeWord)
  .map(([text, slug]) => `[${text}](https://example.com/${slug})`);

const inlineContent = fc.oneof(
  phrase,
  bold,
  boldUnderscore,
  italic,
  italicUnderscore,
  inlineCode,
  link,
);

export const paragraphWithMarks = fc
  .array(inlineContent, { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(' '));

export const headingWithMarks = fc
  .tuple(fc.integer({ min: 1, max: 3 }), paragraphWithMarks)
  .map(([level, content]) => `${'#'.repeat(level)} ${content}`);

export const blockquoteWithMarks = paragraphWithMarks.map((text) => `> ${text}`);

export const listWithMarks = fc
  .array(paragraphWithMarks, { minLength: 2, maxLength: 3 })
  .map((items) => items.map((item) => `- ${item}`).join('\n'));


export const autolink = fc
  .tuple(fc.constantFrom('https', 'http', 'mailto', 'ftp'), safeWord)
  .map(([scheme, path]) => `<${scheme}://${path}.example.com>`);

export const wikiLink = fc.oneof(
  safeWord.map((page) => `[[${page}]]`),
  fc.tuple(safeWord, safeWord).map(([page, anchor]) => `[[${page}#${anchor}]]`),
  fc.tuple(safeWord, phrase).map(([page, alias]) => `[[${page}|${alias}]]`),
);

export const mdxSelfClosing = fc.oneof(
  fc.constant('<Icon />'),
  safeWord.map((name) => `<${name.charAt(0).toUpperCase()}${name.slice(1)} />`),
);

export const mdxPaired = fc
  .tuple(
    safeWord.map((n) => n.charAt(0).toUpperCase() + n.slice(1)),
    phrase,
  )
  .map(([name, body]) => `<${name}>\n\n${body}\n\n</${name}>`);

export const leafDirective = safeWord.map((name) => `::${name}`);

export const containerDirective = fc
  .tuple(safeWord, phrase)
  .map(([name, body]) => `:::${name}\n${body}\n:::`);

const strikethrough = phrase.map((text) => `~~${text}~~`);

export const table = fc
  .tuple(
    fc.array(safeWord, { minLength: 2, maxLength: 4 }),
    fc.array(fc.array(safeWord, { minLength: 2, maxLength: 4 }), { minLength: 1, maxLength: 3 }),
  )
  .map(([headers, rows]) => {
    const headerRow = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = rows
      .map((row) => `| ${row.slice(0, headers.length).join(' | ')} |`)
      .join('\n');
    return `${headerRow}\n${separator}\n${dataRows}`;
  });

const richInlineContent = fc.oneof(
  phrase,
  bold,
  italic,
  inlineCode,
  link,
  autolink,
  wikiLink,
  strikethrough,
  fidelityText,
);

export const paragraphWithRichInline = fc
  .array(richInlineContent, { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(' '));

export const nestedBlockquote = fc.oneof(
  paragraphWithMarks.map((text) => `> ${text}`),
  fc
    .array(phrase, { minLength: 2, maxLength: 3 })
    .map((items) => items.map((item) => `> - ${item}`).join('\n')),
);


export const block = fc.oneof(
  heading,
  paragraph,
  paragraphWithFidelityChars,
  codeBlock,
  codeBlockTilde,
  blockquote,
  bulletList,
  bulletListStar,
  bulletListPlus,
  orderedList,
  orderedListParen,
  thematicBreak,
  thematicBreakStar,
  thematicBreakUnderscore,
  paragraphWithMarks,
  headingWithMarks,
  setextH1,
  setextH2,
  htmlBlock,
  linkRefDef,
);

export const blockExtended = fc.oneof(
  block,
  mdxSelfClosing.map((c) => `${c}\n`),
  mdxPaired,
  leafDirective,
  containerDirective,
  table,
  paragraphWithRichInline,
  nestedBlockquote,
);

const blankLineJoiner = fc.nat({ min: 0, max: 3 }).map((n) => `\n${'\n'.repeat(n + 1)}`);

const composeWithJoiners = <A>(blockArb: fc.Arbitrary<A & string>): fc.Arbitrary<string> =>
  fc.array(blockArb, { minLength: 1, maxLength: 5 }).chain((blocks) =>
    fc
      .array(blankLineJoiner, { minLength: blocks.length - 1, maxLength: blocks.length - 1 })
      .map((joiners) => {
        let out = blocks[0] ?? '';
        for (let i = 1; i < blocks.length; i++) {
          out += joiners[i - 1] + blocks[i];
        }
        return out;
      }),
  );

export const markdownDoc = composeWithJoiners(block as fc.Arbitrary<string>);

export const markdownDocExtended = composeWithJoiners(blockExtended as fc.Arbitrary<string>);


export const dangerousInline = fc.oneof(
  fc.constant('<'),
  fc.constant('{'),
  fc.constant('</'),
  fc.constant('{{'),
  fc.constant('<br>'),
  fc.constant('<https://example.com>'),
  fc.constant('[[Page]]'),
  fc.constant('{expression}'),
  fc.constant('{/* comment */}'),
  safeWord.map((w) => `<${w}`), // unclosed lowercase tag
  safeWord.map((w) => `{${w}`), // unclosed brace
  safeWord.map((w) => `<${w.charAt(0).toUpperCase()}${w.slice(1)}`), // unclosed uppercase
  phrase.map((p) => `<${p}>`), // closed but prose-like
);

export const wrappedDangerous = fc
  .tuple(fc.constantFrom(['*', '*'], ['**', '**'], ['~~', '~~'], ['`', '`']), dangerousInline)
  .map(([[open, close], inner]) => `${open}${inner}${close}`);

export const mixedInlineDangerous = fc
  .array(
    fc.oneof(
      { weight: 2, arbitrary: fc.oneof(phrase, bold, italic, inlineCode, link) },
      { weight: 1, arbitrary: dangerousInline },
      { weight: 1, arbitrary: wrappedDangerous },
    ),
    { minLength: 2, maxLength: 5 },
  )
  .map((parts) => parts.join(' '));

export const containerWithDangerous = fc
  .tuple(
    fc.constantFrom('> ', '- ', '1. '),
    fc.array(fc.oneof(dangerousInline, wrappedDangerous, phrase), { minLength: 1, maxLength: 3 }),
  )
  .map(([prefix, parts]) => parts.map((p) => `${prefix}${p}`).join('\n'));

export const truncatedConstruct = fc.oneof(
  fc
    .tuple(
      safeWord.map((n) => n.charAt(0).toUpperCase() + n.slice(1)),
      phrase,
    )
    .map(([name, body]) => `<${name}>${body}`),
  fc
    .constantFrom('js', 'ts', 'python')
    .chain((lang) => phrase.map((code) => `\`\`\`${lang}\n${code}`)),
  safeWord.chain((name) => phrase.map((body) => `:::${name}\n${body}`)),
  phrase.map((text) => `[${text}](https://`),
  safeWord.map((page) => `[[${page}`),
  phrase.map((body) => `---\ntitle: test\n\n${body}`),
  phrase.map((text) => `**${text}`),
  phrase.map((text) => `*${text}`),
);

export const mdxWithDangerousContent = fc
  .tuple(
    safeWord.map((n) => n.charAt(0).toUpperCase() + n.slice(1)),
    fc.array(fc.oneof(dangerousInline, phrase, bold, autolink, wikiLink), {
      minLength: 1,
      maxLength: 3,
    }),
  )
  .map(([name, parts]) => `<${name}>\n\n${parts.join(' ')}\n\n</${name}>`);

export const interleavedDoc = fc
  .array(
    fc.oneof(
      { weight: 2, arbitrary: block },
      { weight: 1, arbitrary: truncatedConstruct },
      { weight: 1, arbitrary: containerWithDangerous },
      { weight: 1, arbitrary: mixedInlineDangerous },
      { weight: 1, arbitrary: mdxWithDangerousContent },
    ),
    { minLength: 2, maxLength: 6 },
  )
  .map((blocks) => blocks.join('\n\n'));

export const deeplyNested = fc
  .tuple(dangerousInline, phrase, dangerousInline)
  .map(([d1, text, d2]) => `> - **${text} ${d1}**\n> - *${d2} ${text}*`);
