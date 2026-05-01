import { execFileSync } from 'node:child_process';

export interface GhDetectResult {
  available: boolean;
  token?: string;
}

export function detectGh(): GhDetectResult {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
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
