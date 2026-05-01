import { resolve } from 'node:path';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import type { Config } from './schema.ts';

export function resolveContentDir(config: Config, cwd: string): string {
  return resolve(cwd, config.content.dir);
}

export function resolveLockDir(contentDir: string): string {
  return resolve(contentDir, OK_DIR);
}
