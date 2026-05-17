import { describe, expect, test } from 'bun:test';
import { encodeShareUrl } from '@inkeep/open-knowledge-core';
import { buildCustomSchemeUrl, buildSplashViewModel, SPLASH_DOWNLOAD_URL } from './share-splash.ts';

function encodeV1(blobUrl: string): string {
  return encodeShareUrl(blobUrl);
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('buildSplashViewModel', () => {
  test('decodes a happy-path encoded blob URL into the ok view', () => {
    const blobUrl = 'https://github.com/inkeep/playbooks/blob/main/marketing-playbook.md';
    const encoded = encodeV1(blobUrl);

    const view = buildSplashViewModel(encoded);

    expect(view).toEqual({
      kind: 'ok',
      filename: 'marketing-playbook.md',
      owner: 'inkeep',
      repo: 'playbooks',
      repoPath: 'inkeep/playbooks',
      branch: 'main',
      isDefaultBranch: true,
      blobUrl,
      customSchemeUrl: `openknowledge://share?url=${encodeURIComponent(blobUrl)}`,
      githubUrl: blobUrl,
    });
  });

  test('preserves the filename VERBATIM — no title-case, no extension stripping (D29)', () => {
    const cases: Array<{ blobUrl: string; expectedFilename: string }> = [
      {
        blobUrl: 'https://github.com/o/r/blob/main/OnboardingGuide.md',
        expectedFilename: 'OnboardingGuide.md',
      },
      {
        blobUrl: 'https://github.com/o/r/blob/main/q4-okrs.md',
        expectedFilename: 'q4-okrs.md',
      },
      {
        blobUrl: 'https://github.com/o/r/blob/main/marketing-playbook.md',
        expectedFilename: 'marketing-playbook.md',
      },
    ];

    for (const { blobUrl, expectedFilename } of cases) {
      const view = buildSplashViewModel(encodeV1(blobUrl));
      expect(view.kind).toBe('ok');
      if (view.kind === 'ok') {
        expect(view.filename).toBe(expectedFilename);
      }
    }
  });

  test('decodes a nested doc path and renders the basename as filename', () => {
    const blobUrl = 'https://github.com/inkeep/playbooks/blob/main/docs/sub/page.md';
    const view = buildSplashViewModel(encodeV1(blobUrl));
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.filename).toBe('page.md');
    }
  });

  test('decodes a URL-encoded filename with spaces + em-dash + unicode', () => {
    const blobUrl =
      'https://github.com/inkeep/playbooks/blob/main/docs/Q4%20OKRs%20%E2%80%94%20Marketing.md';
    const view = buildSplashViewModel(encodeV1(blobUrl));
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.filename).toBe('Q4 OKRs — Marketing.md');
    }
  });

  test('flags a non-default branch (FR25 branch indicator path)', () => {
    const blobUrl = 'https://github.com/inkeep/playbooks/blob/feat-x/notes.md';
    const view = buildSplashViewModel(encodeV1(blobUrl));
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.branch).toBe('feat-x');
      expect(view.isDefaultBranch).toBe(false);
    }
  });

  test('flags `master` as a default branch (suppresses indicator)', () => {
    const blobUrl = 'https://github.com/o/r/blob/master/file.md';
    const view = buildSplashViewModel(encodeV1(blobUrl));
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.isDefaultBranch).toBe(true);
    }
  });

  test('decodes a percent-encoded slash-bearing branch as a single branch token', () => {
    const blobUrl = 'https://github.com/inkeep/playbooks/blob/feat%2Fshare/file.md';
    const view = buildSplashViewModel(encodeV1(blobUrl));
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.branch).toBe('feat/share');
      expect(view.filename).toBe('file.md');
      expect(view.isDefaultBranch).toBe(false);
    }
  });

  test('returns `unsupported-version` for a v2-shaped payload', () => {
    const blobBytes = new TextEncoder().encode('https://github.com/o/r/blob/main/file.md');
    const v2 = new Uint8Array([0x02, ...blobBytes]);
    const encoded = uint8ArrayToBase64Url(v2);
    const view = buildSplashViewModel(encoded);
    expect(view).toEqual({ kind: 'unsupported-version', version: 2 });
  });

  test('returns `invalid` for undecodable base64url input', () => {
    expect(buildSplashViewModel('not!valid!base64!!!')).toEqual({ kind: 'invalid' });
  });

  test('returns `invalid` for an empty encoded string', () => {
    expect(buildSplashViewModel('')).toEqual({ kind: 'invalid' });
  });

  test('returns `invalid` when the decoded URL is non-github', () => {
    const blobUrl = 'https://gitlab.com/owner/repo/blob/main/README.md';
    const view = buildSplashViewModel(encodeV1(blobUrl));
    expect(view).toEqual({ kind: 'invalid' });
  });

  test('returns `invalid` when the decoded URL is not a /blob/ URL', () => {
    const view = buildSplashViewModel(
      encodeV1('https://github.com/owner/repo/tree/main/README.md'),
    );
    expect(view).toEqual({ kind: 'invalid' });
  });

  test('returns `invalid` when the github URL is missing a path', () => {
    const view = buildSplashViewModel(encodeV1('https://github.com/owner/repo/blob/main'));
    expect(view).toEqual({ kind: 'invalid' });
  });

  test('returns `invalid` for a github-spoofed hostname', () => {
    const view = buildSplashViewModel(
      encodeV1('https://github.com.evil.example/owner/repo/blob/main/README.md'),
    );
    expect(view).toEqual({ kind: 'invalid' });
  });

  test('tolerates trailing query parameters on the encoded URL (Axis 1 per D30)', () => {
    const blobUrl = 'https://github.com/o/r/blob/main/file.md';
    const encoded = `${encodeV1(blobUrl)}?utm_source=slack&ref=campaign`;
    const view = buildSplashViewModel(encoded);
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.blobUrl).toBe(blobUrl);
    }
  });

  test('tolerates a trailing fragment on the encoded URL (Axis 2 per D30)', () => {
    const blobUrl = 'https://github.com/o/r/blob/main/file.md';
    const encoded = `${encodeV1(blobUrl)}#section-2`;
    const view = buildSplashViewModel(encoded);
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.blobUrl).toBe(blobUrl);
    }
  });
});

describe('buildCustomSchemeUrl', () => {
  test('produces the openknowledge://share?url=... custom-scheme handoff URL', () => {
    const blobUrl = 'https://github.com/o/r/blob/main/file with space.md';
    expect(buildCustomSchemeUrl(blobUrl)).toBe(
      `openknowledge://share?url=${encodeURIComponent(blobUrl)}`,
    );
  });
});

describe('SPLASH_DOWNLOAD_URL', () => {
  test('points at the legacy releases latest DMG asset', () => {
    expect(SPLASH_DOWNLOAD_URL).toBe(
      'https://github.com/inkeep/open-knowledge-legacy/releases/latest/download/Open-Knowledge-arm64.dmg',
    );
  });
});
