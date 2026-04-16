/**
 * Tests for rehypeStripCocoaMeta — removes macOS Cocoa HTML Writer noise.
 * Fixture fixtures/apple-notes-sample.html contains a captured paste from
 * Apple Notes with the Generator meta tag and Apple-tab-span /
 * Apple-converted-space spans.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripCocoaMeta } from './strip-cocoa-meta.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripCocoaMeta', () => {
  test('unwraps Apple-tab-span, preserving inner content', () => {
    const html = fixture('apple-notes-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripCocoaMeta],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('Apple-tab-span');
    expect(serialized).not.toContain('Apple-converted-space');
  });

  test('preserves user-visible text across stripped spans', () => {
    const html = fixture('apple-notes-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripCocoaMeta],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('Grocery list');
    expect(serialized).toContain('Milk');
    expect(serialized).toContain('1 gallon');
    expect(serialized).toContain('Bread');
    expect(serialized).toContain('Eggs');
  });

  test('preserves spans whose class set is NOT purely Apple-* (unit-level)', async () => {
    // Unit-level: run the plugin directly on a hast tree. (At the full
    // htmlToMdast level, rehype-remark itself drops span wrappers because
    // mdast has no inline-span equivalent — so the full-pipeline
    // assertion cannot distinguish "the plugin preserved it" from
    // "rehype-remark dropped it". Probe the plugin output directly.)
    const { unified } = await import('unified');
    const rehypeParse = (await import('rehype-parse')).default;
    const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeStripCocoaMeta);
    const html = '<p>prose <span class="Apple-tab-span custom-class">x</span> more</p>';
    const tree = processor.runSync(processor.parse(html));
    // Walk the tree looking for any span with the mixed class set intact.
    const serialized = JSON.stringify(tree);
    expect(serialized).toContain('Apple-tab-span');
    expect(serialized).toContain('custom-class');
  });

  test('plain HTML without Apple noise passes through unchanged', () => {
    const before = htmlToMdast('<p>plain prose</p>');
    const after = htmlToMdast('<p>plain prose</p>', {
      additionalCleanupPlugins: [rehypeStripCocoaMeta],
    });
    expect(after).toEqual(before);
  });
});
