import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'shadow-repo-layout': 'src/shadow-repo-layout.ts',
    server: 'src/server.ts',
  },
  unbundle: false,
  format: 'esm',
  dts: false,
  clean: true,
});
