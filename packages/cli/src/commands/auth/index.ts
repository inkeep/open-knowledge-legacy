import { Command } from 'commander';
import { createTokenStore } from '../../auth/token-store.ts';
import type { Config } from '../../index.ts';
import { gitCredentialCommand } from './git-credential.ts';
import { loginCommand } from './login.ts';
import { patCommand } from './pat.ts';
import { reposCommand } from './repos.ts';
import { signoutCommand } from './signout.ts';
import { statusCommand } from './status.ts';

/**
 * Build the `auth` command group.
 * Subcommands: login, status, repos, signout, pat, git-credential
 */
export function authCommand(getConfig?: () => Config): Command {
  const cmd = new Command('auth');
  cmd.description('GitHub authentication management');

  const getTokenStore = () => createTokenStore();
  const cfg = getConfig ?? (() => ({}) as Config);

  cmd.addCommand(loginCommand(cfg, getTokenStore));
  cmd.addCommand(statusCommand(getTokenStore));
  cmd.addCommand(reposCommand(getTokenStore));
  cmd.addCommand(signoutCommand(getTokenStore));
  cmd.addCommand(patCommand(getTokenStore));
  cmd.addCommand(gitCredentialCommand(getTokenStore));

  return cmd;
}
