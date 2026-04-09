import { HocuspocusProvider } from '@hocuspocus/provider';

export const DOC_NAME = 'test-doc';

// Module-level singleton — one provider for the app lifetime.
// Lives outside React so it survives StrictMode's double-mount in development.
let _provider: HocuspocusProvider | null = null;

export function getProvider(): HocuspocusProvider {
  if (!_provider) {
    _provider = new HocuspocusProvider({
      url: 'ws://localhost:5173/collab',
      name: DOC_NAME,
    });
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__provider = _provider;
    }
  }
  return _provider;
}
