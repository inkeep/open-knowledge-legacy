/**
 * Defense-in-depth coverage for `errorResponse(...)`'s pass-1 hardening
 * (review-cloud iter 1, commit 573aec3b). Both branches guard ~286 call
 * sites and rarely fire; without unit coverage, silent regression would
 * re-expose the original crash risk that motivated the fix.
 */

import { describe, expect, test } from 'bun:test';
import type { ServerResponse } from 'node:http';
import { errorResponse } from './error-response.ts';

/**
 * Minimal `ServerResponse` test double. Tracks `writeHead`/`end` calls and
 * exposes a `writeHeadCalls` / `endBody` surface for assertions. Avoids real
 * HTTP machinery (no socket, no Node version coupling).
 */
function makeMockRes(opts: { headersSent?: boolean } = {}) {
  const writeHeadCalls: Array<{ status: number; headers: Record<string, string> }> = [];
  const endCalls: string[] = [];
  const res = {
    headersSent: opts.headersSent ?? false,
    writeHead(status: number, headers: Record<string, string>) {
      writeHeadCalls.push({ status, headers });
      return res;
    },
    end(body: string) {
      endCalls.push(body);
      return res;
    },
  };
  return { res: res as unknown as ServerResponse, writeHeadCalls, endCalls };
}

describe('errorResponse — defense-in-depth branches', () => {
  test('headersSent: true → writeHead never called (suppressed double-write)', () => {
    const { res, writeHeadCalls, endCalls } = makeMockRes({ headersSent: true });
    errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Anything.', {
      handler: 'test',
    });
    expect(writeHeadCalls.length).toBe(0);
    expect(endCalls.length).toBe(0);
  });

  test('empty title (min(1) violation) → emits fallback urn:ok:error:internal-server-error', () => {
    const { res, writeHeadCalls, endCalls } = makeMockRes();
    // Cast around the public API: `errorResponse` types `title` as `string`,
    // but a runtime caller could still pass `''` (e.g., constructed from a
    // user-supplied field). The schema's `min(1)` would reject this, and
    // pre-pass-1 the throwing `.parse()` would crash. The fallback must emit.
    errorResponse(res, 500, 'urn:ok:error:internal-server-error', '', {
      handler: 'test',
    });
    expect(writeHeadCalls.length).toBe(1);
    expect(writeHeadCalls[0].status).toBe(500);
    expect(writeHeadCalls[0].headers['Content-Type']).toBe('application/problem+json');
    expect(endCalls.length).toBe(1);
    const body = JSON.parse(endCalls[0]);
    expect(body.type).toBe('urn:ok:error:internal-server-error');
    expect(body.title).toBe('Internal server error.');
    expect(body.status).toBe(500);
    expect(typeof body.instance).toBe('string');
  });

  test('happy path: well-formed call writes single problem+json response', () => {
    const { res, writeHeadCalls, endCalls } = makeMockRes();
    errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Bad input.', {
      handler: 'test',
      detail: 'Field x is required.',
    });
    expect(writeHeadCalls.length).toBe(1);
    expect(writeHeadCalls[0].status).toBe(400);
    const body = JSON.parse(endCalls[0]);
    expect(body.type).toBe('urn:ok:error:invalid-request');
    expect(body.title).toBe('Bad input.');
    expect(body.detail).toBe('Field x is required.');
    expect(body.status).toBe(400);
  });
});
