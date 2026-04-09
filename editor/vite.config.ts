import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { hocuspocusPlugin } from './src/server/hocuspocus';

export default defineConfig({
  plugins: [react(), hocuspocusPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      // Exclude content/ from Vite HMR — markdown files there are managed by
      // the persistence layer. Without this, every disk save triggers a full reload.
      ignored: ['**/content/**'],
    },
  },
});
