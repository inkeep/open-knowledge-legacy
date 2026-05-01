export async function postSyncEnabled(enabled: boolean): Promise<void> {
  const res = await fetch('/api/sync/set-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error.length > 0) {
        detail = body.error;
      }
    } catch {}
    throw new Error(`set-enabled failed: ${detail}`);
  }
}
