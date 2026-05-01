import { Octokit } from '@octokit/rest';
import { Command } from 'commander';
import type { TokenStore } from '../../auth/token-store.ts';
import { validateGitHubHost } from './validate-host.ts';

interface ReposOptions {
  host: string;
  json: boolean;
}

async function runRepos(opts: ReposOptions, tokenStore: TokenStore): Promise<void> {
  const { host, json } = opts;
  validateGitHubHost(host);
  const entry = await tokenStore.get(host);
  if (entry == null) {
    process.stderr.write(`Not logged in to ${host}\n`);
    process.exit(1);
  }

  const baseUrl = host === 'github.com' ? undefined : `https://${host}/api/v3`;
  const octokit = new Octokit({ auth: entry.token, ...(baseUrl ? { baseUrl } : {}) });

  const repos: { full_name: string; clone_url: string; private: boolean }[] = [];
  for await (const response of octokit.paginate.iterator(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: 'updated',
  })) {
    for (const repo of response.data) {
      repos.push({ full_name: repo.full_name, clone_url: repo.clone_url, private: repo.private });
    }
  }

  if (json) {
    process.stdout.write(`${JSON.stringify({ type: 'repos', host, repos })}\n`);
  } else {
    for (const r of repos) {
      process.stdout.write(`${r.full_name}  ${r.clone_url}\n`);
    }
  }
}

export function reposCommand(getTokenStore: () => Promise<TokenStore>): Command {
  return new Command('repos')
    .description('List accessible repositories')
    .option('--host <host>', 'GitHub or GitHub Enterprise hostname', 'github.com')
    .option('--json', 'Output JSON', false)
    .action(async (opts: ReposOptions) => {
      await runRepos(opts, await getTokenStore());
    });
}
