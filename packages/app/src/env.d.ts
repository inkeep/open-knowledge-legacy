/// <reference types="vite/client" />
/// <reference types="bun-types" />

declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import type { Editor } from '@tiptap/core';
  import type { GraphNodeVisualState } from '@/components/graph-view-utils';
  import type { ProviderPool } from '@/editor/provider-pool';
  var __graphHarness:
    | {
        clickDoc: (docName: string) => boolean;
        clickBackground: () => boolean;
        clickExternal: (url: string) => boolean;
        getNodeVisualState: (docName: string) => GraphNodeVisualState | null;
        getNodeClickPoint: (nodeKey: string) => {
          x: number;
          y: number;
        } | null;
        getLayoutMetrics: () => {
          graphHeight: number;
          containerHeight: number;
          availableHeight: number;
        };
        getLinkClickPoint: (
          sourceDocName: string,
          targetDocName: string,
        ) => { x: number; y: number } | null;
        isSimulationSettled: () => boolean;
      }
    | undefined;
  var __providerPool: ProviderPool | undefined;
  var __activeProvider: HocuspocusProvider | null;
  /**
   * DEV-only: TipTap `Editor` instance of the currently-active pooled doc.
   * Playwright reads `editor.state.selection` to close the PM-selection-sync
   * race described in precedent §20(a) category C. Tree-shaken from production
   * bundles by the `import.meta.env.DEV` guard in `DocumentContext.tsx`.
   */
  var __activeEditor: Editor | null;
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
  /**
   * Test-only hook: inject a fake agent-focus awareness state into the
   * `__system__` provider, simulating a remote agent peer focusing on
   * `docName`. Fires the awareness 'change' event which triggers
   * SystemDocSubscriber's debounced nav check → hash change.
   */
  var __test_injectAgentFocus: ((docName: string) => boolean) | undefined;
}
