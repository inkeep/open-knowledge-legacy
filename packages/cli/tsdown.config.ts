import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  unbundle: false,
  format: 'esm',
  dts: true,
  clean: true,
  minify: true,
  deps: {
    // Native addons must stay external — they ship .node binaries resolved at runtime
    neverBundle: ['@parcel/watcher', 'simple-git'],
  },
});
