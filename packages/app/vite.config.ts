import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOptions } from 'babel-plugin-react-compiler';
import { defineConfig } from 'vite';
import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';

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
    react(),
    babel({
      presets: [reactCompilerPreset(reactCompilerConfig)],
    }),
    hocuspocusPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      'react',
      'react-dom',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/merge',
      '@codemirror/lang-markdown',
      'prosemirror-changeset',
      'prosemirror-collab',
      'prosemirror-commands',
      'prosemirror-dropcursor',
      'prosemirror-gapcursor',
      'prosemirror-history',
      'prosemirror-inputrules',
      'prosemirror-keymap',
      'prosemirror-markdown',
      'prosemirror-menu',
      'prosemirror-model',
      'prosemirror-schema-basic',
      'prosemirror-schema-list',
      'prosemirror-state',
      'prosemirror-tables',
      'prosemirror-trailing-node',
      'prosemirror-transform',
      'prosemirror-view',
      'yjs',
    ],
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
