import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { ConfigBinding, OkignoreBinding, WriteScope } from '@inkeep/open-knowledge-core';
import { act, cleanup, render, screen } from '@testing-library/react';

type SyncedListener = () => void;
type ScopeKey = WriteScope;

const captures = new Map<
  ScopeKey,
  {
    syncedListener: SyncedListener | null;
    hasSyncedSeed: boolean;
  }
>();

let okignoreSyncedHandler: (() => void) | null = null;

function resetCaptures() {
  captures.clear();
  okignoreSyncedHandler = null;
}

function makeFakeConfigBinding(scope: ScopeKey, hasSyncedSeed: boolean): ConfigBinding {
  captures.set(scope, { syncedListener: null, hasSyncedSeed });
  return {
    current: () => ({}) as never,
    patch: () => ({ ok: true, value: { applied: [], effective: {} } }) as never,
    subscribe: () => () => {},
    hasSynced: () => captures.get(scope)?.hasSyncedSeed ?? false,
    subscribeSynced: (listener) => {
      const entry = captures.get(scope);
      if (entry) entry.syncedListener = listener;
      return () => {
        const e = captures.get(scope);
        if (e?.syncedListener === listener) e.syncedListener = null;
      };
    },
    dispose: () => {},
  };
}

function makeFakeOkignoreBinding(): OkignoreBinding {
  return {
    current: () => ({}) as never,
    patch: () => ({ ok: true, value: { applied: [], effective: {} } }) as never,
    subscribe: () => () => {},
    dispose: () => {},
  } as unknown as OkignoreBinding;
}

mock.module('@/editor/DocumentContext', () => ({
  useDocumentContext: () => ({ collabUrl: 'ws://test.invalid' }),
  DocumentProvider: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module('@/hooks/use-theme-bridge', () => ({
  useThemeBridge: () => {},
}));

mock.module('next-themes', () => ({
  useTheme: () => ({ setTheme: () => {} }),
}));

mock.module('@hocuspocus/provider', () => {
  class FakeHocuspocusProvider {
    on(event: string, handler: () => void) {
      if (event === 'synced') okignoreSyncedHandler = handler;
    }
    off(event: string, handler: () => void) {
      if (event === 'synced' && okignoreSyncedHandler === handler) {
        okignoreSyncedHandler = null;
      }
    }
    destroy() {}
  }
  return { HocuspocusProvider: FakeHocuspocusProvider };
});

mock.module('@inkeep/open-knowledge-core', () => ({
  bindConfigDoc: (_provider: unknown, scope: WriteScope) =>
    makeFakeConfigBinding(scope, scope === 'user' ? userHasSyncedSeed : false),
  bindOkignoreDoc: () => makeFakeOkignoreBinding(),
  CONFIG_DOC_NAME_USER: '__user__/config.yml',
  CONFIG_DOC_NAME_PROJECT: '__config__/project',
  CONFIG_DOC_NAME_PROJECT_LOCAL: '__local__/project',
  CONFIG_DOC_NAME_OKIGNORE: '__config__/okignore',
  mergeLayered: (user: unknown) => user,
}));

let userHasSyncedSeed = false;

const { ConfigProvider, useConfigContext } = await import('./config-provider');

function UserSyncedConsumer() {
  const ctx = useConfigContext();
  return <span data-testid="user-synced">{String(ctx.userSynced)}</span>;
}

describe('ConfigProvider — userSynced behavioral wiring (Tier-3)', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    resetCaptures();
    userHasSyncedSeed = false;
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  test('userSynced reads false until the binding fires its synced listener, then flips to true', () => {
    render(
      <ConfigProvider>
        <UserSyncedConsumer />
      </ConfigProvider>,
    );

    expect(screen.getByTestId('user-synced').textContent).toBe('false');

    const userEntry = captures.get('user');
    expect(userEntry?.syncedListener).not.toBeNull();

    act(() => {
      userEntry?.syncedListener?.();
    });

    expect(screen.getByTestId('user-synced').textContent).toBe('true');
  });

  test('userSynced reads true on first render when the binding has already synced at mount time', () => {
    userHasSyncedSeed = true;

    render(
      <ConfigProvider>
        <UserSyncedConsumer />
      </ConfigProvider>,
    );

    expect(screen.getByTestId('user-synced').textContent).toBe('true');
  });
});
