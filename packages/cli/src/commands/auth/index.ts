import { Command } from 'commander';
import { createTokenStore } from '../../auth/token-store.ts';
import type { Config } from '../../index.ts';
import { gitCredentialCommand } from './git-credential.ts';
import { loginCommand } from './login.ts';

/**
 * Build the `auth` command group.
 * Subcommands: login, git-credential (and future: status, repos, signout, pat)
 */
export function authCommand(getConfig?: () => Config): Command {
  const cmd = new Command('auth');
  cmd.description('GitHub authentication management');

  const getTokenStore = () => createTokenStore();
  const cfg = getConfig ?? (() => ({}) as Config);

  cmd.addCommand(loginCommand(cfg, getTokenStore));
  cmd.addCommand(gitCredentialCommand(getTokenStore));

  return cmd;
}
