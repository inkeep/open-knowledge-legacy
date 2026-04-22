/**
 * US-005 — MCP tools: summary Zod param + pass-through to HTTP body +
 * structured-response surfacing, plus the rename/rollback identity passthrough
 * wiring (D15) that lets the server-side D22 guard actually fire for
 * MCP-driven calls.
 *
 * Covers all four write-like tools: write_document, edit_document,
 * rename_document, rollback_to_version.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { register as registerEditDocument } from './edit-document.ts';
import { register as registerRenameDocument } from './rename-document.ts';
import { register as registerRollbackToVersion } from './rollback-to-version.ts';
import type { ServerInstance } from './shared.ts';
import { register as registerWriteDocument } from './write-document.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  server: { port: 3000, host: 'localhost', openOnAgentEdit: false },
  persistence: { debounceMs: 2000, maxDebounceMs: 10000 },
  mcp: {
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
};

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function createCaptureServer() {
  const tools: Array<{ name: string; description: string; handler: Handler }> = [];
  const server = {
    tool(name: string, description: string, _schema: unknown, handler: Handler) {
      tools.push({ name, description, handler });
    },
  } as unknown as ServerInstance;
  return {
    server,
    getTool(name: string): { name: string; description: string; handler: Handler } {
      const t = tools.find((x) => x.name === name);
      if (!t) throw new Error(`Tool ${name} not registered`);
      return t;
    },
  };
}

let recordedRequest: { url: string; body: Record<string, unknown> } | undefined;
let mockResponse: Record<string, unknown> = { ok: true };

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let tmpDir: string;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      // GETs (e.g. /api/history/<sha>) — return a versionResult shape
      if (req.method === 'GET') {
        return Response.json({
          ok: true,
          author: 'Claude',
          timestamp: '2026-04-21T00:00:00.000Z',
        });
      }
      const body = (await req.json()) as Record<string, unknown>;
      recordedRequest = { url: url.pathname, body };
      return Response.json({
        ok: true,
        timestamp: '2026-04-21T00:00:00.000Z',
        subscriberCount: 1,
        renamed: [{ fromDocName: 'old', toDocName: 'new' }],
        rewrittenDocs: [],
        ...mockResponse,
      });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-summary-passthrough-'));
  recordedRequest = undefined;
  mockResponse = {};
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const TEST_IDENTITY: AgentIdentity = {
  connectionId: 'claude-1',
  displayName: 'Claude',
  colorSeed: 'test-seed',
  clientInfo: { name: 'claude-code', version: '1.0.0' },
};

function baseDeps() {
  return {
    serverUrl: baseUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('US-005 — summary + identityRef passthrough across MCP write tools', () => {
  describe('write_document', () => {
    test('summary is forwarded in the HTTP body when present', async () => {
      const cap = createCaptureServer();
      registerWriteDocument(cap.server, {
        ...baseDeps(),
        identityRef: { current: TEST_IDENTITY },
      });
      await cap.getTool('write_document').handler({
        docName: 'foo',
        markdown: '# hi',
        position: 'append',
        summary: 'Fixed typo',
      });
      expect(recordedRequest?.body.summary).toBe('Fixed typo');
      expect(recordedRequest?.body.agentId).toBe('claude-1');
    });

    test('summary omitted from body when arg is undefined', async () => {
      const cap = createCaptureServer();
      registerWriteDocument(cap.server, baseDeps());
      await cap.getTool('write_document').handler({
        docName: 'foo',
        markdown: '# hi',
        position: 'append',
      });
      expect(recordedRequest?.body).not.toHaveProperty('summary');
    });

    test('server response summary surfaces in structuredContent; hint in text', async () => {
      mockResponse = {
        summary: { value: 'fixed', truncatedFrom: 200 },
        hint: 'Summary truncated from 200 chars to 80 (max 80).',
      };
      const cap = createCaptureServer();
      registerWriteDocument(cap.server, baseDeps());
      const result = await cap.getTool('write_document').handler({
        docName: 'foo',
        markdown: '# hi',
        position: 'append',
        summary: 'x'.repeat(200),
      });
      expect(result.structuredContent?.summary).toEqual({ value: 'fixed', truncatedFrom: 200 });
      expect(result.content[0]?.text).toContain('Summary truncated from 200 chars to 80');
    });

    test('200-char summary passes Zod validation (transport-safety cap)', async () => {
      const cap = createCaptureServer();
      registerWriteDocument(cap.server, baseDeps());
      const input = 'x'.repeat(200);
      const result = await cap.getTool('write_document').handler({
        docName: 'foo',
        markdown: 'hi',
        position: 'append',
        summary: input,
      });
      // At the MCP layer the arg just passes through — the Zod check is a
      // runtime guardrail covered by the Zod schema registration. Here we
      // simply assert the 200-char string reached the HTTP body without
      // being truncated at the MCP layer (truncation is server-side).
      expect(recordedRequest?.body.summary).toBe(input);
      expect(result.isError).toBeUndefined();
    });
  });

  describe('edit_document', () => {
    test('summary + identityRef flow through to /api/agent-patch', async () => {
      const cap = createCaptureServer();
      registerEditDocument(cap.server, {
        ...baseDeps(),
        identityRef: { current: TEST_IDENTITY },
      });
      await cap.getTool('edit_document').handler({
        docName: 'foo',
        find: 'old',
        replace: 'new',
        summary: 'Renamed constant',
      });
      expect(recordedRequest?.url).toBe('/api/agent-patch');
      expect(recordedRequest?.body.summary).toBe('Renamed constant');
      expect(recordedRequest?.body.agentId).toBe('claude-1');
    });
  });

  describe('rename_document — D15 identity passthrough', () => {
    test('identityRef when present puts agentId in the /api/rename body', async () => {
      const cap = createCaptureServer();
      registerRenameDocument(cap.server, {
        ...baseDeps(),
        identityRef: { current: TEST_IDENTITY },
      });
      await cap.getTool('rename_document').handler({
        docName: 'old',
        newDocName: 'new',
      });
      expect(recordedRequest?.url).toBe('/api/rename');
      expect(recordedRequest?.body.agentId).toBe('claude-1');
      expect(recordedRequest?.body.agentName).toBe('Claude');
      expect(recordedRequest?.body.colorSeed).toBe('test-seed');
    });

    test('no identityRef → body omits agentId (server stays anonymous per D22)', async () => {
      const cap = createCaptureServer();
      registerRenameDocument(cap.server, baseDeps());
      await cap.getTool('rename_document').handler({
        docName: 'old',
        newDocName: 'new',
      });
      expect(recordedRequest?.body).not.toHaveProperty('agentId');
    });

    test('summary is forwarded when provided', async () => {
      const cap = createCaptureServer();
      registerRenameDocument(cap.server, {
        ...baseDeps(),
        identityRef: { current: TEST_IDENTITY },
      });
      await cap.getTool('rename_document').handler({
        docName: 'old',
        newDocName: 'new',
        summary: 'Aligned naming with module layout',
      });
      expect(recordedRequest?.body.summary).toBe('Aligned naming with module layout');
    });

    test('description mentions the default substitution sentence (FR11)', async () => {
      const cap = createCaptureServer();
      registerRenameDocument(cap.server, baseDeps());
      const desc = cap.getTool('rename_document').description;
      expect(desc).toContain('If omitted');
      expect(desc).toContain('Renamed X → Y');
    });
  });

  describe('rollback_to_version — D15 identity passthrough', () => {
    test('identityRef when present puts agentId in the /api/rollback body', async () => {
      const cap = createCaptureServer();
      registerRollbackToVersion(cap.server, {
        ...baseDeps(),
        identityRef: { current: TEST_IDENTITY },
      });
      await cap.getTool('rollback_to_version').handler({
        docName: 'foo',
        commitSha: 'a'.repeat(40),
      });
      expect(recordedRequest?.url).toBe('/api/rollback');
      expect(recordedRequest?.body.agentId).toBe('claude-1');
    });

    test('no identityRef → body omits agentId (UI-style anonymous call)', async () => {
      const cap = createCaptureServer();
      registerRollbackToVersion(cap.server, baseDeps());
      await cap.getTool('rollback_to_version').handler({
        docName: 'foo',
        commitSha: 'a'.repeat(40),
      });
      expect(recordedRequest?.body).not.toHaveProperty('agentId');
    });

    test('summary is forwarded when provided', async () => {
      const cap = createCaptureServer();
      registerRollbackToVersion(cap.server, {
        ...baseDeps(),
        identityRef: { current: TEST_IDENTITY },
      });
      await cap.getTool('rollback_to_version').handler({
        docName: 'foo',
        commitSha: 'a'.repeat(40),
        summary: 'Reverted risky refactor',
      });
      expect(recordedRequest?.body.summary).toBe('Reverted risky refactor');
    });

    test('description mentions the default substitution sentence (FR11)', async () => {
      const cap = createCaptureServer();
      registerRollbackToVersion(cap.server, baseDeps());
      const desc = cap.getTool('rollback_to_version').description;
      expect(desc).toContain('If omitted');
      expect(desc).toContain('Restored to');
    });
  });

  describe('No-PII reminder in all four tool descriptions (FR15)', () => {
    test('write_document description mentions no secrets/PII', () => {
      const cap = createCaptureServer();
      registerWriteDocument(cap.server, baseDeps());
      expect(cap.getTool('write_document').description).toContain('secrets or PII');
    });
    test('edit_document description mentions no secrets/PII', () => {
      const cap = createCaptureServer();
      registerEditDocument(cap.server, baseDeps());
      expect(cap.getTool('edit_document').description).toContain('secrets or PII');
    });
    test('rename_document description mentions no secrets/PII', () => {
      const cap = createCaptureServer();
      registerRenameDocument(cap.server, baseDeps());
      expect(cap.getTool('rename_document').description).toContain('secrets or PII');
    });
    test('rollback_to_version description mentions no secrets/PII', () => {
      const cap = createCaptureServer();
      registerRollbackToVersion(cap.server, baseDeps());
      expect(cap.getTool('rollback_to_version').description).toContain('secrets or PII');
    });
  });
});
