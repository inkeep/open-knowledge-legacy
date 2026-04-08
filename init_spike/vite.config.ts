import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';

export default defineConfig({
  plugins: [react(), hocuspocusPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
