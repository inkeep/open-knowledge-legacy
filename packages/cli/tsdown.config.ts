import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: 'esm',
  outputExtension: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  clean: true,
  deps: {
    // Workspace packages must be bundled — they're private and won't be on npm
    alwaysBundle: ['@inkeep/open-knowledge-core', '@inkeep/open-knowledge-server'],
    // Native addons — must not be bundled
    neverBundle: ['@parcel/watcher', 'simple-git'],
  },
});
