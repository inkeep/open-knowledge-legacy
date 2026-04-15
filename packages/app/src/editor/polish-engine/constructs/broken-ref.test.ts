/**
 * Broken link-reference cross-scan unit tests — validates collect/check
 * algorithm, case-insensitive label matching, and edge cases.
 */

import { describe, expect, test } from 'bun:test';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { brokenLinkRefConstruct } from './broken-ref';

function createState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
}

function ensureTree(state: EditorState) {
  // Force the full tree to be available
  syntaxTree(state);
  return state;
}

describe('brokenLinkRefConstruct', () => {
  test('has correct config shape', () => {
    expect(brokenLinkRefConstruct.id).toBe('broken-link-ref');
    expect(brokenLinkRefConstruct.kind).toBe('cross-scan-mark');
    expect(brokenLinkRefConstruct.crossScan).toBeDefined();
    expect(brokenLinkRefConstruct.crossScan?.brokenClass).toBe('cm-link-ref-broken');
  });

  test('collect harvests definitions from LinkReference nodes', () => {
    const state = ensureTree(createState('[example]: https://example.com "Title"\n\nSome text'));
    const collected = brokenLinkRefConstruct.crossScan?.collect(state);
    expect(collected.has('example')).toBe(true);
  });

  test('collect uses case-insensitive labels', () => {
    const state = ensureTree(createState('[Example]: https://example.com\n\nSome text'));
    const collected = brokenLinkRefConstruct.crossScan?.collect(state);
    // Labels are lowercased
    expect(collected.has('example')).toBe(true);
  });

  test('collect returns empty map for doc with no definitions', () => {
    const state = ensureTree(createState('# Hello\n\nJust a paragraph'));
    const collected = brokenLinkRefConstruct.crossScan?.collect(state);
    expect(collected.size).toBe(0);
  });
});
