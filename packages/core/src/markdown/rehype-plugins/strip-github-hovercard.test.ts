import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripGithubHovercard } from './strip-github-hovercard.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripGithubHovercard', () => {
  test('drops data-hovercard-* attrs from the resulting mdast', () => {
    const html = fixture('github-comment-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGithubHovercard],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('hovercard-type');
    expect(serialized).not.toContain('dataHovercard');
  });

  test('strips commit-link / user-mention / issue-link classes', () => {
    const html = fixture('github-comment-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGithubHovercard],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).not.toContain('commit-link');
    expect(serialized).not.toContain('user-mention');
    expect(serialized).not.toContain('issue-link');
  });

  test('preserves anchor href and visible text', () => {
    const html = fixture('github-comment-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripGithubHovercard],
    });
    const serialized = JSON.stringify(mdast);
    expect(serialized).toContain('github.com/owner/repo/commit/abc123def456');
    expect(serialized).toContain('abc123');
    expect(serialized).toContain('@nickgomez');
    expect(serialized).toContain('#42');
  });

  test('plain HTML without hovercard attrs passes through unchanged', () => {
    const before = htmlToMdast('<p>plain</p>');
    const after = htmlToMdast('<p>plain</p>', {
      additionalCleanupPlugins: [rehypeStripGithubHovercard],
    });
    expect(after).toEqual(before);
  });
});
