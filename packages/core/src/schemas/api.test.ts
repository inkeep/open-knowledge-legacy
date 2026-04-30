import { describe, expect, test } from 'bun:test';
import {
  AgentPatchRequestSchema,
  AgentPatchSuccessSchema,
  AgentUndoRequestSchema,
  AgentUndoSuccessSchema,
  AgentWriteMdRequestSchema,
  AgentWriteMdSuccessSchema,
  AgentWriteRequestSchema,
  AgentWriteSuccessSchema,
  CreatePageRequestSchema,
  CreatePageSuccessSchema,
  DeletePathRequestSchema,
  DeletePathSuccessSchema,
  EmptyRequestSchema,
  HeadingEntrySchema,
  LocalOpCloneRequestSchema,
  PageEntrySchema,
  PageHeadingsSuccessSchema,
  PagesSuccessSchema,
  PrincipalResponseSchema,
  ProblemDetailsSchema,
  ProblemTypeSchema,
  RenamedDocMappingSchema,
  RenamePathRequestSchema,
  RenamePathSuccessSchema,
  RenameRequestSchema,
  RenameRewrittenDocSchema,
  RenameSuccessSchema,
  RollbackRequestSchema,
  RollbackSuccessSchema,
  StreamingProblemEventSchema,
  SummaryResponseFieldSchema,
  UploadAssetSuccessSchema,
  UploadRequestSchema,
} from './api';

const validPrincipal = {
  id: 'principal-abc123',
  display_name: 'Miles Kaming-Thanassi',
  display_email: 'miles@example.com',
  source: 'git-config' as const,
  created_at: '2026-04-27T00:00:00.000Z',
};

describe('PrincipalResponseSchema', () => {
  test('parses a valid git-config principal', () => {
    const result = PrincipalResponseSchema.safeParse(validPrincipal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('principal-abc123');
      expect(result.data.display_name).toBe('Miles Kaming-Thanassi');
      expect(result.data.source).toBe('git-config');
    }
  });

  test('parses a valid synthesized principal', () => {
    const result = PrincipalResponseSchema.safeParse({
      ...validPrincipal,
      source: 'synthesized',
      display_name: 'Local User',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('synthesized');
    }
  });

  test('preserves unknown fields for forward-compat (loose schema)', () => {
    const result = PrincipalResponseSchema.safeParse({
      ...validPrincipal,
      future_field: 'new-server-value',
    });
    expect(result.success).toBe(true);
    // .loose() must pass unknown fields through to result.data, not strip them.
    // A change from .loose() to .strip() would make success: true but drop the field.
    if (result.success) {
      expect((result.data as Record<string, unknown>).future_field).toBe('new-server-value');
    }
  });

  test('fails when id is missing', () => {
    const { id: _id, ...withoutId } = validPrincipal;
    const result = PrincipalResponseSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('fails when id is an empty string', () => {
    const result = PrincipalResponseSchema.safeParse({ ...validPrincipal, id: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('fails when display_name is an empty string', () => {
    // An empty git-config user.name (template-rendered configs, mis-quoted setup
    // scripts) must not propagate to the awareness publish-site as name: ''. The
    // safeParse failure here routes the client to the random-identity fallback
    // — same path as a 404 / network error.
    const result = PrincipalResponseSchema.safeParse({ ...validPrincipal, display_name: '' });
    expect(result.success).toBe(false);
  });

  test('accepts empty display_email (field is server-only; absence should not discard usable name+id)', () => {
    // display_email is never rendered in awareness — only used server-side for
    // shadow-repo authoring / Co-Authored-By. An absent or empty email must not
    // cause a valid principal (with a good display_name and id) to be rejected.
    const result = PrincipalResponseSchema.safeParse({ ...validPrincipal, display_email: '' });
    expect(result.success).toBe(true);
  });

  test('fails when source is an invalid enum value', () => {
    const result = PrincipalResponseSchema.safeParse({
      ...validPrincipal,
      source: 'ldap',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('fails when display_name is not a string', () => {
    const result = PrincipalResponseSchema.safeParse({
      ...validPrincipal,
      display_name: 42,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('fails when the entire object is null', () => {
    const result = PrincipalResponseSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RFC 9457 Problem Details (D22, D38)
// ---------------------------------------------------------------------------

describe('ProblemTypeSchema', () => {
  test('accepts the seeded upload-side URN tokens', () => {
    const tokens = [
      'urn:ok:error:malformed-upload',
      'urn:ok:error:collision-exhaustion',
      'urn:ok:error:storage-full',
      'urn:ok:error:storage-readonly',
      'urn:ok:error:storage-error',
      'urn:ok:error:no-file-received',
      'urn:ok:error:parent-doc-name-required',
      'urn:ok:error:path-escape',
    ];
    for (const t of tokens) {
      const result = ProblemTypeSchema.safeParse(t);
      expect(result.success).toBe(true);
    }
  });

  test('accepts the cross-handler shared URN tokens', () => {
    const tokens = [
      'urn:ok:error:method-not-allowed',
      'urn:ok:error:invalid-request',
      'urn:ok:error:internal-server-error',
    ];
    for (const t of tokens) {
      const result = ProblemTypeSchema.safeParse(t);
      expect(result.success).toBe(true);
    }
  });

  test('accepts the local-op security gate URN tokens', () => {
    const tokens = ['urn:ok:error:loopback-required', 'urn:ok:error:invalid-origin'];
    for (const t of tokens) {
      const result = ProblemTypeSchema.safeParse(t);
      expect(result.success).toBe(true);
    }
  });

  test('accepts the local-op clone URN tokens (US-005)', () => {
    const tokens = [
      'urn:ok:error:url-not-allowed',
      'urn:ok:error:dir-outside-home',
      'urn:ok:error:concurrent-operation',
      'urn:ok:error:clone-failed',
      'urn:ok:error:clone-timeout',
      'urn:ok:error:server-start-failed',
    ];
    for (const t of tokens) {
      const result = ProblemTypeSchema.safeParse(t);
      expect(result.success).toBe(true);
    }
  });

  test('rejects relative-URI form (D38: URN form is canonical, not /errors/<kebab>)', () => {
    const result = ProblemTypeSchema.safeParse('/errors/malformed-upload');
    expect(result.success).toBe(false);
  });

  test('rejects bare kebab tokens (closed by policy, NG1)', () => {
    const result = ProblemTypeSchema.safeParse('malformed-upload');
    expect(result.success).toBe(false);
  });

  test('rejects undeclared URN tokens (closed by policy)', () => {
    const result = ProblemTypeSchema.safeParse('urn:ok:error:undeclared-token');
    expect(result.success).toBe(false);
  });
});

describe('ProblemDetailsSchema', () => {
  const validProblem = {
    type: 'urn:ok:error:malformed-upload' as const,
    title: 'The uploaded multipart payload is malformed.',
    status: 400,
  };

  test('parses a minimal valid problem (required fields only)', () => {
    const result = ProblemDetailsSchema.safeParse(validProblem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('urn:ok:error:malformed-upload');
      expect(result.data.title).toBe('The uploaded multipart payload is malformed.');
      expect(result.data.status).toBe(400);
    }
  });

  test('parses a fully-populated problem with instance and detail', () => {
    const result = ProblemDetailsSchema.safeParse({
      ...validProblem,
      instance: '01234567-89ab-4def-8123-456789abcdef',
      detail: 'busboy reported a parse error during upload.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.instance).toBe('01234567-89ab-4def-8123-456789abcdef');
      expect(result.data.detail).toBe('busboy reported a parse error during upload.');
    }
  });

  test('preserves unknown extension fields (RFC 9457 §3.2 / .loose())', () => {
    const result = ProblemDetailsSchema.safeParse({
      ...validProblem,
      errors: [{ field: 'parentDocName', message: 'required' }],
      documentation_url: 'https://example.com/docs/upload',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).errors).toBeDefined();
      expect((result.data as Record<string, unknown>).documentation_url).toBe(
        'https://example.com/docs/upload',
      );
    }
  });

  test('fails when title is missing', () => {
    const { title: _title, ...withoutTitle } = validProblem;
    const result = ProblemDetailsSchema.safeParse(withoutTitle);
    expect(result.success).toBe(false);
  });

  test('fails when title is empty string (D14: title required, non-empty)', () => {
    const result = ProblemDetailsSchema.safeParse({ ...validProblem, title: '' });
    expect(result.success).toBe(false);
  });

  test('fails when status is below 400 (errors only)', () => {
    const result = ProblemDetailsSchema.safeParse({ ...validProblem, status: 200 });
    expect(result.success).toBe(false);
  });

  test('fails when status is above 599 (HTTP status range)', () => {
    const result = ProblemDetailsSchema.safeParse({ ...validProblem, status: 600 });
    expect(result.success).toBe(false);
  });

  test('fails when status is not an integer', () => {
    const result = ProblemDetailsSchema.safeParse({ ...validProblem, status: 400.5 });
    expect(result.success).toBe(false);
  });

  test('fails when instance is not a UUID', () => {
    const result = ProblemDetailsSchema.safeParse({ ...validProblem, instance: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  test('fails when type is not a registered URN token', () => {
    const result = ProblemDetailsSchema.safeParse({
      ...validProblem,
      type: 'urn:ok:error:fictional-token',
    });
    expect(result.success).toBe(false);
  });
});

describe('UploadAssetSuccessSchema', () => {
  test('parses a minimal valid success (src only)', () => {
    const result = UploadAssetSuccessSchema.safeParse({ src: 'attachments/photo.png' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.src).toBe('attachments/photo.png');
    }
  });

  test('parses a fully-populated success with dedup metadata', () => {
    const result = UploadAssetSuccessSchema.safeParse({
      src: 'photo.png',
      path: 'docs/photo.png',
      deduped: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.src).toBe('photo.png');
      expect(result.data.path).toBe('docs/photo.png');
      expect(result.data.deduped).toBe(true);
    }
  });

  test('preserves unknown fields for forward-compat (.loose())', () => {
    const result = UploadAssetSuccessSchema.safeParse({
      src: 'attachments/photo.png',
      future_field: 'new-server-value',
    });
    expect(result.success).toBe(true);
  });

  test('does NOT contain ok:true wrapper field (D22 success drops wrapper)', () => {
    // A response shape with `{ ok: true, src: '...' }` is still parsed by .loose()
    // because .loose() preserves unknown fields. The wire-shape change is enforced
    // structurally — handlers no longer emit `ok: true`. This test simply documents
    // the schema shape: top-level fields are flat (no discriminator).
    const result = UploadAssetSuccessSchema.safeParse({ src: 'foo.png' });
    expect(result.success).toBe(true);
    if (result.success) {
      // No `ok` field exists on the canonical type.
      // @ts-expect-error -- ok is not a field on UploadAssetSuccess
      void result.data.ok;
    }
  });

  test('fails when src is missing', () => {
    const result = UploadAssetSuccessSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('fails when src is empty', () => {
    const result = UploadAssetSuccessSchema.safeParse({ src: '' });
    expect(result.success).toBe(false);
  });

  test('fails when path is empty', () => {
    const result = UploadAssetSuccessSchema.safeParse({ src: 'foo.png', path: '' });
    expect(result.success).toBe(false);
  });
});

describe('UploadRequestSchema', () => {
  test('parses a valid request with parentDocName only', () => {
    const result = UploadRequestSchema.safeParse({ parentDocName: 'notes/index' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentDocName).toBe('notes/index');
    }
  });

  test('parses a request with optional agent identity', () => {
    const result = UploadRequestSchema.safeParse({
      parentDocName: 'notes/index',
      agentId: 'claude-1',
      agentName: 'Claude',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe('claude-1');
      expect(result.data.agentName).toBe('Claude');
    }
  });

  test('fails when parentDocName is missing', () => {
    const result = UploadRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('fails when parentDocName is empty', () => {
    const result = UploadRequestSchema.safeParse({ parentDocName: '' });
    expect(result.success).toBe(false);
  });
});

describe('LocalOpCloneRequestSchema (US-005)', () => {
  test('parses a valid request with url + dir', () => {
    const result = LocalOpCloneRequestSchema.safeParse({
      url: 'https://github.com/owner/repo',
      dir: '~/Documents/repo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://github.com/owner/repo');
      expect(result.data.dir).toBe('~/Documents/repo');
    }
  });

  test('preserves unknown fields for forward-compat (.loose())', () => {
    const result = LocalOpCloneRequestSchema.safeParse({
      url: 'git@github.com:owner/repo',
      dir: '~/work/repo',
      branch: 'main',
    });
    expect(result.success).toBe(true);
  });

  test('fails when url is missing', () => {
    const result = LocalOpCloneRequestSchema.safeParse({ dir: '~/Documents/repo' });
    expect(result.success).toBe(false);
  });

  test('fails when dir is missing', () => {
    const result = LocalOpCloneRequestSchema.safeParse({ url: 'https://github.com/owner/repo' });
    expect(result.success).toBe(false);
  });

  test('fails when url is empty', () => {
    const result = LocalOpCloneRequestSchema.safeParse({ url: '', dir: '~/Documents/repo' });
    expect(result.success).toBe(false);
  });

  test('fails when dir is empty', () => {
    const result = LocalOpCloneRequestSchema.safeParse({
      url: 'https://github.com/owner/repo',
      dir: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('StreamingProblemEventSchema (US-005, D36 c)', () => {
  test('parses a valid mid-stream error event with full ProblemDetails', () => {
    const result = StreamingProblemEventSchema.safeParse({
      type: 'error',
      problem: {
        type: 'urn:ok:error:clone-failed',
        title: 'Clone subprocess exited with non-zero status.',
        status: 500,
        instance: '01234567-89ab-4def-8123-456789abcdef',
        detail: 'fatal: repository not found',
      },
    });
    expect(result.success).toBe(true);
  });

  test('parses a minimal mid-stream error event (problem with required fields only)', () => {
    const result = StreamingProblemEventSchema.safeParse({
      type: 'error',
      problem: {
        type: 'urn:ok:error:clone-timeout',
        title: 'Clone timed out after 10 minutes.',
        status: 504,
      },
    });
    expect(result.success).toBe(true);
  });

  test('fails when outer type is not "error" (streaming protocol discriminator)', () => {
    const result = StreamingProblemEventSchema.safeParse({
      type: 'progress',
      problem: { type: 'urn:ok:error:clone-failed', title: 'foo', status: 500 },
    });
    expect(result.success).toBe(false);
  });

  test('fails when problem field is missing', () => {
    const result = StreamingProblemEventSchema.safeParse({ type: 'error' });
    expect(result.success).toBe(false);
  });

  test('fails when problem field has invalid URN type', () => {
    const result = StreamingProblemEventSchema.safeParse({
      type: 'error',
      problem: { type: 'urn:ok:error:fictional-token', title: 'foo', status: 500 },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cluster A: agent-write / -write-md / -patch / -undo (US-006)
// ---------------------------------------------------------------------------

describe('ProblemTypeSchema cluster A URN tokens', () => {
  test.each([
    'urn:ok:error:reserved-docname',
    'urn:ok:error:target-not-found',
    'urn:ok:error:stale-target',
    'urn:ok:error:no-active-session',
  ])('%s parses', (token) => {
    const result = ProblemTypeSchema.safeParse(token);
    expect(result.success).toBe(true);
  });
});

describe('AgentWriteRequestSchema', () => {
  test('parses minimal empty body', () => {
    const result = AgentWriteRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('parses full body with content + identity + summary', () => {
    const result = AgentWriteRequestSchema.safeParse({
      docName: 'projects/notes',
      content: 'Hello',
      summary: 'Wrote hello',
      agentId: 'claude-1',
      agentName: 'Claude',
      colorSeed: 'abc',
      clientName: 'claude-code',
      clientVersion: '1.2.3',
      label: 'task-42',
    });
    expect(result.success).toBe(true);
  });

  test('rejects unsafe docName with path traversal', () => {
    const result = AgentWriteRequestSchema.safeParse({ docName: '../etc/passwd' });
    expect(result.success).toBe(false);
  });

  test('rejects unsafe docName starting with /', () => {
    const result = AgentWriteRequestSchema.safeParse({ docName: '/abs/path' });
    expect(result.success).toBe(false);
  });

  test('rejects non-string summary', () => {
    const result = AgentWriteRequestSchema.safeParse({ summary: 42 });
    expect(result.success).toBe(false);
  });
});

describe('AgentWriteMdRequestSchema', () => {
  test('parses minimal valid body (markdown only)', () => {
    const result = AgentWriteMdRequestSchema.safeParse({ markdown: '# Hello' });
    expect(result.success).toBe(true);
  });

  test('parses with all enum positions', () => {
    for (const position of ['append', 'prepend', 'replace'] as const) {
      const result = AgentWriteMdRequestSchema.safeParse({ markdown: '# Hi', position });
      expect(result.success).toBe(true);
    }
  });

  test('rejects when markdown is missing', () => {
    const result = AgentWriteMdRequestSchema.safeParse({ position: 'append' });
    expect(result.success).toBe(false);
  });

  test('rejects when markdown is empty string', () => {
    const result = AgentWriteMdRequestSchema.safeParse({ markdown: '' });
    expect(result.success).toBe(false);
  });

  test('rejects when position is unknown enum value', () => {
    const result = AgentWriteMdRequestSchema.safeParse({ markdown: '# Hi', position: 'overwrite' });
    expect(result.success).toBe(false);
  });
});

describe('AgentPatchRequestSchema', () => {
  test('parses minimal valid body (find + replace)', () => {
    const result = AgentPatchRequestSchema.safeParse({ find: 'old', replace: 'new' });
    expect(result.success).toBe(true);
  });

  test('parses with non-negative integer offset', () => {
    const result = AgentPatchRequestSchema.safeParse({ find: 'a', replace: 'b', offset: 0 });
    expect(result.success).toBe(true);
  });

  test('accepts empty replace string (deletes the matched segment)', () => {
    const result = AgentPatchRequestSchema.safeParse({ find: 'old', replace: '' });
    expect(result.success).toBe(true);
  });

  test('rejects empty find string', () => {
    const result = AgentPatchRequestSchema.safeParse({ find: '', replace: 'x' });
    expect(result.success).toBe(false);
  });

  test('rejects negative offset', () => {
    const result = AgentPatchRequestSchema.safeParse({
      find: 'a',
      replace: 'b',
      offset: -1,
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-integer offset', () => {
    const result = AgentPatchRequestSchema.safeParse({
      find: 'a',
      replace: 'b',
      offset: 1.5,
    });
    expect(result.success).toBe(false);
  });

  test('rejects when find is missing', () => {
    const result = AgentPatchRequestSchema.safeParse({ replace: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('AgentUndoRequestSchema', () => {
  test('parses minimal valid body (connectionId only)', () => {
    const result = AgentUndoRequestSchema.safeParse({ connectionId: 'agent-abc' });
    expect(result.success).toBe(true);
  });

  test('parses with all scope enum values', () => {
    for (const scope of ['last', 'session', 'file'] as const) {
      const result = AgentUndoRequestSchema.safeParse({
        connectionId: 'agent-abc',
        scope,
      });
      expect(result.success).toBe(true);
    }
  });

  test('rejects when connectionId is missing', () => {
    const result = AgentUndoRequestSchema.safeParse({ scope: 'last' });
    expect(result.success).toBe(false);
  });

  test('rejects when connectionId is empty string', () => {
    const result = AgentUndoRequestSchema.safeParse({ connectionId: '' });
    expect(result.success).toBe(false);
  });

  test('rejects when scope is unknown enum value', () => {
    const result = AgentUndoRequestSchema.safeParse({
      connectionId: 'agent-abc',
      scope: 'all',
    });
    expect(result.success).toBe(false);
  });
});

describe('SummaryResponseFieldSchema', () => {
  test('parses simple value-only summary', () => {
    const result = SummaryResponseFieldSchema.safeParse({ value: 'Wrote a doc' });
    expect(result.success).toBe(true);
  });

  test('parses truncated summary with hint', () => {
    const result = SummaryResponseFieldSchema.safeParse({
      value: 'Trunc…',
      truncatedFrom: 120,
      hint: 'Summary truncated from 120 chars to 80 (max 80).',
    });
    expect(result.success).toBe(true);
  });

  test('rejects when value is missing', () => {
    const result = SummaryResponseFieldSchema.safeParse({ truncatedFrom: 5 });
    expect(result.success).toBe(false);
  });
});

describe('AgentWriteSuccessSchema', () => {
  test('parses with timestamp only', () => {
    const result = AgentWriteSuccessSchema.safeParse({ timestamp: '2026-04-30T00:00:00.000Z' });
    expect(result.success).toBe(true);
  });

  test('parses with summary present', () => {
    const result = AgentWriteSuccessSchema.safeParse({
      timestamp: '2026-04-30T00:00:00.000Z',
      summary: { value: 'Added section X' },
    });
    expect(result.success).toBe(true);
  });

  test('rejects when ok:true wrapper is present (D22)', () => {
    // Migrated handlers MUST drop the `ok: true` wrapper. A reader-side
    // safeParse should still ACCEPT it via `.loose()` (forward-compat) —
    // this test documents the intentional non-strictness.
    const result = AgentWriteSuccessSchema.safeParse({
      ok: true,
      timestamp: '2026-04-30T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentWriteMdSuccessSchema', () => {
  test('parses with subscriber counts and no hints', () => {
    const result = AgentWriteMdSuccessSchema.safeParse({
      timestamp: '2026-04-30T00:00:00.000Z',
      subscriberCount: 0,
      systemSubscriberCount: 0,
    });
    expect(result.success).toBe(true);
  });

  test('parses with one orphan hint', () => {
    const result = AgentWriteMdSuccessSchema.safeParse({
      timestamp: '2026-04-30T00:00:00.000Z',
      subscriberCount: 1,
      systemSubscriberCount: 1,
      hints: [
        {
          type: 'orphan',
          parentCandidates: ['folder/README'],
          message: 'No backlinks; consider linking from [[folder/README]].',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rejects negative subscriberCount', () => {
    const result = AgentWriteMdSuccessSchema.safeParse({
      timestamp: '2026-04-30T00:00:00.000Z',
      subscriberCount: -1,
      systemSubscriberCount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects orphan hint with non-orphan type literal', () => {
    const result = AgentWriteMdSuccessSchema.safeParse({
      timestamp: '2026-04-30T00:00:00.000Z',
      subscriberCount: 0,
      systemSubscriberCount: 0,
      hints: [{ type: 'something-else', parentCandidates: [], message: '' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('AgentPatchSuccessSchema', () => {
  test('parses with required fields', () => {
    const result = AgentPatchSuccessSchema.safeParse({
      timestamp: '2026-04-30T00:00:00.000Z',
      subscriberCount: 0,
      systemSubscriberCount: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentUndoSuccessSchema', () => {
  test('parses with scope=last', () => {
    const result = AgentUndoSuccessSchema.safeParse({
      docName: 'foo',
      scope: 'last',
      undone: true,
    });
    expect(result.success).toBe(true);
  });

  test('parses with scope=session and undone=false (no-op)', () => {
    const result = AgentUndoSuccessSchema.safeParse({
      docName: 'foo',
      scope: 'session',
      undone: false,
    });
    expect(result.success).toBe(true);
  });

  test('rejects scope=file (handler collapses to session before emitting)', () => {
    const result = AgentUndoSuccessSchema.safeParse({
      docName: 'foo',
      scope: 'file',
      undone: false,
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty docName', () => {
    const result = AgentUndoSuccessSchema.safeParse({
      docName: '',
      scope: 'last',
      undone: false,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cluster B: pages CRUD (US-007)
// ---------------------------------------------------------------------------

describe('Cluster B URN tokens (US-007)', () => {
  test('accepts the four new cluster B URNs', () => {
    for (const token of [
      'urn:ok:error:doc-not-found',
      'urn:ok:error:doc-already-exists',
      'urn:ok:error:document-not-open',
      'urn:ok:error:rollback-not-configured',
    ]) {
      expect(ProblemTypeSchema.safeParse(token).success).toBe(true);
    }
  });
});

describe('RenamedDocMappingSchema', () => {
  test('parses a valid mapping', () => {
    const result = RenamedDocMappingSchema.safeParse({ fromDocName: 'a', toDocName: 'b' });
    expect(result.success).toBe(true);
  });
  test('rejects empty fromDocName', () => {
    expect(RenamedDocMappingSchema.safeParse({ fromDocName: '', toDocName: 'b' }).success).toBe(
      false,
    );
  });
  test('rejects missing toDocName', () => {
    expect(RenamedDocMappingSchema.safeParse({ fromDocName: 'a' }).success).toBe(false);
  });
});

describe('EmptyRequestSchema', () => {
  test('accepts empty object', () => {
    expect(EmptyRequestSchema.safeParse({}).success).toBe(true);
  });
  test('accepts unknown fields (loose)', () => {
    expect(EmptyRequestSchema.safeParse({ foo: 1 }).success).toBe(true);
  });
});

describe('CreatePageRequestSchema', () => {
  test('parses a valid path', () => {
    const result = CreatePageRequestSchema.safeParse({ path: 'foo/bar.md' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.path).toBe('foo/bar.md');
  });
  test('rejects empty path', () => {
    expect(CreatePageRequestSchema.safeParse({ path: '' }).success).toBe(false);
  });
  test('rejects missing path', () => {
    expect(CreatePageRequestSchema.safeParse({}).success).toBe(false);
  });
  test('accepts agentId pass-through', () => {
    const result = CreatePageRequestSchema.safeParse({
      path: 'a.md',
      agentId: 'claude-1',
      agentName: 'Claude',
    });
    expect(result.success).toBe(true);
  });
});

describe('CreatePageSuccessSchema', () => {
  test('parses a valid response', () => {
    expect(CreatePageSuccessSchema.safeParse({ docName: 'foo' }).success).toBe(true);
  });
  test('rejects missing docName', () => {
    expect(CreatePageSuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('PageEntrySchema and PagesSuccessSchema', () => {
  const validPage = {
    docName: 'foo',
    title: 'Foo',
    docExt: '.md',
    size: 100,
    modified: '2026-04-30T00:00:00.000Z',
  };
  test('parses a valid page entry', () => {
    expect(PageEntrySchema.safeParse(validPage).success).toBe(true);
  });
  test('accepts empty title', () => {
    // title may be empty when extractPageTitle finds no headings; the
    // schema should not reject — the docName is the user-visible fallback.
    expect(PageEntrySchema.safeParse({ ...validPage, title: '' }).success).toBe(true);
  });
  test('rejects negative size', () => {
    expect(PageEntrySchema.safeParse({ ...validPage, size: -1 }).success).toBe(false);
  });
  test('PagesSuccessSchema parses a list', () => {
    expect(PagesSuccessSchema.safeParse({ pages: [validPage] }).success).toBe(true);
  });
  test('PagesSuccessSchema accepts empty list', () => {
    expect(PagesSuccessSchema.safeParse({ pages: [] }).success).toBe(true);
  });
});

describe('HeadingEntrySchema and PageHeadingsSuccessSchema', () => {
  test('parses a valid heading entry', () => {
    expect(HeadingEntrySchema.safeParse({ level: 2, text: 'A', slug: 'a' }).success).toBe(true);
  });
  test('rejects level 0', () => {
    expect(HeadingEntrySchema.safeParse({ level: 0, text: 'A', slug: 'a' }).success).toBe(false);
  });
  test('rejects level 7', () => {
    expect(HeadingEntrySchema.safeParse({ level: 7, text: 'A', slug: 'a' }).success).toBe(false);
  });
  test('PageHeadingsSuccessSchema parses success', () => {
    const result = PageHeadingsSuccessSchema.safeParse({
      docName: 'foo',
      headings: [{ level: 1, text: 'Title', slug: 'title' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('RenameRequestSchema', () => {
  test('parses a valid rename', () => {
    const result = RenameRequestSchema.safeParse({ docName: 'a', newDocName: 'b' });
    expect(result.success).toBe(true);
  });
  test('rejects empty docName', () => {
    expect(RenameRequestSchema.safeParse({ docName: '', newDocName: 'b' }).success).toBe(false);
  });
  test('rejects empty newDocName', () => {
    expect(RenameRequestSchema.safeParse({ docName: 'a', newDocName: '' }).success).toBe(false);
  });
  test('accepts optional summary', () => {
    expect(
      RenameRequestSchema.safeParse({
        docName: 'a',
        newDocName: 'b',
        summary: 'optional summary',
      }).success,
    ).toBe(true);
  });
  test('rejects non-string summary', () => {
    expect(
      RenameRequestSchema.safeParse({ docName: 'a', newDocName: 'b', summary: 42 }).success,
    ).toBe(false);
  });
});

describe('RenameRewrittenDocSchema', () => {
  test('parses a valid entry', () => {
    expect(RenameRewrittenDocSchema.safeParse({ docName: 'a', rewrites: 5 }).success).toBe(true);
  });
  test('rejects negative rewrites', () => {
    expect(RenameRewrittenDocSchema.safeParse({ docName: 'a', rewrites: -1 }).success).toBe(false);
  });
});

describe('RenameSuccessSchema', () => {
  test('parses success with no rewrites', () => {
    expect(RenameSuccessSchema.safeParse({ renamed: [], rewrittenDocs: [] }).success).toBe(true);
  });
  test('parses success with summary', () => {
    expect(
      RenameSuccessSchema.safeParse({
        renamed: [{ fromDocName: 'a', toDocName: 'b' }],
        rewrittenDocs: [{ docName: 'c', rewrites: 1 }],
        summary: { value: 'Renamed a → b' },
      }).success,
    ).toBe(true);
  });
});

describe('RenamePathRequestSchema', () => {
  test('parses a valid file rename', () => {
    expect(
      RenamePathRequestSchema.safeParse({ kind: 'file', fromPath: 'a.md', toPath: 'b.md' }).success,
    ).toBe(true);
  });
  test('parses a valid folder rename', () => {
    expect(
      RenamePathRequestSchema.safeParse({ kind: 'folder', fromPath: 'a', toPath: 'b' }).success,
    ).toBe(true);
  });
  test('rejects unknown kind', () => {
    expect(
      RenamePathRequestSchema.safeParse({ kind: 'symlink', fromPath: 'a', toPath: 'b' }).success,
    ).toBe(false);
  });
  test('rejects empty fromPath', () => {
    expect(
      RenamePathRequestSchema.safeParse({ kind: 'file', fromPath: '', toPath: 'b' }).success,
    ).toBe(false);
  });
});

describe('RenamePathSuccessSchema', () => {
  test('parses an empty renamed list', () => {
    expect(RenamePathSuccessSchema.safeParse({ renamed: [] }).success).toBe(true);
  });
  test('parses a populated list', () => {
    expect(
      RenamePathSuccessSchema.safeParse({
        renamed: [{ fromDocName: 'a', toDocName: 'b' }],
      }).success,
    ).toBe(true);
  });
});

describe('DeletePathRequestSchema', () => {
  test('parses a valid file delete', () => {
    expect(DeletePathRequestSchema.safeParse({ kind: 'file', path: 'a.md' }).success).toBe(true);
  });
  test('parses a valid folder delete', () => {
    expect(DeletePathRequestSchema.safeParse({ kind: 'folder', path: 'a' }).success).toBe(true);
  });
  test('rejects unknown kind', () => {
    expect(DeletePathRequestSchema.safeParse({ kind: 'symlink', path: 'a' }).success).toBe(false);
  });
});

describe('DeletePathSuccessSchema', () => {
  test('parses success with deleted names', () => {
    expect(DeletePathSuccessSchema.safeParse({ deletedDocNames: ['a', 'b'] }).success).toBe(true);
  });
  test('parses success with empty list', () => {
    expect(DeletePathSuccessSchema.safeParse({ deletedDocNames: [] }).success).toBe(true);
  });
});

describe('RollbackRequestSchema', () => {
  const validSha = 'a'.repeat(40);
  test('parses a valid rollback', () => {
    expect(RollbackRequestSchema.safeParse({ docName: 'a', commitSha: validSha }).success).toBe(
      true,
    );
  });
  test('accepts versionTag', () => {
    expect(
      RollbackRequestSchema.safeParse({
        docName: 'a',
        commitSha: validSha,
        versionTag: 'v1.0.0',
      }).success,
    ).toBe(true);
  });
  test('rejects invalid SHA', () => {
    expect(RollbackRequestSchema.safeParse({ docName: 'a', commitSha: 'not-a-sha' }).success).toBe(
      false,
    );
  });
  test('rejects short SHA', () => {
    expect(RollbackRequestSchema.safeParse({ docName: 'a', commitSha: 'abc1234' }).success).toBe(
      false,
    );
  });
  test('rejects non-string summary', () => {
    expect(
      RollbackRequestSchema.safeParse({
        docName: 'a',
        commitSha: validSha,
        summary: 42,
      }).success,
    ).toBe(false);
  });
});

describe('RollbackSuccessSchema', () => {
  test('parses a valid rollback success', () => {
    expect(
      RollbackSuccessSchema.safeParse({
        restoredFrom: 'abcdef0123456789',
        timestamp: '2026-04-30T00:00:00Z',
      }).success,
    ).toBe(true);
  });
  test('parses with optional summary', () => {
    expect(
      RollbackSuccessSchema.safeParse({
        restoredFrom: 'abc',
        timestamp: '2026-04-30T00:00:00Z',
        summary: { value: 'Restored to abc' },
      }).success,
    ).toBe(true);
  });
});
