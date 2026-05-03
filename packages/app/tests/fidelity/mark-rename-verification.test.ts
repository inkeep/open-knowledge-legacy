import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import { mdRoundTrip, normalize } from './helpers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findMarkType(node: JSONContent, markType: string): boolean {
  if (node.marks?.some((m) => m.type === markType)) return true;
  for (const child of node.content ?? []) {
    if (findMarkType(child, markType)) return true;
  }
  return false;
}

function findNodeType(node: JSONContent, nodeType: string): boolean {
  if (node.type === nodeType) return true;
  for (const child of node.content ?? []) {
    if (findNodeType(child, nodeType)) return true;
  }
  return false;
}

describe('D16 mark renames — bold → strong, italic → emphasis', () => {
  test('**bold** produces PM mark named "strong"', () => {
    const json = mdManager.parse('**bold text**\n');
    expect(findMarkType(json, 'strong')).toBe(true);
    expect(findMarkType(json, 'bold')).toBe(false);
  });

  test('*emphasis* produces PM mark named "emphasis"', () => {
    const json = mdManager.parse('*emphasized text*\n');
    expect(findMarkType(json, 'emphasis')).toBe(true);
    expect(findMarkType(json, 'italic')).toBe(false);
  });

  test('__bold__ with underscores still produces "strong" mark', () => {
    const json = mdManager.parse('__bold text__\n');
    expect(findMarkType(json, 'strong')).toBe(true);
  });

  test('_emphasis_ with underscores still produces "emphasis" mark', () => {
    const json = mdManager.parse('_emphasized text_\n');
    expect(findMarkType(json, 'emphasis')).toBe(true);
  });
});

describe('D17 block renames — horizontalRule → thematicBreak', () => {
  test('--- produces PM node named "thematicBreak"', () => {
    const json = mdManager.parse('---\n');
    expect(findNodeType(json, 'thematicBreak')).toBe(true);
    expect(findNodeType(json, 'horizontalRule')).toBe(false);
  });

  test('*** produces PM node named "thematicBreak"', () => {
    const json = mdManager.parse('***\n');
    expect(findNodeType(json, 'thematicBreak')).toBe(true);
  });

  test('___ produces PM node named "thematicBreak"', () => {
    const json = mdManager.parse('___\n');
    expect(findNodeType(json, 'thematicBreak')).toBe(true);
  });
});

describe('renamed marks round-trip markdown correctly', () => {
  test('**bold** serializes back as **bold**', () => {
    expect(normalize(mdRoundTrip('**bold**\n'))).toBe(normalize('**bold**\n'));
  });

  test('*em* serializes back as *em*', () => {
    expect(normalize(mdRoundTrip('*em*\n'))).toBe(normalize('*em*\n'));
  });

  test('doc-start --- normalizes to *** (NG10)', () => {
    expect(normalize(mdRoundTrip('---\n'))).toBe(normalize('***\n'));
  });

  test('non-doc-start --- preserves authoring form', () => {
    expect(normalize(mdRoundTrip('paragraph\n\n---\n\nmore\n'))).toBe(
      normalize('paragraph\n\n---\n\nmore\n'),
    );
  });
});
