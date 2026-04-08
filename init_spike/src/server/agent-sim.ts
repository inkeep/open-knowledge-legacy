/**
 * V3: Agent simulator — triggers DirectConnection writes via HTTP API.
 *
 * Usage:
 *   bun run src/server/agent-sim.ts                    # single raw Y.XmlElement write
 *   bun run src/server/agent-sim.ts --rapid 5          # 5 rapid writes (100ms apart)
 *   bun run src/server/agent-sim.ts --markdown         # single markdown write (unified path)
 *   bun run src/server/agent-sim.ts --markdown --rapid 5
 *
 * Requires the Vite dev server to be running (bun run dev).
 */

export {};

const BASE_URL = 'http://localhost:5173';

async function agentWriteRaw(): Promise<{ ok: boolean; timestamp?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/agent-write`, { method: 'POST' });
  return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
}

async function agentWriteMarkdown(
  markdown: string,
  position: 'append' | 'prepend' = 'append',
): Promise<{ ok: boolean; timestamp?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, position }),
  });
  return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
}

const args = process.argv.slice(2);
const useMarkdown = args.includes('--markdown');
const rapidIndex = args.indexOf('--rapid');
const count = rapidIndex >= 0 ? Number.parseInt(args[rapidIndex + 1] || '5', 10) : 1;

async function doWrite() {
  const timestamp = new Date().toISOString();
  if (useMarkdown) {
    return agentWriteMarkdown(`Agent markdown write at ${timestamp}`, 'append');
  }
  return agentWriteRaw();
}

if (count > 1) {
  console.log(`Rapid mode: ${count} writes, 100ms apart (${useMarkdown ? 'markdown' : 'raw'})\n`);
  for (let i = 0; i < count; i++) {
    const result = await doWrite();
    console.log(
      `  Write ${i + 1}/${count}: ${result.ok ? 'OK' : 'FAIL'} ${result.timestamp ?? result.error}`,
    );
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
} else {
  console.log(`Single agent write (${useMarkdown ? 'markdown' : 'raw'})...`);
  const result = await doWrite();
  console.log(`  Result: ${result.ok ? 'OK' : 'FAIL'} ${result.timestamp ?? result.error}`);
}

console.log('\nDone. Check the browser editor for new paragraph(s).');
