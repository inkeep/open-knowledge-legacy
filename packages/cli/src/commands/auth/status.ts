import { Octokit } from '@octokit/rest';
import { Command } from 'commander';
import { detectGh } from '../../auth/gh-detect.ts';
import type { TokenStore } from '../../auth/token-store.ts';
import { validateGitHubHost } from './validate-host.ts';

interface StatusOptions {
  host: string;
  json: boolean;
}

type ResolvedStatusSource = { tier: 'A' | 'B' | 'C'; token: string } | { tier: 'none' };

export async function resolveStatusSource(
  host: string,
  tokenStore: TokenStore,
  _detectGhFn: (host?: string) => ReturnType<typeof detectGh> = detectGh,
): Promise<ResolvedStatusSource> {
  const gh = _detectGhFn(host);
  if (gh.available && gh.token) return { tier: 'A', token: gh.token };
  const entry = await tokenStore.get(host);
  if (entry == null) return { tier: 'none' };
  return { tier: entry.gitProtocol === 'ssh' ? 'C' : 'B', token: entry.token };
}

async function runStatus(opts: StatusOptions, tokenStore: TokenStore): Promise<void> {
  const { host, json } = opts;
  validateGitHubHost(host);

  const source = await resolveStatusSource(host, tokenStore);

  if (source.tier === 'none') {
    if (json) {
      process.stdout.write(`${JSON.stringify({ type: 'status', host, authenticated: false })}\n`);
    } else {
      process.stderr.write(`Not logged in to ${host}\n`);
    }
    process.exit(1);
  }

  const baseUrl = host === 'github.com' ? undefined : `https://${host}/api/v3`;
  const octokit = new Octokit({ auth: source.token, ...(baseUrl ? { baseUrl } : {}) });

  try {
    const { data } = await octokit.users.getAuthenticated();
    if (json) {
      process.stdout.write(
        `${JSON.stringify({
          type: 'status',
          host,
          authenticated: true,
          tier: source.tier,
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
    .option('--host <host>', 'GitHub or GitHub Enterprise hostname', 'github.com')
    .option('--json', 'Output JSON', false)
    .action(async (opts: StatusOptions) => {
      await runStatus(opts, await getTokenStore());
    });
}
