import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOptions } from 'babel-plugin-react-compiler';
import { defineConfig } from 'vite';
import { chromeTokensVitePlugin } from './src/build/chrome-tokens-vite-plugin';
import { rejectionLoopGuardPlugin } from './src/build/rejection-loop-guard-plugin';
import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';
import { RENDERER_DEDUPE } from './vite.dedupe';

const reactCompilerConfig: PluginOptions = {
  panicThreshold: 'all_errors',
  environment: {
    validateNoDerivedComputationsInEffects: true,
    validateNoImpureFunctionsInRender: true,
  },
};

const vitePort = process.env.VITE_PORT ? Number.parseInt(process.env.VITE_PORT, 10) : undefined;

export default defineConfig({
  base: './',
  plugins: [
    rejectionLoopGuardPlugin(),
    chromeTokensVitePlugin(),
    react(),
    babel({
      presets: [reactCompilerPreset(reactCompilerConfig)],
    }),
    hocuspocusPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: [...RENDERER_DEDUPE],
  },
  server: {
    port: vitePort ?? 5173,
    strictPort: vitePort !== undefined,
    watch: {
      ignored: ['**/content/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        if (
          log.code === 'EVAL' &&
          typeof log.id === 'string' &&
          log.id.includes('/@protobufjs/inquire/')
        ) {
          return;
        }
        if (log.code === 'PLUGIN_TIMINGS') {
          return;
        }
        defaultHandler(level, log);
      },
    },
  },
});
