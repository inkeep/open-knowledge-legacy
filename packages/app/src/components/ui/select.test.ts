import { describe, expect, test } from 'bun:test';
import SRC from './select?raw';

const A11Y_OPT_IN =
  'motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none motion-reduce:duration-0';

const SNAPPY_TOKENS = [
  'transition-[opacity,scale]',
  'ease-(--ease-out-strong)',
  'starting:opacity-0',
  'starting:scale-95',
  'data-closed:duration-0',
  'FORKED FROM radix-nova',
] as const;

describe('Select module', () => {
  test('exports the full Select API surface', async () => {
    const mod = await import('./select');
    for (const name of [
      'Select',
      'SelectContent',
      'SelectGroup',
      'SelectItem',
      'SelectLabel',
      'SelectScrollDownButton',
      'SelectScrollUpButton',
      'SelectSeparator',
      'SelectTrigger',
      'SelectValue',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('Select upstream overlay motion', () => {
  test('SelectContent carries the upstream keyframe motion block', () => {
    for (const token of [
      'duration-100',
      'data-open:animate-in',
      'data-open:fade-in-0',
      'data-open:zoom-in-95',
      'data-closed:animate-out',
      'data-closed:fade-out-0',
      'data-closed:zoom-out-95',
      'data-[side=bottom]:slide-in-from-top-2',
      'data-[side=left]:slide-in-from-right-2',
      'data-[side=right]:slide-in-from-left-2',
      'data-[side=top]:slide-in-from-bottom-2',
      'data-[align-trigger=true]:animate-none',
    ]) {
      expect(SRC).toContain(token);
    }
  });

  test('the reduced-motion opt-in is present as the contiguous a11y contract', () => {
    expect(SRC).toContain(A11Y_OPT_IN);
  });

  test('scale pivots from the preserved trigger-origin radix var', () => {
    expect(SRC).toContain('origin-(--radix-select-content-transform-origin)');
  });

  test('the position==="popper" collision-offset cn-arg is preserved unchanged', () => {
    expect(SRC).toContain("position === 'popper' &&");
    expect(SRC).toContain('data-[side=bottom]:translate-y-1');
    expect(SRC).toContain('data-[side=left]:-translate-x-1');
    expect(SRC).toContain('data-[side=right]:translate-x-1');
    expect(SRC).toContain('data-[side=top]:-translate-y-1');
  });

  test('the snappy transition tier cannot silently return', () => {
    for (const token of SNAPPY_TOKENS) {
      expect(SRC).not.toContain(token);
    }
  });

  test('no long-form data-[state] animation drift', () => {
    expect(SRC).not.toMatch(/data-\[state=(?:open|closed)\]:(?:animate|fade|zoom|slide)/);
  });
});
