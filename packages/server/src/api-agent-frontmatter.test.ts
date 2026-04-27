/**
 * Tests for agent-write frontmatter handling.
 *
 * These tests capture the bug where write_document (POST /api/agent-write-md)
 * and edit_document (POST /api/agent-patch) silently drop or mishandle
 * YAML frontmatter in the agent's payload.
 *
 * The canonical markdown representation is frontmatter + body. Both agent
 * write surfaces MUST address both regions:
 *
 * 1. write_document with a replace payload that includes frontmatter must
 *    route that frontmatter into Y.Map('metadata') so it reaches disk via
 *    onStoreDocument's `prependFrontmatter(fmFromDoc, body)` path.
 *
 * 2. write_document with a body-only replace payload must preserve existing
 *    frontmatter (don't drop it, don't duplicate it).
 *
 * 3. edit_document (agent-patch) must be able to find/replace text inside
 *    the frontmatter region, not just the body — frontmatter is part of
 *    the document as the agent sees it on disk.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
import { getFrontmatterMap } from '@inkeep/open-knowledge-core';
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

describe('POST /api/agent-write-md (write_document) — frontmatter handling', () => {
  test('replace with a payload containing frontmatter updates Y.Map("metadata") — not just body', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      // Seed existing frontmatter in metaMap (simulates a file loaded from
      // disk). Passing FM in the payload routes through the same per-key +
      // legacy mirror code path that `onLoadDocument` uses, so per-key entries
      // populate alongside the legacy slot.
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          '---\ntitle: Old Title\n---\n# Body\n\nOriginal body.\n',
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      // Agent sends a full document — frontmatter AND body — via write_document.
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

      // metaMap must now reflect the agent's new frontmatter.
      const fm = metaMap.get('frontmatter');
      expect(fm).toBe('---\ntitle: New Title\ncluster: research\n---\n');

      // Per-key entries reflect the new payload — Y.Map slots populate one
      // per property so concurrent writes to different keys merge cleanly.
      expect(getFrontmatterMap(session.dc.document)).toEqual({
        title: 'New Title',
        cluster: 'research',
      });

      // Y.Text must NOT contain the literal --- fences (they're in metaMap, not body).
      // After Observer A debounce, ytext should be frontmatter + body. We assert the
      // synchronous state that applyAgentMarkdownWrite produces via applyFastDiff:
      // ytext === prependFrontmatter(fm, canonicalBody).
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('title: New Title');
      expect(ytext).toContain('cluster: research');
      expect(ytext).toContain('Agent-updated body.');
      // The body region must NOT contain a stray --- fence (the bug produced
      // a document with either doubled frontmatter or a thematicBreak from
      // the agent's --- being parsed as body).
      const closingFenceIdx = ytext.indexOf('---\n', 4); // skip opening ---\n at 0
      expect(closingFenceIdx).toBeGreaterThan(-1);
      const afterFmClose = ytext.slice(closingFenceIdx + 4);
      expect(afterFmClose).not.toContain('---');
    } finally {
      await cleanup();
    }
  });

  test('replace with body-only payload preserves existing frontmatter', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      // Seed a document with frontmatter already loaded.
      const existingFm = '---\ntitle: Keep Me\nauthor: Alice\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, `${existingFm}# Old Body\n`, 'replace');
      }, AGENT_WRITE_ORIGIN);

      // Agent replaces the body only — no frontmatter in payload.
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/agent-write-md',
        { docName: 'test-doc', markdown: '# New Body\n\nFresh content.\n', position: 'replace' },
      );

      expect(response.status).toBe(200);

      // Existing frontmatter must survive unchanged.
      expect(metaMap.get('frontmatter')).toBe(existingFm);

      // Per-key entries are unchanged when the payload has no FM.
      expect(getFrontmatterMap(session.dc.document)).toEqual({
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

  test('append payload never touches frontmatter', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

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
      expect(metaMap.get('frontmatter')).toBe(existingFm);

      // Per-key entries are unchanged by an append operation.
      expect(getFrontmatterMap(session.dc.document)).toEqual({ title: 'Stable' });

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('title: Stable');
      expect(ytext).toContain('First paragraph.');
      expect(ytext).toContain('Appended paragraph.');
      // Frontmatter must appear exactly once.
      expect(ytext.split('---\n').length).toBe(3); // opening ---, closing ---, trailing after = 3 splits
    } finally {
      await cleanup();
    }
  });

  test('append payload that itself starts with frontmatter does NOT double-write frontmatter', async () => {
    // Defensive case: an agent mistakenly prepends frontmatter to an append payload.
    // The append operation should treat the payload as body — strip any leading
    // frontmatter before composing (or at minimum, never produce a document with
    // two --- frontmatter blocks).
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

      // Per-key entries are unchanged by an append operation, even when the
      // payload itself contains a stray FM block (defensively stripped).
      expect(getFrontmatterMap(session.dc.document)).toEqual({ title: 'First' });

      const ytext = session.dc.document.getText('source').toString();
      // Must not contain two frontmatter blocks.
      const fmOpenMatches = ytext.match(/^---\n|^\n---\n/gm) ?? [];
      expect(fmOpenMatches.length).toBeLessThanOrEqual(2); // opener + closer of ONE block
    } finally {
      await cleanup();
    }
  });

  test('prepend payload that itself starts with frontmatter does NOT double-write frontmatter', async () => {
    // Parity with the append case above: if an agent mistakenly prepends frontmatter
    // to a prepend payload, the operation must treat the payload as body — strip any
    // leading frontmatter before composing so the document never ends up with two
    // --- blocks. Guards against regressions in the prepend branch of
    // applyAgentMarkdownWrite, which uses the same defensive-strip pattern as append.
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

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

      // Existing frontmatter must survive; payload FM must be stripped.
      expect(metaMap.get('frontmatter')).toBe(existingFm);

      // Per-key entries are unchanged by a prepend operation.
      expect(getFrontmatterMap(session.dc.document)).toEqual({ title: 'First' });

      const ytext = session.dc.document.getText('source').toString();
      // Must not contain two frontmatter blocks.
      const fmOpenMatches = ytext.match(/^---\n|^\n---\n/gm) ?? [];
      expect(fmOpenMatches.length).toBeLessThanOrEqual(2); // opener + closer of ONE block
      // Body carries the prepended content, original body still present.
      expect(ytext).toContain('Prepended.');
      expect(ytext).toContain('# Original Body');
      // The payload's 'title: Second' must NOT leak into the body or metaMap.
      expect(ytext).not.toContain('title: Second');
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/agent-patch (edit_document) — frontmatter handling', () => {
  test('can find and replace text inside frontmatter', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      const existingFm = '---\ntitle: Old Title\ncluster: misc\n---\n';
      session.dc.document.transact(() => {
        metaMap.set('frontmatter', existingFm);
        applyAgentMarkdownWrite(session.dc.document, '# Body\n\nThe body stays.\n', 'replace');
      }, AGENT_WRITE_ORIGIN);

      // Agent wants to change cluster: misc → cluster: research.
      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'cluster: misc',
        replace: 'cluster: research',
      });

      expect(response.status).toBe(200);

      const fm = metaMap.get('frontmatter');
      expect(fm).toBe('---\ntitle: Old Title\ncluster: research\n---\n');

      // Body must remain untouched.
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('The body stays.');
      expect(ytext).not.toContain('cluster: misc');
    } finally {
      await cleanup();
    }
  });

  test('returns 404 not-found (not a success) when find is absent from BOTH frontmatter and body', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      session.dc.document.transact(() => {
        metaMap.set('frontmatter', '---\ntitle: Stable\n---\n');
        applyAgentMarkdownWrite(session.dc.document, '# Body\n\nReal content.\n', 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'nonexistent text that is nowhere',
        replace: 'whatever',
      });

      expect(response.status).toBe(404);
      const parsed = JSON.parse(response.body);
      expect(parsed.ok).toBe(false);
    } finally {
      await cleanup();
    }
  });

  test('patch in body still works (regression — frontmatter fix must not break body patching)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      session.dc.document.transact(() => {
        metaMap.set('frontmatter', '---\ntitle: Doc\n---\n');
        applyAgentMarkdownWrite(session.dc.document, '# Body\n\nalpha appears here.\n', 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'alpha',
        replace: 'beta',
      });

      expect(response.status).toBe(200);

      // Frontmatter unchanged.
      expect(metaMap.get('frontmatter')).toBe('---\ntitle: Doc\n---\n');

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('beta appears here.');
      expect(ytext).not.toContain('alpha appears here.');
    } finally {
      await cleanup();
    }
  });

  test('patch that prefers frontmatter match over later body match (first-match semantics across full doc)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      // Both frontmatter and body contain the word "draft".
      session.dc.document.transact(() => {
        metaMap.set('frontmatter', '---\nstatus: draft\n---\n');
        applyAgentMarkdownWrite(session.dc.document, '# Body\n\nNot a draft.\n', 'replace');
      }, AGENT_WRITE_ORIGIN);

      // With no offset, agent-patch uses first-match — that's in the frontmatter.
      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'draft',
        replace: 'published',
      });

      expect(response.status).toBe(200);

      expect(metaMap.get('frontmatter')).toBe('---\nstatus: published\n---\n');

      // Body's "draft" must survive since only the first occurrence is replaced.
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('Not a draft.');
    } finally {
      await cleanup();
    }
  });

  test('patch that deletes the entire frontmatter region clears metaMap', async () => {
    // The patch handler composes `prependFrontmatter(currentFm, currentBody)` before
    // running find/replace, then re-splits the result. When the replace is '', the
    // FM region disappears from the composed full-doc, stripFrontmatter on the result
    // returns an empty FM string, and metaMap must be cleared accordingly. Without
    // this, stale frontmatter would persist in Y.Map('metadata') even though the
    // on-disk canonical form has none.
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

      const existingFm = '---\ntitle: ToRemove\n---\n';
      session.dc.document.transact(() => {
        metaMap.set('frontmatter', existingFm);
        applyAgentMarkdownWrite(session.dc.document, '# Body\n\nKeep me.\n', 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: '---\ntitle: ToRemove\n---\n',
        replace: '',
      });

      expect(response.status).toBe(200);

      // metaMap must reflect "no frontmatter" — stale 'title: ToRemove' gone.
      expect(metaMap.get('frontmatter')).toBe('');

      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).not.toContain('title: ToRemove');
      expect(ytext).not.toContain('---');
      // Body survives the patch.
      expect(ytext).toContain('Keep me.');
    } finally {
      await cleanup();
    }
  });
});

describe('per-key UndoManager attribution under per-key writes', () => {
  test('applyAgentUndo reverts only the keys touched by the last frame', async () => {
    const { sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('doc-perkey-undo.md');
      const document = session.dc.document;
      const metaMap = document.getMap('metadata');

      // Frame 1: seed FM with two properties under session.origin.
      document.transact(() => {
        applyAgentMarkdownWrite(
          document,
          '---\ntitle: Original\nstatus: draft\n---\n# Body\n',
          'replace',
        );
      }, session.origin);
      session.um.stopCapturing();

      // Frame 2: change only `title`. `status` value is identical so its slot
      // is untouched (per-key diff in setFrontmatterFromYaml skips equal values).
      document.transact(() => {
        applyAgentMarkdownWrite(
          document,
          '---\ntitle: Updated\nstatus: draft\n---\n# Body\n',
          'replace',
        );
      }, session.origin);
      session.um.stopCapturing();

      // Frame 3: change only `status`.
      document.transact(() => {
        applyAgentMarkdownWrite(
          document,
          '---\ntitle: Updated\nstatus: published\n---\n# Body\n',
          'replace',
        );
      }, session.origin);

      expect(metaMap.get('title')).toBe('Updated');
      expect(metaMap.get('status')).toBe('published');

      // Undo last: only the keys touched by Frame 3 revert. `title` stays.
      const undone = applyAgentUndo(session, 'last');
      expect(undone).toBe(true);
      expect(metaMap.get('title')).toBe('Updated');
      expect(metaMap.get('status')).toBe('draft');

      // Undo last again: only the keys touched by Frame 2 revert. `status` stays.
      applyAgentUndo(session, 'last');
      expect(metaMap.get('title')).toBe('Original');
      expect(metaMap.get('status')).toBe('draft');
    } finally {
      await cleanup();
    }
  });
});
