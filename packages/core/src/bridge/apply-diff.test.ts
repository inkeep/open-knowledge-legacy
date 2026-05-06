import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { applyFastDiff } from './apply-diff.ts';

function setup(initial: string): Y.Text {
  const doc = new Y.Doc();
  const ytext = doc.getText('test');
  if (initial) ytext.insert(0, initial);
  return ytext;
}

describe('applyFastDiff', () => {
  test('identity — no change when currentText === newText', () => {
    const ytext = setup('hello world');
    applyFastDiff(ytext, 'hello world', 'hello world');
    expect(ytext.toString()).toBe('hello world');
  });

  test('small middle replacement — outer prefix/suffix preserved', () => {
    const ytext = setup('hello cruel world');
    applyFastDiff(ytext, 'hello cruel world', 'hello kind world');
    expect(ytext.toString()).toBe('hello kind world');
  });

  test('pure append', () => {
    const ytext = setup('hello');
    applyFastDiff(ytext, 'hello', 'hello world');
    expect(ytext.toString()).toBe('hello world');
  });

  test('pure prepend', () => {
    const ytext = setup('world');
    applyFastDiff(ytext, 'world', 'hello world');
    expect(ytext.toString()).toBe('hello world');
  });

  test('empty to nonempty', () => {
    const ytext = setup('');
    applyFastDiff(ytext, '', 'hello');
    expect(ytext.toString()).toBe('hello');
  });

  test('nonempty to empty', () => {
    const ytext = setup('hello');
    applyFastDiff(ytext, 'hello', '');
    expect(ytext.toString()).toBe('');
  });

  describe('CPU DoS defense — large input fallback', () => {
    const LARGE_BYTES = 300 * 1024;

    test('large currentText → fallback still produces correct result', () => {
      const filler = 'a'.repeat(LARGE_BYTES);
      const current = `${filler}MIDDLE${filler}`;
      const next = `${filler}REPLACED${filler}`;
      const ytext = setup(current);
      const start = Date.now();
      applyFastDiff(ytext, current, next);
      const elapsed = Date.now() - start;
      expect(ytext.toString()).toBe(next);
      expect(elapsed).toBeLessThan(1000);
    });

    test('large newText → fallback still produces correct result', () => {
      const filler = 'b'.repeat(LARGE_BYTES);
      const current = 'small original';
      const next = `${filler}small original${filler}`;
      const ytext = setup(current);
      applyFastDiff(ytext, current, next);
      expect(ytext.toString()).toBe(next);
    });

    test('full wholesale replace at large size — no common prefix/suffix', () => {
      const current = 'a'.repeat(LARGE_BYTES);
      const next = 'b'.repeat(LARGE_BYTES);
      const ytext = setup(current);
      applyFastDiff(ytext, current, next);
      expect(ytext.toString()).toBe(next);
    });

    test('large input with full common prefix and suffix collapses to no-op middle', () => {
      const filler = 'c'.repeat(LARGE_BYTES);
      const ytext = setup(filler);
      applyFastDiff(ytext, filler, filler);
      expect(ytext.toString()).toBe(filler);
    });

    test('adversarial random middle stays bounded — no CPU pin', () => {
      const ONE_MIB = 1024 * 1024;
      let current = '';
      let next = '';
      for (let i = 0; i < ONE_MIB; i++) {
        current += String.fromCharCode(65 + (i % 26));
        next += String.fromCharCode(97 + ((i * 7) % 26));
      }
      const ytext = setup(current);
      const start = Date.now();
      applyFastDiff(ytext, current, next);
      const elapsed = Date.now() - start;
      expect(ytext.toString()).toBe(next);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
