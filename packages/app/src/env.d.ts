/// <reference types="vite/client" />

declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import type { ProviderPool } from '@/editor/provider-pool';
  var __providerPool: ProviderPool | undefined;
  var __activeProvider: HocuspocusProvider | null;
  /**
   * Test-only hook: force-reject the cached syncPromise for a docName.
   * Returns true if an entry was rejected, false otherwise.
   */
  var __test_rejectSyncPromise:
    | ((docName: string, kind?: 'timeout' | 'disconnect') => boolean)
    | undefined;
  /**
   * Test-only hook: close the active HocuspocusProvider's WebSocket to exercise
   * post-sync reconnect paths (F8 acceptance criterion).
   */
  var __test_closeActiveWebSocket: (() => boolean) | undefined;
}
