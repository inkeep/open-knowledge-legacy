import { describe, expect, test } from 'bun:test';
import SRC from './sheet?raw';

const OVERLAY_A11Y_OPT_IN =
  'motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none motion-reduce:duration-0';

const CONTENT_A11Y_OPT_IN =
  'motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none';

const CONTENT_SIDES = ['bottom', 'left', 'right', 'top'] as const;

const SNAPPY_TOKENS = [
  'transition-[opacity,scale]',
  'ease-(--ease-out-strong)',
  'starting:opacity-0',
  'starting:scale-95',
  'data-closed:duration-0',
  'FORKED FROM radix-nova',
] as const;

function classNameLiteral(slot: string): string {
  const match = SRC.match(new RegExp(`data-slot="${slot}"[\\s\\S]*?'([^']*)'`));
  if (!match) {
    throw new Error(`Could not extract className for data-slot="${slot}"`);
  }
  return match[1] ?? '';
}

describe('Sheet module', () => {
  test('exports the full Sheet API surface', async () => {
    const mod = await import('./sheet');
    for (const name of [
      'Sheet',
      'SheetClose',
      'SheetContent',
      'SheetDescription',
      'SheetFooter',
      'SheetHeader',
      'SheetTitle',
      'SheetTrigger',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('SheetOverlay upstream + a11y contract', () => {
  const overlay = classNameLiteral('sheet-overlay');

  test('uses upstream duration-100 symmetric fade keyframes', () => {
    expect(overlay).toContain('duration-100');
    expect(overlay).toContain('data-open:animate-in');
    expect(overlay).toContain('data-open:fade-in-0');
    expect(overlay).toContain('data-closed:animate-out');
    expect(overlay).toContain('data-closed:fade-out-0');
  });

  test('carries the a11y motion-reduce opt-in', () => {
    expect(overlay).toContain(OVERLAY_A11Y_OPT_IN);
  });
});

describe('SheetContent upstream + a11y contract', () => {
  const content = classNameLiteral('sheet-content');

  test('uses upstream hybrid transition duration-200 ease-in-out', () => {
    expect(content).toContain('transition duration-200 ease-in-out');
  });

  test('uses upstream open keyframe + slide-in-from on every side', () => {
    expect(content).toContain('data-open:animate-in');
    expect(content).toContain('data-open:fade-in-0');
    for (const side of CONTENT_SIDES) {
      expect(content).toContain(`data-[side=${side}]:data-open:slide-in-from-${side}-10`);
    }
  });

  test('uses upstream close keyframe + slide-out-to on every side', () => {
    expect(content).toContain('data-closed:animate-out');
    expect(content).toContain('data-closed:fade-out-0');
    for (const side of CONTENT_SIDES) {
      expect(content).toContain(`data-[side=${side}]:data-closed:slide-out-to-${side}-10`);
    }
  });

  test('carries the hybrid a11y motion-reduce opt-in', () => {
    expect(content).toContain(CONTENT_A11Y_OPT_IN);
  });
});

describe('Sheet snappy-tier negative-drift guard', () => {
  test.each(SNAPPY_TOKENS)('does not contain snappy token: %s', (token) => {
    expect(SRC).not.toContain(token);
  });
});
