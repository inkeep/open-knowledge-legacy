import { homedir } from 'node:os';
import { join } from 'node:path';

const defaultProvider = (): string | null => {
  try {
    return homedir();
  } catch {
    return null;
  }
};

let userHomeProvider: () => string | null = defaultProvider;

export const USER_TEMPLATES_SOURCE_LABEL = '~/.ok';

export function getUserHome(): string | null {
  return userHomeProvider();
}

export function getUserTemplatesDir(): string | null {
  const home = userHomeProvider();
  if (!home) return null;
  return join(home, '.ok', 'templates');
}

export function __setUserHomeProviderForTest(fn: () => string | null): void {
  userHomeProvider = fn;
}

export function __resetUserHomeProviderForTest(): void {
  userHomeProvider = defaultProvider;
}
