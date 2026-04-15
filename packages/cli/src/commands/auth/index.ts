import { Command } from 'commander';
import { createTokenStore } from '../../auth/token-store.ts';
import { gitCredentialCommand } from './git-credential.ts';

/**
 * Build the `auth` command group.
 * Subcommands: git-credential (and future: login, status, repos, signout, pat)
 */
export function authCommand(): Command {
  const cmd = new Command('auth');
  cmd.description('GitHub authentication management');

  const getTokenStore = () => createTokenStore();
  cmd.addCommand(gitCredentialCommand(getTokenStore));

  return cmd;
}
