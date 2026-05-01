/**
 * `open-knowledge mcp` command — thin stdio → HTTP MCP shim.
 *
 * All diagnostic logging goes to stderr; stdout is reserved for MCP frames.
 * The running `ok start` process owns the MCP implementation at `/mcp`.
 * This command only resolves the live server port (or auto-starts `ok start`)
 * and proxies stdio JSON-RPC to Streamable HTTP.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Config, resolveContentDir, resolveLockDir } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { OK_DIR } from '../constants.ts';
import { parseSpawnTimeoutEnv, startMcpShim } from '../mcp/shim.ts';

/**
 * Pure predicate: should `ok mcp` refuse to start in this directory?
 * True when no `--port` override is given AND `<projectDir>/.ok/`
 * does not exist (i.e. the directory was never `ok init`'d). Exported for
 * testing.
 */
export function shouldRefuseMcpStart(projectDir: string, port: string | undefined): boolean {
  if (port !== undefined) return false;
  return !existsSync(resolve(projectDir, OK_DIR));
}

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project knowledge base')
    .option(
      '-p, --port <port>',
      'Override port discovery and proxy to this HTTP MCP port',
      undefined,
    )
    .action(async (opts: { port?: string }) => {
      try {
        const startupConfig = getConfig();
        const projectDir = process.cwd();

        // Refuse to start in directories that haven't been `ok init`'d. Without
        // this gate, a globally-registered MCP would treat any cwd as an OK
        // project and (transitively, via auto-spawned `ok start`) scaffold
        // `.ok/`, `.git/`, and a shadow repo there. `--port`
        // bypasses — explicit user intent. Non-zero exit aligns with how
        // every other CLI precondition failure signals (config.ts, preview.ts,
        // start.ts) so MCP hosts can distinguish refusal from clean shutdown.
        if (shouldRefuseMcpStart(projectDir, opts.port)) {
          process.stderr.write(
            `[mcp] ${projectDir} is not an Open Knowledge project (no ${OK_DIR}/); exiting. Run \`ok init\` to scaffold one.\n`,
          );
          process.exitCode = 1;
          return;
        }

        const contentDir = resolveContentDir(startupConfig, projectDir);
        const timeoutMs = parseSpawnTimeoutEnv(process.env.OK_MCP_SPAWN_TIMEOUT_MS);

        await startMcpShim({
          lockDir: resolveLockDir(contentDir),
          contentDir,
          host: startupConfig.server.host,
          portOverride: opts.port,
          envAutoStart: process.env.OK_MCP_AUTOSTART,
          configAutoStart: startupConfig.mcp.autoStart,
          timeoutMs,
        });
      } catch (err) {
        process.stderr.write(
          `MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  return cmd;
}
