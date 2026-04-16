/// <reference types="vite/client" />

declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import type { GraphNodeVisualState } from '@/components/graph-view-utils';
  import type { ProviderPool } from '@/editor/provider-pool';
  var __graphHarness:
    | {
        clickDoc: (docName: string) => boolean;
        clickBackground: () => boolean;
        getNodeVisualState: (docName: string) => GraphNodeVisualState | null;
      }
    | undefined;
  var __providerPool: ProviderPool | undefined;
  var __activeProvider: HocuspocusProvider | null;
}
