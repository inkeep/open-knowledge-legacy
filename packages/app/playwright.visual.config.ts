import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const contentDir = mkdtempSync(join(tmpdir(), 'ok-visual-'));
writeFileSync(join(contentDir, 'test-doc.md'), '', 'utf-8');
mkdirSync(join(contentDir, 'sidebar-folder'), { recursive: true });
writeFileSync(join(contentDir, 'sidebar-folder', 'nested-doc.md'), '', 'utf-8');
console.log(`[playwright:visual] OK_TEST_CONTENT_DIR = ${contentDir}`);

const port = process.env.VITE_PORT || '13580';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/visual',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: `VITE_PORT=${port} bun run dev`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      OK_TEST_CONTENT_DIR: contentDir,
    },
  },
});
