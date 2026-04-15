/**
 * Nested CodeMirror sync math tests (NCM02-NCM04, M15).
 *
 * Tests the `computeChange` function that computes minimal string diffs
 * for PM→CM and CM→PM synchronization.
 */

import { describe, expect, test } from 'bun:test';
import { computeChange } from './RawMdxFallbackCMView';

describe('computeChange', () => {
  test('returns null for identical strings', () => {
    expect(computeChange('hello', 'hello')).toBeNull();
  });

  test('returns null for empty identical strings', () => {
    expect(computeChange('', '')).toBeNull();
  });

  test('detects insert at end', () => {
    const change = computeChange('hello', 'hello world');
    expect(change).toEqual({ from: 5, to: 5, text: ' world' });
  });

  test('detects insert at beginning', () => {
    const change = computeChange('world', 'hello world');
    expect(change).toEqual({ from: 0, to: 0, text: 'hello ' });
  });

  test('detects insert in middle', () => {
    const change = computeChange('helloworld', 'hello world');
    expect(change).toEqual({ from: 5, to: 5, text: ' ' });
  });

  test('detects delete at end', () => {
    const change = computeChange('hello world', 'hello');
    expect(change).toEqual({ from: 5, to: 11, text: '' });
  });

  test('detects delete at beginning', () => {
    const change = computeChange('hello world', 'world');
    expect(change).toEqual({ from: 0, to: 6, text: '' });
  });

  test('detects delete in middle', () => {
    const change = computeChange('hello world', 'helloworld');
    expect(change).toEqual({ from: 5, to: 6, text: '' });
  });

  test('detects replacement', () => {
    const change = computeChange('hello world', 'hello there');
    expect(change).toEqual({ from: 6, to: 11, text: 'there' });
  });

  test('detects full replacement', () => {
    const change = computeChange('abc', 'xyz');
    expect(change).toEqual({ from: 0, to: 3, text: 'xyz' });
  });

  test('handles empty to non-empty', () => {
    const change = computeChange('', 'hello');
    expect(change).toEqual({ from: 0, to: 0, text: 'hello' });
  });

  test('handles non-empty to empty', () => {
    const change = computeChange('hello', '');
    expect(change).toEqual({ from: 0, to: 5, text: '' });
  });

  test('handles single character insert', () => {
    const change = computeChange('helo', 'hello');
    expect(change).toEqual({ from: 3, to: 3, text: 'l' });
  });

  test('handles single character delete', () => {
    const change = computeChange('hello', 'helo');
    expect(change).toEqual({ from: 3, to: 4, text: '' });
  });

  test('handles multiline content', () => {
    const old = '<Callout>\nfirst\n</Callout>';
    const neu = '<Callout>\nsecond\n</Callout>';
    const change = computeChange(old, neu);
    expect(change).toEqual({ from: 10, to: 15, text: 'second' });
  });

  // Loop prevention stress test (NCM04-inspired at unit level)
  test('1000 sequential computeChanges produce correct results', () => {
    let current = 'start';
    for (let i = 0; i < 1000; i++) {
      const next = `${current}${i}`;
      const change = computeChange(current, next);
      expect(change).not.toBeNull();
      // Apply the change to verify correctness
      const applied = current.slice(0, change?.from) + change?.text + current.slice(change?.to);
      expect(applied).toBe(next);
      current = next;
    }
  });
});
