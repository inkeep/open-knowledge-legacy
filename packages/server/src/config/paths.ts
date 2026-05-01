/**
 * Path resolution helpers shared across CLI commands.
 *
 * `resolveContentDir` is the single choke point for deriving `<contentDir>`
 * from a cwd + config. `start` and `mcp` both call it so MCP port discovery
 * cannot silently look in the wrong place.
 */

import { resolve } from 'node:path';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import type { Config } from './schema.ts';

/**
 * Resolve the absolute content directory from a config and cwd.
 * Equivalent to `resolve(cwd, config.content.dir)`; centralized so MCP
 * and the server cannot disagree about where the server.lock lives.
 */
export function resolveContentDir(config: Config, cwd: string): string {
  return resolve(cwd, config.content.dir);
}

/**
 * The `.ok/` directory inside a contentDir — where the server
 * lock, registry entries, and other per-project state files live.
 */
export function resolveLockDir(contentDir: string): string {
  return resolve(contentDir, OK_DIR);
}
