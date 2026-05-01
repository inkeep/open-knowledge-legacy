/**
 * `open-knowledge mcp` command — starts stdio MCP server.
 *
 * All diagnostic logging goes to stderr.
 *
 * The stdio MCP process is now intentionally project-agnostic at startup:
 * without an explicit `--port` override it discovers / auto-starts the target
 * project's Hocuspocus server lazily from the effective cwd of each tool call
 * (explicit tool cwd → exactly one client root → error).
 *
 * Transitive auto-git-init (SPEC 2026-04-21-shadow-repo-single-mode D13):
 * when this command auto-spawns `ok start` to service a tool call against a
 * project that has no running server, the spawned `ok start` runs
 * `ensureProjectGit` which may create `.git/` in the project directory. Opt
 * out via `OK_MCP_AUTOSTART=0` or config `mcp.autoStart: false`. `ok mcp`
 * itself never runs `ensureProjectGit` — the auto-init is strictly a
 * side-effect of the auto-spawned `ok start`.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { createProjectConfigResolver } from '../config/loader.ts';
import type { Config } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { startMcpServer } from '../mcp/server.ts';
import { createProjectServerUrlResolver, parseSpawnTimeoutEnv } from '../mcp/server-discovery.ts';

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
      'Override port discovery and connect to this port (0 = disk-only)',
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
