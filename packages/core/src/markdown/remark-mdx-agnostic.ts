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
 *
 * R16 idempotency (spec 2026-04-16 markdown-pipeline-engineering-health):
 * the attacher pushes onto `this.data()` arrays. Under the cached-processor
 * pattern the attacher runs exactly once per processor (freeze is a one-shot
 * gate), but we defend against re-entry by capturing module-level singletons
 * of the extension values and skipping the push when the exact same singleton
 * is already present. Identity match (===) is the invariant: structurally
 * similar-but-fresh extensions would silently double-register.
 */
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';
import { mdx } from 'micromark-extension-mdx';
import type { Processor } from 'unified';

// Module-level singletons — identity-based dedup key.
const MICROMARK_EXT = mdx();
const FROM_MARKDOWN_EXT = mdxFromMarkdown();
const TO_MARKDOWN_EXT = mdxToMarkdown();

export function remarkMdxAgnostic(this: Processor): void {
  const data = this.data();

  if (!data.micromarkExtensions) data.micromarkExtensions = [];
  if (!data.fromMarkdownExtensions) data.fromMarkdownExtensions = [];
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = [];

  const micromarkExts = data.micromarkExtensions as unknown[];
  if (!micromarkExts.some((e) => e === MICROMARK_EXT)) {
    micromarkExts.push(MICROMARK_EXT);
  }

  const fromExts = data.fromMarkdownExtensions as unknown[][];
  if (!fromExts.some((e) => e === FROM_MARKDOWN_EXT)) {
    fromExts.push(FROM_MARKDOWN_EXT);
  }

  const toExts = data.toMarkdownExtensions as unknown[];
  if (!toExts.some((e) => e === TO_MARKDOWN_EXT)) {
    toExts.push(TO_MARKDOWN_EXT);
  }
}
