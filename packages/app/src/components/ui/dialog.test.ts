import { describe, expect, test } from 'bun:test';
import GLOBALS from '../../globals.css?raw';
import SRC from './dialog?raw';

const A11Y_OPT_IN =
  'motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none motion-reduce:duration-0';

const SNAPPY_TOKENS = [
  'transition-[opacity,scale]',
  'transition-opacity',
  'ease-(--ease-out-strong)',
  'starting:opacity-0',
  'starting:scale-95',
  'data-closed:duration-0',
] as const;

function classNameLiteral(slot: string): string {
  const m = SRC.match(new RegExp(`data-slot="${slot}"[\\s\\S]*?cn\\(\\s*'([^']*)'`));
  return m?.[1] ?? '';
}

describe('Dialog module', () => {
  test('exports the full Dialog API surface', async () => {
    const mod = await import('./dialog');
    for (const name of [
      'Dialog',
      'DialogBody',
      'DialogClose',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogOverlay',
      'DialogPortal',
      'DialogTitle',
      'DialogTrigger',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('Dialog Electron drag-region opt-out', () => {
  test('DialogContent carries [-webkit-app-region:no-drag]', () => {
    expect(SRC).toContain('[-webkit-app-region:no-drag]');
    const occurrences = SRC.match(/\[-webkit-app-region:no-drag\]/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Dialog upstream keyframe motion', () => {
  test('DialogOverlay uses the upstream duration-100 fade block', () => {
    const overlay = classNameLiteral('dialog-overlay');
    expect(overlay).not.toBe('');
    expect(overlay).toContain('duration-100');
    expect(overlay).toContain('data-open:animate-in');
    expect(overlay).toContain('data-open:fade-in-0');
    expect(overlay).toContain('data-closed:animate-out');
    expect(overlay).toContain('data-closed:fade-out-0');
  });

  test('DialogContent uses the upstream duration-100 zoom/fade block', () => {
    const content = classNameLiteral('dialog-content');
    expect(content).not.toBe('');
    expect(content).toContain('duration-100');
    expect(content).toContain('data-open:animate-in');
    expect(content).toContain('data-open:fade-in-0');
    expect(content).toContain('data-open:zoom-in-95');
    expect(content).toContain('data-closed:animate-out');
    expect(content).toContain('data-closed:fade-out-0');
    expect(content).toContain('data-closed:zoom-out-95');
  });

  test('DialogContent zooms from center — no slide motion', () => {
    expect(classNameLiteral('dialog-content')).not.toContain('slide-in-from');
  });

  test('overlay and content both carry the motion-reduce a11y opt-in', () => {
    expect(classNameLiteral('dialog-overlay')).toContain(A11Y_OPT_IN);
    expect(classNameLiteral('dialog-content')).toContain(A11Y_OPT_IN);
  });
});

describe('Dialog viewport centering', () => {
  test('DialogContent is unconditionally centered on both axes', () => {
    const content = classNameLiteral('dialog-content');
    expect(content).toContain('top-1/2');
    expect(content).toContain('-translate-y-1/2');
    expect(content).toContain('left-1/2');
    expect(content).toContain('-translate-x-1/2');
    expect(content).toContain('max-h-[calc(100dvh-2rem)]');
  });
});

describe('Dialog has no snappy tier or transition/placement props', () => {
  test('the snappy transition tier cannot silently return', () => {
    for (const token of SNAPPY_TOKENS) {
      expect(SRC).not.toContain(token);
    }
  });

  test('the transition and placement props are gone', () => {
    expect(SRC).not.toMatch(/transition\?:/);
    expect(SRC).not.toMatch(/placement\?:/);
    expect(SRC).not.toMatch(/transition\s*===/);
    expect(SRC).not.toMatch(/placement\s*===/);
    expect(SRC).not.toMatch(/<DialogOverlay\s+transition=/);
  });
});

describe('Dialog/Sheet reduced-transparency baseline (globals.css)', () => {
  test('a prefers-reduced-transparency block strips backdrop-filter from both overlays', () => {
    const block = GLOBALS.match(
      /@media \(prefers-reduced-transparency: reduce\) \{[^}]*\[data-slot="dialog-overlay"\][\s\S]*?\}\s*\}/,
    );
    expect(block).not.toBeNull();
    const blockText = block?.[0] ?? '';
    expect(blockText).toContain('[data-slot="dialog-overlay"]');
    expect(blockText).toContain('[data-slot="sheet-overlay"]');
    expect(blockText).toContain('backdrop-filter: none');
    expect(blockText).toContain('-webkit-backdrop-filter: none');
  });

  test('the electron outer-canvas reduced-transparency block is left intact', () => {
    expect(GLOBALS).toContain('html.electron-mode [data-slot="sidebar-wrapper"]');
  });
});
