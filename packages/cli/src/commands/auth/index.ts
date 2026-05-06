import { Command } from 'commander';
import { createTokenStore } from '../../auth/token-store.ts';
import { gitCredentialCommand } from './git-credential.ts';
import { loginCommand } from './login.ts';
import { patCommand } from './pat.ts';
import { reposCommand } from './repos.ts';
import { signoutCommand } from './signout.ts';
import { statusCommand } from './status.ts';

export function authCommand(): Command {
  const cmd = new Command('auth');
  cmd.description('GitHub authentication management');

  const getTokenStore = () => createTokenStore();

  cmd.addCommand(loginCommand(getTokenStore));
  cmd.addCommand(statusCommand(getTokenStore));
  cmd.addCommand(reposCommand(getTokenStore));
  cmd.addCommand(signoutCommand(getTokenStore));
  cmd.addCommand(patCommand(getTokenStore));
  cmd.addCommand(gitCredentialCommand(getTokenStore));

  return cmd;
}
