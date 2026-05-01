import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripMsoStyles } from './strip-mso-styles.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripMsoStyles', () => {
  test('drops xmlns:o, xmlns:w, xmlns:m namespaced elements', () => {
    const html = fixture('word-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripMsoStyles],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('xmlns:o');
    expect(serialized).not.toContain('<o:');
    expect(serialized).not.toContain('<w:');
    expect(serialized).not.toContain('<m:');
  });

  test('strips MsoNormal and MsoListParagraph classes from surviving elements', () => {
    const html = fixture('word-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripMsoStyles],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('MsoNormal');
    expect(serialized).not.toContain('MsoListParagraph');
  });

  test('strips mso-* inline style values', () => {
    const html = fixture('word-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripMsoStyles],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('mso-');
  });

  test('preserves user-visible prose content', () => {
    const html = fixture('word-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripMsoStyles],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('Project Update');
    expect(serialized).toContain('Q2 deliverables');
    expect(serialized).toContain('Ship clipboard feature');
    expect(serialized).toContain('Write the docs');
  });

  test('plain HTML without mso-* passes through unchanged', () => {
    const before = htmlToMdast('<p>plain</p>');
    const after = htmlToMdast('<p>plain</p>', {
      additionalCleanupPlugins: [rehypeStripMsoStyles],
    });
    expect(after).toEqual(before);
  });
});
