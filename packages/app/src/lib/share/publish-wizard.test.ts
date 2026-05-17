import { describe, expect, mock, test } from 'bun:test';
import {
  buildSamlSsoAuthorizeUrl,
  canSubmitPublish,
  copyPostPublishShareUrl,
  extractFolderBasename,
  fetchPublishNameCheck,
  fetchPublishOwners,
  presentPublishError,
  resolveNameCheckStatus,
  sanitizeRepoName,
  submitPublishRequest,
} from './publish-wizard';
import { runShareAction } from './run-share-action';

describe('sanitizeRepoName', () => {
  test('keeps allowed alphanumerics + . _ -', () => {
    expect(sanitizeRepoName('my-repo_v1.2')).toBe('my-repo_v1.2');
  });

  test('drops spaces + other punctuation', () => {
    expect(sanitizeRepoName('my repo (final)')).toBe('myrepofinal');
  });

  test('drops unicode characters (server-side regex rejects them)', () => {
    expect(sanitizeRepoName('Q4 OKRs — Marketing')).toBe('Q4OKRsMarketing');
  });

  test('collapses runs of separators and trims leading/trailing', () => {
    expect(sanitizeRepoName('--hello---world..foo--')).toBe('hello-world.foo');
    expect(sanitizeRepoName('..dotted..')).toBe('dotted');
  });

  test('empty input yields empty string', () => {
    expect(sanitizeRepoName('')).toBe('');
    expect(sanitizeRepoName('   ')).toBe('');
    expect(sanitizeRepoName('---')).toBe('');
  });
});

describe('extractFolderBasename', () => {
  test('extracts trailing POSIX segment', () => {
    expect(extractFolderBasename('/Users/me/Projects/marketing-playbook')).toBe(
      'marketing-playbook',
    );
  });

  test('extracts trailing Windows segment', () => {
    expect(extractFolderBasename('C:\\Users\\me\\Projects\\Foo')).toBe('Foo');
  });

  test('tolerates trailing separators', () => {
    expect(extractFolderBasename('/Users/me/Foo/')).toBe('Foo');
    expect(extractFolderBasename('/Users/me/Foo///')).toBe('Foo');
  });

  test('empty input yields empty string', () => {
    expect(extractFolderBasename('')).toBe('');
  });

  test('no-separator input returns the input unchanged', () => {
    expect(extractFolderBasename('foo')).toBe('foo');
  });
});

describe('buildSamlSsoAuthorizeUrl', () => {
  test('builds the GitHub org-policies-applications URL', () => {
    expect(buildSamlSsoAuthorizeUrl('inkeep')).toBe(
      'https://github.com/orgs/inkeep/policies/applications',
    );
  });

  test('percent-encodes the org login (defensive — orgs are alphanumeric in practice)', () => {
    expect(buildSamlSsoAuthorizeUrl('weird org')).toBe(
      'https://github.com/orgs/weird%20org/policies/applications',
    );
  });
});

describe('presentPublishError', () => {
  test('name-conflict routes to edit-name + interpolates owner/name', () => {
    const r = presentPublishError('name-conflict', 'inkeep', 'demo');
    expect(r.next.kind).toBe('edit-name');
    expect(r.banner).toContain('inkeep/demo');
    expect(r.banner).toContain('already exists');
    expect(r.banner).not.toContain('<name>');
  });

  test('saml-sso surfaces the authorize URL', () => {
    const r = presentPublishError('saml-sso', 'inkeep', 'demo');
    expect(r.next).toEqual({
      kind: 'authorize-org',
      authorizeUrl: 'https://github.com/orgs/inkeep/policies/applications',
    });
    expect(r.banner).toContain('authorize Open Knowledge for inkeep');
  });

  test('push-failed routes to retry-push + interpolates owner/name', () => {
    const r = presentPublishError('push-failed', 'me', 'demo');
    expect(r.next.kind).toBe('retry-push');
    expect(r.banner).toContain('me/demo');
    expect(r.banner).toContain('push failed');
    expect(r.banner).not.toContain('<name>');
  });

  test('auth-required routes to reauth', () => {
    const r = presentPublishError('auth-required', 'me', 'demo');
    expect(r.next.kind).toBe('reauth');
  });

  test('init-failed / network / no-project all route to edit-form', () => {
    expect(presentPublishError('init-failed', 'me', 'demo').next.kind).toBe('edit-form');
    expect(presentPublishError('network', 'me', 'demo').next.kind).toBe('edit-form');
    expect(presentPublishError('no-project', 'me', 'demo').next.kind).toBe('edit-form');
  });
});

describe('fetchPublishOwners', () => {
  test('parses a happy-path body and returns owners array', async () => {
    const fakeFetch = mock(async () =>
      makeJsonResponse({
        ok: true,
        owners: [
          { login: 'me', kind: 'user', avatarUrl: 'https://x/y.png' },
          { login: 'inkeep', kind: 'org' },
        ],
      }),
    ) as unknown as typeof fetch;

    const res = await fetchPublishOwners(fakeFetch);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.owners).toHaveLength(2);
      expect(res.owners[0]).toEqual({
        login: 'me',
        kind: 'user',
        avatarUrl: 'https://x/y.png',
      });
    }
  });

  test('parses an auth-required error body', async () => {
    const fakeFetch = mock(async () =>
      makeJsonResponse({ ok: false, error: 'auth-required' }),
    ) as unknown as typeof fetch;

    const res = await fetchPublishOwners(fakeFetch);
    expect(res).toEqual({ ok: false, error: 'auth-required' });
  });

  test('throws on non-2xx transport status', async () => {
    const fakeFetch = mock(async () => makeJsonResponse({}, 500)) as unknown as typeof fetch;

    await expect(fetchPublishOwners(fakeFetch)).rejects.toThrow('owners transport 500');
  });

  test('throws on response shape mismatch', async () => {
    const fakeFetch = mock(async () =>
      makeJsonResponse({ ok: true, owners: 'not-an-array' }),
    ) as unknown as typeof fetch;

    await expect(fetchPublishOwners(fakeFetch)).rejects.toThrow('owners response shape mismatch');
  });
});

describe('fetchPublishNameCheck', () => {
  test('builds URL with URL-encoded query params and returns body', async () => {
    let capturedUrl: string | null = null;
    const fakeFetch = mock(async (url: string) => {
      capturedUrl = url;
      return makeJsonResponse({ ok: true, available: true });
    }) as unknown as typeof fetch;

    const res = await fetchPublishNameCheck('inkeep org', 'my repo', fakeFetch);
    expect(capturedUrl).toBe('/api/share/publish/name-check?owner=inkeep%20org&name=my%20repo');
    expect(res).toEqual({ ok: true, available: true });
  });

  test('parses taken response', async () => {
    const fakeFetch = mock(async () =>
      makeJsonResponse({ ok: true, available: false }),
    ) as unknown as typeof fetch;

    const res = await fetchPublishNameCheck('inkeep', 'taken', fakeFetch);
    expect(res).toEqual({ ok: true, available: false });
  });

  test('throws on non-2xx transport status', async () => {
    const fakeFetch = mock(async () => makeJsonResponse({}, 503)) as unknown as typeof fetch;

    await expect(fetchPublishNameCheck('me', 'x', fakeFetch)).rejects.toThrow(
      'name-check transport 503',
    );
  });
});

describe('resolveNameCheckStatus', () => {
  test('available branch', () => {
    expect(resolveNameCheckStatus({ ok: true, available: true }, 'me', 'foo')).toEqual({
      kind: 'available',
    });
  });

  test('taken branch carries owner + name for banner rendering', () => {
    expect(resolveNameCheckStatus({ ok: true, available: false }, 'me', 'foo')).toEqual({
      kind: 'taken',
      owner: 'me',
      name: 'foo',
    });
  });

  test('auth-required surfaces sign-in banner', () => {
    const result = resolveNameCheckStatus({ ok: false, error: 'auth-required' }, 'me', 'foo');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.banner).toMatch(/sign-in expired/i);
    }
  });

  test('network error surfaces generic banner', () => {
    const result = resolveNameCheckStatus({ ok: false, error: 'network' }, 'me', 'foo');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.banner).toMatch(/reach GitHub/i);
    }
  });
});

describe('canSubmitPublish', () => {
  const owner = { login: 'me', kind: 'user' as const };

  test('enabled when all gates pass', () => {
    expect(
      canSubmitPublish({
        owner,
        sanitizedName: 'my-repo',
        nameCheck: { kind: 'available' },
        submitting: false,
      }),
    ).toBe(true);
  });

  test('disabled while submitting', () => {
    expect(
      canSubmitPublish({
        owner,
        sanitizedName: 'my-repo',
        nameCheck: { kind: 'available' },
        submitting: true,
      }),
    ).toBe(false);
  });

  test('disabled when no owner picked', () => {
    expect(
      canSubmitPublish({
        owner: null,
        sanitizedName: 'my-repo',
        nameCheck: { kind: 'available' },
        submitting: false,
      }),
    ).toBe(false);
  });

  test('disabled when sanitized name is empty', () => {
    expect(
      canSubmitPublish({
        owner,
        sanitizedName: '',
        nameCheck: { kind: 'available' },
        submitting: false,
      }),
    ).toBe(false);
  });

  test('disabled when name-check is not available (pending/checking/taken/error/idle)', () => {
    for (const nameCheck of [
      { kind: 'idle' } as const,
      { kind: 'pending' } as const,
      { kind: 'checking' } as const,
      { kind: 'taken', owner: 'me', name: 'x' } as const,
      { kind: 'error', banner: 'oops' } as const,
    ]) {
      expect(
        canSubmitPublish({
          owner,
          sanitizedName: 'my-repo',
          nameCheck,
          submitting: false,
        }),
      ).toBe(false);
    }
  });
});

describe('submitPublishRequest', () => {
  test('POSTs JSON body and returns happy-path response', async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = mock(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return makeJsonResponse({
        ok: true,
        ownerLogin: 'me',
        repoName: 'my-repo',
        cloneUrl: 'https://github.com/me/my-repo.git',
        defaultBranch: 'main',
      });
    }) as unknown as typeof fetch;

    const res = await submitPublishRequest(
      {
        owner: 'me',
        name: 'my-repo',
        visibility: 'private',
        description: 'hello',
      },
      fakeFetch,
    );
    expect(res.ok).toBe(true);
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(capturedInit?.body).toBe(
      JSON.stringify({
        owner: 'me',
        name: 'my-repo',
        visibility: 'private',
        description: 'hello',
      }),
    );
  });

  test('parses every business error variant of the discriminated union', async () => {
    const codes = [
      'name-conflict',
      'saml-sso',
      'auth-required',
      'push-failed',
      'init-failed',
      'network',
      'no-project',
    ] as const;
    for (const error of codes) {
      const fakeFetch = mock(async () =>
        makeJsonResponse({ ok: false, error }),
      ) as unknown as typeof fetch;

      const res = await submitPublishRequest(
        {
          owner: 'me',
          name: 'x',
          visibility: 'private',
        },
        fakeFetch,
      );
      expect(res).toEqual({ ok: false, error });
    }
  });

  test('throws on non-2xx transport status', async () => {
    const fakeFetch = mock(async () => makeJsonResponse({}, 502)) as unknown as typeof fetch;

    await expect(
      submitPublishRequest({ owner: 'me', name: 'x', visibility: 'private' }, fakeFetch),
    ).rejects.toThrow('publish transport 502');
  });

  test('throws on response shape mismatch', async () => {
    const fakeFetch = mock(async () =>
      makeJsonResponse({ ok: true /* missing other fields */ }),
    ) as unknown as typeof fetch;

    await expect(
      submitPublishRequest({ owner: 'me', name: 'x', visibility: 'private' }, fakeFetch),
    ).rejects.toThrow('publish response shape mismatch');
  });
});

describe('copyPostPublishShareUrl', () => {
  test('routes through real runShareAction: server URL lands on clipboard + toast fires', async () => {
    const clipboardTexts: string[] = [];
    const successToasts: string[] = [];
    const errorToasts: string[] = [];
    const logs: string[] = [];
    const calls: { url: string; init: RequestInit | undefined }[] = [];

    const fetchFn = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return makeJsonResponse({
        ok: true,
        shareUrl: 'https://openknowledge.ai/d/abc',
        blobUrl: 'https://github.com/inkeep/playbooks/blob/main/AGENTS.md',
        branch: 'main',
      });
    }) as unknown as typeof fetch;

    await copyPostPublishShareUrl('AGENTS.md', {
      runShareAction,
      clipboardWrite: async (text) => {
        clipboardTexts.push(text);
      },
      toastSuccess: (msg) => {
        successToasts.push(msg);
      },
      toastError: (msg) => {
        errorToasts.push(msg);
      },
      logEvent: (msg) => {
        logs.push(msg);
      },
      fetchFn,
    });

    expect(clipboardTexts).toEqual(['https://openknowledge.ai/d/abc']);
    expect(successToasts).toEqual(['Link copied.']);
    expect(errorToasts).toEqual([]);
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[share] action=link-construct');
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain('/api/share/construct-url');
    expect(calls[0].init?.method).toBe('POST');
  });

  test('toastError fires + clipboard untouched when construct-url returns business error', async () => {
    const clipboardTexts: string[] = [];
    const successToasts: string[] = [];
    const errorToasts: string[] = [];
    const fetchFn = mock(async () =>
      makeJsonResponse({ ok: false, error: 'detached-head' }),
    ) as unknown as typeof fetch;
    await copyPostPublishShareUrl('AGENTS.md', {
      runShareAction,
      clipboardWrite: async (text) => {
        clipboardTexts.push(text);
      },
      toastSuccess: (msg) => {
        successToasts.push(msg);
      },
      toastError: (msg) => {
        errorToasts.push(msg);
      },
      logEvent: () => {},
      fetchFn,
    });
    expect(clipboardTexts).toEqual([]);
    expect(successToasts).toEqual([]);
    expect(errorToasts.length).toBe(1);
    expect(errorToasts[0]).toContain('Switch to a branch');
  });
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
