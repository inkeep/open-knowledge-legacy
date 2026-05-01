
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripSlackClasses } from './strip-slack-classes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripSlackClasses', () => {
  test('preserves message text content', () => {
    const html = fixture('slack-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripSlackClasses],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('ship the clipboard feature');
    expect(serialized).toContain('@nick');
    expect(serialized).toContain('thoughts');
  });

  test('strips c-message_kit__ / c-message__ / c-compose CSS classes', () => {
    const html = fixture('slack-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripSlackClasses],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('c-message_kit__');
    expect(serialized).not.toContain('c-message__');
    expect(serialized).not.toContain('c-compose');
  });

  test('drops c-timestamp spans so timestamps do not leak into content', () => {
    const html = fixture('slack-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripSlackClasses],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('11:24 AM');
    expect(serialized).not.toContain('c-timestamp');
  });

  test('plain HTML without Slack classes passes through unchanged', () => {
    const before = htmlToMdast('<p>plain</p>');
    const after = htmlToMdast('<p>plain</p>', {
      additionalCleanupPlugins: [rehypeStripSlackClasses],
    });
    expect(after).toEqual(before);
  });
});
