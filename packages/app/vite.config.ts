import react from '@vitejs/plugin-react';
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

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', reactCompilerConfig]],
      },
    }),
    hocuspocusPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    watch: {
      // Exclude the content/ directory from Vite's HMR watcher.
      // Markdown files here are managed by the Hocuspocus file watcher + persistence
      // layer. Letting Vite HMR also watch them causes a full page reload on every
      // persistence write, which drops in-flight typing and jumps the cursor.
      ignored: ['**/content/**'],
    },
  },
});
