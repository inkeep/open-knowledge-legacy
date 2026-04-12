declare namespace globalThis {
  import type { HocuspocusProvider } from '@hocuspocus/provider';
  import { ProviderPool } from '@/editor/provider-pool';
  var __activeProvider: HocuspocusProvider;
  var __providerPool: ProviderPool | null;
}
