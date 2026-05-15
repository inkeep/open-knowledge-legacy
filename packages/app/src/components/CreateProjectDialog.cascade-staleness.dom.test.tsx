import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  OkDesktopBridge,
  OkFindEnclosingGitRootResult,
  OkFolderState,
} from '@/lib/desktop-bridge-types';
import { CreateProjectDialog } from './CreateProjectDialog';

type WindowGlobals = {
  NodeFilter?: typeof NodeFilter;
};
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & {
    window?: WindowGlobals;
    ResizeObserver?: unknown;
  };
const globalWithDomShims = globalThis as GlobalWithDomShims;
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

const ASYNC_TIMEOUT_MS = 2000;

const PARENT = '/Users/test/Projects';
const TARGET = `${PARENT}/Andrew Brain`;
const FIRST_GIT_RESULT: OkFindEnclosingGitRootResult = {
  gitRoot: '/Users/test',
  distance: 1,
};

interface ProgrammableBridgeStub {
  bridge: OkDesktopBridge;
  setEnclosingGitResult(result: OkFindEnclosingGitRootResult | null): void;
  setRemoveGitFolderImpl(impl: (gitRoot: string) => Promise<void>): void;
  setPickedPath(picked: string | null): void;
  readonly findGitCalls: ReadonlyArray<string>;
  readonly folderStateCalls: ReadonlyArray<string>;
  readonly removeGitCalls: ReadonlyArray<string>;
  readonly openFolderCalls: ReadonlyArray<number>;
}

function makeStubBridge(
  initialGit: OkFindEnclosingGitRootResult | null,
  initialPicked: string | null,
): ProgrammableBridgeStub {
  let currentGitResult: OkFindEnclosingGitRootResult | null = initialGit;
  let currentPicked: string | null = initialPicked;
  let removeGitImpl: (gitRoot: string) => Promise<void> = async () => undefined;
  const findGitCalls: string[] = [];
  const folderStateCalls: string[] = [];
  const removeGitCalls: string[] = [];
  const openFolderCalls: number[] = [];

  const bridge = {
    fs: {
      defaultProjectsRoot: async (): Promise<string> => PARENT,
      folderState: async (path: string): Promise<OkFolderState> => {
        folderStateCalls.push(path);
        return 'free';
      },
      findEnclosingProjectRoot: async (_path: string) => null,
      findEnclosingGitRoot: async (path: string) => {
        findGitCalls.push(path);
        return currentGitResult;
      },
      removeGitFolder: async (gitRoot: string) => {
        removeGitCalls.push(gitRoot);
        return removeGitImpl(gitRoot);
      },
    },
    dialog: {
      openFolder: async (): Promise<string | null> => {
        openFolderCalls.push(openFolderCalls.length + 1);
        return currentPicked;
      },
    },
    project: {
      recordCreateNewBannerShown: async () => undefined,
      createNew: async () => undefined,
      open: async () => undefined,
    },
  } as unknown as OkDesktopBridge;

  return {
    bridge,
    setEnclosingGitResult: (result) => {
      currentGitResult = result;
    },
    setRemoveGitFolderImpl: (impl) => {
      removeGitImpl = impl;
    },
    setPickedPath: (picked) => {
      currentPicked = picked;
    },
    findGitCalls,
    folderStateCalls,
    removeGitCalls,
    openFolderCalls,
  };
}

describe('CreateProjectDialog cascade staleness (Tier-3 mount)', () => {
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleWarnSpy.mockRestore();
  });

  test('S1: re-engaging Browse with the same target after an FS mutation produces a fresh probe', async () => {
    const stub = makeStubBridge(FIRST_GIT_RESULT, TARGET);
    render(<CreateProjectDialog open={true} onOpenChange={() => {}} bridge={stub.bridge} />);

    expect(screen.queryByTestId('create-name') !== null).toBe(false);

    const browse = (await screen.findByTestId('create-browse', undefined, {
      timeout: ASYNC_TIMEOUT_MS,
    })) as HTMLButtonElement;
    await waitFor(
      () => {
        expect(browse.disabled).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    fireEvent.click(browse);
    await waitFor(
      () => {
        expect(screen.queryByTestId('create-banner-git-confirm')).not.toBeNull();
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    stub.setEnclosingGitResult(null);

    const probesBeforeReBrowse = stub.findGitCalls.length;
    fireEvent.click(browse);

    await waitFor(
      () => {
        const delta = stub.findGitCalls.length - probesBeforeReBrowse;
        expect(delta).toBeGreaterThanOrEqual(1);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    await waitFor(
      () => {
        const stillShowingStaleBanner = screen.queryByTestId('create-banner-git-confirm') !== null;
        expect(stillShowingStaleBanner).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
  });

  test('S2: window focus event triggers a re-probe — banner clears when FS resolves while dialog stays open', async () => {
    const stub = makeStubBridge(FIRST_GIT_RESULT, TARGET);
    render(<CreateProjectDialog open={true} onOpenChange={() => {}} bridge={stub.bridge} />);

    expect(screen.queryByTestId('create-name') !== null).toBe(false);
    const browse = (await screen.findByTestId('create-browse', undefined, {
      timeout: ASYNC_TIMEOUT_MS,
    })) as HTMLButtonElement;
    await waitFor(
      () => {
        expect(browse.disabled).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    fireEvent.click(browse);
    await waitFor(
      () => {
        expect(screen.queryByTestId('create-banner-git-confirm')).not.toBeNull();
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    stub.setEnclosingGitResult(null);
    const callCountBeforeFocus = stub.findGitCalls.length;

    fireEvent(window, new Event('focus'));

    await waitFor(
      () => {
        const delta = stub.findGitCalls.length - callCountBeforeFocus;
        expect(delta).toBeGreaterThanOrEqual(1);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    await waitFor(
      () => {
        const stillShowing = screen.queryByTestId('create-banner-git-confirm') !== null;
        expect(stillShowing).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
  });

  test('S3: remove-.git button: confirm → IPC called → re-probe → banner clears (terminal case, no higher .git)', async () => {
    const stub = makeStubBridge(FIRST_GIT_RESULT, TARGET);
    stub.setRemoveGitFolderImpl(async () => {
      stub.setEnclosingGitResult(null);
    });

    render(<CreateProjectDialog open={true} onOpenChange={() => {}} bridge={stub.bridge} />);
    expect(screen.queryByTestId('create-name') !== null).toBe(false);
    const browse = (await screen.findByTestId('create-browse', undefined, {
      timeout: ASYNC_TIMEOUT_MS,
    })) as HTMLButtonElement;
    await waitFor(
      () => {
        expect(browse.disabled).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    fireEvent.click(browse);
    await waitFor(
      () => {
        expect(screen.queryByTestId('create-banner-git-confirm')).not.toBeNull();
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    fireEvent.click(screen.getByTestId('create-banner-git-remove'));
    expect(screen.queryByTestId('create-banner-git-remove-confirm')).not.toBeNull();
    expect(stub.removeGitCalls.length).toBe(0);

    fireEvent.click(screen.getByTestId('create-banner-git-remove-confirm-button'));
    await waitFor(
      () => {
        expect(stub.removeGitCalls).toEqual([FIRST_GIT_RESULT.gitRoot]);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    await waitFor(
      () => {
        expect(screen.queryByTestId('create-banner-git-confirm')).toBeNull();
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
  });

  test('S4: remove-.git button: when a higher .git exists, banner repaints with the new gitRoot and the user can climb', async () => {
    const FIRST = { gitRoot: '/Users/test', distance: 1 } as const;
    const HIGHER = { gitRoot: '/Users', distance: 2 } as const;

    const stub = makeStubBridge(FIRST, TARGET);
    stub.setRemoveGitFolderImpl(async (gitRoot) => {
      if (gitRoot === FIRST.gitRoot) {
        stub.setEnclosingGitResult(HIGHER);
      } else if (gitRoot === HIGHER.gitRoot) {
        stub.setEnclosingGitResult(null);
      }
    });

    render(<CreateProjectDialog open={true} onOpenChange={() => {}} bridge={stub.bridge} />);
    expect(screen.queryByTestId('create-name') !== null).toBe(false);
    const browse = (await screen.findByTestId('create-browse', undefined, {
      timeout: ASYNC_TIMEOUT_MS,
    })) as HTMLButtonElement;
    await waitFor(
      () => {
        expect(browse.disabled).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    fireEvent.click(browse);

    await waitFor(
      () => {
        const banner = screen.queryByTestId('create-banner-git-confirm');
        expect(banner?.textContent?.includes(FIRST.gitRoot)).toBe(true);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    fireEvent.click(screen.getByTestId('create-banner-git-remove'));
    fireEvent.click(screen.getByTestId('create-banner-git-remove-confirm-button'));
    await waitFor(
      () => {
        expect(stub.removeGitCalls).toEqual([FIRST.gitRoot]);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    await waitFor(
      () => {
        const banner = screen.queryByTestId('create-banner-git-confirm');
        expect(banner?.textContent?.includes(HIGHER.gitRoot)).toBe(true);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    expect(screen.queryByTestId('create-banner-git-remove-confirm')).toBeNull();
    expect(screen.queryByTestId('create-banner-git-remove')).not.toBeNull();

    fireEvent.click(screen.getByTestId('create-banner-git-remove'));
    fireEvent.click(screen.getByTestId('create-banner-git-remove-confirm-button'));
    await waitFor(
      () => {
        expect(stub.removeGitCalls).toEqual([FIRST.gitRoot, HIGHER.gitRoot]);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    await waitFor(
      () => {
        expect(screen.queryByTestId('create-banner-git-confirm')).toBeNull();
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
  });

  test('S6: cascade probes folderState against the sanitized creation target, not the raw picked path', async () => {
    const PICKED_RAW = '/Users/test/.hidden-notes';
    const EXPECTED_SANITIZED_TARGET = '/Users/test/hidden-notes';

    const stub = makeStubBridge(null, PICKED_RAW);
    render(<CreateProjectDialog open={true} onOpenChange={() => {}} bridge={stub.bridge} />);

    const browse = (await screen.findByTestId('create-browse', undefined, {
      timeout: ASYNC_TIMEOUT_MS,
    })) as HTMLButtonElement;
    await waitFor(
      () => {
        expect(browse.disabled).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    fireEvent.click(browse);

    await waitFor(
      () => {
        expect(stub.folderStateCalls.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    expect(stub.folderStateCalls).toContain(EXPECTED_SANITIZED_TARGET);
    expect(stub.folderStateCalls).not.toContain(PICKED_RAW);
  });

  test('S5: remove-.git button: IPC failure surfaces inline error, banner stays, retry path remains', async () => {
    const stub = makeStubBridge(FIRST_GIT_RESULT, TARGET);
    stub.setRemoveGitFolderImpl(async () => {
      throw new Error('EACCES: permission denied');
    });

    render(<CreateProjectDialog open={true} onOpenChange={() => {}} bridge={stub.bridge} />);
    expect(screen.queryByTestId('create-name') !== null).toBe(false);
    const browse = (await screen.findByTestId('create-browse', undefined, {
      timeout: ASYNC_TIMEOUT_MS,
    })) as HTMLButtonElement;
    await waitFor(
      () => {
        expect(browse.disabled).toBe(false);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    fireEvent.click(browse);
    await waitFor(
      () => {
        expect(screen.queryByTestId('create-banner-git-confirm')).not.toBeNull();
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );

    fireEvent.click(screen.getByTestId('create-banner-git-remove'));
    fireEvent.click(screen.getByTestId('create-banner-git-remove-confirm-button'));
    await waitFor(
      () => {
        const errorNode = screen.queryByTestId('create-banner-git-remove-error');
        expect(errorNode?.textContent?.includes('EACCES')).toBe(true);
      },
      { timeout: ASYNC_TIMEOUT_MS },
    );
    expect(screen.queryByTestId('create-banner-git-confirm')).not.toBeNull();
    expect(screen.queryByTestId('create-banner-git-remove')).not.toBeNull();
  });
});
