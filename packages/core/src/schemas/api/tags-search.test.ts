import { describe, expect, test } from 'bun:test';
import { TemplateGetSuccessSchema, TemplatePayloadSchema } from './tags-search.ts';

const validPayload = (scope: string) => ({
  name: 'daily-journal',
  folder: '~/.ok',
  scope,
  path: '~/.ok/templates/daily-journal.md',
  frontmatter: { title: '{{date}}' },
  body: '## Morning\n',
});

describe('TemplatePayloadSchema.scope', () => {
  test.each(['local', 'inherited', 'user'])('accepts scope=%s', (scope) => {
    const result = TemplatePayloadSchema.safeParse(validPayload(scope));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe(scope);
    }
  });

  test('rejects unknown scope value', () => {
    const result = TemplatePayloadSchema.safeParse(validPayload('global'));
    expect(result.success).toBe(false);
  });
});

describe('TemplateGetSuccessSchema', () => {
  test('accepts user-scope payload — pins the GET target=user contract', () => {
    const result = TemplateGetSuccessSchema.safeParse({
      template: validPayload('user'),
    });
    expect(result.success).toBe(true);
  });

  test('frontmatter accepts free-form unknown values', () => {
    const result = TemplateGetSuccessSchema.safeParse({
      template: {
        ...validPayload('user'),
        frontmatter: { title: { '{ date }': null }, tags: ['x'] },
      },
    });
    expect(result.success).toBe(true);
  });
});
