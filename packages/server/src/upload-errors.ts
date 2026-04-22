/**
 * Typed upload-write errors.
 *
 * Extracted from api-extension.ts into its own module so upload-streaming.ts
 * and api-extension.ts can both import without creating a cycle. The union
 * is the stable error-code contract the HTTP 507/500/400 dispatch at the
 * handler boundary consumes.
 *
 * See reports/streaming-upload-refactor/REPORT.md §D6 for the full
 * classification table (ENOSPC → storage-full, EROFS/EACCES → storage-
 * readonly, busboy error → malformed-upload, etc.).
 */

export type UploadWriteReason =
  | 'collision-exhaustion'
  | 'storage-full'
  | 'storage-readonly'
  | 'storage-error'
  | 'malformed-upload';

export class UploadWriteError extends Error {
  readonly reason: UploadWriteReason;
  readonly cause?: unknown;

  constructor(reason: UploadWriteReason, cause?: unknown) {
    super(`UploadWriteError: ${reason}`);
    this.reason = reason;
    this.cause = cause;
  }
}
