import { describe, expect, test } from 'bun:test';
import {
  ActivityAgentHeaderSchema,
  ActivityBurstSchema,
  ActivityFileSchema,
  AgentActivitySuccessSchema,
  AgentBurstDiffSuccessSchema,
  AgentPatchRequestSchema,
  AgentPatchSuccessSchema,
  AgentPresenceEntrySchema,
  AgentUndoRequestSchema,
  AgentUndoSuccessSchema,
  AgentWriteMdRequestSchema,
  AgentWriteMdSuccessSchema,
  AgentWriteRequestSchema,
  AgentWriteSuccessSchema,
  BacklinkCountsSuccessSchema,
  BacklinkEntrySchema,
  BacklinksSuccessSchema,
  ConflictEntrySchema,
  CreatePageRequestSchema,
  CreatePageSuccessSchema,
  DeadLinkEntrySchema,
  DeadLinkSourceSchema,
  DeadLinksSuccessSchema,
  DeletePathRequestSchema,
  DeletePathSuccessSchema,
  DocumentListEntrySchema,
  DocumentListSuccessSchema,
  DocumentReadSuccessSchema,
  EmptyRequestSchema,
  ForwardLinkDocEntrySchema,
  ForwardLinkEntrySchema,
  ForwardLinkExternalEntrySchema,
  ForwardLinksSuccessSchema,
  HeadingEntrySchema,
  HubEntrySchema,
  HubsSuccessSchema,
  InstalledAgentsSuccessSchema,
  LinkGraphDocNodeSchema,
  LinkGraphEdgeSchema,
  LinkGraphExternalNodeSchema,
  LinkGraphNodeSchema,
  LinkGraphSuccessSchema,
  LocalOpAuthEmptySuccessSchema,
  LocalOpAuthHostRequestSchema,
  LocalOpAuthIdentitySchema,
  LocalOpAuthIdentitySuccessSchema,
  LocalOpAuthPatRequestSchema,
  LocalOpAuthPatSuccessSchema,
  LocalOpAuthSetIdentityRequestSchema,
  LocalOpAuthStatusSuccessSchema,
  LocalOpCloneRequestSchema,
  LocalOpOpenRequestSchema,
  LocalOpOpenSuccessSchema,
  MetricsAgentPresenceSuccessSchema,
  MetricsParseHealthSuccessSchema,
  MetricsReconciliationSuccessSchema,
  OrphanEntrySchema,
  OrphansSuccessSchema,
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
  SeedApplyRequestSchema,
  SeedApplySuccessSchema,
  SeedPlanSuccessSchema,
  StreamingProblemEventSchema,
  SuggestLinksMentionSchema,
  SuggestLinksSuccessSchema,
  SuggestLinksTargetSchema,
  SummaryResponseFieldSchema,
  SyncAbortMergeSuccessSchema,
  SyncConflictContentSuccessSchema,
  SyncConflictsSuccessSchema,
  SyncResolveConflictRequestSchema,
  SyncResolveConflictSuccessSchema,
  SyncSetEnabledRequestSchema,
  SyncSetEnabledSuccessSchema,
  SyncStateSchema,
  SyncStatusSchema,
  SyncStatusSuccessSchema,
  SyncTriggerRequestSchema,
  SyncTriggerSuccessSchema,
  TestRescanBacklinksSuccessSchema,
  TestResetSuccessSchema,
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

// ─── Cluster C URN tokens (US-008) ───────────────────────────────────────

describe('ProblemTypeSchema cluster C URN tokens', () => {
  test('document-not-available is valid', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:document-not-available').success).toBe(true);
  });
  test('backlink-index-not-configured is valid', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:backlink-index-not-configured').success).toBe(
      true,
    );
  });
});

// ─── Cluster C: read endpoint success schemas ────────────────────────────

describe('DocumentReadSuccessSchema', () => {
  test('parses a flat success body', () => {
    expect(
      DocumentReadSuccessSchema.safeParse({ docName: 'foo', content: '# hi\n\nbody' }).success,
    ).toBe(true);
  });
  test('parses an empty content string', () => {
    expect(DocumentReadSuccessSchema.safeParse({ docName: 'foo', content: '' }).success).toBe(true);
  });
  test('rejects missing content', () => {
    expect(DocumentReadSuccessSchema.safeParse({ docName: 'foo' }).success).toBe(false);
  });
  test('rejects empty docName', () => {
    expect(DocumentReadSuccessSchema.safeParse({ docName: '', content: 'x' }).success).toBe(false);
  });
});

describe('DocumentListEntrySchema', () => {
  test('parses a non-symlink entry', () => {
    expect(
      DocumentListEntrySchema.safeParse({
        docName: 'pages/foo',
        docExt: '.md',
        size: 142,
        modified: '2026-04-30T00:00:00Z',
        isSymlink: false,
        canonicalDocName: null,
        targetPath: null,
      }).success,
    ).toBe(true);
  });
  test('parses a symlink alias entry', () => {
    expect(
      DocumentListEntrySchema.safeParse({
        docName: 'foo',
        docExt: '.md',
        size: 142,
        modified: '2026-04-30T00:00:00Z',
        isSymlink: true,
        canonicalDocName: 'target',
        targetPath: 'target.md',
      }).success,
    ).toBe(true);
  });
  test('rejects negative size', () => {
    expect(
      DocumentListEntrySchema.safeParse({
        docName: 'foo',
        docExt: '.md',
        size: -1,
        modified: '2026-04-30T00:00:00Z',
        isSymlink: false,
        canonicalDocName: null,
        targetPath: null,
      }).success,
    ).toBe(false);
  });
});

describe('DocumentListSuccessSchema', () => {
  test('parses an empty list', () => {
    expect(DocumentListSuccessSchema.safeParse({ documents: [] }).success).toBe(true);
  });
  test('parses a populated list', () => {
    expect(
      DocumentListSuccessSchema.safeParse({
        documents: [
          {
            docName: 'foo',
            docExt: '.md',
            size: 0,
            modified: '2026-04-30T00:00:00Z',
            isSymlink: false,
            canonicalDocName: null,
            targetPath: null,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('BacklinkEntrySchema', () => {
  test('parses with anchor + snippet present', () => {
    expect(
      BacklinkEntrySchema.safeParse({
        source: 'alpha',
        anchor: 'intro',
        title: 'Alpha',
        snippet: 'Refers to beta.',
      }).success,
    ).toBe(true);
  });
  test('parses with null anchor + snippet', () => {
    expect(
      BacklinkEntrySchema.safeParse({
        source: 'alpha',
        anchor: null,
        title: 'Alpha',
        snippet: null,
      }).success,
    ).toBe(true);
  });
  test('rejects empty source', () => {
    expect(
      BacklinkEntrySchema.safeParse({
        source: '',
        anchor: null,
        title: 'Alpha',
        snippet: null,
      }).success,
    ).toBe(false);
  });
});

describe('BacklinksSuccessSchema', () => {
  test('parses success body with empty backlinks', () => {
    expect(BacklinksSuccessSchema.safeParse({ docName: 'beta', backlinks: [] }).success).toBe(true);
  });
});

describe('BacklinkCountsSuccessSchema', () => {
  test('parses an empty count map', () => {
    expect(BacklinkCountsSuccessSchema.safeParse({ counts: {} }).success).toBe(true);
  });
  test('parses populated counts', () => {
    expect(
      BacklinkCountsSuccessSchema.safeParse({ counts: { alpha: 3, beta: 0, gamma: 12 } }).success,
    ).toBe(true);
  });
  test('rejects negative counts', () => {
    expect(BacklinkCountsSuccessSchema.safeParse({ counts: { alpha: -1 } }).success).toBe(false);
  });
});

describe('ForwardLinkEntrySchema', () => {
  test('parses doc kind', () => {
    expect(
      ForwardLinkDocEntrySchema.safeParse({
        kind: 'doc',
        docName: 'beta',
        anchor: null,
        title: 'Beta',
        snippet: null,
      }).success,
    ).toBe(true);
  });
  test('parses external kind', () => {
    expect(
      ForwardLinkExternalEntrySchema.safeParse({
        kind: 'external',
        url: 'https://example.com/x',
        title: 'X',
        snippet: null,
      }).success,
    ).toBe(true);
  });
  test('discriminated union routes by kind', () => {
    const docResult = ForwardLinkEntrySchema.safeParse({
      kind: 'doc',
      docName: 'beta',
      anchor: 'h1',
      title: 'Beta',
      snippet: 'snippet',
    });
    expect(docResult.success).toBe(true);
    if (docResult.success) {
      expect(docResult.data.kind).toBe('doc');
    }

    const extResult = ForwardLinkEntrySchema.safeParse({
      kind: 'external',
      url: 'https://example.com',
      title: 'Example',
      snippet: null,
    });
    expect(extResult.success).toBe(true);
    if (extResult.success) {
      expect(extResult.data.kind).toBe('external');
    }
  });
  test('rejects unknown kind', () => {
    expect(ForwardLinkEntrySchema.safeParse({ kind: 'mystery' }).success).toBe(false);
  });
});

describe('ForwardLinksSuccessSchema', () => {
  test('parses success body', () => {
    expect(
      ForwardLinksSuccessSchema.safeParse({
        docName: 'alpha',
        forwardLinks: [
          { kind: 'doc', docName: 'beta', anchor: null, title: 'Beta', snippet: null },
          {
            kind: 'external',
            url: 'https://example.com',
            title: 'Example',
            snippet: null,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('LinkGraphNodeSchema', () => {
  test('parses doc node with metadata', () => {
    expect(
      LinkGraphDocNodeSchema.safeParse({
        id: 'doc:foo',
        kind: 'doc',
        docName: 'foo',
        anchor: null,
        label: 'Foo',
        cluster: 'retrieval',
        category: 'concept',
        tags: ['search', 'vectors'],
      }).success,
    ).toBe(true);
  });
  test('parses doc node with all metadata null', () => {
    expect(
      LinkGraphDocNodeSchema.safeParse({
        id: 'doc:foo',
        kind: 'doc',
        docName: 'foo',
        anchor: null,
        label: 'Foo',
        cluster: null,
        category: null,
        tags: null,
      }).success,
    ).toBe(true);
  });
  test('parses external node', () => {
    expect(
      LinkGraphExternalNodeSchema.safeParse({
        id: 'ext:https://example.com',
        kind: 'external',
        url: 'https://example.com',
        label: 'Example',
      }).success,
    ).toBe(true);
  });
  test('discriminated union rejects unknown kind', () => {
    expect(LinkGraphNodeSchema.safeParse({ id: 'a', kind: 'mystery' }).success).toBe(false);
  });
});

describe('LinkGraphEdgeSchema', () => {
  test('parses an edge', () => {
    expect(LinkGraphEdgeSchema.safeParse({ source: 'doc:a', target: 'doc:b' }).success).toBe(true);
  });
  test('rejects empty source', () => {
    expect(LinkGraphEdgeSchema.safeParse({ source: '', target: 'doc:b' }).success).toBe(false);
  });
});

describe('LinkGraphSuccessSchema', () => {
  test('parses an empty graph', () => {
    expect(LinkGraphSuccessSchema.safeParse({ nodes: [], links: [] }).success).toBe(true);
  });
  test('parses a populated graph', () => {
    expect(
      LinkGraphSuccessSchema.safeParse({
        nodes: [
          {
            id: 'doc:a',
            kind: 'doc',
            docName: 'a',
            anchor: null,
            label: 'A',
            cluster: null,
            category: null,
            tags: null,
          },
          {
            id: 'ext:https://example.com',
            kind: 'external',
            url: 'https://example.com',
            label: 'Example',
          },
        ],
        links: [{ source: 'doc:a', target: 'ext:https://example.com' }],
      }).success,
    ).toBe(true);
  });
});

describe('OrphanEntrySchema', () => {
  test('accepts a populated entry', () => {
    expect(OrphanEntrySchema.safeParse({ docName: 'lonely', title: 'Lonely Page' }).success).toBe(
      true,
    );
  });
  test('accepts empty title (handler falls back to docName for missing H1)', () => {
    expect(OrphanEntrySchema.safeParse({ docName: 'lonely', title: '' }).success).toBe(true);
  });
  test('rejects empty docName', () => {
    expect(OrphanEntrySchema.safeParse({ docName: '', title: 'X' }).success).toBe(false);
  });
});

describe('OrphansSuccessSchema', () => {
  test('parses an empty list', () => {
    expect(OrphansSuccessSchema.safeParse({ orphans: [] }).success).toBe(true);
  });
  test('parses a populated list', () => {
    expect(
      OrphansSuccessSchema.safeParse({
        orphans: [
          { docName: 'a', title: 'A' },
          { docName: 'b', title: 'B' },
        ],
      }).success,
    ).toBe(true);
  });
  test('preserves unknown fields per .loose() forward-compat', () => {
    expect(
      OrphansSuccessSchema.safeParse({ orphans: [], extension: { future: true } }).success,
    ).toBe(true);
  });
});

describe('HubEntrySchema', () => {
  test('accepts a populated entry', () => {
    expect(HubEntrySchema.safeParse({ docName: 'index', title: 'Index', count: 42 }).success).toBe(
      true,
    );
  });
  test('accepts count=0 (technically possible if a hub registers but loses backlinks)', () => {
    expect(HubEntrySchema.safeParse({ docName: 'x', title: 'X', count: 0 }).success).toBe(true);
  });
  test('rejects negative count', () => {
    expect(HubEntrySchema.safeParse({ docName: 'x', title: 'X', count: -1 }).success).toBe(false);
  });
  test('rejects non-integer count', () => {
    expect(HubEntrySchema.safeParse({ docName: 'x', title: 'X', count: 1.5 }).success).toBe(false);
  });
});

describe('HubsSuccessSchema', () => {
  test('parses an empty list', () => {
    expect(HubsSuccessSchema.safeParse({ hubs: [] }).success).toBe(true);
  });
  test('parses a populated list', () => {
    expect(
      HubsSuccessSchema.safeParse({
        hubs: [{ docName: 'index', title: 'Index', count: 5 }],
      }).success,
    ).toBe(true);
  });
});

describe('DeadLinkSourceSchema', () => {
  test('accepts a populated source with snippet', () => {
    expect(
      DeadLinkSourceSchema.safeParse({
        source: 'alpha',
        title: 'Alpha',
        snippet: 'See missing-target.',
      }).success,
    ).toBe(true);
  });
  test('accepts null snippet (empty doc / no surrounding text)', () => {
    expect(DeadLinkSourceSchema.safeParse({ source: 'a', title: 'A', snippet: null }).success).toBe(
      true,
    );
  });
});

describe('DeadLinkEntrySchema', () => {
  test('accepts populated sources array', () => {
    expect(
      DeadLinkEntrySchema.safeParse({
        target: 'missing',
        sources: [{ source: 'alpha', title: 'Alpha', snippet: 'See missing.' }],
      }).success,
    ).toBe(true);
  });
  test('accepts empty sources array', () => {
    expect(DeadLinkEntrySchema.safeParse({ target: 'missing', sources: [] }).success).toBe(true);
  });
  test('rejects empty target', () => {
    expect(DeadLinkEntrySchema.safeParse({ target: '', sources: [] }).success).toBe(false);
  });
});

describe('DeadLinksSuccessSchema', () => {
  test('parses an empty list', () => {
    expect(DeadLinksSuccessSchema.safeParse({ deadLinks: [] }).success).toBe(true);
  });
  test('parses a populated list', () => {
    expect(
      DeadLinksSuccessSchema.safeParse({
        deadLinks: [
          {
            target: 'missing',
            sources: [{ source: 'alpha', title: 'Alpha', snippet: 'See missing.' }],
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('SuggestLinksTargetSchema', () => {
  test('accepts a populated target', () => {
    expect(
      SuggestLinksTargetSchema.safeParse({
        docName: 'project-alpha',
        title: 'Project Alpha',
        aliases: ['alpha-project', 'PA'],
      }).success,
    ).toBe(true);
  });
  test('accepts empty aliases', () => {
    expect(
      SuggestLinksTargetSchema.safeParse({
        docName: 'project-alpha',
        title: 'Project Alpha',
        aliases: [],
      }).success,
    ).toBe(true);
  });
  test('rejects non-array aliases', () => {
    expect(
      SuggestLinksTargetSchema.safeParse({
        docName: 'p',
        title: 'P',
        aliases: 'alpha',
      }).success,
    ).toBe(false);
  });
});

describe('SuggestLinksMentionSchema', () => {
  test('accepts a populated mention', () => {
    expect(
      SuggestLinksMentionSchema.safeParse({
        source: 'notes',
        excerpt: 'Project Alpha is shipping next week.',
        offset: 0,
      }).success,
    ).toBe(true);
  });
  test('accepts empty excerpt', () => {
    expect(
      SuggestLinksMentionSchema.safeParse({ source: 'notes', excerpt: '', offset: 0 }).success,
    ).toBe(true);
  });
  test('rejects negative offset', () => {
    expect(
      SuggestLinksMentionSchema.safeParse({ source: 'notes', excerpt: 'x', offset: -1 }).success,
    ).toBe(false);
  });
});

describe('SuggestLinksSuccessSchema', () => {
  test('parses an empty mentions array', () => {
    expect(
      SuggestLinksSuccessSchema.safeParse({
        target: { docName: 'p', title: 'P', aliases: [] },
        mentions: [],
        truncated: false,
      }).success,
    ).toBe(true);
  });
  test('parses a populated response with truncation', () => {
    expect(
      SuggestLinksSuccessSchema.safeParse({
        target: { docName: 'p', title: 'P', aliases: ['p-alias'] },
        mentions: [{ source: 'notes', excerpt: 'P found here.', offset: 0 }],
        truncated: true,
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cluster F: metrics + agent activity + test handlers (US-011)
// ---------------------------------------------------------------------------

describe('ActivityBurstSchema', () => {
  test('parses a happy-path burst', () => {
    expect(
      ActivityBurstSchema.safeParse({
        stackIndex: 0,
        ts: 1714512345000,
        additions: 12,
        deletions: 3,
      }).success,
    ).toBe(true);
  });
  test('rejects negative stackIndex', () => {
    expect(
      ActivityBurstSchema.safeParse({
        stackIndex: -1,
        ts: 1,
        additions: 0,
        deletions: 0,
      }).success,
    ).toBe(false);
  });
  test('rejects non-integer additions', () => {
    expect(
      ActivityBurstSchema.safeParse({
        stackIndex: 0,
        ts: 1,
        additions: 1.5,
        deletions: 0,
      }).success,
    ).toBe(false);
  });
});

describe('ActivityFileSchema', () => {
  test('parses a populated file entry', () => {
    expect(
      ActivityFileSchema.safeParse({
        docName: 'notes/draft',
        additionsTotal: 50,
        deletionsTotal: 20,
        lastTs: 1714512345000,
        bursts: [{ stackIndex: 0, ts: 1714512000000, additions: 10, deletions: 4 }],
      }).success,
    ).toBe(true);
  });
  test('parses an empty bursts array', () => {
    expect(
      ActivityFileSchema.safeParse({
        docName: 'notes/draft',
        additionsTotal: 0,
        deletionsTotal: 0,
        lastTs: 0,
        bursts: [],
      }).success,
    ).toBe(true);
  });
  test('rejects empty docName', () => {
    expect(
      ActivityFileSchema.safeParse({
        docName: '',
        additionsTotal: 0,
        deletionsTotal: 0,
        lastTs: 0,
        bursts: [],
      }).success,
    ).toBe(false);
  });
});

describe('ActivityAgentHeaderSchema', () => {
  test('parses a populated header', () => {
    expect(
      ActivityAgentHeaderSchema.safeParse({
        displayName: 'Claude',
        color: '#D97757',
        icon: 'claude',
        connectionId: 'agent-claude-1',
      }).success,
    ).toBe(true);
  });
  test('parses a header without optional icon', () => {
    expect(
      ActivityAgentHeaderSchema.safeParse({
        displayName: 'Cursor',
        color: '#1f2937',
        connectionId: 'agent-cursor-1',
      }).success,
    ).toBe(true);
  });
  test('rejects empty displayName', () => {
    expect(
      ActivityAgentHeaderSchema.safeParse({
        displayName: '',
        color: '#000',
        connectionId: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('AgentActivitySuccessSchema', () => {
  test('parses sessionAlive=false zero-state response', () => {
    expect(
      AgentActivitySuccessSchema.safeParse({
        sessionAlive: false,
        agent: null,
        files: [],
      }).success,
    ).toBe(true);
  });
  test('parses a populated response', () => {
    expect(
      AgentActivitySuccessSchema.safeParse({
        sessionAlive: true,
        agent: {
          displayName: 'Claude',
          color: '#D97757',
          connectionId: 'agent-1',
        },
        files: [
          {
            docName: 'a',
            additionsTotal: 10,
            deletionsTotal: 5,
            lastTs: 1,
            bursts: [],
          },
        ],
      }).success,
    ).toBe(true);
  });
  test('rejects body missing files array', () => {
    expect(AgentActivitySuccessSchema.safeParse({ sessionAlive: false, agent: null }).success).toBe(
      false,
    );
  });
});

describe('AgentBurstDiffSuccessSchema', () => {
  test('parses a populated diff response', () => {
    expect(
      AgentBurstDiffSuccessSchema.safeParse({
        diff: '@@ -1 +1 @@\n-old\n+new\n',
        generatedAt: 1714512345000,
      }).success,
    ).toBe(true);
  });
  test('parses an empty diff string', () => {
    expect(
      AgentBurstDiffSuccessSchema.safeParse({
        diff: '',
        generatedAt: 0,
      }).success,
    ).toBe(true);
  });
  test('rejects negative generatedAt', () => {
    expect(
      AgentBurstDiffSuccessSchema.safeParse({
        diff: '',
        generatedAt: -1,
      }).success,
    ).toBe(false);
  });
});

describe('TestResetSuccessSchema', () => {
  test('parses an empty body', () => {
    expect(TestResetSuccessSchema.safeParse({}).success).toBe(true);
  });
  test('parses a body with extra fields (.loose())', () => {
    expect(TestResetSuccessSchema.safeParse({ extraField: 'forward-compat' }).success).toBe(true);
  });
});

describe('TestRescanBacklinksSuccessSchema', () => {
  test('parses an empty body', () => {
    expect(TestRescanBacklinksSuccessSchema.safeParse({}).success).toBe(true);
  });
});

describe('MetricsReconciliationSuccessSchema', () => {
  test('parses a typical metrics snapshot (.loose() permissive)', () => {
    expect(
      MetricsReconciliationSuccessSchema.safeParse({
        reconcileCount: 5,
        conflictCount: 0,
        cc1LastSeq: { 'doc-1': 12 },
      }).success,
    ).toBe(true);
  });
  test('parses an empty object', () => {
    expect(MetricsReconciliationSuccessSchema.safeParse({}).success).toBe(true);
  });
});

describe('MetricsParseHealthSuccessSchema', () => {
  test('parses a typical parse-health snapshot (.loose() permissive)', () => {
    expect(
      MetricsParseHealthSuccessSchema.safeParse({
        parseFallback: { blockLevel: 0, wholeDoc: 0 },
        ypsMismatch: { block: 0, inline: 0 },
      }).success,
    ).toBe(true);
  });
});

describe('AgentPresenceEntrySchema', () => {
  test('parses a writing entry', () => {
    expect(
      AgentPresenceEntrySchema.safeParse({
        displayName: 'Claude',
        icon: 'claude',
        color: '#D97757',
        currentDoc: 'notes/draft',
        mode: 'writing',
        ts: 1714512345000,
      }).success,
    ).toBe(true);
  });
  test('parses an idle entry with null currentDoc', () => {
    expect(
      AgentPresenceEntrySchema.safeParse({
        displayName: 'Claude',
        icon: 'claude',
        color: '#D97757',
        currentDoc: null,
        mode: 'idle',
        ts: 1714512345000,
      }).success,
    ).toBe(true);
  });
  test('rejects unknown mode', () => {
    expect(
      AgentPresenceEntrySchema.safeParse({
        displayName: 'Claude',
        icon: 'claude',
        color: '#D97757',
        currentDoc: null,
        mode: 'editing',
        ts: 1,
      }).success,
    ).toBe(false);
  });
});

describe('MetricsAgentPresenceSuccessSchema', () => {
  test('parses an empty presence map', () => {
    expect(
      MetricsAgentPresenceSuccessSchema.safeParse({
        presence: {},
      }).success,
    ).toBe(true);
  });
  test('parses a populated presence map', () => {
    expect(
      MetricsAgentPresenceSuccessSchema.safeParse({
        presence: {
          'agent-1': {
            displayName: 'Claude',
            icon: 'claude',
            color: '#D97757',
            currentDoc: 'a',
            mode: 'writing',
            ts: 1,
          },
        },
      }).success,
    ).toBe(true);
  });
  test('rejects body missing presence field', () => {
    expect(MetricsAgentPresenceSuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('InstalledAgentsSuccessSchema', () => {
  test('parses a populated boolean record', () => {
    expect(
      InstalledAgentsSuccessSchema.safeParse({
        claude: true,
        codex: false,
        cursor: true,
      }).success,
    ).toBe(true);
  });
  test('parses an empty record', () => {
    expect(InstalledAgentsSuccessSchema.safeParse({}).success).toBe(true);
  });
  test('rejects non-boolean values', () => {
    expect(
      InstalledAgentsSuccessSchema.safeParse({
        claude: 'true',
      }).success,
    ).toBe(false);
  });
});

// Cluster G — LocalOp + auth (US-012) -----------------------------------------

describe('Cluster G URN tokens (US-012)', () => {
  test('auth-failed is a member of ProblemTypeSchema', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:auth-failed').success).toBe(true);
  });
  test('no-project-dir is a member of ProblemTypeSchema', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:no-project-dir').success).toBe(true);
  });
  test('server-open-failed is a member of ProblemTypeSchema', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:server-open-failed').success).toBe(true);
  });
});

describe('LocalOpOpenRequestSchema', () => {
  test('parses a valid dir', () => {
    expect(LocalOpOpenRequestSchema.safeParse({ dir: '~/Projects/notes' }).success).toBe(true);
  });
  test('rejects empty dir', () => {
    expect(LocalOpOpenRequestSchema.safeParse({ dir: '' }).success).toBe(false);
  });
  test('rejects missing dir', () => {
    expect(LocalOpOpenRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('LocalOpOpenSuccessSchema', () => {
  test('parses a valid port', () => {
    expect(LocalOpOpenSuccessSchema.safeParse({ port: 5173 }).success).toBe(true);
  });
  test('rejects negative port', () => {
    expect(LocalOpOpenSuccessSchema.safeParse({ port: -1 }).success).toBe(false);
  });
  test('rejects zero port', () => {
    expect(LocalOpOpenSuccessSchema.safeParse({ port: 0 }).success).toBe(false);
  });
});

describe('LocalOpAuthHostRequestSchema', () => {
  test('parses with host', () => {
    expect(LocalOpAuthHostRequestSchema.safeParse({ host: 'github.com' }).success).toBe(true);
  });
  test('parses without host (optional)', () => {
    expect(LocalOpAuthHostRequestSchema.safeParse({}).success).toBe(true);
  });
  test('rejects empty host', () => {
    expect(LocalOpAuthHostRequestSchema.safeParse({ host: '' }).success).toBe(false);
  });
});

describe('LocalOpAuthPatRequestSchema', () => {
  test('parses pat-only', () => {
    expect(LocalOpAuthPatRequestSchema.safeParse({ pat: 'ghp_abc123' }).success).toBe(true);
  });
  test('parses pat with host', () => {
    expect(
      LocalOpAuthPatRequestSchema.safeParse({ pat: 'ghp_abc123', host: 'github.com' }).success,
    ).toBe(true);
  });
  test('rejects missing pat', () => {
    expect(LocalOpAuthPatRequestSchema.safeParse({ host: 'github.com' }).success).toBe(false);
  });
  test('rejects empty pat', () => {
    expect(LocalOpAuthPatRequestSchema.safeParse({ pat: '' }).success).toBe(false);
  });
});

describe('LocalOpAuthSetIdentityRequestSchema', () => {
  test('parses valid name + email', () => {
    expect(
      LocalOpAuthSetIdentityRequestSchema.safeParse({
        name: 'Alice Tester',
        email: 'alice@example.com',
      }).success,
    ).toBe(true);
  });
  test('rejects whitespace-only name', () => {
    expect(
      LocalOpAuthSetIdentityRequestSchema.safeParse({
        name: '   ',
        email: 'alice@example.com',
      }).success,
    ).toBe(false);
  });
  test('rejects whitespace-only email', () => {
    expect(
      LocalOpAuthSetIdentityRequestSchema.safeParse({
        name: 'Alice',
        email: '   ',
      }).success,
    ).toBe(false);
  });
  test('rejects missing fields', () => {
    expect(LocalOpAuthSetIdentityRequestSchema.safeParse({ name: 'Alice' }).success).toBe(false);
  });
});

describe('LocalOpAuthIdentitySchema', () => {
  test('parses a populated identity', () => {
    expect(
      LocalOpAuthIdentitySchema.safeParse({ name: 'Alice', email: 'alice@example.com' }).success,
    ).toBe(true);
  });
  test('parses null', () => {
    expect(LocalOpAuthIdentitySchema.safeParse(null).success).toBe(true);
  });
  test('rejects empty name', () => {
    expect(LocalOpAuthIdentitySchema.safeParse({ name: '', email: 'x@y.z' }).success).toBe(false);
  });
});

describe('LocalOpAuthIdentitySuccessSchema', () => {
  test('parses a populated identity', () => {
    expect(
      LocalOpAuthIdentitySuccessSchema.safeParse({
        identity: { name: 'Alice', email: 'alice@example.com' },
      }).success,
    ).toBe(true);
  });
  test('parses null identity', () => {
    expect(LocalOpAuthIdentitySuccessSchema.safeParse({ identity: null }).success).toBe(true);
  });
  test('rejects missing identity field', () => {
    expect(LocalOpAuthIdentitySuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('LocalOpAuthStatusSuccessSchema', () => {
  test('parses authenticated:true', () => {
    expect(LocalOpAuthStatusSuccessSchema.safeParse({ authenticated: true }).success).toBe(true);
  });
  test('parses authenticated:false', () => {
    expect(LocalOpAuthStatusSuccessSchema.safeParse({ authenticated: false }).success).toBe(true);
  });
  test('preserves CLI-emitted extras via .loose()', () => {
    expect(
      LocalOpAuthStatusSuccessSchema.safeParse({
        authenticated: true,
        login: 'alice',
        host: 'github.com',
      }).success,
    ).toBe(true);
  });
  test('rejects missing authenticated field', () => {
    expect(LocalOpAuthStatusSuccessSchema.safeParse({ login: 'alice' }).success).toBe(false);
  });
});

describe('LocalOpAuthPatSuccessSchema', () => {
  test('parses CLI complete event with login', () => {
    expect(
      LocalOpAuthPatSuccessSchema.safeParse({
        type: 'complete',
        login: 'alice',
        name: 'Alice',
      }).success,
    ).toBe(true);
  });
  test('parses bare empty object (fallback shape)', () => {
    expect(LocalOpAuthPatSuccessSchema.safeParse({}).success).toBe(true);
  });
});

describe('LocalOpAuthEmptySuccessSchema', () => {
  test('parses empty body', () => {
    expect(LocalOpAuthEmptySuccessSchema.safeParse({}).success).toBe(true);
  });
  test('preserves forward-compat fields via .loose()', () => {
    expect(
      LocalOpAuthEmptySuccessSchema.safeParse({ signedOutAt: '2026-04-30T10:00:00.000Z' }).success,
    ).toBe(true);
  });
});

// ─── Cluster H: sync + seed handlers (US-013) ───────────────────────────────

describe('Cluster H URN tokens (US-013)', () => {
  test('parses urn:ok:error:sync-not-active', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:sync-not-active').success).toBe(true);
  });
  test('parses urn:ok:error:project-repo-not-configured', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:project-repo-not-configured').success).toBe(
      true,
    );
  });
  test('parses urn:ok:error:seed-prerequisite-missing', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:seed-prerequisite-missing').success).toBe(
      true,
    );
  });
  test('parses urn:ok:error:seed-invalid-root', () => {
    expect(ProblemTypeSchema.safeParse('urn:ok:error:seed-invalid-root').success).toBe(true);
  });
});

describe('SyncStateSchema', () => {
  test('accepts every documented state', () => {
    for (const s of [
      'dormant',
      'idle',
      'fetching',
      'pulling',
      'pushing',
      'conflict',
      'offline',
      'auth-error',
      'disabled',
    ]) {
      expect(SyncStateSchema.safeParse(s).success).toBe(true);
    }
  });
  test('rejects unknown state', () => {
    expect(SyncStateSchema.safeParse('exploding').success).toBe(false);
  });
});

describe('SyncStatusSchema / SyncStatusSuccessSchema', () => {
  const validStatus = {
    state: 'idle' as const,
    lastSyncUtc: null,
    lastFetchUtc: null,
    lastPushedSha: null,
    ahead: 0,
    behind: 0,
    consecutiveFailures: 0,
    conflictCount: 0,
    hasRemote: false,
    syncEnabled: false,
    identityUnresolved: false,
  };
  test('parses minimal status (no error/pausedReason)', () => {
    expect(SyncStatusSchema.safeParse(validStatus).success).toBe(true);
  });
  test('parses status with optional fields populated', () => {
    expect(
      SyncStatusSchema.safeParse({
        ...validStatus,
        lastSyncUtc: '2026-04-30T10:00:00.000Z',
        lastFetchUtc: '2026-04-30T09:50:00.000Z',
        lastPushedSha: 'abc1234',
        ahead: 3,
        behind: 1,
        error: 'Network unavailable',
        pausedReason: 'manual',
      }).success,
    ).toBe(true);
  });
  test('rejects negative ahead/behind/conflictCount', () => {
    expect(SyncStatusSchema.safeParse({ ...validStatus, ahead: -1 }).success).toBe(false);
    expect(SyncStatusSchema.safeParse({ ...validStatus, behind: -1 }).success).toBe(false);
    expect(SyncStatusSchema.safeParse({ ...validStatus, conflictCount: -1 }).success).toBe(false);
  });
  test('rejects missing required field', () => {
    const { state: _state, ...incomplete } = validStatus;
    expect(SyncStatusSchema.safeParse(incomplete).success).toBe(false);
  });
  test('SyncStatusSuccessSchema is the same shape (Wire = Status)', () => {
    expect(SyncStatusSuccessSchema.safeParse(validStatus).success).toBe(true);
  });
});

describe('SyncTriggerRequestSchema', () => {
  test('parses empty body (op defaults server-side)', () => {
    expect(SyncTriggerRequestSchema.safeParse({}).success).toBe(true);
  });
  test('parses op:sync', () => {
    expect(SyncTriggerRequestSchema.safeParse({ op: 'sync' }).success).toBe(true);
  });
  test('parses op:push and op:pull', () => {
    expect(SyncTriggerRequestSchema.safeParse({ op: 'push' }).success).toBe(true);
    expect(SyncTriggerRequestSchema.safeParse({ op: 'pull' }).success).toBe(true);
  });
  test('rejects unknown op (stricter than legacy silent fallthrough)', () => {
    expect(SyncTriggerRequestSchema.safeParse({ op: 'gibberish' }).success).toBe(false);
  });
});

describe('SyncTriggerSuccessSchema', () => {
  test('parses op echo', () => {
    expect(SyncTriggerSuccessSchema.safeParse({ op: 'sync' }).success).toBe(true);
  });
  test('rejects missing op', () => {
    expect(SyncTriggerSuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('SyncSetEnabledRequestSchema', () => {
  test('parses {enabled: true}', () => {
    expect(SyncSetEnabledRequestSchema.safeParse({ enabled: true }).success).toBe(true);
  });
  test('parses {enabled: false}', () => {
    expect(SyncSetEnabledRequestSchema.safeParse({ enabled: false }).success).toBe(true);
  });
  test('rejects non-boolean', () => {
    expect(SyncSetEnabledRequestSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
    expect(SyncSetEnabledRequestSchema.safeParse({ enabled: 1 }).success).toBe(false);
  });
  test('rejects missing field', () => {
    expect(SyncSetEnabledRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('SyncSetEnabledSuccessSchema', () => {
  const validStatus = {
    state: 'idle' as const,
    lastSyncUtc: null,
    lastFetchUtc: null,
    lastPushedSha: null,
    ahead: 0,
    behind: 0,
    consecutiveFailures: 0,
    conflictCount: 0,
    hasRemote: false,
    syncEnabled: true,
    identityUnresolved: false,
  };
  test('parses {status}', () => {
    expect(SyncSetEnabledSuccessSchema.safeParse({ status: validStatus }).success).toBe(true);
  });
  test('rejects missing status', () => {
    expect(SyncSetEnabledSuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('ConflictEntrySchema', () => {
  test('parses minimal entry', () => {
    expect(
      ConflictEntrySchema.safeParse({
        file: 'docs/foo.md',
        detectedAt: '2026-04-30T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });
  test('parses entry with optional SHAs', () => {
    expect(
      ConflictEntrySchema.safeParse({
        file: 'docs/foo.md',
        detectedAt: '2026-04-30T10:00:00.000Z',
        oursSha: 'abc1234',
        theirsSha: 'def5678',
        baseSha: '0000000',
      }).success,
    ).toBe(true);
  });
  test('rejects empty file', () => {
    expect(
      ConflictEntrySchema.safeParse({ file: '', detectedAt: '2026-04-30T10:00:00.000Z' }).success,
    ).toBe(false);
  });
});

describe('SyncConflictsSuccessSchema', () => {
  test('parses empty conflicts list', () => {
    expect(SyncConflictsSuccessSchema.safeParse({ conflicts: [] }).success).toBe(true);
  });
  test('parses populated list', () => {
    expect(
      SyncConflictsSuccessSchema.safeParse({
        conflicts: [{ file: 'a.md', detectedAt: '2026-04-30T10:00:00.000Z' }],
      }).success,
    ).toBe(true);
  });
  test('rejects missing conflicts field', () => {
    expect(SyncConflictsSuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('SyncResolveConflictRequestSchema', () => {
  test('parses {file, strategy:mine}', () => {
    expect(
      SyncResolveConflictRequestSchema.safeParse({ file: 'a.md', strategy: 'mine' }).success,
    ).toBe(true);
  });
  test('parses {file, strategy:content, content}', () => {
    expect(
      SyncResolveConflictRequestSchema.safeParse({
        file: 'a.md',
        strategy: 'content',
        content: 'merged body',
      }).success,
    ).toBe(true);
  });
  test('rejects missing file', () => {
    expect(SyncResolveConflictRequestSchema.safeParse({ strategy: 'mine' }).success).toBe(false);
  });
  test('rejects empty file', () => {
    expect(SyncResolveConflictRequestSchema.safeParse({ file: '', strategy: 'mine' }).success).toBe(
      false,
    );
  });
  test('rejects unknown strategy', () => {
    expect(
      SyncResolveConflictRequestSchema.safeParse({ file: 'a.md', strategy: 'magic' }).success,
    ).toBe(false);
  });
});

describe('SyncConflictContentSuccessSchema', () => {
  test('parses populated stages', () => {
    expect(
      SyncConflictContentSuccessSchema.safeParse({
        file: 'a.md',
        base: 'before',
        ours: 'mine',
        theirs: 'theirs',
      }).success,
    ).toBe(true);
  });
  test('parses empty stages (delete/edit conflict)', () => {
    expect(
      SyncConflictContentSuccessSchema.safeParse({ file: 'a.md', base: '', ours: '', theirs: '' })
        .success,
    ).toBe(true);
  });
  test('rejects missing file', () => {
    expect(
      SyncConflictContentSuccessSchema.safeParse({ base: '', ours: '', theirs: '' }).success,
    ).toBe(false);
  });
});

describe('SyncResolveConflictSuccessSchema and SyncAbortMergeSuccessSchema', () => {
  test('both parse empty body', () => {
    expect(SyncResolveConflictSuccessSchema.safeParse({}).success).toBe(true);
    expect(SyncAbortMergeSuccessSchema.safeParse({}).success).toBe(true);
  });
});

describe('SeedPlanSuccessSchema', () => {
  test('parses {plan: ...} (plan is z.unknown — opaque)', () => {
    expect(
      SeedPlanSuccessSchema.safeParse({
        plan: { created: [], skipped: [], configEdits: [], warnings: [] },
      }).success,
    ).toBe(true);
  });
  test('parses {plan: anything}', () => {
    expect(SeedPlanSuccessSchema.safeParse({ plan: null }).success).toBe(true);
    expect(SeedPlanSuccessSchema.safeParse({ plan: 'string' }).success).toBe(true);
  });
  test('rejects missing plan field', () => {
    expect(SeedPlanSuccessSchema.safeParse({}).success).toBe(false);
  });
});

describe('SeedApplyRequestSchema', () => {
  test('parses {plan: ...}', () => {
    expect(
      SeedApplyRequestSchema.safeParse({
        plan: { created: [], skipped: [], configEdits: [], warnings: [] },
      }).success,
    ).toBe(true);
  });
  test('rejects missing plan field', () => {
    expect(SeedApplyRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('SeedApplySuccessSchema', () => {
  test('parses {result: ...}', () => {
    expect(
      SeedApplySuccessSchema.safeParse({
        result: { applied: 3, errors: [], durationMs: 42 },
      }).success,
    ).toBe(true);
  });
  test('rejects missing result field', () => {
    expect(SeedApplySuccessSchema.safeParse({}).success).toBe(false);
  });
});
