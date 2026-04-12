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
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset(reactCompilerConfig)],
    }),
    hocuspocusPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ['prosemirror-view'],
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
