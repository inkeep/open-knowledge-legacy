import { describe, expect, test } from 'bun:test';
import { PrincipalResponseSchema } from './api';

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
