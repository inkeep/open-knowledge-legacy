/**
 * Tests for doc-start thematic fix transformer.
 *
 * Validates that `---\n\n---` (empty YAML frontmatter at doc start) is
 * converted to thematicBreak nodes, and that real frontmatter is untouched.
 */
import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function findNodeType(json: JSONContent, type: string): boolean {
  if (json.type === type) return true;
  for (const child of json.content ?? []) {
    if (findNodeType(child, type)) return true;
  }
  return false;
}

describe('doc-start-thematic-fix: empty yaml → thematicBreak', () => {
  test('---\\n\\n--- (empty yaml) produces thematicBreak PM nodes', () => {
    const json = mdManager.parse('---\n\n---');
    // Should have thematicBreak nodes (not empty doc or yaml)
    expect(findNodeType(json, 'thematicBreak')).toBe(true);
  });

  test('---\\n--- (empty yaml, no blank) produces thematicBreak PM nodes', () => {
    const json = mdManager.parse('---\n---');
    expect(findNodeType(json, 'thematicBreak')).toBe(true);
  });

  test('empty yaml round-trip is idempotent', () => {
    const r1 = roundTrip('---\n\n---');
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });
});

describe('doc-start-thematic-fix: real frontmatter is untouched', () => {
  test('yaml with content stays as yaml (ignored by PM → empty doc with paragraph)', () => {
    // Real frontmatter: yaml.value.trim() !== '' → transformer skips
    const json = mdManager.parse('---\ntitle: x\n---\n\nbody\n');
    // PM doc should have a paragraph with "body" (yaml filtered to Y.Map)
    const hasBody = JSON.stringify(json).includes('body');
    expect(hasBody).toBe(true);
  });

  test('real frontmatter + body round-trips without frontmatter (stripped by PM layer)', () => {
    // Note: outside observer sync, frontmatter is NOT preserved (Y.Map path handles it)
    // Direct mdManager.parse strips yaml → body only
    const r = roundTrip('---\ntitle: x\n---\n\nbody\n');
    expect(r.trim()).toBe('body');
  });
});

describe('doc-start-thematic-fix: unclosed --- fallback', () => {
  test('single --- (unclosed) is already thematicBreak by remark-frontmatter', () => {
    const json = mdManager.parse('---\n');
    // remark-frontmatter doesn't claim unclosed --- → already thematicBreak
    expect(findNodeType(json, 'thematicBreak')).toBe(true);
  });

  test('--- followed by content (no closing ---) round-trips with NG10 normalization', () => {
    // Note: NG10 serialize-side normalizes doc-start --- to ***
    const r1 = roundTrip('---\n\ntext\n');
    expect(r1).toContain('***');
    expect(r1).toContain('text');
    // Idempotent from round 2
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });
});
