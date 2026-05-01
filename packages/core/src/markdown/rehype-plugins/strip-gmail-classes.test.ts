
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripGmailClasses } from './strip-gmail-classes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripGmailClasses', () => {
  test('preserves user-visible content from a Gmail sample', () => {
    const html = fixture('gmail-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGmailClasses],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('Hi team');
    expect(serialized).toContain('summary for this week');
    expect(serialized).toContain('Shipped the paste pipeline');
  });

  test('strips gmail_* class names from the resulting mdast', () => {
    const html = fixture('gmail-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGmailClasses],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('gmail_default');
    expect(serialized).not.toContain('gmail_quote');
    expect(serialized).not.toContain('gmail_signature');
    expect(serialized).not.toContain('gmail_attr');
  });

  test('gmail_quote div becomes blockquote in mdast', () => {
    const html = '<div class="gmail_quote">quoted reply</div>';
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGmailClasses],
    });
    const types = mdast.children.map((c) => c.type);
    expect(types).toContain('blockquote');
  });

  test('plain HTML without gmail_* passes through unchanged', () => {
    const before = htmlToMdast('<p>plain prose</p>');
    const after = htmlToMdast('<p>plain prose</p>', {
      additionalCleanupPlugins: [rehypeStripGmailClasses],
    });
    expect(after).toEqual(before);
  });
});
