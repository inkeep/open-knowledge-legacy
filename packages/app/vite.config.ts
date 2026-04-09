import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';

export default defineConfig({
  plugins: [react(), hocuspocusPlugin()],
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
