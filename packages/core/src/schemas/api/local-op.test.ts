import { describe, expect, test } from 'bun:test';
import {
  LocalOpAuthEmptySuccessSchema,
  LocalOpAuthHostRequestSchema,
  LocalOpAuthIdentitySchema,
  LocalOpAuthIdentitySuccessSchema,
  LocalOpAuthPatRequestSchema,
  LocalOpAuthPatSuccessSchema,
  LocalOpAuthSetIdentityRequestSchema,
  LocalOpAuthStatusSuccessSchema,
  LocalOpOpenRequestSchema,
  LocalOpOpenSuccessSchema,
  ProblemTypeSchema,
} from './index.ts';

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
