import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { PluginOptions } from 'babel-plugin-react-compiler';
import { defineConfig } from 'vite';
import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';

const reactCompilerConfig: PluginOptions = {
  // Fail the build on any compiler diagnostic
  panicThreshold: 'all_errors',
  environment: {
    validateNoDerivedComputationsInEffects: true,
    validateNoImpureFunctionsInRender: true,
  },
};

const vitePort = process.env.VITE_PORT ? Number.parseInt(process.env.VITE_PORT, 10) : undefined;

export default defineConfig({
  // Relative asset paths — `./assets/foo.js` in the built index.html.
  // Works under both HTTP (`ok ui` serves from root) and `file://` (Electron's
  // `loadFile()` resolves relative to the bundle path). Default `base: '/'`
  // silently broke the packaged renderer: under `file://`, `/assets/foo.js`
  // resolves to the filesystem root and every chunk 404s.
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
    // Force all prosemirror core packages to resolve to a single instance.
    // Bun's hoisted install produces two physical copies of several prosemirror
    // packages (one at `node_modules/<pkg>`, one inside `.bun/<pkg>@*/`) and
    // Vite's dep pre-bundle lands each in its own chunk. Without dedupe, two
    // failure modes reliably break the editor:
    //
    //   1. `instanceof DecorationSet` checks in prosemirror-view's
    //      `DecorationGroup.from()` return false across chunks, so a
    //      `members.reduce(... concat((m as DecorationGroup).members))` pass
    //      adds `undefined` to the result array. That surfaces as
    //      `TypeError: Cannot read properties of undefined (reading 'localsInner')`
    //      inside `DecorationGroup.locals()` when a DOM change triggers
    //      `iterDeco` — breaks any plugin emitting decorations (suggestion,
    //      placeholder, focus, etc.).
    //
    //   2. Selection-type registration via `Selection.jsonID(id, Class)` is a
    //      global side effect on prosemirror-state's Selection class. Two
    //      copies of prosemirror-gapcursor each call `jsonID('gapcursor', ...)`
    //      against the (possibly already-deduped) Selection, producing
    //      `Error: Duplicate use of selection JSON ID gapcursor`.
    //
    // Deduping every prosemirror-* package + yjs here is the canonical fix.
    //
    // react + react-dom: TipTap's peer deps pull in a second copy of React
    //   when installed alongside @tiptap/* packages, causing "Invalid hook call"
    //   errors (React requires a single shared instance for hooks to work).
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
      // Exclude the content/ directory from Vite's HMR watcher.
      // Markdown files here are managed by the Hocuspocus file watcher + persistence
      // layer. Letting Vite HMR also watch them causes a full page reload on every
      // persistence write, which drops in-flight typing and jumps the cursor.
      ignored: ['**/content/**'],
    },
  },
});
