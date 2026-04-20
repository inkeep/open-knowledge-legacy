import { Command } from 'commander';
import type { TokenStore } from '../../auth/token-store.ts';

export interface SignoutOptions {
  host: string;
}

export async function runSignout(opts: SignoutOptions, tokenStore: TokenStore): Promise<void> {
  const { host } = opts;
  await tokenStore.clear(host);
  process.stderr.write(`✓ Signed out from ${host}\n`);
}

export function signoutCommand(getTokenStore: () => Promise<TokenStore>): Command {
  return new Command('signout')
    .description('Remove stored credentials')
    .option('--host <host>', 'GitHub hostname', 'github.com')
    .action(async (opts: SignoutOptions) => {
      await runSignout(opts, await getTokenStore());
    });
}
