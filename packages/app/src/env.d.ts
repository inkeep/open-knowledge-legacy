declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import type { ProviderPool } from '@/editor/provider-pool';
  var __activeProvider: HocuspocusProvider;
  var __providerPool: ProviderPool | null;
}
