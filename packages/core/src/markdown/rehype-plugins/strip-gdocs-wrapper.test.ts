import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripGdocsWrapper } from './strip-gdocs-wrapper.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripGdocsWrapper', () => {
  test('unwraps top-level <b id="docs-internal-guid-..."> container', () => {
    const html = fixture('gdocs-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGdocsWrapper],
    });
    const types = mdast.children.map((c) => c.type);
    expect(types).toContain('heading');
    expect(types).toContain('list');
  });

  test('preserves inner content: heading text and list items', () => {
    const html = fixture('gdocs-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGdocsWrapper],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('Meeting Notes');
    expect(serialized).toContain('First action item');
    expect(serialized).toContain('Second action item');
  });

  test('no docs-internal-guid token in the mdast tree', () => {
    const html = fixture('gdocs-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGdocsWrapper],
    });
    expect(JSON.stringify(mdast)).not.toContain('docs-internal-guid');
  });

  test('plain HTML (no wrapper) passes through unchanged', () => {
    const before = htmlToMdast('<p>just prose</p>');
    const after = htmlToMdast('<p>just prose</p>', {
      additionalCleanupPlugins: [rehypeStripGdocsWrapper],
    });
    expect(after).toEqual(before);
  });

  test('unwraps <div dir="ltr"> wrapper around a single <table>', () => {
    const html =
      '<div dir="ltr"><table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>';
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGdocsWrapper],
    });
    const topTypes = mdast.children.map((c) => c.type);
    expect(topTypes).toContain('table');
  });
});
