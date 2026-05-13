import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { useSelectionMirror } from './use-selection-mirror';

interface StubItem {
  getPath: () => string;
  isSelected: () => boolean;
  select: () => void;
  deselect: () => void;
  isExpanded: () => boolean;
  expand: () => void;
  focus: () => void;
  isDirectory: () => boolean;
}

interface StubModel {
  getItem: (path: string) => StubItem | null;
  getSelectedPaths: () => string[];
}

function makeStubModel(paths: string[]): StubModel {
  const items = new Map<string, StubItem>();
  for (const p of paths) {
    let selected = false;
    items.set(p, {
      getPath: () => p,
      isSelected: () => selected,
      select: () => {
        selected = true;
      },
      deselect: () => {
        selected = false;
      },
      isExpanded: () => false,
      expand: () => {},
      focus: () => {},
      isDirectory: () => false,
    });
  }
  return {
    getItem: (path: string) => items.get(path) ?? null,
    getSelectedPaths: () =>
      Array.from(items.entries())
        .filter(([, it]) => it.isSelected())
        .map(([p]) => p),
  };
}

function Harness({ initialPath, model }: { initialPath: string | null; model: StubModel }) {
  const [activeTreePath, setActiveTreePath] = useState<string | null>(initialPath);
  const suppressSelectionRef = useRef(false);

  useSelectionMirror(
    // biome-ignore lint/suspicious/noExplicitAny: Tier-3 stub for the test budget; production callers always pass real Pierre models.
    model as any,
    activeTreePath,
    '',
    suppressSelectionRef,
  );

  return (
    <>
      <button type="button" data-testid="set-A" onClick={() => setActiveTreePath('A.md')}>
        A
      </button>
      <button type="button" data-testid="set-B" onClick={() => setActiveTreePath('B.md')}>
        B
      </button>
      <button type="button" data-testid="set-null" onClick={() => setActiveTreePath(null)}>
        none
      </button>
      <span data-testid="selected">{model.getSelectedPaths().join(',')}</span>
    </>
  );
}

describe('FileTree selection-mirror (Tier-3 mount)', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  test('initial mount selects the active path', () => {
    const model = makeStubModel(['A.md', 'B.md', 'C.md']);
    render(<Harness initialPath="A.md" model={model} />);

    expect(model.getSelectedPaths()).toEqual(['A.md']);
  });

  test('userEvent.click → singleton-mirror invariant on activeTreePath switch', async () => {
    const model = makeStubModel(['A.md', 'B.md', 'C.md']);
    render(<Harness initialPath="A.md" model={model} />);

    expect(model.getSelectedPaths()).toEqual(['A.md']);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('set-B'));

    expect(model.getSelectedPaths()).toEqual(['B.md']);
  });

  test('clicking the null-button clears all selection', async () => {
    const model = makeStubModel(['A.md', 'B.md', 'C.md']);
    render(<Harness initialPath="A.md" model={model} />);

    expect(model.getSelectedPaths()).toEqual(['A.md']);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('set-null'));

    expect(model.getSelectedPaths()).toEqual([]);
  });

  test('non-empty activeAncestorTreePathsSignature expands every collapsed ancestor', () => {
    let parentExpanded = false;
    let parentExpandCallCount = 0;
    const items = new Map<string, StubItem>([
      [
        'parent/',
        {
          getPath: () => 'parent/',
          isSelected: () => false,
          select: () => {},
          deselect: () => {},
          isExpanded: () => parentExpanded,
          expand: () => {
            parentExpanded = true;
            parentExpandCallCount += 1;
          },
          focus: () => {},
          isDirectory: () => true,
        },
      ],
      [
        'parent/child.md',
        {
          getPath: () => 'parent/child.md',
          isSelected: () => false,
          select: () => {},
          deselect: () => {},
          isExpanded: () => false,
          expand: () => {},
          focus: () => {},
          isDirectory: () => false,
        },
      ],
    ]);
    const model: StubModel = {
      getItem: (path: string) => items.get(path) ?? null,
      getSelectedPaths: () => [],
    };
    function AncestorHarness() {
      const suppressSelectionRef = useRef(false);
      useSelectionMirror(
        // biome-ignore lint/suspicious/noExplicitAny: Tier-3 stub for the test budget; production callers always pass real Pierre models.
        model as any,
        'parent/child.md',
        'parent/',
        suppressSelectionRef,
      );
      return null;
    }
    render(<AncestorHarness />);

    expect(parentExpandCallCount).toBe(1);
    expect(parentExpanded).toBe(true);
  });

  test('unmount drains the queueMicrotask cleanup without React post-unmount warning', async () => {
    const model = makeStubModel(['A.md', 'B.md', 'C.md']);
    const { unmount } = render(<Harness initialPath="A.md" model={model} />);

    expect(model.getSelectedPaths()).toEqual(['A.md']);

    unmount();
    await Promise.resolve();
    await Promise.resolve();

    const sawPostUnmountWarning = consoleErrorSpy.mock.calls.some((call: unknown[]) => {
      const message = call[0];
      return typeof message === 'string' && /unmount(ed)? component/i.test(message);
    });
    expect(sawPostUnmountWarning).toBe(false);
  });
});
