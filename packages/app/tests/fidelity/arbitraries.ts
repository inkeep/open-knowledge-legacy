/**
 * fast-check arbitraries for structured markdown generation.
 *
 * Generates syntactically valid markdown constructs for PBT invariant tests.
 * Each generator produces markdown strings that should survive round-trip.
 */

import * as fc from 'fast-check';

// ─── Atoms ───

/** Plain text: alphanumeric words (no markdown-special chars). */
const safeWord = fc.stringMatching(/^[a-zA-Z0-9]{1,12}$/);

/** A phrase of 1-5 safe words. */
const phrase = fc.array(safeWord, { minLength: 1, maxLength: 5 }).map((words) => words.join(' '));

/** Text that includes fidelity-sensitive chars: & < > */
const fidelityText = fc.oneof(
  phrase.map((p) => `${p} & more`),
  phrase.map((p) => `${p} < less`),
  phrase.map((p) => `${p} > greater`),
  phrase.map((p) => `${p} & < >`),
);

// ─── Block constructs ───

/** ATX heading (levels 1-6). */
export const heading = fc
  .tuple(fc.integer({ min: 1, max: 6 }), phrase)
  .map(([level, text]) => `${'#'.repeat(level)} ${text}`);

/** Plain paragraph. */
export const paragraph = phrase;

/** Paragraph with fidelity-sensitive characters. */
export const paragraphWithFidelityChars = fidelityText;

/** Fenced code block (backtick). */
export const codeBlock = fc
  .tuple(
    fc.constantFrom('', 'js', 'typescript', 'python', 'markdown'),
    fc.array(safeWord, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(' = ')),
  )
  .map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``);

/** Fenced code block (tilde — non-default delimiter). */
export const codeBlockTilde = fc
  .tuple(
    fc.constantFrom('', 'js'),
    fc.array(safeWord, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(' = ')),
  )
  .map(([lang, body]) => `~~~${lang}\n${body}\n~~~`);

/** Blockquote. */
export const blockquote = phrase.map((text) => `> ${text}`);

/** Bullet list with default marker (-). */
export const bulletList = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `- ${item}`).join('\n'));

/** Bullet list with * marker (non-default). */
export const bulletListStar = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `* ${item}`).join('\n'));

/** Bullet list with + marker (non-default). */
export const bulletListPlus = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `+ ${item}`).join('\n'));

/** Ordered list with default delimiter (.). */
export const orderedList = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n'));

/** Ordered list with ) delimiter (non-default). */
export const orderedListParen = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item, i) => `${i + 1}) ${item}`).join('\n'));

/** Thematic break (default). */
const thematicBreak = fc.constant('---');

/** Thematic break with * (non-default). */
export const thematicBreakStar = fc.constant('***');

/** Thematic break with _ (non-default). */
export const thematicBreakUnderscore = fc.constant('___');

/** Setext heading level 1 (= underline). */
export const setextH1 = phrase.map((t) => `${t}\n${'='.repeat(Math.max(t.length, 3))}`);

/** Setext heading level 2 (- underline). */
export const setextH2 = phrase.map((t) => `${t}\n${'-'.repeat(Math.max(t.length, 3))}`);

/** Hard break with backslash. */
export const hardBreakBackslash = fc.tuple(phrase, phrase).map(([a, b]) => `${a}\\\n${b}`);

/** Hard break with two trailing spaces. */
export const hardBreakSpaces = fc.tuple(phrase, phrase).map(([a, b]) => `${a}  \n${b}`);

/** Raw HTML block. */
export const htmlBlock = fc.constantFrom(
  '<div>content</div>',
  '<details><summary>S</summary></details>',
);

/** Link reference definition. */
export const linkRefDef = fc.constantFrom(
  '[example]: https://example.com "Title"',
  '[ref]: https://example.com',
);

// ─── Inline marks (R19) ───

/** Bold text (default **). */
const bold = phrase.map((text) => `**${text}**`);

/** Bold text with underscore delimiter (non-default __). */
const boldUnderscore = phrase.map((text) => `__${text}__`);

/** Italic text (default *). */
const italic = phrase.map((text) => `*${text}*`);

/** Italic text with underscore delimiter (non-default _). */
const italicUnderscore = phrase.map((text) => `_${text}_`);

/** Inline code. */
const inlineCode = safeWord.map((text) => `\`${text}\``);

/** Link. */
const link = fc
  .tuple(phrase, safeWord)
  .map(([text, slug]) => `[${text}](https://example.com/${slug})`);

/** Inline content: text or marked text (includes non-default delimiters). */
const inlineContent = fc.oneof(
  phrase,
  bold,
  boldUnderscore,
  italic,
  italicUnderscore,
  inlineCode,
  link,
);

/** Paragraph with inline marks — tests mark boundary serialization (R19). */
export const paragraphWithMarks = fc
  .array(inlineContent, { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(' '));

/** Heading with inline marks. */
export const headingWithMarks = fc
  .tuple(fc.integer({ min: 1, max: 3 }), paragraphWithMarks)
  .map(([level, content]) => `${'#'.repeat(level)} ${content}`);

// ─── Composite ───

/** Any supported block construct (includes non-default delimiter forms). */
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

/** A complete markdown document (1-5 blocks separated by blank lines). */
export const markdownDoc = fc
  .array(block, { minLength: 1, maxLength: 5 })
  .map((blocks) => blocks.join('\n\n'));
