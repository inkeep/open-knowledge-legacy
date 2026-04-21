/**
 * Save-version integration tests (US-021, D45, D33).
 *
 * Verifies the graceful-availability contract:
 *   - History checkpoint ALWAYS lands (plumbing path, no hooks/signing).
 *   - Parent-git step is best-effort: only attempted when projectDir is a git repo.
 *   - Non-git: response 200, checkpointRef present, versionTag undefined, warn logged.
 *   - Git: response 200, checkpointRef + versionTag present.
 *   - State-transition: non-git → git init → second save-version produces fresh tag.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
import simpleGit from 'simple-git';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { type HistoryRef, initHistoryRepo } from './history-repo.ts';

interface CapturedResponse {
  status: number;
  body: string;
  parsed: Record<string, unknown>;
}

function makeJsonPostReq(url: string, body: unknown): IncomingMessage {
  const readable = Readable.from(Buffer.from(JSON.stringify(body))) as unknown as IncomingMessage;
  readable.method = 'POST';
  readable.url = url;
  readable.headers = { host: 'localhost', 'content-type': 'application/json' };
  return readable;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: '', parsed: {} };
  const res = {
    writeHead(status: number) {
      captured.status = status;
    },
    setHeader() {},
    end(body?: string) {
      captured.body = body ?? '';
      try {
        captured.parsed = JSON.parse(body ?? '{}') as Record<string, unknown>;
      } catch {
        // non-JSON body
      }
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

const warnings: string[] = [];
const origWarn = console.warn;

describe('save-version graceful availability (US-021, D45)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-sv-test-'));
    warnings.length = 0;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.warn = origWarn;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('non-git dir: history checkpoint lands, versionTag=undefined, warn logged', async () => {
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, 'doc.md'), '# Hello\n');

    const historyHandle = await initHistoryRepo(tmpDir);
    const historyRef: HistoryRef = { current: historyHandle };

    const hocuspocus = new Hocuspocus({ quiet: true });
    const sessionManager = new AgentSessionManager(hocuspocus);

    try {
      const ext = createApiExtension({
        hocuspocus,
        sessionManager,
        contentDir,
        projectDir: tmpDir, // tmpDir is NOT a git repo
        historyRef,
        contentRoot: 'content',
        getFileIndex: () => new Map(),
      });

      const req = makeJsonPostReq('/api/save-version', { message: 'first checkpoint' });
      const { res, captured } = makeRes();
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: req, response: res });

      expect(captured.status).toBe(200);
      expect(captured.parsed.ok).toBe(true);
      expect(typeof captured.parsed.checkpointRef).toBe('string');
      expect(captured.parsed.versionTag).toBeUndefined();

      // Warning must be emitted for non-git dir
      const svWarn = warnings.find((w) => w.includes('[save-version] parent-git unavailable:'));
      expect(svWarn).toBeDefined();
    } finally {
      await sessionManager.closeAll();
    }
  });

  test('git dir: history checkpoint + ok/v1 tag both land', async () => {
    // Set up a real git repo in tmpDir
    const projectDir = tmpDir;
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, 'doc.md'), '# Hello\n');

    const git = simpleGit(projectDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    await git.add('.');
    await git.commit('initial');

    const historyHandle = await initHistoryRepo(projectDir);
    const historyRef: HistoryRef = { current: historyHandle };

    const hocuspocus = new Hocuspocus({ quiet: true });
    const sessionManager = new AgentSessionManager(hocuspocus);

    try {
      const ext = createApiExtension({
        hocuspocus,
        sessionManager,
        contentDir,
        projectDir,
        historyRef,
        contentRoot: 'content',
        getFileIndex: () => new Map(),
      });

      const req = makeJsonPostReq('/api/save-version', { message: 'my checkpoint' });
      const { res, captured } = makeRes();
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: req, response: res });

      expect(captured.status).toBe(200);
      expect(captured.parsed.ok).toBe(true);
      expect(typeof captured.parsed.checkpointRef).toBe('string');
      expect(captured.parsed.versionTag).toBe('ok/v1');

      // No parent-git unavailable warning for git dir
      const svWarn = warnings.find((w) => w.includes('[save-version] parent-git unavailable:'));
      expect(svWarn).toBeUndefined();
    } finally {
      await sessionManager.closeAll();
    }
  });

  test('state-transition: non-git → git init → second save-version gets fresh tag', async () => {
    const projectDir = tmpDir;
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, 'doc.md'), '# Hello\n');

    const historyHandle = await initHistoryRepo(projectDir);
    const historyRef: HistoryRef = { current: historyHandle };

    const hocuspocus = new Hocuspocus({ quiet: true });
    const sessionManager = new AgentSessionManager(hocuspocus);

    try {
      const ext = createApiExtension({
        hocuspocus,
        sessionManager,
        contentDir,
        projectDir,
        historyRef,
        contentRoot: 'content',
        getFileIndex: () => new Map(),
      });

      // First save-version: no git repo → versionTag undefined
      const req1 = makeJsonPostReq('/api/save-version', { message: 'pre-git' });
      const { res: res1, captured: captured1 } = makeRes();
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: req1, response: res1 });

      expect(captured1.status).toBe(200);
      expect(captured1.parsed.ok).toBe(true);
      expect(captured1.parsed.versionTag).toBeUndefined();

      // Now run git init (state transition)
      const git = simpleGit(projectDir);
      await git.init();
      await git.addConfig('user.name', 'Test User');
      await git.addConfig('user.email', 'test@example.com');
      await git.add('.');
      await git.commit('initial');

      // Second save-version: git repo now available → gets ok/v1 tag
      const req2 = makeJsonPostReq('/api/save-version', { message: 'post-git-init' });
      const { res: res2, captured: captured2 } = makeRes();
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: req2, response: res2 });

      expect(captured2.status).toBe(200);
      expect(captured2.parsed.ok).toBe(true);
      expect(captured2.parsed.versionTag).toBe('ok/v1');
    } finally {
      await sessionManager.closeAll();
    }
  });
});
