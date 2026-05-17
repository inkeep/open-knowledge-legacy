import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeShareUrl } from '@inkeep/open-knowledge-core';

interface TestRig {
  port: number;
  projectDir: string;
  server: Server;
  cleanup: () => Promise<void>;
}

async function bootRig(initProject?: (projectDir: string) => void): Promise<TestRig> {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'share-construct-url-'));
  const projectDir = join(tmpRoot, 'project');
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  initProject?.(projectDir);

  const { Hocuspocus } = await import('@hocuspocus/server');
  const { AgentSessionManager } = await import('../agent-sessions.ts');
  const { createApiExtension } = await import('../api-extension.ts');

  const hocuspocus = new Hocuspocus({ quiet: true });
  const sessionManager = new AgentSessionManager(hocuspocus);
  const ext = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    projectDir,
    getFileIndex: () => new Map(),
    serverInstanceId: 'test-instance',
  });

  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    // biome-ignore lint/suspicious/noExplicitAny: test harness
    hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
      if (!res.writableEnded) {
        res.writeHead(500);
        res.end('Error');
      }
    });
  });
  hocuspocus.configuration.extensions.push(ext);

  const port = await new Promise<number>((resolveListen) => {
    server.listen(0, () => {
      const addr = server.address();
      resolveListen(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  return {
    port,
    projectDir,
    server,
    cleanup: async () => {
      await new Promise<void>((res) => server.close(() => res()));
      await rm(tmpRoot, { recursive: true, force: true });
    },
  };
}

function seedRemoteAndHead(
  projectDir: string,
  spec: { head: string; originUrl: string; branchesOnOrigin?: string[] },
): void {
  const gitDir = join(projectDir, '.git');
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(join(gitDir, 'HEAD'), spec.head);
  writeFileSync(
    join(gitDir, 'config'),
    `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${spec.originUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
  if (spec.branchesOnOrigin) {
    const refDir = join(gitDir, 'refs', 'remotes', 'origin');
    for (const branch of spec.branchesOnOrigin) {
      const refPath = join(refDir, branch);
      mkdirSync(join(refPath, '..'), { recursive: true });
      writeFileSync(refPath, 'abc123def456abc123def456abc123def456abc1\n');
    }
  }
}

async function postConstructUrl(port: number, body: unknown): Promise<Response> {
  return fetch(`http://localhost:${port}/api/share/construct-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/share/construct-url', () => {
  let rig: TestRig;

  afterEach(async () => {
    if (rig) await rig.cleanup();
  });

  test('happy path: returns encoded share URL that round-trips via decodeShareUrl', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: 'docs/guide.md' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.branch).toBe('main');
    expect(json.blobUrl).toBe('https://github.com/inkeep/open-knowledge/blob/main/docs/guide.md');
    expect(typeof json.shareUrl).toBe('string');
    expect(json.shareUrl).toMatch(/^https:\/\/openknowledge\.ai\/d\/[A-Za-z0-9_-]+$/);
    const encoded = (json.shareUrl as string).replace('https://openknowledge.ai/d/', '');
    const decoded = decodeShareUrl(encoded);
    expect(decoded.version).toBe(1);
    expect(decoded.blobUrl).toBe(
      'https://github.com/inkeep/open-knowledge/blob/main/docs/guide.md',
    );
  });

  test('no-remote: project has no origin section', async () => {
    rig = await bootRig((projectDir) => {
      const gitDir = join(projectDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
      writeFileSync(join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
    });
    const res = await postConstructUrl(rig.port, { docPath: 'a.md' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'no-remote' });
  });

  test('detached-head: HEAD is a raw SHA', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: '0123456789abcdef0123456789abcdef01234567\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: 'a.md' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'detached-head' });
  });

  test('branch-not-on-origin: HEAD branch has no matching remote ref', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/feature-not-pushed\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: 'a.md' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: false,
      error: 'branch-not-on-origin',
      branch: 'feature-not-pushed',
    });
  });

  test('non-github-remote: origin is a gitlab URL', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'git@gitlab.com:inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: 'a.md' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'non-github-remote' });
  });

  test('invalid-path: rejects .. segment', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: 'docs/../etc/passwd' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'invalid-path' });
  });

  test('invalid-path: rejects .git segment', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: '.git/HEAD' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'invalid-path' });
  });

  test('invalid-path: rejects absolute path', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: '/etc/passwd' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'invalid-path' });
  });

  test('docPath with spaces + unicode round-trips through encode/decode', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const docPath = 'docs/Q4 OKRs — Marketing.md';
    const res = await postConstructUrl(rig.port, { docPath });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.blobUrl).toBe(
      `https://github.com/inkeep/open-knowledge/blob/main/${encodeURIComponent('Q4 OKRs — Marketing.md').replace(/^/, 'docs/')}`,
    );
    const encoded = (json.shareUrl as string).replace('https://openknowledge.ai/d/', '');
    const decoded = decodeShareUrl(encoded);
    const decodedUrl = new URL(decoded.blobUrl);
    const segments = decodedUrl.pathname.split('/');
    expect(segments.slice(0, 5)).toEqual(['', 'inkeep', 'open-knowledge', 'blob', 'main']);
    const decodedDocPath = segments
      .slice(5)
      .map((s) => decodeURIComponent(s))
      .join('/');
    expect(decodedDocPath).toBe(docPath);
  });

  test('happy path: branch with slash via loose ref', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/feat/sharing-virality-flow\n',
        originUrl: 'git@github.com:inkeep/open-knowledge.git',
        branchesOnOrigin: ['feat/sharing-virality-flow'],
      });
    });
    const res = await postConstructUrl(rig.port, { docPath: 'docs/guide.md' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.branch).toBe('feat/sharing-virality-flow');
    expect(json.blobUrl).toBe(
      'https://github.com/inkeep/open-knowledge/blob/feat/sharing-virality-flow/docs/guide.md',
    );
  });

  test('rejects GET method with 405', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await fetch(`http://localhost:${rig.port}/api/share/construct-url`);
    expect(res.status).toBe(405);
  });

  test('rejects body without docPath with 400', async () => {
    rig = await bootRig((projectDir) => {
      seedRemoteAndHead(projectDir, {
        head: 'ref: refs/heads/main\n',
        originUrl: 'https://github.com/inkeep/open-knowledge.git',
        branchesOnOrigin: ['main'],
      });
    });
    const res = await postConstructUrl(rig.port, {});
    expect(res.status).toBe(400);
  });
});
