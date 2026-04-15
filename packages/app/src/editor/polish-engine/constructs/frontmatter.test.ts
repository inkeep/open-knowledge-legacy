/**
 * Frontmatter customDetect unit tests — validates regex-based
 * YAML frontmatter detection at document start.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { frontmatterConstruct } from './frontmatter';

function detect(content: string) {
  const state = EditorState.create({ doc: content });
  return frontmatterConstruct.customDetect?.(state);
}

describe('frontmatter detection', () => {
  test('detects valid frontmatter at doc start', () => {
    const ranges = detect('---\ntitle: Hello\n---\n\nBody text');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(0);
    // to should be end of closing --- line
    const closingLine = '---\ntitle: Hello\n---';
    expect(ranges[0].to).toBe(closingLine.length);
  });

  test('returns empty for doc without frontmatter', () => {
    const ranges = detect('# Hello\n\nBody text');
    expect(ranges).toHaveLength(0);
  });

  test('returns empty for doc starting with non-frontmatter', () => {
    const ranges = detect('Hello world\n---\nfoo: bar\n---');
    expect(ranges).toHaveLength(0);
  });

  test('returns empty for doc with only opening fence', () => {
    const ranges = detect('---\ntitle: Hello\nNo closing fence');
    expect(ranges).toHaveLength(0);
  });

  test('returns empty for single-line doc', () => {
    const ranges = detect('---');
    expect(ranges).toHaveLength(0);
  });

  test('detects frontmatter with trailing whitespace on fences', () => {
    const ranges = detect('---  \ntitle: Test\n---  \n\nBody');
    expect(ranges).toHaveLength(1);
  });

  test('returns empty for empty document', () => {
    const ranges = detect('');
    expect(ranges).toHaveLength(0);
  });

  test('detects minimal frontmatter (empty body)', () => {
    const ranges = detect('---\n---');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(0);
  });
});
