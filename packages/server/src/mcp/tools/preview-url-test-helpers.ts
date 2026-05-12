import { resolve } from 'node:path';
import { LOCAL_DIR, OK_DIR } from '@inkeep/open-knowledge-core';
import { acquireUiLock, updateUiLockPort } from '../../ui-lock.ts';

const TEST_UI_PORT = 5173;

export function bindTestUiLock(cwd: string, port = TEST_UI_PORT): string {
  const lockDir = resolve(cwd, OK_DIR, LOCAL_DIR);
  acquireUiLock(lockDir, { port: 0, worktreeRoot: cwd });
  updateUiLockPort(lockDir, port);
  return `http://localhost:${port}`;
}
