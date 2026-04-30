#!/usr/bin/env node

// Propagate --no-color/--color argv flags to env vars for libraries in the
// dependency tree that check NO_COLOR/FORCE_COLOR. picocolors itself checks
// argv directly at module evaluation time, but other libraries may only
// read env vars. --no-color always wins when both flags are present,
// matching picocolors' own precedence and no-color.org convention.

if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
  delete process.env.FORCE_COLOR;
} else if (process.argv.includes('--color')) {
  process.env.FORCE_COLOR = '1';
  delete process.env.NO_COLOR;
}

import type { Config } from '@inkeep/open-knowledge-server';
/**
 * CLI entry point for @inkeep/open-knowledge.
 *
 * Commander.js v14 with `start` as the default command.
 * Config loaded via preAction hook: CLI > ENV > project > user > Zod defaults.
 */
import { Command } from 'commander';
import { authCommand } from './commands/auth/index.ts';
import { cleanCommand } from './commands/clean.ts';
import { cloneCommand } from './commands/clone.ts';
import { configCommand } from './commands/config.ts';
import { initCommand } from './commands/init.ts';
import { installSkillCommand } from './commands/install-skill.ts';
import { mcpCommand } from './commands/mcp.ts';
import { previewCommand } from './commands/preview.ts';
import { pullCommand } from './commands/pull.ts';
import { pushCommand } from './commands/push.ts';
import { seedCommand } from './commands/seed.ts';
import { startCommand } from './commands/start.ts';
import { statusCommand } from './commands/status.ts';
import { stopCommand } from './commands/stop.ts';
import { syncCommand } from './commands/sync.ts';
import { uiCommand } from './commands/ui.ts';
import { PACKAGE_VERSION } from './constants.ts';
import { loadConfig } from './index.ts';

const program = new Command();

// Shared state populated by preAction hook
let resolvedConfig: Config;

program
  .name('open-knowledge')
  .description('Local-first knowledge base with CRDT collaboration')
  .version(PACKAGE_VERSION)
  .option('--cwd <path>', 'Working directory')
  .option('--log-level <level>', 'Log level', 'info')
  .option('--no-color', 'Disable color output')
  .option('--color', 'Force color output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    const cwd = opts.cwd as string | undefined;
    if (cwd !== undefined) {
      // Honor --cwd globally so every subcommand (status/stop/clean/start/etc.)
      // resolves lock dir, content dir, and relative paths against the requested
      // directory rather than wherever the CLI was invoked from.
      process.chdir(cwd);
    }
    const { config } = loadConfig(cwd);

    // CLI flags override config (host only — `server.port` is no longer a
    // schema field per D29; port flows from `--port` / `PORT` env directly
    // into `bootStartServer` at the start command's action site).
    const startOpts =
      thisCommand.args.length === 0 ? opts : (thisCommand.commands[0]?.opts() ?? {});
    if (startOpts.host !== undefined) {
      config.server.host = startOpts.host as string;
    }

    // ENV overrides
    if (process.env.HOST) {
      config.server.host = process.env.HOST;
    }

    resolvedConfig = config;
  });

// Start command (default)
const start = startCommand(() => resolvedConfig);
program.addCommand(start, { isDefault: true });

// MCP command
const mcp = mcpCommand(() => resolvedConfig);
program.addCommand(mcp);

// init command — stateless terminal setup, no config needed
program.addCommand(initCommand());

// seed command — stateless content-scaffold, no config needed
program.addCommand(seedCommand());

// install-skill command — build + install the .skill into Claude Desktop / Cowork.
// Closes the loop for Pro/Max users who saw the Cowork hint from `ok init`:
// one command, two-click install via the `.skill` file association.
// See specs/2026-04-24-skill-dual-track-install/SPEC.md Ship 1f.
program.addCommand(installSkillCommand());

// preview command — read-only content scope inspection
const preview = previewCommand(() => resolvedConfig);
program.addCommand(preview);

// ui command — serves the React editor (sibling of `start`).
const ui = uiCommand(() => resolvedConfig);
program.addCommand(ui);

// stop / clean / status — lifecycle utilities (FR-1.7, FR-1.7b, FR-1.14).
program.addCommand(stopCommand(() => resolvedConfig));
program.addCommand(cleanCommand(() => resolvedConfig));
program.addCommand(statusCommand(() => resolvedConfig));

// config command group — inspect + migrate `.open-knowledge/config.yml`
// (config-edit-paths spec FR-16, FR-26 / D37). Stateless — no resolved config
// dependency; both subcommands re-load fresh from disk via core helpers.
program.addCommand(configCommand());

// auth command group — login, status, repos, signout, pat, git-credential
program.addCommand(authCommand(() => resolvedConfig));

// clone command — git clone + auto-start
program.addCommand(cloneCommand(() => resolvedConfig));

// sync commands — delegate to server or fall back to simple-git
program.addCommand(syncCommand(() => resolvedConfig));
program.addCommand(pushCommand(() => resolvedConfig));
program.addCommand(pullCommand(() => resolvedConfig));

await program.parseAsync();
