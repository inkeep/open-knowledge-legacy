import type { Readable, Writable } from 'node:stream';
import { Command } from 'commander';
import type { TokenStore } from '../../auth/token-store.ts';

/**
 * Core git credential-helper get logic.
 *
 * Reads key=value pairs from `input` until blank line or EOF, looks up
 * credentials in `tokenStore` by hostname, and writes the result to `output`.
 *
 * Returns 0 on success, 1 if no credentials found.
 */
export async function handleCredentialGet(
  input: Readable,
  output: Writable,
  tokenStore: TokenStore,
): Promise<number> {
  const text = await readAll(input);
  const attrs = parseCredentialInput(text);
  const host = attrs.host ?? '';

  if (!host) return 1;

  const entry = await tokenStore.get(host);
  if (entry == null) return 1;

  // Git's credential protocol is newline-delimited `key=value`. If `login` or
  // `token` contained CR/LF (e.g. via a crafted OAuth profile flowing through
  // TokenEntry), an unsanitized write would inject arbitrary protocol fields
  // such as `\nurl=http://evil\npassword=stolen`. Strip them before writing.
  const safeLine = (s: string) => s.replace(/[\r\n]/g, '');
  output.write(`username=${safeLine(entry.login)}\npassword=${safeLine(entry.token)}\n`);
  return 0;
}

function parseCredentialInput(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return result;
}

function readAll(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

/**
 * Build the `auth git-credential` sub-command.
 * Registered under the `auth` command group.
 */
export function gitCredentialCommand(getTokenStore: () => Promise<TokenStore>): Command {
  const cmd = new Command('git-credential');
  cmd.description('Git credential helper (git credential-helper protocol)');

  cmd
    .command('get')
    .description('Lookup credentials from TokenStore (called by git)')
    .action(async () => {
      const store = await getTokenStore();
      const exitCode = await handleCredentialGet(process.stdin, process.stdout, store);
      process.exit(exitCode);
    });

  return cmd;
}
