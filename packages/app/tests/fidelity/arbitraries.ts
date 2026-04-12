/**
 * fast-check arbitraries for structured markdown generation.
 *
 * Generates syntactically valid markdown constructs for PBT invariant tests.
 * Each generator produces markdown strings that should survive round-trip.
 */

import * as fc from 'fast-check';

// ─── Atoms ───

/** Plain text: alphanumeric words (no markdown-special chars). */
const safeWord = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
  { minLength: 1, maxLength: 12 },
);

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

/** Fenced code block. */
export const codeBlock = fc
  .tuple(
    fc.constantFrom('', 'js', 'typescript', 'python', 'markdown'),
    fc.array(safeWord, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(' = ')),
  )
  .map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``);

/** Blockquote. */
export const blockquote = phrase.map((text) => `> ${text}`);

/** Bullet list (2-4 items). */
export const bulletList = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item) => `- ${item}`).join('\n'));

/** Ordered list (2-4 items). */
export const orderedList = fc
  .array(phrase, { minLength: 2, maxLength: 4 })
  .map((items) => items.map((item, i) => `${i + 1}. ${item}`).join('\n'));

/** Thematic break. */
export const thematicBreak = fc.constant('---');

// ─── Inline marks (R19) ───

/** Bold text. */
const bold = phrase.map((text) => `**${text}**`);

/** Italic text. */
const italic = phrase.map((text) => `*${text}*`);

/** Inline code. */
const inlineCode = safeWord.map((text) => `\`${text}\``);

/** Link. */
const link = fc
  .tuple(phrase, safeWord)
  .map(([text, slug]) => `[${text}](https://example.com/${slug})`);

/** Inline content: text or marked text. */
const inlineContent = fc.oneof(phrase, bold, italic, inlineCode, link);

/** Paragraph with inline marks — tests mark boundary serialization (R19). */
export const paragraphWithMarks = fc
  .array(inlineContent, { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(' '));

/** Heading with inline marks. */
export const headingWithMarks = fc
  .tuple(fc.integer({ min: 1, max: 3 }), paragraphWithMarks)
  .map(([level, content]) => `${'#'.repeat(level)} ${content}`);

/** Blockquote with inline marks. */
export const blockquoteWithMarks = paragraphWithMarks.map((text) => `> ${text}`);

/** List item with inline marks. */
export const listWithMarks = fc
  .array(paragraphWithMarks, { minLength: 2, maxLength: 3 })
  .map((items) => items.map((item) => `- ${item}`).join('\n'));

// ─── Composite ───

/** Any supported block construct. */
export const block = fc.oneof(
  heading,
  paragraph,
  paragraphWithFidelityChars,
  codeBlock,
  blockquote,
  bulletList,
  orderedList,
  thematicBreak,
  paragraphWithMarks,
  headingWithMarks,
);

/** A complete markdown document (1-5 blocks separated by blank lines). */
export const markdownDoc = fc
  .array(block, { minLength: 1, maxLength: 5 })
  .map((blocks) => blocks.join('\n\n'));
