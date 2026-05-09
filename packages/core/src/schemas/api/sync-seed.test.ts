import { describe, expect, test } from 'bun:test';
import {
  ConflictEntrySchema,
  InstallSkillSuccessSchema,
  ProblemTypeSchema,
  SeedApplyRequestSchema,
  SeedApplySuccessSchema,
  SeedPlanSuccessSchema,
  SyncAbortMergeSuccessSchema,
  SyncConflictContentSuccessSchema,
  SyncConflictsSuccessSchema,
  SyncResolveConflictRequestSchema,
  SyncResolveConflictSuccessSchema,
  SyncStateSchema,
  SyncStatusSchema,
  SyncTriggerRequestSchema,
  SyncTriggerSuccessSchema,
} from './index.ts';

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

describe('SyncStatusSchema', () => {
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

describe('InstallSkillSuccessSchema (discriminated union)', () => {
  test('parses installed variant — all artifact fields required', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'installed',
        outputPath: '/tmp/skill.zip',
        size: 1024,
        sha256: 'a'.repeat(64),
        skillVersion: '1.0.0',
      }).success,
    ).toBe(true);
  });
  test('parses built variant with optional handoffError absent', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'built',
        outputPath: '/tmp/skill.zip',
        size: 1024,
        sha256: 'a'.repeat(64),
        skillVersion: '1.0.0',
      }).success,
    ).toBe(true);
  });
  test('parses built variant with handoffError present', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'built',
        outputPath: '/tmp/skill.zip',
        size: 1024,
        sha256: 'a'.repeat(64),
        skillVersion: '1.0.0',
        handoffError: { reason: 'unsupported-platform', message: 'linux not supported' },
      }).success,
    ).toBe(true);
  });
  test('parses failed variant — buildError required', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'failed',
        buildError: 'esbuild exit 1',
      }).success,
    ).toBe(true);
  });
  test('parses skip-current with skillVersion + recordedAt', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'skip-current',
        skillVersion: '1.0.0',
        recordedAt: '2026-05-07T12:00:00Z',
      }).success,
    ).toBe(true);
  });
  test('parses skip-current with skillVersion only (recordedAt optional)', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'skip-current',
        skillVersion: '1.0.0',
      }).success,
    ).toBe(true);
  });
  test('rejects skip-current without required skillVersion', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'skip-current',
        recordedAt: '2026-05-07T12:00:00Z',
      }).success,
    ).toBe(false);
  });
  test('accepts forward-compat extra fields per .loose() variants', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'failed',
        buildError: 'x',
        futureField: 42,
      }).success,
    ).toBe(true);
  });
  test('rejects unknown status discriminant', () => {
    expect(
      InstallSkillSuccessSchema.safeParse({
        status: 'unknown-status',
        skillVersion: '1.0.0',
      }).success,
    ).toBe(false);
  });
});
