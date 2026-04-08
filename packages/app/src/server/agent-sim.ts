/**
 * V4: Agent simulator — triggers DirectConnection writes via HTTP API.
 *
 * The agent write endpoints (/api/agent-write, /api/agent-write-md) now:
 * - Set agent awareness (name: Claude, color: #D97757, type: agent)
 * - Write Y.Map('activity') entry alongside content for flash plugins
 * - Use 'agent-write' origin for per-origin undo tracking
 *
 * Usage:
 *   bun run src/server/agent-sim.ts                    # single raw write
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

async function checkUndoStatus(): Promise<{ canUndo: boolean; canRedo: boolean } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/agent-undo-status`);
    if (res.ok) return (await res.json()) as { canUndo: boolean; canRedo: boolean };
  } catch {
    // Server not running or endpoint not available
  }
  return null;
}

const args = process.argv.slice(2);
const useMarkdown = args.includes('--markdown');
const rapidIndex = args.indexOf('--rapid');
const count = rapidIndex >= 0 ? Number.parseInt(args[rapidIndex + 1] || '5', 10) : 1;

async function doWrite(index: number) {
  const timestamp = new Date().toISOString();
  try {
    let result: { ok: boolean; timestamp?: string; error?: string };
    if (useMarkdown) {
      result = await agentWriteMarkdown(`Agent markdown write at ${timestamp}`, 'append');
    } else {
      result = await agentWriteRaw();
    }

    if (result.ok) {
      console.log(
        `  [write ${index}] OK — awareness: editing→idle, activity map updated, origin: agent-write`,
      );
    } else {
      console.error(`  [write ${index}] FAIL — ${result.error ?? 'unknown error'}`);
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`  [write ${index}] ERROR — ${message}`);
    console.error('    Is the dev server running? (bun run dev)');
    return { ok: false, error: message };
  }
}

console.log(`\n--- Agent Simulator (v4) ---`);
console.log(`Mode: ${useMarkdown ? 'markdown' : 'raw'}`);
console.log(`Writes: ${count}${count > 1 ? ' (rapid, 100ms apart)' : ''}`);
console.log(`Presence: Agent connects with awareness (Claude, #D97757, type: agent)`);
console.log(`Activity: Y.Map('activity') updated per write for flash plugins`);
console.log(`Undo: writes tracked with 'agent-write' origin\n`);

if (count > 1) {
  for (let i = 0; i < count; i++) {
    await doWrite(i + 1);
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
} else {
  await doWrite(1);
}

// Check undo status after writes
const undoStatus = await checkUndoStatus();
if (undoStatus) {
  console.log(`\nUndo status: canUndo=${undoStatus.canUndo}, canRedo=${undoStatus.canRedo}`);
}

console.log('\nDone. Check the browser for:');
console.log('  - Agent in presence bar (Claude badge)');
console.log('  - Region flash on new content');
console.log('  - "Undo Agent Edit" button enabled');
