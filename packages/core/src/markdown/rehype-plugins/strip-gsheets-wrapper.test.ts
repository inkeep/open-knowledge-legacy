/**
 * Tests for rehypeStripGsheetsWrapper — unwraps Google Sheets clipboard HTML.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripGsheetsWrapper } from './strip-gsheets-wrapper.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripGsheetsWrapper', () => {
  test('unwraps <google-sheets-html-origin> and preserves the inner table', () => {
    const html = fixture('gsheets-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGsheetsWrapper],
    });
    const types = mdast.children.map((c) => c.type);
    expect(types).toContain('table');
  });

  test('drops data-sheets-* attributes from the mdast', () => {
    const html = fixture('gsheets-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGsheetsWrapper],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('data-sheets');
    expect(serialized).not.toContain('dataSheets');
  });

  test('preserves table cell values from the fixture', () => {
    const html = fixture('gsheets-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGsheetsWrapper],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('Name');
    expect(serialized).toContain('Role');
    expect(serialized).toContain('Nick');
    expect(serialized).toContain('CTO');
  });

  test('non-Gsheets HTML passes through unchanged', () => {
    const before = htmlToMdast('<p>plain</p>');
    const after = htmlToMdast('<p>plain</p>', {
      additionalCleanupPlugins: [rehypeStripGsheetsWrapper],
    });
    expect(after).toEqual(before);
  });
});
