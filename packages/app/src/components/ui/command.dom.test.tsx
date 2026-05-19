import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { CommandDialog, CommandInput, CommandList } from './command';

type WindowGlobals = {
  MutationObserver?: typeof MutationObserver;
  NodeFilter?: typeof NodeFilter;
};
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & {
    window?: WindowGlobals;
    ResizeObserver?: unknown;
  };
const globalWithDomShims = globalThis as GlobalWithDomShims;
if (
  globalWithDomShims.MutationObserver === undefined &&
  globalWithDomShims.window?.MutationObserver !== undefined
) {
  globalWithDomShims.MutationObserver = globalWithDomShims.window.MutationObserver;
}
if (
  globalWithDomShims.NodeFilter === undefined &&
  globalWithDomShims.window?.NodeFilter !== undefined
) {
  globalWithDomShims.NodeFilter = globalWithDomShims.window.NodeFilter;
}
if (globalWithDomShims.ResizeObserver === undefined) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalWithDomShims.ResizeObserver = NoopResizeObserver;
}

afterEach(() => {
  cleanup();
});

const KEYFRAME_CLASSES = [
  'animate-in',
  'fade-in-0',
  'zoom-in-95',
  'animate-out',
  'fade-out-0',
  'zoom-out-95',
] as const;

const SNAPPY_TOKENS = [
  'transition-[opacity,scale]',
  'transition-opacity',
  'ease-(--ease-out-strong)',
  'starting:opacity-0',
  'starting:scale-95',
  'data-closed:duration-0',
] as const;

function renderPalette() {
  return render(
    <CommandDialog open={true}>
      <CommandInput placeholder="search" />
      <CommandList />
    </CommandDialog>,
  );
}

describe('CommandDialog inherits DialogContent upstream keyframe motion', () => {
  test('content carries the animate/fade/zoom keyframe classes', () => {
    renderPalette();
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
    const cls = content?.className ?? '';
    for (const keyframeClass of KEYFRAME_CLASSES) {
      expect(cls).toContain(keyframeClass);
    }
  });

  test('overlay carries animate-in/animate-out and the fade siblings', () => {
    renderPalette();
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    const cls = overlay?.className ?? '';
    expect(cls).toContain('animate-in');
    expect(cls).toContain('animate-out');
    expect(cls).toContain('fade-in-0');
    expect(cls).toContain('fade-out-0');
  });

  test('the pruned snappy transition tier is absent from the rendered palette', () => {
    renderPalette();
    const contentCls = document.querySelector('[data-slot="dialog-content"]')?.className ?? '';
    const overlayCls = document.querySelector('[data-slot="dialog-overlay"]')?.className ?? '';
    for (const token of SNAPPY_TOKENS) {
      expect(contentCls).not.toContain(token);
      expect(overlayCls).not.toContain(token);
    }
  });
});

describe('CommandDialog is top-anchored (inline className override)', () => {
  test('rendered content anchors near the top, not viewport-center', () => {
    renderPalette();
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
    const cls = content?.className ?? '';
    expect(cls).toContain('top-[12vh]');
    expect(cls).toContain('translate-y-0');
    expect(cls).not.toContain('top-1/2');
    expect(cls).not.toContain('-translate-y-1/2');
    expect(cls).toContain('left-1/2');
    expect(cls).toContain('-translate-x-1/2');
  });
});
