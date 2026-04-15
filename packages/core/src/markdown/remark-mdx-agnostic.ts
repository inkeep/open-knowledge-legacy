/**
 * remarkMdxAgnostic — remark plugin wrapping `micromark-extension-mdx` (agnostic
 * mode) instead of `micromark-extension-mdxjs` (strict mode with acorn).
 *
 * Agnostic mode parses JSX tags and balanced-brace expressions WITHOUT JavaScript
 * expression validation (no acorn). This eliminates 4 acorn-specific throw classes:
 *   - "Could not parse expression with acorn" on `{ noServer: true }` in prose
 *   - Labeled-statement rejection on object-literal expressions
 *   - Unexpected-character errors on `<50ms` / `<img>` patterns
 *   - ESM import/export validation (content re-parses as prose per NG1)
 *
 * See SPEC §9 R1, D1, D5.
 */
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';
import { mdx } from 'micromark-extension-mdx';
import type { Processor } from 'unified';

export function remarkMdxAgnostic(this: Processor): void {
  const data = this.data();

  if (!data.micromarkExtensions) data.micromarkExtensions = [];
  if (!data.fromMarkdownExtensions) data.fromMarkdownExtensions = [];
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = [];

  (data.micromarkExtensions as unknown[]).push(mdx());
  (data.fromMarkdownExtensions as unknown[][]).push(mdxFromMarkdown());
  (data.toMarkdownExtensions as unknown[]).push(mdxToMarkdown());
}
