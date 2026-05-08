#!/usr/bin/env node

if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
  delete process.env.FORCE_COLOR;
} else if (process.argv.includes('--color')) {
  process.env.FORCE_COLOR = '1';
  delete process.env.NO_COLOR;
}

import { spawn } from 'node:child_process';
import type { Config } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { authCommand } from './commands/auth/index.ts';
import { cleanCommand } from './commands/clean.ts';
import { cloneCommand } from './commands/clone.ts';
import { configCommand } from './commands/config.ts';
import { createRealDetectDeps, detectDesktop, launchDesktop } from './commands/desktop-dispatch.ts';
import { diagnoseCommand } from './commands/diagnose.ts';
import { initCommand } from './commands/init.ts';
import { installSkillCommand } from './commands/install-skill.ts';
import { mcpCommand } from './commands/mcp.ts';
import { previewCommand } from './commands/preview.ts';
import { psCommand } from './commands/ps.ts';
import { pullCommand } from './commands/pull.ts';
import { pushCommand } from './commands/push.ts';
import { seedCommand } from './commands/seed.ts';
import { runStartCommand, startCommand } from './commands/start.ts';
import { statusCommand } from './commands/status.ts';
import { stopCommand } from './commands/stop.ts';
import { syncCommand } from './commands/sync.ts';
import { uiCommand } from './commands/ui.ts';
import { PACKAGE_VERSION } from './constants.ts';
import { loadConfig } from './index.ts';

const program = new Command();

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
      process.chdir(cwd);
    }
    const { config } = loadConfig(cwd);
    resolvedConfig = config;
  });

program.action(async () => {
  const decision = detectDesktop(createRealDetectDeps());

  if (decision.available) {
    launchDesktop({ spawn });
    return;
  }

  await runStartCommand(resolvedConfig, {});
});

const start = startCommand(() => resolvedConfig);
program.addCommand(start);

const mcp = mcpCommand(() => resolvedConfig);
program.addCommand(mcp);

program.addCommand(initCommand());

program.addCommand(seedCommand());

program.addCommand(installSkillCommand());

const preview = previewCommand(() => resolvedConfig);
program.addCommand(preview);

const ui = uiCommand(() => resolvedConfig);
program.addCommand(ui);

program.addCommand(stopCommand(() => resolvedConfig));
program.addCommand(cleanCommand(() => resolvedConfig));
program.addCommand(statusCommand(() => resolvedConfig));

program.addCommand(psCommand());

program.addCommand(diagnoseCommand());

program.addCommand(configCommand());

program.addCommand(authCommand());

program.addCommand(cloneCommand(() => resolvedConfig));

program.addCommand(syncCommand(() => resolvedConfig));
program.addCommand(pushCommand(() => resolvedConfig));
program.addCommand(pullCommand(() => resolvedConfig));

await program.parseAsync(process.argv, { from: 'node' });
