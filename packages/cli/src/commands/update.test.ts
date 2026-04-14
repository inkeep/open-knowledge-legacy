import { describe, expect, it } from 'bun:test';
import {
  compareVersions,
  detectPackageManager,
  fetchLatestVersion,
  formatUpdateResult,
  getInstallCommand,
  readCliVersion,
  runUpdate,
  type UpdateCommandResult,
} from './update.ts';

describe('readCliVersion', () => {
  it('reads the version from the CLI package.json', () => {
    const v = readCliVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('detectPackageManager', () => {
  it('detects bun', () => {
    expect(detectPackageManager({ npm_config_user_agent: 'bun/1.3.11 npm/?' })).toBe('bun');
  });
  it('detects pnpm', () => {
    expect(detectPackageManager({ npm_config_user_agent: 'pnpm/9.0.0 npm/?' })).toBe('pnpm');
  });
  it('detects yarn', () => {
    expect(detectPackageManager({ npm_config_user_agent: 'yarn/1.22.0 npm/?' })).toBe('yarn');
  });
  it('falls back to npm', () => {
    expect(detectPackageManager({})).toBe('npm');
    expect(detectPackageManager({ npm_config_user_agent: 'npm/10.0.0 node/v22' })).toBe('npm');
  });
});

describe('getInstallCommand', () => {
  it('returns the global install command for each package manager', () => {
    expect(getInstallCommand('npm', '@inkeep/open-knowledge')).toBe(
      'npm install -g @inkeep/open-knowledge@latest',
    );
    expect(getInstallCommand('bun', '@inkeep/open-knowledge')).toBe(
      'bun add -g @inkeep/open-knowledge@latest',
    );
    expect(getInstallCommand('pnpm', '@inkeep/open-knowledge')).toBe(
      'pnpm add -g @inkeep/open-knowledge@latest',
    );
    expect(getInstallCommand('yarn', '@inkeep/open-knowledge')).toBe(
      'yarn global add @inkeep/open-knowledge@latest',
    );
  });
});

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.0.1', '0.0.2')).toBeLessThan(0);
  });
  it('strips leading v and prerelease suffix', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0);
  });
});

function mockFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    return Promise.resolve(handler(url));
  }) as typeof fetch;
}

describe('fetchLatestVersion', () => {
  it('returns the version when the registry responds 200', async () => {
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ version: '1.2.3' }), { status: 200 }),
    );
    const v = await fetchLatestVersion({
      packageName: '@inkeep/open-knowledge',
      fetchImpl,
    });
    expect(v).toBe('1.2.3');
  });

  it('returns undefined on 404', async () => {
    const fetchImpl = mockFetch(() => new Response('', { status: 404 }));
    const v = await fetchLatestVersion({
      packageName: '@inkeep/open-knowledge',
      fetchImpl,
    });
    expect(v).toBeUndefined();
  });

  it('throws on other non-ok responses', async () => {
    const fetchImpl = mockFetch(
      () => new Response('', { status: 500, statusText: 'Internal Server Error' }),
    );
    await expect(
      fetchLatestVersion({ packageName: '@inkeep/open-knowledge', fetchImpl }),
    ).rejects.toThrow(/500/);
  });

  it('hits /<package>/latest on the registry', async () => {
    let seen = '';
    const fetchImpl = mockFetch((url) => {
      seen = url;
      return new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 });
    });
    await fetchLatestVersion({
      packageName: '@inkeep/open-knowledge',
      registryUrl: 'https://registry.example.com',
      fetchImpl,
    });
    expect(seen).toBe('https://registry.example.com/@inkeep/open-knowledge/latest');
  });
});

describe('runUpdate', () => {
  it('reports not-published when the registry returns 404', async () => {
    const fetchImpl = mockFetch(() => new Response('', { status: 404 }));
    const result = await runUpdate({ fetchImpl, pm: 'npm' });
    expect(result.action).toBe('not-published');
    expect(result.installCommand).toBe('npm install -g @inkeep/open-knowledge@latest');
  });

  it('reports up-to-date when current === latest', async () => {
    const current = readCliVersion();
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ version: current }), { status: 200 }),
    );
    const result = await runUpdate({ fetchImpl, pm: 'bun' });
    expect(result.action).toBe('up-to-date');
    expect(result.latest).toBe(current);
  });

  it('reports checked without installing when --check and newer available', async () => {
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 }),
    );
    let execCalled = false;
    const result = await runUpdate({
      fetchImpl,
      pm: 'npm',
      check: true,
      execImpl: () => {
        execCalled = true;
      },
    });
    expect(result.action).toBe('checked');
    expect(result.latest).toBe('99.0.0');
    expect(execCalled).toBe(false);
  });

  it('invokes the install command when a newer version is available', async () => {
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 }),
    );
    let seenCmd = '';
    const result = await runUpdate({
      fetchImpl,
      pm: 'bun',
      execImpl: (cmd) => {
        seenCmd = cmd;
      },
    });
    expect(result.action).toBe('installed');
    expect(seenCmd).toBe('bun add -g @inkeep/open-knowledge@latest');
  });

  it('reports failed when the install command throws', async () => {
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ version: '99.0.0' }), { status: 200 }),
    );
    const result = await runUpdate({
      fetchImpl,
      pm: 'npm',
      execImpl: () => {
        throw new Error('permission denied');
      },
    });
    expect(result.action).toBe('failed');
    expect(result.error).toContain('permission denied');
  });

  it('reports failed when the registry query throws', async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error('ENETUNREACH');
    });
    const result = await runUpdate({ fetchImpl, pm: 'npm' });
    expect(result.action).toBe('failed');
    expect(result.error).toContain('ENETUNREACH');
  });
});

describe('formatUpdateResult', () => {
  const base = {
    current: '0.0.1',
    packageManager: 'npm' as const,
    installCommand: 'npm install -g @inkeep/open-knowledge@latest',
  };

  it('formats not-published results', () => {
    const r: UpdateCommandResult = { ...base, action: 'not-published' };
    expect(formatUpdateResult(r)).toContain('not yet published');
  });

  it('formats up-to-date results', () => {
    const r: UpdateCommandResult = {
      ...base,
      action: 'up-to-date',
      latest: '0.0.1',
    };
    expect(formatUpdateResult(r)).toContain('Already up to date');
  });

  it('formats checked results with the install command', () => {
    const r: UpdateCommandResult = {
      ...base,
      action: 'checked',
      latest: '0.0.2',
    };
    const out = formatUpdateResult(r);
    expect(out).toContain('newer version is available');
    expect(out).toContain('npm install -g @inkeep/open-knowledge@latest');
  });

  it('formats installed results', () => {
    const r: UpdateCommandResult = {
      ...base,
      action: 'installed',
      latest: '0.0.2',
    };
    expect(formatUpdateResult(r)).toContain('Updated via npm');
  });

  it('formats failed results with a manual-retry hint', () => {
    const r: UpdateCommandResult = {
      ...base,
      action: 'failed',
      error: 'boom',
    };
    const out = formatUpdateResult(r);
    expect(out).toContain('Update failed');
    expect(out).toContain('retry manually');
  });
});
