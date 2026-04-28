import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOptions } from 'babel-plugin-react-compiler';
import { defineConfig } from 'electron-vite';

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
 * electron-vite 6.x accepts Vite 8 as a peer dep (no bundled internal copy), so
 * the renderer now runs against the same Vite 8 + rolldown instance as
 * `packages/app`. React Compiler is applied via `@rolldown/plugin-babel` +
 * `reactCompilerPreset` — same pattern as `packages/app/vite.config.ts`.
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
    build: {
      externalizeDeps: true,
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
    plugins: [
      react(),
      // Error: Cannot deep clone non-plain object https://github.com/alex8088/electron-vite/issues/902
      await babel({
        presets: [reactCompilerPreset(reactCompilerConfig)],
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
