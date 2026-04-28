/**
 * Tests for POST /api/frontmatter-patch (US-005).
 *
 * Verifies the new MCP `frontmatter_patch` tool's HTTP surface — JSON Merge
 * Patch (RFC 7396) semantics, atomic reject-or-commit on validation failure,
 * non-paired `formOrigin` write attribution, and per-key Y.Map state mirror.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
import {
  getFrontmatterMap,
  type Principal,
  parseFrontmatterYaml,
  unwrapFrontmatterFences,
} from '@inkeep/open-knowledge-core';
import {
  AGENT_WRITE_ORIGIN,
  AgentSessionManager,
  applyAgentMarkdownWrite,
} from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { swapContributors } from './contributor-tracker.ts';

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
  opts: { getPrincipal?: () => Principal | null } = {},
): Promise<CapturedResponse> {
  const ext = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    getFileIndex: () => new Map(),
    ...(opts.getPrincipal ? { getPrincipal: opts.getPrincipal } : {}),
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
  const projectDir = mkdtempSync(join(tmpdir(), 'ok-api-fm-patch-'));
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

async function seedDoc(
  sessionManager: AgentSessionManager,
  docName: string,
  fm: string,
  body: string,
): Promise<void> {
  const session = await sessionManager.getSession(docName);
  session.dc.document.transact(() => {
    applyAgentMarkdownWrite(session.dc.document, `${fm}${body}`, 'replace');
  }, AGENT_WRITE_ORIGIN);
}

describe('POST /api/frontmatter-patch — Merge Patch semantics', () => {
  test('set, create, and delete keys land atomically in per-key Y.Map state', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(
        sessionManager,
        'test-doc',
        '---\ntitle: Old\ndraft: true\ntags:\n  - a\n---\n',
        '# Body\n',
      );
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        {
          docName: 'test-doc',
          patch: { title: 'New', draft: null, status: 'published' },
        },
      );

      expect(response.status).toBe(200);
      expect(getFrontmatterMap(session.dc.document)).toEqual({
        title: 'New',
        tags: ['a'],
        status: 'published',
      });
    } finally {
      await cleanup();
    }
  });

  test('omitted keys are unchanged', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(
        sessionManager,
        'test-doc',
        '---\ntitle: Keep\nauthor: Alice\n---\n',
        '# Body\n',
      );
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { author: 'Bob' } },
      );

      expect(response.status).toBe(200);
      const map = getFrontmatterMap(session.dc.document);
      expect(map.title).toBe('Keep');
      expect(map.author).toBe('Bob');
    } finally {
      await cleanup();
    }
  });

  test('null deletes a key', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Foo\ndraft: true\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { draft: null } },
      );

      expect(response.status).toBe(200);
      const map = getFrontmatterMap(session.dc.document);
      expect(map).toEqual({ title: 'Foo' });
      expect('draft' in map).toBe(false);
    } finally {
      await cleanup();
    }
  });

  test('list values land as arrays', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: T\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { tags: ['docs', 'crdt', 'mcp'] } },
      );

      expect(response.status).toBe(200);
      expect(getFrontmatterMap(session.dc.document).tags).toEqual(['docs', 'crdt', 'mcp']);
    } finally {
      await cleanup();
    }
  });

  test('empty patch object is a no-op success', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: T\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');
      const before = getFrontmatterMap(session.dc.document);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: {} },
      );

      expect(response.status).toBe(200);
      expect(getFrontmatterMap(session.dc.document)).toEqual(before);
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — atomicity + validation', () => {
  test('one invalid value rejects the whole patch with 400 + per-key errors; doc unchanged', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Original\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');
      const before = getFrontmatterMap(session.dc.document);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        {
          docName: 'test-doc',
          // tags as numbers — invalid (FrontmatterValueSchema rejects number[]).
          patch: { title: 'New', tags: [1, 2, 3] },
        },
      );

      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.ok).toBe(false);
      expect(parsed.fieldErrors).toBeDefined();
      expect(parsed.fieldErrors.tags).toBeTruthy();
      // Doc state unchanged — atomic reject.
      expect(getFrontmatterMap(session.dc.document)).toEqual(before);
    } finally {
      await cleanup();
    }
  });

  test('rejects payload without a `patch` field', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc' },
      );
      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.ok).toBe(false);
    } finally {
      await cleanup();
    }
  });

  test('rejects patch containing the reserved `frontmatter` key', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { frontmatter: 'foo' } },
      );
      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toContain('reserved');
    } finally {
      await cleanup();
    }
  });

  test('rejects invalid types map', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        {
          docName: 'test-doc',
          patch: { title: 'foo' },
          types: { title: 'invalid-type' },
        },
      );
      expect(response.status).toBe(400);
      const parsed = JSON.parse(response.body);
      expect(parsed.error).toContain('types');
    } finally {
      await cleanup();
    }
  });

  test('rejects invalid JSON body', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const ext = createApiExtension({
        hocuspocus,
        sessionManager,
        contentDir,
        getFileIndex: () => new Map(),
      });
      const readable = Readable.from(Buffer.from('not json')) as unknown as IncomingMessage;
      readable.method = 'POST';
      readable.url = '/api/frontmatter-patch';
      readable.headers = { host: 'localhost', 'content-type': 'application/json' };
      const { res, captured } = makeRes();
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: readable, response: res });
      expect(captured.status).toBe(400);
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — origin + bridge propagation', () => {
  test('write origin is non-paired form-write origin (not session.origin or session.undoOrigin)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: T\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      // formOrigin is exposed on the session record; verify it's distinct from
      // origin and undoOrigin and that it lacks `context.paired`.
      expect(session.formOrigin).toBeDefined();
      expect(session.formOrigin).not.toBe(session.origin);
      expect(session.formOrigin).not.toBe(session.undoOrigin);
      const ctx = (session.formOrigin as { context: Record<string, unknown> }).context;
      expect(ctx.paired).toBeUndefined();
      expect(ctx.origin).toBe('form-write');

      // Subscribe BEFORE the write to capture the origin object.
      const origins: unknown[] = [];
      const onTransaction = (tr: { origin: unknown }) => {
        origins.push(tr.origin);
      };
      session.dc.document.on('beforeTransaction', onTransaction);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { author: 'Sarah' } },
      );

      session.dc.document.off('beforeTransaction', onTransaction);

      expect(response.status).toBe(200);
      // The form write transaction's origin is session.formOrigin (object identity).
      expect(origins.includes(session.formOrigin)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('handler does not write Y.Text directly (Observer A propagation is async)', async () => {
    // The form-write origin is non-paired; Observer A handles Y.Text
    // propagation after settle. The HTTP handler must NOT touch Y.Text or
    // XmlFragment directly — that's verified separately in
    // server-observers.test.ts (US-004 "FORM_WRITE-style non-paired origin").
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n\nContent.\n');
      const session = await sessionManager.getSession('test-doc');
      const ytextBefore = session.dc.document.getText('source').toString();

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { title: 'New' } },
      );

      expect(response.status).toBe(200);
      // Without Observer A wired up at this layer, Y.Text remains stale (still
      // shows the seeded composition). The handler's contract is metaMap-only.
      expect(session.dc.document.getText('source').toString()).toBe(ytextBefore);
      // Per-key state IS updated synchronously.
      expect(getFrontmatterMap(session.dc.document).title).toBe('New');
    } finally {
      await cleanup();
    }
  });

  test('legacy frontmatter slot stays in sync with per-key state', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { title: 'Updated', author: 'Sarah' } },
      );

      expect(response.status).toBe(200);
      const metaMap = session.dc.document.getMap('metadata');
      const legacy = metaMap.get('frontmatter') as string | undefined;
      expect(legacy).toBeDefined();
      expect(legacy).toContain('title: Updated');
      expect(legacy).toContain('author: Sarah');
    } finally {
      await cleanup();
    }
  });

  test('form-source writes do not drop an agent-flash entry (no phantom-agent body flash)', async () => {
    // The agent-flash Y.Map is the side-channel the editor reads to animate
    // body text in agent colors. Form writes are the local human principal
    // editing their own properties — flashing the body in agent colors would
    // mis-attribute the write. The handler skips the activityMap.set when
    // `source: 'form'` is supplied.
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');
      const flashMap = session.dc.document.getMap('agent-flash');
      expect(flashMap.size).toBe(0);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', source: 'form', op: 'set', patch: { title: 'New' } },
      );

      expect(response.status).toBe(200);
      // Form write completed but no agent-flash entry was dropped.
      expect(flashMap.size).toBe(0);
    } finally {
      await cleanup();
    }
  });

  test('MCP-source writes still drop an agent-flash entry (control)', async () => {
    // Companion to the form-source test above: the agent-flash drop is
    // gated on `!isFormWrite`, so the absence of `source: 'form'` (the MCP
    // path) must continue to populate the side-channel.
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');
      const flashMap = session.dc.document.getMap('agent-flash');
      expect(flashMap.size).toBe(0);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { title: 'New' } },
      );

      expect(response.status).toBe(200);
      expect(flashMap.size).toBe(1);
    } finally {
      await cleanup();
    }
  });

  test('deleting all keys clears the legacy frontmatter slot', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\nonly: here\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { only: null } },
      );

      expect(response.status).toBe(200);
      expect(getFrontmatterMap(session.dc.document)).toEqual({});
      const metaMap = session.dc.document.getMap('metadata');
      expect(metaMap.get('frontmatter')).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — concurrent multi-key merge (FR3)', () => {
  test('different-key writes from human + agent merge per-key', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Initial\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      // Two simultaneous patches to different keys.
      const [r1, r2] = await Promise.all([
        callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
          docName: 'test-doc',
          patch: { title: 'Updated' },
          agentId: 'human-1',
          agentName: 'Sarah',
        }),
        callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
          docName: 'test-doc',
          patch: { tags: ['new'] },
          agentId: 'agent-1',
          agentName: 'Claude',
        }),
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      const map = getFrontmatterMap(session.dc.document);
      expect(map.title).toBe('Updated');
      expect(map.tags).toEqual(['new']);
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — guards', () => {
  test('rejects unsafe docName', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: '../escape', patch: { title: 'x' } },
      );
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  test('rejects reserved __system__ docName', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: '__system__', patch: { title: 'x' } },
      );
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  });

  test('rejects GET method', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const ext = createApiExtension({
        hocuspocus,
        sessionManager,
        contentDir,
        getFileIndex: () => new Map(),
      });
      const readable = Readable.from(Buffer.alloc(0)) as unknown as IncomingMessage;
      readable.method = 'GET';
      readable.url = '/api/frontmatter-patch';
      readable.headers = { host: 'localhost' };
      const { res, captured } = makeRes();
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: readable, response: res });
      expect(captured.status).toBe(405);
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — type inference (D29)', () => {
  test('list value infers and stores correctly', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: T\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      // No `types` override — list shape inferred from value.
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { topics: ['a', 'b'] } },
      );

      expect(response.status).toBe(200);
      expect(getFrontmatterMap(session.dc.document).topics).toEqual(['a', 'b']);
    } finally {
      await cleanup();
    }
  });

  test('explicit text type override is accepted (does not affect storage shape)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: T\n---\n', '# Body\n');
      const session = await sessionManager.getSession('test-doc');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        {
          docName: 'test-doc',
          patch: { version: '2026-04-27' },
          types: { version: 'text' },
        },
      );

      expect(response.status).toBe(200);
      expect(getFrontmatterMap(session.dc.document).version).toBe('2026-04-27');
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — form-caller identity attribution (precedent #25)', () => {
  // Pre-fix the form path defaulted unidentified callers to `claude-1`/Claude,
  // attributing every browser property edit to the agent. Form callers ARE
  // identified — they're the local human principal. These tests pin the
  // attribution to `principal-<UUID>` so contributor tracking, presence
  // broadcasts, and focus pushes carry the user's identity.

  function makePrincipal(): Principal {
    return {
      id: 'principal-test-uuid',
      display_name: 'Sarah',
      display_email: 'sarah@example.com',
      source: 'git-config',
      created_at: '2026-04-28T00:00:00.000Z',
    };
  }

  test('form write with no agentId attributes to principal, not claude-1', async () => {
    swapContributors(); // reset accumulator
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');
      const principal = makePrincipal();

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        // NB: no agentId / agentName — exactly what the browser PropertyPanel sends.
        { docName: 'test-doc', patch: { title: 'New' }, source: 'form', op: 'set' },
        { getPrincipal: () => principal },
      );

      expect(response.status).toBe(200);
      const writers = [...swapContributors().keys()];
      expect(writers).toContain('principal-test-uuid');
      expect(writers).not.toContain('claude-1');
    } finally {
      await cleanup();
    }
  });

  test('form write falls back to principal-local when getPrincipal is not wired', async () => {
    swapContributors();
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');

      // Don't wire getPrincipal — exercises the test/setup-without-principal
      // fallback. Should NOT default to claude-1.
      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { title: 'New' }, source: 'form' },
      );

      expect(response.status).toBe(200);
      const writers = [...swapContributors().keys()];
      expect(writers).toContain('principal-local');
      expect(writers).not.toContain('claude-1');
    } finally {
      await cleanup();
    }
  });

  test('MCP write (no source field) preserves caller-supplied agentId', async () => {
    swapContributors();
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        {
          docName: 'test-doc',
          patch: { title: 'New' },
          agentId: 'agent-cursor-abc',
          agentName: 'Cursor',
        },
        { getPrincipal: () => makePrincipal() }, // present but unused for MCP path
      );

      expect(response.status).toBe(200);
      const writers = [...swapContributors().keys()];
      expect(writers).toContain('agent-cursor-abc');
      expect(writers).not.toContain('principal-test-uuid');
    } finally {
      await cleanup();
    }
  });

  test('MCP write without agentId still defaults to claude-1 (existing behavior preserved)', async () => {
    // Sanity check: the form-vs-MCP distinction is the `source: 'form'` field.
    // MCP callers that omit agentId continue to use the legacy `claude-1`
    // default — only the form path gets principal attribution.
    swapContributors();
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      await seedDoc(sessionManager, 'test-doc', '---\ntitle: Old\n---\n', '# Body\n');

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        // No source field, no agentId — legacy MCP shape.
        { docName: 'test-doc', patch: { title: 'New' } },
      );

      expect(response.status).toBe(200);
      const writers = [...swapContributors().keys()];
      expect(writers).toContain('claude-1');
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — comment preservation on legacy mirror', () => {
  // Pre-fix the form path synthesized the legacy slot from per-key state via
  // `serializeFrontmatterMap`, building a fresh Document AST that dropped
  // YAML comments. Now the handler applies the patch to the parsed pre-patch
  // Document so comments + source order survive the round-trip.

  test('YAML comments above an unchanged key survive a patch to a different key', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      // Seed via applyAgentMarkdownWrite so the legacy slot ends up with the
      // comment-bearing yaml as written.
      const session = await sessionManager.getSession('test-doc');
      const seededFm = '---\n# spec owner\ntitle: Foo\nstatus: draft\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, `${seededFm}# Body\n`, 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        // Patch a different key — the `# spec owner` comment should survive.
        { docName: 'test-doc', patch: { status: 'published' }, source: 'form', op: 'set' },
      );

      expect(response.status).toBe(200);
      const metaMap = session.dc.document.getMap('metadata');
      const legacy = metaMap.get('frontmatter') as string | undefined;
      expect(legacy).toBeDefined();
      // The YAML comment must survive the patch.
      expect(legacy).toContain('# spec owner');
      expect(legacy).toContain('title: Foo');
      expect(legacy).toContain('status: published');
    } finally {
      await cleanup();
    }
  });

  test('comment preservation also covers the patched key itself', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      // Comment immediately above the key being patched.
      const seededFm = '---\n# Author of record\nauthor: Alice\nversion: 1\n---\n';
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, `${seededFm}# Body\n`, 'replace');
      }, AGENT_WRITE_ORIGIN);

      const response = await callApi(
        hocuspocus,
        sessionManager,
        contentDir,
        '/api/frontmatter-patch',
        { docName: 'test-doc', patch: { author: 'Bob' }, source: 'form', op: 'set' },
      );

      expect(response.status).toBe(200);
      const legacy = session.dc.document.getMap('metadata').get('frontmatter') as
        | string
        | undefined;
      expect(legacy).toBeDefined();
      expect(legacy).toContain('# Author of record');
      expect(legacy).toContain('author: Bob');
      expect(legacy).toContain('version: 1');
      expect(legacy).not.toContain('author: Alice');
    } finally {
      await cleanup();
    }
  });
});

describe('POST /api/frontmatter-patch — legacy mirror is rebuildable from per-key state', () => {
  // Regression invariant for the transition pattern: every write surface
  // that touches metaMap must leave the legacy `'frontmatter'` slot in a
  // state where parsing it yields a value-map equal to `getFrontmatterMap`.
  // The slot is observable (carries comments + source order) but NOT
  // authoritative — per-key entries are. If a future writer drifts the
  // legacy slot from per-key, this test catches it before that mirror
  // becomes the source.

  function assertMirrorRebuildable(
    session: { dc: { document: { getMap: (k: string) => { get: (k: string) => unknown } } } },
    label: string,
  ): void {
    const doc = session.dc.document as unknown as Parameters<typeof getFrontmatterMap>[0];
    const map = getFrontmatterMap(doc);
    const legacy = session.dc.document.getMap('metadata').get('frontmatter');
    if (Object.keys(map).length === 0) {
      expect(legacy, `${label}: empty per-key map → no legacy slot`).toBeUndefined();
      return;
    }
    expect(legacy, `${label}: legacy slot must exist when per-key has entries`).toBeDefined();
    expect(typeof legacy, `${label}: legacy slot must be string`).toBe('string');
    const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(legacy as string));
    expect(parsed.map, `${label}: legacy slot parses to a valid map`).not.toBeNull();
    expect(parsed.map, `${label}: legacy slot parsed map equals per-key map`).toEqual(map);
  }

  test('mirror invariant holds across set, create, and delete patches in sequence', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      // Seed via agent-write (existing transition pattern).
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(
          session.dc.document,
          '---\ntitle: Seed\nstatus: draft\n---\n# Body\n',
          'replace',
        );
      }, AGENT_WRITE_ORIGIN);
      assertMirrorRebuildable(session, 'after agent seed');

      await callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
        docName: 'test-doc',
        patch: { title: 'Renamed' },
      });
      assertMirrorRebuildable(session, 'after MCP set');

      await callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
        docName: 'test-doc',
        patch: { author: 'Sarah', version: 1 },
        source: 'form',
        op: 'add',
      });
      assertMirrorRebuildable(session, 'after form add (multi-key)');

      await callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
        docName: 'test-doc',
        patch: { status: null },
        source: 'form',
        op: 'remove',
      });
      assertMirrorRebuildable(session, 'after form delete');
    } finally {
      await cleanup();
    }
  });

  test('mirror invariant holds when all keys are deleted (legacy slot cleared)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');
      session.dc.document.transact(() => {
        applyAgentMarkdownWrite(session.dc.document, '---\nonly: here\n---\n# Body\n', 'replace');
      }, AGENT_WRITE_ORIGIN);
      assertMirrorRebuildable(session, 'before drain');

      await callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
        docName: 'test-doc',
        patch: { only: null },
        source: 'form',
        op: 'remove',
      });
      assertMirrorRebuildable(session, 'after drain');
    } finally {
      await cleanup();
    }
  });

  test('mirror invariant holds for list-shape values (per-key array equality)', async () => {
    const { contentDir, hocuspocus, sessionManager, cleanup } = setup();
    try {
      const session = await sessionManager.getSession('test-doc');

      await callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
        docName: 'test-doc',
        patch: { tags: ['a', 'b', 'c'], draft: true, version: 1 },
        source: 'form',
        op: 'add',
      });
      assertMirrorRebuildable(session, 'mixed shapes');

      await callApi(hocuspocus, sessionManager, contentDir, '/api/frontmatter-patch', {
        docName: 'test-doc',
        patch: { tags: ['x'] },
        source: 'form',
        op: 'set',
      });
      assertMirrorRebuildable(session, 'list replacement');
    } finally {
      await cleanup();
    }
  });
});
