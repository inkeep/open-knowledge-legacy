import { describe, expect, test } from 'bun:test';
import { isAllowedApiOrigin } from './api-origin.ts';

describe('API origin guards', () => {
  test('allows only local browser origins and opaque Electron origins', () => {
    expect(isAllowedApiOrigin('null')).toBe(true);
    expect(isAllowedApiOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedApiOrigin('https://127.0.0.1:3000')).toBe(true);
    expect(isAllowedApiOrigin('http://[::1]:3000')).toBe(true);

    expect(isAllowedApiOrigin('https://example.com')).toBe(false);
    expect(isAllowedApiOrigin('not a url')).toBe(false);
  });
});
