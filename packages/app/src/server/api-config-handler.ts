interface DevApiConfigResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  omitBody: boolean;
}

export function computeDevApiConfigResponse(
  method: string | undefined,
  port: number,
): DevApiConfigResponse | null {
  if (method !== 'GET' && method !== 'HEAD') return null;
  const collabUrl = port > 0 ? `ws://localhost:${port}/collab` : null;
  return {
    status: 200,
    body: JSON.stringify({ collabUrl, previewUrl: null, port }),
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    omitBody: method === 'HEAD',
  };
}
