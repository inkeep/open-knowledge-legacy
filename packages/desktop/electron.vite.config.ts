import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOptions } from 'babel-plugin-react-compiler';
import { defineConfig } from 'electron-vite';
import { RENDERER_DEDUPE } from '../app/vite.dedupe';

const reactCompilerConfig: PluginOptions = {
  panicThreshold: 'all_errors',
  environment: {
    validateNoDerivedComputationsInEffects: true,
    validateNoImpureFunctionsInRender: true,
  },
};

const appRoot = resolve(__dirname, '../app');

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      sourcemap: 'hidden',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'utility/server-entry': resolve(__dirname, 'src/utility/server-entry.ts'),
        },
        output: { format: 'es', entryFileNames: '[name].js' },
      },
    },
    resolve: {
      alias: {
        '@/shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: appRoot,
    plugins: [
      react(),
      await babel({
        presets: [reactCompilerPreset(reactCompilerConfig)],
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(appRoot, 'src'),
      },
      dedupe: [...RENDERER_DEDUPE],
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      sourcemap: 'hidden',
      rollupOptions: {
        input: resolve(appRoot, 'index.html'),
      },
    },
    server: {
      watch: {
        ignored: ['**/content/**'],
      },
    },
  },
});
