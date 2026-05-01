/**
 * Defense-in-depth coverage for `errorResponse(...)`'s pass-1 hardening
 * (review-cloud iter 1, commit 573aec3b). Both branches guard ~286 call
 * sites and rarely fire; without unit coverage, silent regression would
 * re-expose the original crash risk that motivated the fix.
 */

import { describe, expect, test } from 'bun:test';
import type { ServerResponse } from 'node:http';
import {
  createStreamingErrorWriter,
  errorResponse,
  streamingProblemEvent,
} from './error-response.ts';

/**
 * Minimal `ServerResponse` test double. Tracks `writeHead`/`end`/`write` calls
 * and exposes a `writeHeadCalls` / `endCalls` / `writeCalls` surface for
 * assertions. Avoids real HTTP machinery (no socket, no Node version coupling).
 */
function makeMockRes(opts: { headersSent?: boolean; writableEnded?: boolean } = {}) {
  const writeHeadCalls: Array<{ status: number; headers: Record<string, string> }> = [];
  const endCalls: string[] = [];
  const writeCalls: string[] = [];
  const res = {
    headersSent: opts.headersSent ?? false,
    writableEnded: opts.writableEnded ?? false,
    writeHead(status: number, headers: Record<string, string>) {
      writeHeadCalls.push({ status, headers });
      return res;
    },
    end(body: string) {
      endCalls.push(body);
      return res;
    },
    write(chunk: string) {
      writeCalls.push(chunk);
      return true;
    },
  };
  return { res: res as unknown as ServerResponse, writeHeadCalls, endCalls, writeCalls };
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

describe('streamingProblemEvent — defense-in-depth fallback', () => {
  test('empty title (min(1) violation) → returns fallback event', () => {
    // Mirrors the errorResponse fallback test: a runtime caller could still
    // pass `''` and the throwing `.parse()` (pre pass-2) would crash mid-
    // stream. The pass-2 safeParse fallback must emit a typed event.
    const event = streamingProblemEvent(500, 'urn:ok:error:internal-server-error', '', {
      handler: 'test',
    });
    expect(event.type).toBe('error');
    expect(event.problem.type).toBe('urn:ok:error:internal-server-error');
    expect(event.problem.title).toBe('Internal server error.');
    expect(event.problem.status).toBe(500);
    expect(typeof event.problem.instance).toBe('string');
  });

  test('happy path: well-formed call returns the typed event', () => {
    const event = streamingProblemEvent(503, 'urn:ok:error:sync-not-active', 'Sync engine off.', {
      handler: 'test',
      detail: 'Sync engine is not active in this environment.',
    });
    expect(event.type).toBe('error');
    expect(event.problem.type).toBe('urn:ok:error:sync-not-active');
    expect(event.problem.title).toBe('Sync engine off.');
    expect(event.problem.detail).toBe('Sync engine is not active in this environment.');
    expect(event.problem.status).toBe(503);
  });
});

describe('createStreamingErrorWriter — writableEnded guard', () => {
  test('writableEnded: true → write never called (suppressed mid-stream double-emit)', () => {
    const { res, writeCalls } = makeMockRes({ writableEnded: true });
    const writer = createStreamingErrorWriter(res, 'test');
    writer(500, 'urn:ok:error:internal-server-error', 'Whatever.');
    expect(writeCalls.length).toBe(0);
  });

  test('writableEnded: false → emits one NDJSON line with typed event', () => {
    const { res, writeCalls } = makeMockRes();
    const writer = createStreamingErrorWriter(res, 'test');
    writer(500, 'urn:ok:error:internal-server-error', 'Real error.');
    expect(writeCalls.length).toBe(1);
    expect(writeCalls[0].endsWith('\n')).toBe(true);
    const event = JSON.parse(writeCalls[0].trimEnd());
    expect(event.type).toBe('error');
    expect(event.problem.type).toBe('urn:ok:error:internal-server-error');
    expect(event.problem.title).toBe('Real error.');
  });
});
