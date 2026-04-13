import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  unbundle: true,
  format: 'esm',
  dts: true,
  clean: true,
  deps: {
    // Workspace packages must be bundled — they're private and won't be on npm
    alwaysBundle: ['@inkeep/open-knowledge-core', '@inkeep/open-knowledge-server'],
    // Native addons — must not be bundled
    neverBundle: ['@parcel/watcher', 'chokidar'],
  },
});
