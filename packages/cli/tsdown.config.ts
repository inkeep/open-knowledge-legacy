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
  // Native addons — must not be bundled
  deps: {
    neverBundle: ['@parcel/watcher', 'simple-git'],
  },
});
