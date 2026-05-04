type FolderFrontmatterPatch = Record<string, unknown>;

interface TemplateFrontmatterFields {
  title?: string;
  description?: string;
  tags?: string[];
}

interface ServerErrorEnvelope {
  ok?: boolean;
  error?: string | { code: string; message: string };
}

function extractError(payload: ServerErrorEnvelope | null, status: number): string {
  const err = payload?.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') return err.message;
  return `HTTP ${status}`;
}

export async function saveFolderConfig(
  path: string,
  frontmatter: FolderFrontmatterPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/folder-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, frontmatter }),
    });
    const payload = (await res.json().catch(() => null)) as ServerErrorEnvelope | null;
    if (!res.ok || !payload?.ok) {
      return { ok: false, error: extractError(payload, res.status) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveTemplate(input: {
  folder: string;
  name: string;
  frontmatter: TemplateFrontmatterFields;
  body: string;
}): Promise<{ ok: true; created: boolean; warnings: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await res.json().catch(() => null)) as
      | (ServerErrorEnvelope & { created?: boolean; warnings?: string[] })
      | null;
    if (!res.ok || !payload?.ok) {
      return { ok: false, error: extractError(payload, res.status) };
    }
    return { ok: true, created: payload.created ?? false, warnings: payload.warnings ?? [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteTemplate(
  folder: string,
  name: string,
): Promise<{ ok: true; existed: boolean } | { ok: false; error: string }> {
  try {
    const qs = `?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`;
    const res = await fetch(`/api/template${qs}`, { method: 'DELETE' });
    const payload = (await res.json().catch(() => null)) as
      | (ServerErrorEnvelope & { existed?: boolean })
      | null;
    if (!res.ok || !payload?.ok) {
      return { ok: false, error: extractError(payload, res.status) };
    }
    return { ok: true, existed: payload.existed ?? false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
