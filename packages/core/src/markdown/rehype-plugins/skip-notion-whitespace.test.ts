/**
 * Tests for rehypeSkipNotionWhitespace — preserves Notion's literal-\n
 * hard breaks and strips the notionvc comment marker.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeSkipNotionWhitespace } from './skip-notion-whitespace.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeSkipNotionWhitespace', () => {
  test('detects notionvc marker and converts literal \\n to hard breaks', () => {
    const html = fixture('notion-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeSkipNotionWhitespace],
    });
    const serialized = JSON.stringify(mdast);
    // Hard breaks land as mdast `break` nodes.
    expect(serialized).toContain('"type":"break"');
  });

  test('drops the notionvc marker comment from the resulting tree', () => {
    const html = fixture('notion-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeSkipNotionWhitespace],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('notionvc');
  });

  test('preserves user-visible prose content', () => {
    const html = fixture('notion-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeSkipNotionWhitespace],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('Weekly notes');
    expect(serialized).toContain('This is line one');
    expect(serialized).toContain('Second paragraph');
  });

  test('non-Notion HTML (no marker) is untouched', () => {
    const before = htmlToMdast('<p>line1\nline2</p>');
    const after = htmlToMdast('<p>line1\nline2</p>', {
      additionalCleanupPlugins: [rehypeSkipNotionWhitespace],
    });
    // Without the Notion marker, the literal \n is unchanged; rehype-remark
    // collapses whitespace per normal — both trees are identical.
    expect(after).toEqual(before);
  });
});
