import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { getParseHealth, resetParseHealth } from '@inkeep/open-knowledge-core';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';
import { onPillRenderError } from './SidebarSearchBar';

let shouldThrow = false;

function MaybeThrowPill({ label }: { label: string }) {
  if (shouldThrow) {
    throw new Error(`MaybeThrowPill boom: ${label}`);
  }
  return (
    <button type="button" data-testid="pill">
      {label}
    </button>
  );
}

describe('SidebarSearchBar ErrorBoundary (Tier-3 mount, QA-015)', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    shouldThrow = false;
    resetParseHealth();
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('renders child when no throw — baseline (no boundary fallback, no observability emission)', () => {
    render(
      <ErrorBoundary fallbackRender={() => null} onError={onPillRenderError}>
        <MaybeThrowPill label="Search" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('pill').textContent).toBe('Search');
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBeUndefined();
  });

  test('renders null fallback on child throw + onPillRenderError fires the structured emission', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary fallbackRender={() => null} onError={onPillRenderError}>
        <MaybeThrowPill label="Search" />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('pill')).toBeNull();
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBe(1);
    const sawStructuredEmission = consoleWarnSpy.mock.calls.some((call: unknown[]) => {
      const message = call[0];
      if (typeof message !== 'string') return false;
      try {
        const parsed = JSON.parse(message);
        return (
          parsed.event === 'jsx-render-failure' &&
          parsed.component === 'sidebarSearchPill' &&
          parsed.rawComponentName === 'sidebarSearchPill'
        );
      } catch {
        return false;
      }
    });
    expect(sawStructuredEmission).toBe(true);
  });

  test('sibling subtree outside the boundary stays mounted when the pill throws', () => {
    shouldThrow = true;
    render(
      <div>
        <ErrorBoundary fallbackRender={() => null} onError={onPillRenderError}>
          <MaybeThrowPill label="Search" />
        </ErrorBoundary>
        <div data-testid="sibling">FileTree + toolbar + ⌘K listener live here</div>
      </div>,
    );
    expect(screen.queryByTestId('pill')).toBeNull();
    expect(screen.getByTestId('sibling').textContent).toBe(
      'FileTree + toolbar + ⌘K listener live here',
    );
  });

  test('resetKeys flip after a throw remounts the child for a fresh render attempt', () => {
    shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary
        fallbackRender={() => null}
        onError={onPillRenderError}
        resetKeys={['expanded']}
      >
        <MaybeThrowPill label="Search" />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('pill')).toBeNull();
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBe(1);

    shouldThrow = false;
    rerender(
      <ErrorBoundary
        fallbackRender={() => null}
        onError={onPillRenderError}
        resetKeys={['collapsed']}
      >
        <MaybeThrowPill label="Search" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('pill').textContent).toBe('Search');
    expect(getParseHealth().jsxRenderFailure.sidebarSearchPill).toBe(1);
  });
});
