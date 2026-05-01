import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';
import { mdx } from 'micromark-extension-mdx';
import type { Processor } from 'unified';

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
