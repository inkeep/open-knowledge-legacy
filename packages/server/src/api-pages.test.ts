/**
 * Tests for extractPageTitle — the title extraction logic used by GET /api/pages.
 *
 * Priority: frontmatter `title:` field → first `# heading` line → filename without extension.
 */
import { describe, expect, test } from 'bun:test';
import { extractPageTitle } from './api-extension.ts';

describe('extractPageTitle', () => {
  test('returns frontmatter title when present', () => {
    const content = '---\ntitle: My Great Page\nauthor: Alice\n---\n\n# Different Heading\n\nBody.';
    expect(extractPageTitle(content, 'my-great-page')).toBe('My Great Page');
  });

  test('trims whitespace from frontmatter title', () => {
    const content = '---\ntitle:   Trimmed Title   \n---\n\nBody.';
    expect(extractPageTitle(content, 'filename')).toBe('Trimmed Title');
  });

  test('falls through to first heading when frontmatter has no title', () => {
    const content = '---\nauthor: Bob\n---\n\n# First Heading\n\nBody.';
    expect(extractPageTitle(content, 'filename')).toBe('First Heading');
  });

  test('falls through to heading when no frontmatter', () => {
    const content = '# Just a Heading\n\nBody text here.';
    expect(extractPageTitle(content, 'filename')).toBe('Just a Heading');
  });

  test('falls through to filename when no frontmatter title and no heading', () => {
    const content = 'Just plain text with no heading.';
    expect(extractPageTitle(content, 'my-page')).toBe('my-page');
  });

  test('falls through to filename for empty file', () => {
    expect(extractPageTitle('', 'empty-doc')).toBe('empty-doc');
  });

  test('does not pick up title: in the body (outside frontmatter)', () => {
    const content = 'No frontmatter here.\n\ntitle: This is in the body.\n\n# Real Heading\n';
    expect(extractPageTitle(content, 'filename')).toBe('Real Heading');
  });

  test('handles frontmatter with no closing delimiter gracefully — falls to heading', () => {
    // Malformed frontmatter: no closing ---
    const content = '---\ntitle: Orphaned\n\n# Heading\n\nBody.';
    // No closing ---, so frontmatter is not recognized — falls to heading
    expect(extractPageTitle(content, 'filename')).toBe('Heading');
  });

  test('trims ## and deeper headings — only # heading used', () => {
    const content = '## Second Level\n\n### Third Level\n\nBody.';
    // No # heading, falls to filename
    expect(extractPageTitle(content, 'filename')).toBe('filename');
  });

  test('picks up # heading that follows frontmatter', () => {
    const content = '---\ndate: 2026-01-01\n---\n\n# Actual Title\n\nContent.';
    expect(extractPageTitle(content, 'filename')).toBe('Actual Title');
  });
});
