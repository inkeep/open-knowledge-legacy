import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: 'inline',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        output: { format: 'es' },
      },
    },
    resolve: {
      alias: {
        '@/shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: 'inline',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'es' },
      },
    },
  },
  // Renderer is intentionally minimal — the real React app is packages/app/,
  // consumed as extraResources from packages/cli/dist/public/. This section
  // still runs for `dev` mode's HMR shell but produces near-empty output in
  // packaged builds because mainWindow.loadFile() points at the app/ resource.
  renderer: {
    build: {
      sourcemap: 'inline',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
