/// <reference types="vite/client" />

declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
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
      }
    | undefined;
  var __providerPool: ProviderPool | undefined;
  var __activeProvider: HocuspocusProvider | null;
}
