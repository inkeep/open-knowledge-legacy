/**
 * Tests for R23 autolink + void-HTML regression fix.
 *
 * Verifies that `<https://example.com>` and `<br>` parse without crashing
 * (the 2 regressions surfaced by R1 probe).
 */
import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

describe('R23: autolink regression fix', () => {
  test('autolink <https://example.com> parses without error', () => {
    expect(() => mdManager.parse('Visit <https://example.com>.\n')).not.toThrow();
  });

  test('autolink round-trips', () => {
    const md = 'Visit <https://example.com>.\n';
    const output = roundTrip(md);
    expect(output).toContain('https://example.com');
  });
});

describe('R23: void HTML regression fix', () => {
  test('<br> parses without error', () => {
    expect(() => mdManager.parse('Line one<br>Line two.\n')).not.toThrow();
  });

  test('<br> round-trips', () => {
    const md = 'Line one<br>Line two.\n';
    const output = roundTrip(md);
    expect(output).toContain('<br>');
  });

  test('<hr> parses without error', () => {
    expect(() => mdManager.parse('Above\n\n<hr>\n\nBelow\n')).not.toThrow();
  });

  test('<img> parses without error', () => {
    expect(() => mdManager.parse('<img src="photo.jpg">\n')).not.toThrow();
  });

  test('<br/> self-closing parses without error', () => {
    expect(() => mdManager.parse('Line<br/>break.\n')).not.toThrow();
  });
});
