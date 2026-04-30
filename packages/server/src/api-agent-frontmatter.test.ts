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

describe('POST /api/agent-patch (edit_document) — frontmatter rejection', () => {
  // agent-patch refuses to splice into the frontmatter region — agents
  // editing FM properties are routed to the `frontmatter_patch` MCP tool,
  // whose typed Merge Patch semantics map onto per-key Y.Map storage.
  // The rejection signal combines a string-shape heuristic (catches
  // yaml-style finds and explicit `---` fences) with a position-based
  // check inside the transact (catches non-yaml finds that happen to
  // first-match in the FM region).

  test('rejects yaml-shape find (e.g. "cluster: misc") with 400 + migration hint', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      const metaMap = session.dc.document.getMap('metadata');

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

      // Doc must be untouched — FM unchanged and body unchanged.
      expect(metaMap.get('frontmatter')).toBe(existingFm);
      expect(getFrontmatterMap(session.dc.document)).toEqual({
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
      const metaMap = session.dc.document.getMap('metadata');

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

      // FM still present — heuristic rejected before any state mutation.
      expect(metaMap.get('frontmatter')).toBe(existingFm);
      expect(getFrontmatterMap(session.dc.document)).toEqual({ title: 'ToRemove' });
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
      const metaMap = session.dc.document.getMap('metadata');

      const existingFm = '---\nstatus: draft\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          `${existingFm}# Body\n\nNot a draft.\n`,
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);

      // `draft` doesn't match the heuristic — no `---`, no key-value
      // shape — but its first occurrence in the composed full-doc lands
      // inside the FM region. The position-based check catches it.
      const response = await callApi(hocuspocus, sessionManager, contentDir, '/api/agent-patch', {
        docName: 'test-doc',
        find: 'draft',
        replace: 'published',
      });

      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toContain('Frontmatter edits are not supported');

      // FM and body both unchanged — rollback is automatic since the
      // transact returned early without splicing.
      expect(metaMap.get('frontmatter')).toBe(existingFm);
      expect(getFrontmatterMap(session.dc.document)).toEqual({ status: 'draft' });
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
      const metaMap = session.dc.document.getMap('metadata');

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

      // FM unchanged; body got the substitution.
      expect(metaMap.get('frontmatter')).toBe(existingFm);
      expect(getFrontmatterMap(session.dc.document)).toEqual({ title: 'Doc' });
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

      // Heuristic doesn't match (no `---`, no key:value), and the find
      // isn't anywhere in the doc, so the position check never runs.
      // 404 is the expected signal — agents distinguish "not found" from
      // "FM forbidden" by status code.
      expect(response.status).toBe(404);
      const parsed = JSON.parse(response.body);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).not.toContain('Frontmatter edits are not supported');
    } finally {
      await cleanup();
    }
  });

  test('rejects yaml-shape find even when no FM exists in the doc (heuristic precheck is doc-stateless)', async () => {
    // Heuristic precheck runs before any doc state is read. An agent
    // calling agent-patch with a yaml-style find on a body-only doc still
    // gets the migration hint — the right tool for `key: value` writes
    // is frontmatter_patch, regardless of the target's current FM state.
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      // Body-only seed (no FM at all).
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

      // Body untouched.
      const ytext = session.dc.document.getText('source').toString();
      expect(ytext).toContain('foo: bar appears here.');
      expect(ytext).not.toContain('baz: qux');
    } finally {
      await cleanup();
    }
  });

  test('does NOT precheck-reject body-only patch on bare-colon prose (`IMPORTANT:`, `Note:`)', async () => {
    // Word-then-colon prose patterns like `IMPORTANT:` or `Note:` end at
    // the colon with no value — they are NOT YAML key-value shapes. The
    // doc-stateless heuristic precheck must let them through so the
    // position-based check (which knows where the FM region ends) is the
    // sole authority for whether the patch lands in body vs frontmatter.
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
