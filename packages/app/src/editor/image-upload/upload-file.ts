import { getCurrentDocName } from './current-doc-name.ts';

interface UploadFileResult {
  url: string;
}

const UPLOAD_ENDPOINT = '/api/upload';

interface UploadFileDeps {
  fetch?: typeof fetch;
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

  if (!res.ok) {
    let errorMessage = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {}
    throw new Error(errorMessage);
  }

  let url: string;
  try {
    const body = (await res.json()) as { src?: string; path?: string };
    const resolved = body.path ?? body.src;
    if (typeof resolved !== 'string') {
      throw new Error('Server response missing "path"/"src" field');
    }
    url = resolved.startsWith('/') ? resolved : `/${resolved}`;
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Upload response parse error: ${message}`);
  }

  return { url };
}
