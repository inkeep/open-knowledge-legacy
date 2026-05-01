export type UploadWriteReason =
  | 'collision-exhaustion'
  | 'storage-full'
  | 'storage-readonly'
  | 'storage-error'
  | 'malformed-upload';

export class UploadWriteError extends Error {
  readonly reason: UploadWriteReason;

  constructor(reason: UploadWriteReason, cause?: unknown) {
    super(`UploadWriteError: ${reason}`, { cause });
    this.name = 'UploadWriteError';
    this.reason = reason;
  }
}
