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
   * Test-only hook: arm a rejection to fire on the NEXT syncPromise creation
   * for `docName`. Race-free alternative to `__test_rejectSyncPromise` for
   * localhost where the real sync completes in <10ms and a post-hoc polling
   * loop cannot reliably observe the pending entry before it resolves.
   * See sync-promise.ts for timing rationale.
   */
  var __test_armPendingRejection:
    | ((docName: string, kind?: 'timeout' | 'predisconnect') => void)
    | undefined;
  /**
   * Test-only hook: close the active HocuspocusProvider's WebSocket to exercise
   * post-sync reconnect paths (F8 acceptance criterion).
   */
  var __test_closeActiveWebSocket: (() => boolean) | undefined;
}
