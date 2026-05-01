import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { createProjectConfigResolver } from '../config/loader.ts';
import type { Config } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { startMcpServer } from '../mcp/server.ts';
import { createProjectServerUrlResolver, parseSpawnTimeoutEnv } from '../mcp/server-discovery.ts';

export function shouldRefuseMcpStart(projectDir: string, port: string | undefined): boolean {
  if (port !== undefined) return false;
  return !existsSync(resolve(projectDir, OK_DIR));
}

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project knowledge base')
    .option(
      '-p, --port <port>',
      'Override port discovery and connect to this port (0 = disk-only)',
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

        const resolveConfig = createProjectConfigResolver({
          startupCwd: projectDir,
          startupConfig,
        });

        const timeoutMs = parseSpawnTimeoutEnv(process.env.OK_MCP_SPAWN_TIMEOUT_MS);
        let serverUrl: string | ((cwd?: string) => Promise<string | undefined>) | undefined;
        let message: string;
        if (opts.port !== undefined) {
          const parsed = Number.parseInt(opts.port, 10);
          if (Number.isNaN(parsed)) {
            serverUrl = undefined;
            message = `invalid --port value '${opts.port}' — disk-only mode`;
          } else if (parsed > 0) {
            serverUrl = `ws://${startupConfig.server.host}:${parsed}`;
            message = `using --port override, connecting to ${serverUrl}`;
          } else {
            serverUrl = undefined;
            message = '--port=0 — disk-only mode';
          }
        } else {
          serverUrl = createProjectServerUrlResolver({
            startupCwd: projectDir,
            resolveConfig,
            host: startupConfig.server.host,
            portOverride: undefined,
            envAutoStart: process.env.OK_MCP_AUTOSTART,
            timeoutMs,
          });
          message = 'project server discovery/autostart is lazy per effective cwd';
        }
        process.stderr.write(`[mcp] ${message}\n`);

        await startMcpServer({
          projectDir,
          serverUrl,
          config: resolveConfig,
          startupConfig,
          bypassProjectSelection: opts.port !== undefined,
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
