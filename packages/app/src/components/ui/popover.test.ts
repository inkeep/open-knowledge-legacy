import { describe, expect, test } from 'bun:test';
import SRC from './popover?raw';

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

describe('Popover module', () => {
  test('exports the full Popover API surface', async () => {
    const mod = await import('./popover');
    for (const name of ['Popover', 'PopoverAnchor', 'PopoverContent', 'PopoverTrigger']) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('Popover upstream overlay motion', () => {
  test('PopoverContent carries the upstream keyframe motion block', () => {
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
    ]) {
      expect(SRC).toContain(token);
    }
  });

  test('the reduced-motion opt-in is present as the contiguous a11y contract', () => {
    expect(SRC).toContain(A11Y_OPT_IN);
  });

  test('scale pivots from the trigger origin', () => {
    expect(SRC).toContain('origin-(--radix-popover-content-transform-origin)');
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
