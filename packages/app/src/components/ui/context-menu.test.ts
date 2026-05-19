import { describe, expect, test } from 'bun:test';
import SRC from './context-menu?raw';

const A11Y_OPT_IN =
  'motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none motion-reduce:duration-0';

const UPSTREAM_MOTION_TOKENS = [
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
] as const;

const SNAPPY_TOKENS = [
  'transition-[opacity,scale]',
  'ease-(--ease-out-strong)',
  'starting:opacity-0',
  'starting:scale-95',
  'data-closed:duration-0',
  'FORKED FROM radix-nova',
] as const;

function contentClassName(slot: string): string {
  const m = SRC.match(new RegExp(`data-slot="${slot}"[\\s\\S]*?'([^']*)'`));
  expect(m).not.toBeNull();
  return m?.[1] ?? '';
}

describe('ContextMenu module', () => {
  test('exports the full ContextMenu API surface', async () => {
    const mod = await import('./context-menu');
    for (const name of [
      'ContextMenu',
      'ContextMenuCheckboxItem',
      'ContextMenuContent',
      'ContextMenuGroup',
      'ContextMenuItem',
      'ContextMenuLabel',
      'ContextMenuPortal',
      'ContextMenuRadioGroup',
      'ContextMenuRadioItem',
      'ContextMenuSeparator',
      'ContextMenuShortcut',
      'ContextMenuSub',
      'ContextMenuSubContent',
      'ContextMenuSubTrigger',
      'ContextMenuTrigger',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('ContextMenu upstream overlay motion', () => {
  for (const slot of ['context-menu-content', 'context-menu-sub-content']) {
    test(`${slot} carries the upstream keyframe motion block`, () => {
      const cls = contentClassName(slot);
      for (const token of UPSTREAM_MOTION_TOKENS) {
        expect(cls).toContain(token);
      }
    });

    test(`${slot} carries the reduced-motion a11y opt-in`, () => {
      expect(contentClassName(slot)).toContain(A11Y_OPT_IN);
    });

    test(`${slot} pivots the scale from the trigger origin`, () => {
      expect(contentClassName(slot)).toContain(
        'origin-(--radix-context-menu-content-transform-origin)',
      );
    });
  }

  test('ContextMenuSubTrigger retains its data-open: open-state highlight', () => {
    expect(SRC).toContain('data-open:bg-accent');
    expect(SRC).toContain('data-open:text-accent-foreground');
  });

  test('the snappy transition tier cannot silently return', () => {
    for (const token of SNAPPY_TOKENS) {
      expect(SRC).not.toContain(token);
    }
  });

  test('no long-form data-[state] animation/highlight drift', () => {
    expect(SRC).not.toMatch(/data-\[state=(?:open|closed)\]:(?:animate|fade|zoom|slide|bg|text)/);
  });
});
