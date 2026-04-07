/**
 * V3: Agent simulator — triggers DirectConnection writes via HTTP API.
 *
 * Usage:
 *   bun run src/server/agent-sim.ts           # single write
 *   bun run src/server/agent-sim.ts --rapid 5 # 5 rapid writes (100ms apart)
 *
 * Requires the Vite dev server to be running (bun run dev).
 * The Hocuspocus server exposes POST /api/agent-write which uses
 * DirectConnection internally to write a paragraph to the Y.Doc.
 */

export {};

const API_URL = 'http://localhost:5173/api/agent-write';

async function agentWrite(): Promise<{ ok: boolean; timestamp?: string; error?: string }> {
  const res = await fetch(API_URL, { method: 'POST' });
  return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
}

const args = process.argv.slice(2);
const rapidIndex = args.indexOf('--rapid');
const count = rapidIndex >= 0 ? Number.parseInt(args[rapidIndex + 1] || '5', 10) : 1;

if (count > 1) {
  console.log(`Rapid mode: ${count} writes, 100ms apart\n`);
  for (let i = 0; i < count; i++) {
    const result = await agentWrite();
    console.log(
      `  Write ${i + 1}/${count}: ${result.ok ? 'OK' : 'FAIL'} ${result.timestamp ?? result.error}`,
    );
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
} else {
  console.log('Single agent write...');
  const result = await agentWrite();
  console.log(`  Result: ${result.ok ? 'OK' : 'FAIL'} ${result.timestamp ?? result.error}`);
}

console.log('\nDone. Check the browser editor for new paragraph(s).');
