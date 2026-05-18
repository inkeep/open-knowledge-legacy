import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { getParseHealth, resetParseHealth } from '@inkeep/open-knowledge-core';
import { onPillRenderError } from './SidebarSearchBar';
import SRC from './SidebarSearchBar?raw';

describe('SidebarSearchBar module', () => {
  test('exports the SidebarSearchBar component', async () => {
    const mod = await import('./SidebarSearchBar');
    expect(typeof mod.SidebarSearchBar).toBe('function');
  });

  test('exports onPillRenderError as a named function', async () => {
    const mod = await import('./SidebarSearchBar');
    expect(typeof mod.onPillRenderError).toBe('function');
  });
});

describe('onPillRenderError — Pattern C runtime observability emission', () => {
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    resetParseHealth();
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('emits structured jsx-render-failure event with sidebarSearchPill surface label', () => {
    onPillRenderError(new Error('boom'), { componentStack: '\n  at SidebarSearchBar' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'jsx-render-failure',
        component: 'sidebarSearchPill',
        rawComponentName: 'sidebarSearchPill',
        error: 'Error: boom',
        stack: '\n  at SidebarSearchBar',
      }),
    );
  });

  test('increments the parse-health counter for sidebarSearchPill', () => {
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBeUndefined();
    onPillRenderError(new Error('first'), { componentStack: '\n  at SidebarSearchBar' });
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBe(1);
    onPillRenderError(new Error('second'), { componentStack: '\n  at SidebarSearchBar' });
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBe(2);
  });

  test('normalizes non-Error throws via String(err) — react-error-boundary types error as unknown', () => {
    onPillRenderError('plain string throw', { componentStack: '\n  at SidebarSearchBar' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(payload.error).toBe('Error: plain string throw');
  });

  test('carries componentStack through to the stack field', () => {
    onPillRenderError(new Error('x'), {
      componentStack: '\n  at SidebarSearchBar\n  at FileSidebar',
    });

    const payload = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(payload.stack).toBe('\n  at SidebarSearchBar\n  at FileSidebar');
  });
});

describe('SidebarSearchBar source-level guards', () => {
  test('imports Button from \'@/components/ui/button\' and uses variant="outline"', () => {
    expect(SRC).toMatch(/import\s*\{\s*Button\s*\}\s*from\s*['"]@\/components\/ui\/button['"]/);
    expect(SRC).toMatch(/variant=['"]outline['"]/);
  });

  test('composition pins every visual class in the locked contract', () => {
    expect(SRC).toContain('rounded-lg');
    expect(SRC).toContain('h-9');
    expect(SRC).toContain('w-full');
    expect(SRC).toContain('justify-start');
    expect(SRC).toContain('gap-2');
    expect(SRC).toContain('px-3');
    expect(SRC).toContain('font-normal');
    expect(SRC).toContain('text-muted-foreground');
  });

  test("imports the Search icon from 'lucide-react' and renders it as decorative (aria-hidden)", () => {
    expect(SRC).toMatch(/import\s*\{\s*Search\s*\}\s*from\s*['"]lucide-react['"]/);
    expect(SRC).toMatch(/<Search\s+aria-hidden=['"]true['"]\s*\/>/);
  });

  test('renders the visible Search label with flex-1 text-left text-sm spans', () => {
    expect(SRC).toMatch(/<span\s+className=['"]flex-1\s+text-left\s+text-sm['"]>Search<\/span>/);
  });

  test('button carries the stable telemetry selector value', () => {
    expect(SRC).toMatch(/data-telemetry-event=['"]ok\.sidebar\.search_pill\.click['"]/);
  });

  test('does NOT add aria-label to the button (visible label is the accessible name)', () => {
    expect(SRC).not.toMatch(/aria-label=['"]/);
  });

  test('does NOT import useCallback / useMemo / memo / forwardRef from react', () => {
    expect(SRC).not.toMatch(/import\s*\{[^}]*\buseCallback\b[^}]*\}\s*from\s*['"]react['"]/);
    expect(SRC).not.toMatch(/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['"]react['"]/);
    expect(SRC).not.toMatch(/import\s*\{[^}]*\bmemo\b[^}]*\}\s*from\s*['"]react['"]/);
    expect(SRC).not.toMatch(/import\s*\{[^}]*\bforwardRef\b[^}]*\}\s*from\s*['"]react['"]/);
  });

  test('does NOT import @testing-library/react (repo convention)', () => {
    expect(SRC).not.toMatch(/@testing-library\/react/);
  });
});
