import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
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
 *
 * Plugin pinning: electron-vite 5.x bundles Vite 7 internally (see
 * node_modules/electron-vite/node_modules/vite@7.3.2), so plugin-react is pinned
 * to ^5 (Vite 6/7-compatible) here. packages/app can stay on plugin-react@6 +
 * Vite 8 + rolldown because its web build runs against a different Vite
 * instance. React Compiler is applied via plugin-react@5's babel option
 * rather than @rolldown/plugin-babel (rolldown-only).
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
        // Two entries in the main bundle: the main-process entry itself AND
        // the utility-process entry that main.forks. electron-vite's config
        // only has `main`/`preload`/`renderer` sections — there is no native
        // `utility` slot — so we piggyback on main. `entryFileNames` uses the
        // input key as a path pattern (`utility/server-entry` → that nested
        // filename), which matches main.index.ts's `join(__dirname,
        // '../utility/server-entry.js')` load path: main lands at
        // `out/main/index.js` and utility at `out/main/utility/server-entry.js`,
        // so `../utility/...` from `out/main/index.js` resolves up one + back
        // into the same folder. Alternative: multi-root rollup config — not
        // worth the complexity for a single extra entry.
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
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: 'inline',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // CommonJS, not ESM. Electron's sandboxed preload (webPreferences.sandbox: true,
        // our locked default per D38) only supports CommonJS — ESM preloads require
        // sandbox: false and are an Electron 28+ feature with different ABI. Emitting
        // `cjs` produces `out/preload/index.js` (matches `preload:` path in main/index.ts)
        // and works under our sandbox. Without this, Electron silently fails to load
        // the preload script and `window.okDesktop` is never populated — renderer
        // falls into the web-mode branch and the Navigator never appears.
        // `entryFileNames: '[name].js'` overrides electron-vite's default `.cjs`/`.mjs`
        // suffixing so main's `join(__dirname, '../preload/index.js')` load path works
        // without having to special-case the extension.
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: appRoot,
    configFile: false,
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', reactCompilerConfig]],
        },
      }),
    ],
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
