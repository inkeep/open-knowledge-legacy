import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
import { readFmMap, stripFrontmatter } from '@inkeep/open-knowledge-core';
import {
  AGENT_WRITE_ORIGIN,
  AgentSessionManager,
  applyAgentMarkdownWrite,
  applyAgentUndo,
} from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';

interface CapturedResponse {
  status: number;
  body: string;
}

function makeJsonPostReq(url: string, body: unknown): IncomingMessage {
  const readable = Readable.from(Buffer.from(JSON.stringify(body))) as unknown as IncomingMessage;
  readable.method = 'POST';
  readable.url = url;
  readable.headers = { host: 'localhost', 'content-type': 'application/json' };
  return readable;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      captured.status = status;
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

async function callApi(
  hocuspocus: Hocuspocus,
  sessionManager: AgentSessionManager,
  contentDir: string,
  url: string,
  body: unknown,
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    getFileIndex: () => new Map(),
  });
  const req = makeJsonPostReq(url, body);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

function setup() {
  const projectDir = mkdtempSync(join(tmpdir(), 'ok-api-agent-fm-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  const hocuspocus = new Hocuspocus({ quiet: true });
  const sessionManager = new AgentSessionManager(hocuspocus);
  const cleanup = async () => {
    await sessionManager.closeAll();
    rmSync(projectDir, { recursive: true, force: true });
  };
  return { projectDir, contentDir, hocuspocus, sessionManager, cleanup };
}

function ytextFm(doc: import('yjs').Doc): string {
  return stripFrontmatter(doc.getText('source').toString()).frontmatter;
}

function fmMap(doc: import('yjs').Doc): Record<string, unknown> {
  return readFmMap(doc.getText('source').toString());
}

describe('POST /api/agent-write-md (write_document) — frontmatter handling', () => {
  test('replace with payload containing FM updates the YAML region of Y.Text', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          '---\ntitle: Old Title\n---\n# Body\n\nOriginal body.\n',
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const payload =
        '---\ntitle: New Title\ncluster: research\n---\n\n# Body\n\nAgent-updated body.\n';
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/agent-write-md',
        { docName: 'test-doc', markdown: payload, position: 'replace' },
      );

      expect(response.status).toBe(200);

      expect(fmMap(session.dc.document)).toEqual({
        title: 'New Title',
        cluster: 'research',
      });

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('title: New Title');
      expect(ytext).toContain('cluster: research');
      expect(ytext).toContain('Agent-updated body.');

      const closingFenceIdx = ytext.indexOf('---\n', 4);
      expect(closingFenceIdx).toBeGreaterThan(-1);
      const afterFmClose = ytext.slice(closingFenceIdx + 4);
      expect(afterFmClose).not.toContain('---');
    } finally {
      await cleanup();
    }
  });

  test('replace with body-only payload preserves existing FM', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: Keep Me\nauthor: Alice\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, `${existingFm}# Old Body\n`, 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/agent-write-md',
        { docName: 'test-doc', markdown: '# New Body\n\nFresh content.\n', position: 'replace' },
      );

      expect(response.status).toBe(200);

      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({
        title: 'Keep Me',
        author: 'Alice',
      });

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext.startsWith(existingFm)).toBe(true);
      expect(ytext).toContain('# New Body');
      expect(ytext).toContain('Fresh content.');
      expect(ytext).not.toContain('# Old Body');
    } finally {
      await cleanup();
    }
  });

  test('append payload never touches FM', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: Stable\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          `${existingFm}# Header\n\nFirst paragraph.\n`,
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/agent-write-md',
        { docName: 'test-doc', markdown: 'Appended paragraph.\n', position: 'append' },
      );

      expect(response.status).toBe(200);
      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({ title: 'Stable' });

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('title: Stable');
      expect(ytext).toContain('First paragraph.');
      expect(ytext).toContain('Appended paragraph.');
      expect(ytext.split('---\n').length).toBe(3);
    } finally {
      await cleanup();
    }
  });

  test('append payload that itself starts with FM does NOT double-write FM', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: First\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, `${existingFm}# Body\n`, 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/agent-write-md',
        {
          docName: 'test-doc',
          markdown: '---\ntitle: Second\n---\n\nExtra.\n',
          position: 'append',
        },
      );

      expect(response.status).toBe(200);
      expect(fmMap(session.dc.document)).toEqual({ title: 'First' });

      const ytext = session.dc.document.getText('source').toString();
      const fmOpenMatches = ytext.match(/^---\n|^\n---\n/gm) ?? [];
      expect(fmOpenMatches.length).toBeLessThanOrEqual(2);
    } finally {
      await cleanup();
    }
  });

  test('prepend payload that itself starts with FM does NOT double-write FM', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: First\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, `${existingFm}# Original Body\n`, 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/agent-write-md',
        {
          docName: 'test-doc',
          markdown: '---\ntitle: Second\n---\n\nPrepended.\n',
          position: 'prepend',
        },
      );

      expect(response.status).toBe(200);
      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({ title: 'First' });

      const ytext = session.dc.document.getText('source').toString();
      const fmOpenMatches = ytext.match(/^---\n|^\n---\n/gm) ?? [];
      expect(fmOpenMatches.length).toBeLessThanOrEqual(2);
      expect(ytext).toContain('Prepended.');
      expect(ytext).toContain('# Original Body');
      expect(ytext).not.toContain('title: Second');
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/agent-patch (edit_document) — frontmatter rejection', () => {
  test('rejects yaml-shape find (e.g. "cluster: misc") with 400 + migration hint', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: Old Title\ncluster: misc\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          `${existingFm}# Body\n\nThe body stays.\n`,
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'cluster: misc',
        replace: 'cluster: research',
      });

      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain('Frontmatter edits are not supported');
      expect(parsed.error).toContain('write_document');

      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({
        title: 'Old Title',
        cluster: 'misc',
      });
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('cluster: misc');
      expect(ytext).not.toContain('cluster: research');
      expect(ytext).toContain('The body stays.');
    } finally {
      await cleanup();
    }
  });

  test('rejects find containing "---" fence with 400 + doc unchanged', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: ToRemove\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          `${existingFm}# Body\n\nKeep me.\n`,
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: '---\ntitle: ToRemove\n---\n',
        replace: '',
      });

      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toContain('Frontmatter edits are not supported');

      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({ title: 'ToRemove' });
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('title: ToRemove');
      expect(ytext).toContain('Keep me.');
    } finally {
      await cleanup();
    }
  });

  test('rejects body-shape find ("draft") that first-matches inside FM via position-based check', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\nstatus: draft\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          `${existingFm}# Body\n\nNot a draft.\n`,
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'draft',
        replace: 'published',
      });

      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toContain('Frontmatter edits are not supported');

      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({ status: 'draft' });
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('status: draft');
      expect(ytext).toContain('Not a draft.');
      expect(ytext).not.toContain('published');
    } finally {
      await cleanup();
    }
  });

  test('body-only patch with non-yaml find still applies (regression — body path unaffected)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      const existingFm = '---\ntitle: Doc\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          `${existingFm}# Body\n\nalpha appears here.\n`,
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'alpha',
        replace: 'beta',
      });

      expect(response.status).toBe(200);

      expect(ytextFm(session.dc.document)).toBe(existingFm);
      expect(fmMap(session.dc.document)).toEqual({ title: 'Doc' });
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('beta appears here.');
      expect(ytext).not.toContain('alpha appears here.');
    } finally {
      await cleanup();
    }
  });

  test('returns 404 (not 400) when non-yaml find is absent from both FM and body', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          '---\ntitle: Stable\n---\n# Body\n\nReal content.\n',
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'nonexistent text that is nowhere',
        replace: 'whatever',
      });

      expect(response.status).toBe(404);
      const parsed = JSON.parse(response.body);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).not.toContain('Frontmatter edits are not supported');
    } finally {
      await cleanup();
    }
  });

  test('rejects yaml-shape find even when no FM exists in the doc (heuristic precheck is doc-stateless)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          '# Body\n\nfoo: bar appears here.\n',
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'foo: bar',
        replace: 'baz: qux',
      });

      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toContain('Frontmatter edits are not supported');

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('foo: bar appears here.');
      expect(ytext).not.toContain('baz: qux');
    } finally {
      await cleanup();
    }
  });

  test('does NOT precheck-reject body-only patch on bare-colon prose (`IMPORTANT:`, `Note:`)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          '---\ntitle: Doc\n---\n# Body\n\nIMPORTANT: read this.\n',
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'IMPORTANT:',
        replace: 'NOTE:',
      });

      expect(response.status).toBe(200);
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('NOTE: read this.');
      expect(ytext).not.toContain('IMPORTANT:');
    } finally {
      await cleanup();
    }
  });
});

describe('agent-undo round-trip across FM-touching writes', () => {
  test('applyAgentUndo reverts FM region in lock-step with body changes', async () => {
    const { sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('doc-fm-undo.md');
      const document = session.dc.document;

      document.transact(() => {
        applyAgentMarkdownWrite(
          document,
          '---\ntitle: Original\nstatus: draft\n---\n# Body\n',
          'replace',
        );
      }, session.origin);
      session.um.stopCapturing();

      document.transact(() => {
        applyAgentMarkdownWrite(
          document,
          '---\ntitle: Updated\nstatus: draft\n---\n# Body\n',
          'replace',
        );
      }, session.origin);

      expect(fmMap(document)).toEqual({ title: 'Updated', status: 'draft' });

      const undone = applyAgentUndo(session, 'last');
      expect(undone).toBe(true);
      expect(fmMap(document)).toEqual({ title: 'Original', status: 'draft' });
    } finally {
      await cleanup();
    }
  });
});
