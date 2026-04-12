declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import type { ProviderPool } from '@/editor/provider-pool';
  var __providerPool: ProviderPool;
  var __activeProvider: HocuspocusProvider | null;
}
