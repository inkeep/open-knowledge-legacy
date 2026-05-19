import { describe, expect, test } from 'bun:test';
import SRC from './tooltip?raw';

const UPSTREAM_MOTION_TOKENS = [
  'data-[side=bottom]:slide-in-from-top-2',
  'data-[side=left]:slide-in-from-right-2',
  'data-[side=right]:slide-in-from-left-2',
  'data-[side=top]:slide-in-from-bottom-2',
  'data-[state=delayed-open]:animate-in',
  'data-[state=delayed-open]:fade-in-0',
  'data-[state=delayed-open]:zoom-in-95',
  'data-open:animate-in',
  'data-open:fade-in-0',
  'data-open:zoom-in-95',
  'data-closed:animate-out',
  'data-closed:fade-out-0',
  'data-closed:zoom-out-95',
] as const;

const A11Y_OPT_IN_TOKENS = [
  'motion-reduce:data-open:animate-none',
  'motion-reduce:data-closed:animate-none',
  'motion-reduce:data-[state=delayed-open]:animate-none',
  'motion-reduce:duration-0',
] as const;

const SNAPPY_TOKENS = [
  'transition-[opacity,scale]',
  'ease-(--ease-out-strong)',
  'starting:opacity-0',
  'starting:scale-95',
  'data-closed:duration-0',
  'duration-100',
  'FORKED FROM radix-nova',
] as const;

describe('Tooltip module', () => {
  test('exports the full Tooltip API surface', async () => {
    const mod = await import('./tooltip');
    for (const name of ['Tooltip', 'TooltipContent', 'TooltipProvider', 'TooltipTrigger']) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('TooltipProvider delayDuration default', () => {
  test('defaults delayDuration to 0 so first hovers open without delay', () => {
    expect(SRC).toMatch(/function\s+TooltipProvider\s*\(\s*\{\s*[\s\S]*?delayDuration\s*=\s*0\b/);
    expect(SRC).toContain('delayDuration={delayDuration}');
  });
});

describe('Tooltip overlay motion', () => {
  test('TooltipContent carries every upstream keyframe utility', () => {
    for (const token of UPSTREAM_MOTION_TOKENS) {
      expect(SRC).toContain(token);
    }
  });

  test('TooltipContent carries the reduced-motion a11y opt-in', () => {
    for (const token of A11Y_OPT_IN_TOKENS) {
      expect(SRC).toContain(token);
    }
  });

  test('the zoom entrance pivots from the trigger origin', () => {
    expect(SRC).toContain('origin-(--radix-tooltip-content-transform-origin)');
  });

  test('no snappy transition tier drift', () => {
    for (const token of SNAPPY_TOKENS) {
      expect(SRC).not.toContain(token);
    }
  });
});
