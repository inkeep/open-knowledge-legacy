import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import {
  type ProblemDetails,
  ProblemDetailsSchema,
  type ProblemType,
} from '@inkeep/open-knowledge-core';
import type { HttpErrorStatus } from '@inkeep/open-knowledge-server';

export function emitProblem(
  res: ServerResponse,
  status: HttpErrorStatus,
  type: ProblemType,
  title: string,
  detail?: string,
): void {
  const instance = `urn:uuid:${randomUUID()}`;
  if (res.headersSent || res.writableEnded || res.destroyed) {
    console.error('[ok ui] emitProblem called after headers sent — suppressed', {
      type,
      status,
      instance,
    });
    return;
  }
  const body: ProblemDetails = {
    type,
    title,
    status,
    instance,
    ...(detail !== undefined ? { detail } : {}),
  };
  const validated = ProblemDetailsSchema.safeParse(body);
  if (!validated.success) {
    console.error('[ok ui] emitProblem produced an invalid ProblemDetails body:', {
      issues: validated.error.issues,
      originalStatus: status,
      body,
    });
    const fallbackStatus = 500 as const;
    res.writeHead(fallbackStatus, {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        type: 'urn:ok:error:internal-server-error' satisfies ProblemType,
        title: 'Internal server error.',
        status: fallbackStatus,
        instance,
      }),
    );
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/problem+json',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}
