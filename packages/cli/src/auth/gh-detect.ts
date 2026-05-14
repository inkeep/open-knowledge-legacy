import { execFileSync } from 'node:child_process';

export interface GhDetectResult {
  available: boolean;
  token?: string;
}

export function detectGh(host?: string): GhDetectResult {
  try {
    const args = ['auth', 'token', ...(host ? ['--hostname', host] : [])];
    const token = execFileSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (token.length === 0) return { available: false };
    return { available: true, token };
  } catch {
    return { available: false };
  }
}
