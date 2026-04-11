import { rmSync } from 'node:fs';

export default async function globalTeardown(): Promise<void> {
  const dir = process.env.OK_TEST_CONTENT_DIR;
  if (dir?.startsWith('/') && dir.includes('ok-playwright-')) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[playwright] removed ${dir}`);
  }
}
