import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  unbundle: false,
  format: 'esm',
  dts: false,
  clean: true,
  deps: {
    neverBundle: ['@parcel/watcher', 'simple-git'],
  },
});
