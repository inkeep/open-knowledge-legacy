import { Octokit } from '@octokit/rest';
import { Command } from 'commander';
import type { TokenStore } from '../../auth/token-store.ts';

export interface StatusOptions {
  host: string;
  json: boolean;
}

export async function runStatus(opts: StatusOptions, tokenStore: TokenStore): Promise<void> {
  const { host, json } = opts;
  const entry = await tokenStore.get(host);

  if (entry == null) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ type: 'status', host, authenticated: false })}\n`);
    } else {
      process.stderr.write(`Not logged in to ${host}\n`);
    }
    process.exit(1);
  }

  const baseUrl = host === 'github.com' ? undefined : `https://${host}/api/v3`;
  const octokit = new Octokit({ auth: entry.token, ...(baseUrl ? { baseUrl } : {}) });

  try {
    const { data } = await octokit.users.getAuthenticated();
    if (json) {
      process.stdout.write(
        `${JSON.stringify({
          type: 'status',
          host,
          authenticated: true,
          login: data.login,
          name: data.name,
          email: data.email,
        })}\n`,
      );
    } else {
      process.stderr.write(`✓ Logged in as ${data.login} on ${host}\n`);
    }
  } catch {
    if (json) {
      process.stdout.write(
        JSON.stringify({ type: 'status', host, authenticated: false, error: 'token invalid' }) +
          '\n',
      );
    } else {
      process.stderr.write(`✗ Token invalid for ${host}\n`);
    }
    process.exit(1);
  }
}

export function statusCommand(getTokenStore: () => Promise<TokenStore>): Command {
  return new Command('status')
    .description('Show authentication status')
    .option('--host <host>', 'GitHub hostname', 'github.com')
    .option('--json', 'Output JSON', false)
    .action(async (opts: StatusOptions) => {
      await runStatus(opts, await getTokenStore());
    });
}
