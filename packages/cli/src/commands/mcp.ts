import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Config, getLocalDir, resolveContentDir } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { OK_DIR } from '../constants.ts';
import { parseSpawnTimeoutEnv, startMcpShim } from '../mcp/shim.ts';

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
          lockDir: getLocalDir(contentDir),
          contentDir,
          portOverride: opts.port,
          envAutoStart: process.env.OK_MCP_AUTOSTART,
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
