/**
 * Module-level singleton for the currently-open document name. TiptapEditor
 * sets this on mount; upload helpers (uploadAndInsert, uploadFile) read it to
 * derive the multipart `parentDocName` field. Singleton is fine because the
 * editor surface is single-instance — only one document is mounted at a time.
 *
 * Extracted from `image-upload/index.ts` so `upload-file.ts` can read it
 * without creating a cycle (index.ts imports upload-file.ts via the refactored
 * `uploadAndInsert`).
 */

let currentDocName: string | null = null;

export function setCurrentDocName(docName: string | null): void {
  currentDocName = docName;
}

export function getCurrentDocName(): string | null {
  return currentDocName;
}
