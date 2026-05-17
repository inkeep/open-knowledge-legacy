import { describe, expect, test } from 'bun:test';

import type {
  OkShareReceivedPayload,
  RecentProjectEntry,
  ShareFolderValidationResult,
} from '@/lib/desktop-bridge-types';

import {
  buildCloneUrl,
  canonicalGitHubRemoteUrl,
  findQ1Match,
  formatReceiveLog,
  mapValidationToToast,
  presentReceiveError,
  resolveSharePayload,
} from './receive-flow';

describe('canonicalGitHubRemoteUrl', () => {
  test('emits https github.git form for plain owner/repo', () => {
    expect(canonicalGitHubRemoteUrl({ owner: 'inkeep', repo: 'open-knowledge' })).toBe(
      'https://github.com/inkeep/open-knowledge.git',
    );
  });

  test('preserves casing in the canonical form', () => {
    expect(canonicalGitHubRemoteUrl({ owner: 'Inkeep', repo: 'Open-Knowledge' })).toBe(
      'https://github.com/Inkeep/Open-Knowledge.git',
    );
  });
});

describe('buildCloneUrl', () => {
  test('matches the canonical .git form (the clone wizard accepts both forms equally)', () => {
    expect(buildCloneUrl({ owner: 'inkeep', repo: 'open-knowledge' })).toBe(
      'https://github.com/inkeep/open-knowledge.git',
    );
  });
});

describe('findQ1Match', () => {
  const expected = { owner: 'inkeep', repo: 'open-knowledge' };

  function recent(overrides: Partial<RecentProjectEntry> = {}): RecentProjectEntry {
    return {
      path: '/Users/me/projects/something',
      name: 'something',
      lastOpenedAt: '2026-05-15T00:00:00.000Z',
      ...overrides,
    };
  }

  test('returns null on an empty list', () => {
    expect(findQ1Match([], expected)).toBeNull();
  });

  test('returns the first matching entry by canonical .git form', () => {
    const a = recent({ path: '/a', gitRemoteUrl: 'https://github.com/other/repo.git' });
    const b = recent({
      path: '/b',
      gitRemoteUrl: 'https://github.com/inkeep/open-knowledge.git',
    });
    const c = recent({
      path: '/c',
      gitRemoteUrl: 'https://github.com/inkeep/open-knowledge.git',
    });
    expect(findQ1Match([a, b, c], expected)?.path).toBe('/b');
  });

  test('matches case-insensitively on owner and repo segments', () => {
    const r = recent({
      path: '/x',
      gitRemoteUrl: 'https://github.com/Inkeep/Open-Knowledge.git',
    });
    expect(findQ1Match([r], expected)?.path).toBe('/x');
  });

  test('matches when the stored URL omits the .git suffix', () => {
    const r = recent({ path: '/x', gitRemoteUrl: 'https://github.com/inkeep/open-knowledge' });
    expect(findQ1Match([r], expected)?.path).toBe('/x');
  });

  test('matches when the stored URL has a trailing slash', () => {
    const r = recent({ path: '/x', gitRemoteUrl: 'https://github.com/inkeep/open-knowledge/' });
    expect(findQ1Match([r], expected)?.path).toBe('/x');
  });

  test('skips entries without gitRemoteUrl', () => {
    const r = recent({ path: '/x' });
    expect(findQ1Match([r], expected)).toBeNull();
  });

  test('skips entries marked missing even when the URL matches', () => {
    const r = recent({
      path: '/x',
      gitRemoteUrl: 'https://github.com/inkeep/open-knowledge.git',
      missing: true,
    });
    expect(findQ1Match([r], expected)).toBeNull();
  });

  test('returns null when no entry matches', () => {
    const r = recent({ path: '/x', gitRemoteUrl: 'https://github.com/other/thing.git' });
    expect(findQ1Match([r], expected)).toBeNull();
  });

  test('documents Q1 gap: SSH-form stored URL misses match — falls through to Q2', () => {
    const r = recent({
      path: '/x',
      gitRemoteUrl: 'git@github.com:inkeep/open-knowledge.git',
    });
    expect(findQ1Match([r], expected)).toBeNull();
  });
});

describe('mapValidationToToast', () => {
  const expected = { owner: 'inkeep', repo: 'open-knowledge' };

  function withKind<K extends ShareFolderValidationResult['kind']>(
    kind: K,
    extras: Partial<ShareFolderValidationResult> = {},
  ): ShareFolderValidationResult {
    if (kind === 'ok') {
      return { kind: 'ok', gitRemoteUrl: 'https://github.com/inkeep/open-knowledge.git' };
    }
    if (kind === 'wrong-repo') {
      return {
        kind: 'wrong-repo',
        actualOwner: extras && 'actualOwner' in extras ? (extras.actualOwner ?? 'a') : 'a',
        actualRepo: extras && 'actualRepo' in extras ? (extras.actualRepo ?? 'b') : 'b',
      };
    }
    return { kind } as ShareFolderValidationResult;
  }

  test('returns null on ok (no toast — caller proceeds)', () => {
    expect(mapValidationToToast(withKind('ok'), expected)).toBeNull();
  });

  test('not-git surfaces the not-a-git-repo prompt', () => {
    expect(mapValidationToToast(withKind('not-git'), expected)).toBe(
      "This folder doesn't contain a git repository. Pick a different folder?",
    );
  });

  test('wrong-repo surfaces the actual vs expected owner/repo per the spec AC', () => {
    const result = withKind('wrong-repo', { actualOwner: 'forky', actualRepo: 'spoon' });
    expect(mapValidationToToast(result, expected)).toBe(
      'This folder is a clone of forky/spoon, not inkeep/open-knowledge. Pick a different folder?',
    );
  });

  test('non-github + symlink-escape + no-origin all surface the wrong-repo generic prompt (Q-A9 v1 simplification)', () => {
    expect(mapValidationToToast(withKind('non-github'), expected)).toBe(
      "This folder isn't a clone of inkeep/open-knowledge. Pick a different folder?",
    );
    expect(mapValidationToToast(withKind('symlink-escape'), expected)).toBe(
      "This folder isn't a clone of inkeep/open-knowledge. Pick a different folder?",
    );
    expect(mapValidationToToast(withKind('no-origin'), expected)).toBe(
      "This folder isn't a clone of inkeep/open-knowledge. Pick a different folder?",
    );
  });
});

describe('presentReceiveError', () => {
  test('ok payload returns null (caller proceeds)', () => {
    const payload: OkShareReceivedPayload = {
      kind: 'ok',
      owner: 'a',
      repo: 'b',
      branch: 'main',
      path: 'README.md',
      blobUrl: 'https://github.com/a/b/blob/main/README.md',
    };
    expect(presentReceiveError(payload)).toBeNull();
  });

  test('unsupported-version payload returns the update prompt', () => {
    expect(presentReceiveError({ kind: 'unsupported-version' })).toEqual({
      kind: 'unsupported-version',
      message: 'Update Open Knowledge to open this share.',
    });
  });

  test('invalid payload returns the invalid prompt', () => {
    expect(presentReceiveError({ kind: 'invalid' })).toEqual({
      kind: 'invalid',
      message: 'Invalid share URL.',
    });
  });
});

describe('resolveSharePayload', () => {
  test('returns the resolved tuple for an ok payload', () => {
    const payload: OkShareReceivedPayload = {
      kind: 'ok',
      owner: 'a',
      repo: 'b',
      branch: 'feat-x',
      path: 'docs/guide.md',
      blobUrl: 'https://github.com/a/b/blob/feat-x/docs/guide.md',
    };
    expect(resolveSharePayload(payload)).toEqual({
      owner: 'a',
      repo: 'b',
      branch: 'feat-x',
      path: 'docs/guide.md',
      blobUrl: 'https://github.com/a/b/blob/feat-x/docs/guide.md',
    });
  });

  test('returns null for non-ok payloads', () => {
    expect(resolveSharePayload({ kind: 'unsupported-version' })).toBeNull();
    expect(resolveSharePayload({ kind: 'invalid' })).toBeNull();
  });
});

describe('formatReceiveLog', () => {
  test('emits the bracket-prefix shape with whichever fields are set', () => {
    expect(formatReceiveLog({ q1_hit: true })).toBe('[receive] q1_hit=true');
    expect(formatReceiveLog({ q1_hit: false })).toBe('[receive] q1_hit=false');
    expect(formatReceiveLog({ q2_path: 'clone' })).toBe('[receive] q2_path=clone');
    expect(formatReceiveLog({ q2_path: 'local' })).toBe('[receive] q2_path=local');
    expect(formatReceiveLog({ folder_validate: 'wrong-repo' })).toBe(
      '[receive] folder_validate=wrong-repo',
    );
    expect(formatReceiveLog({ q1_hit: false, q2_path: 'local', folder_validate: 'ok' })).toBe(
      '[receive] q1_hit=false q2_path=local folder_validate=ok',
    );
  });

  test('emits just the prefix with no fields', () => {
    expect(formatReceiveLog({})).toBe('[receive]');
  });
});
