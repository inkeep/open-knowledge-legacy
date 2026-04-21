import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOptions } from 'babel-plugin-react-compiler';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * electron-vite config — M1 desktop build.
 *
 * Renderer section mirrors `packages/app/vite.config.ts` (React + React Compiler
 * + dedupe list for prosemirror/codemirror/yjs/react) minus its `hocuspocusPlugin`,
 * because Electron's utility process owns Hocuspocus — the renderer just connects
 * to `ws://localhost:<utility-port>/collab` via `window.okDesktop.config.collabUrl`.
 *
 * Keeping `configFile: false` in the renderer prevents Vite from auto-discovering
 * `packages/app/vite.config.ts` when `root` points at `../app`, which would
 * re-enable the hocuspocus plugin and launch a competing server.
 */

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
  renderer: {
    root: appRoot,
    configFile: false,
    plugins: [react(), babel({ presets: [reactCompilerPreset(reactCompilerConfig)] })],
    resolve: {
      alias: {
        '@': resolve(appRoot, 'src'),
      },
      // Duplicated from packages/app/vite.config.ts — see the long comment there
      // for the underlying reason (DecorationSet `instanceof` checks + gapcursor
      // `Selection.jsonID` global registration + React hook identity).
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
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      sourcemap: 'inline',
      rollupOptions: {
        input: resolve(appRoot, 'index.html'),
      },
    },
    server: {
      // Vite's HMR shouldn't watch content/ — Hocuspocus owns those writes.
      // Inherited from packages/app's config for consistency.
      watch: {
        ignored: ['**/content/**'],
      },
    },
  },
});
