import { ProblemDetailsSchema, UploadAssetSuccessSchema } from '@inkeep/open-knowledge-core';
import { HttpResponseParseError } from '../http-client.ts';
import { getCurrentDocName } from './current-doc-name.ts';

interface UploadFileResult {
  url: string;
}

const UPLOAD_ENDPOINT = '/api/upload';

interface UploadFileDeps {
  fetch?: typeof fetch;
  /** Currently-open document name. Defaults to `getCurrentDocName()` from the
   *  module singleton (set by TiptapEditor on mount). */
  docName?: string | null;
}

export async function uploadFile(
  file: File,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: kept on the public signature so PropPanel + PropUploadButton compile unchanged after the per-MIME → unified endpoint flip; the picker's <input accept> already filters at the OS dialog
  accept: readonly string[],
  deps: UploadFileDeps = {},
): Promise<UploadFileResult> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  const docName = deps.docName !== undefined ? deps.docName : getCurrentDocName();
  if (!docName) {
    throw new Error('No document is open');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('parentDocName', docName);

  let res: Response;
  try {
    res = await fetchImpl(UPLOAD_ENDPOINT, { method: 'POST', body: formData });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`Upload failed: ${message}`);
  }

  let rawBody: unknown;
  try {
    rawBody = await res.json();
  } catch (parseError) {
    throw new HttpResponseParseError('Upload response is not JSON.', {
      cause: parseError,
      status: res.status,
    });
  }

  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(rawBody);
    if (!problem.success) {
      throw new HttpResponseParseError('Upload error response did not match ProblemDetails.', {
        cause: problem.error,
        status: res.status,
      });
    }
    throw new Error(problem.data.title);
  }

  const success = UploadAssetSuccessSchema.safeParse(rawBody);
  if (!success.success) {
    throw new HttpResponseParseError('Upload success response did not match UploadAssetSuccess.', {
      cause: success.error,
      status: res.status,
    });
  }
  const resolved = success.data.path ?? success.data.src;
  const url = resolved.startsWith('/') ? resolved : `/${resolved}`;
  return { url };
}
