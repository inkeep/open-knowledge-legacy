/**
 * Generalized media-upload helper. Routes a File to the appropriate server
 * endpoint by MIME-type prefix (image/, video/, audio/) and returns the
 * resolved relative URL on success.
 *
 * Per D4/D5 LOCKED in `specs/2026-04-28-cb-v2-prop-file-upload/SPEC.md`: the
 * `accept` argument is a UX hint only — this helper does NOT re-validate
 * against it. The server's per-endpoint allowlist is the security boundary
 * (NFR-1). The hint is passed through for inclusion in the
 * unsupported-prefix error message so callers (e.g., toasts) get useful
 * context when a user picks a file outside the picker's `accept` set via the
 * "all files" override.
 */
import { getCurrentDocName } from './current-doc-name.ts';

interface UploadFileResult {
  url: string;
}

const ENDPOINT_BY_MIME_PREFIX: Readonly<Record<string, string>> = {
  'image/': '/api/upload-image',
  'video/': '/api/upload-video',
  'audio/': '/api/upload-audio',
};

function resolveEndpoint(mimeType: string): string | undefined {
  for (const [prefix, endpoint] of Object.entries(ENDPOINT_BY_MIME_PREFIX)) {
    if (mimeType.startsWith(prefix)) return endpoint;
  }
  return undefined;
}

/**
 * Optional dependency injection bag — production callers omit this and the
 * helper resolves both via the global / module-singleton (see defaults). Tests
 * pass mock implementations directly, sidestepping `globalThis.fetch =`
 * mutation patterns that have proven flaky on Linux Bun (CI failure observed
 * on `1f69f274` — the bare-fetch / global-mutation interaction surfaces a
 * "string-rejection" before the first test runs).
 */
interface UploadFileDeps {
  /** Fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Currently-open document name. Defaults to `getCurrentDocName()` from the
   *  module singleton (set by TiptapEditor on mount). */
  docName?: string | null;
}

export async function uploadFile(
  file: File,
  accept: readonly string[],
  deps: UploadFileDeps = {},
): Promise<UploadFileResult> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const endpoint = resolveEndpoint(file.type);
  if (!endpoint) {
    const hint = accept.length > 0 ? accept.join(', ') : 'none';
    throw new Error(
      `Cannot upload file with type "${file.type}" — supported prefixes are image/, video/, audio/ (accept hint: ${hint})`,
    );
  }

  const docName = deps.docName !== undefined ? deps.docName : getCurrentDocName();
  if (!docName) {
    throw new Error('No document is open');
  }
  // Send the bare docName (extension-less per OK's server convention). The
  // server only uses `dirname(parentDocName)` to derive the upload directory,
  // so the extension is irrelevant — appending a hardcoded `.md` would send
  // the wrong literal for `.mdx` docs even though the dirname is the same.

  const formData = new FormData();
  formData.append('file', file);
  formData.append('parentDocName', docName);

  let res: Response;
  try {
    res = await fetchImpl(endpoint, { method: 'POST', body: formData });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`Upload failed: ${message}`);
  }

  if (!res.ok) {
    let errorMessage = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      // server returned non-JSON; keep the status-code default
    }
    throw new Error(errorMessage);
  }

  let src: string;
  try {
    const body = (await res.json()) as { src?: string };
    if (typeof body.src !== 'string') {
      throw new Error('Server response missing "src" field');
    }
    src = body.src;
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Upload response parse error: ${message}`);
  }

  return { url: src };
}
