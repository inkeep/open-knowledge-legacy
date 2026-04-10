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
 *   bun run src/server/agent-sim.ts --patch            # targeted patch sequence
 *   bun run src/server/agent-sim.ts --patch --doc my-doc --interval 1000 --port 5173
 *
 * Requires the Vite dev server to be running (bun run dev).
 */

export {};

const args = process.argv.slice(2);

// --- Flag parsing ---
const useMarkdown = args.includes('--markdown');
const usePatch = args.includes('--patch');
const rapidIndex = args.indexOf('--rapid');
const count = rapidIndex >= 0 ? Number.parseInt(args[rapidIndex + 1] || '5', 10) : 1;

const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number.parseInt(args[portIndex + 1] || '5173', 10) : 5173;

const docIndex = args.indexOf('--doc');
const docName = docIndex >= 0 ? (args[docIndex + 1] ?? 'test-doc') : 'test-doc';

const intervalIndex = args.indexOf('--interval');
const intervalMs =
  intervalIndex >= 0 ? Number.parseInt(args[intervalIndex + 1] || '2000', 10) : 2000;

const BASE_URL = `http://localhost:${port}`;

// --- Mutual exclusivity check ---
if (usePatch && (useMarkdown || rapidIndex >= 0)) {
  console.error('Error: --patch is mutually exclusive with --markdown and --rapid.');
  process.exit(1);
}

// --- API helpers ---

async function agentWriteRaw(): Promise<{ ok: boolean; timestamp?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/agent-write`, { method: 'POST' });
  return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
}

async function agentWriteMarkdown(
  markdown: string,
  position: 'append' | 'prepend' | 'replace' = 'append',
): Promise<{ ok: boolean; timestamp?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, position, docName }),
  });
  return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
}

async function agentPatch(
  find: string,
  replace: string,
): Promise<{ ok: boolean; timestamp?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/agent-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ find, replace, docName }),
  });
  return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
}

async function readDocument(): Promise<{ ok: boolean; content?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/document?docName=${encodeURIComponent(docName)}`);
  return (await res.json()) as { ok: boolean; content?: string; error?: string };
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

// --- Write helper (existing modes) ---

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

// --- Patch mode ---

const PATCH_TEMPLATE = `# Test Document

## Status

Status: pending

## Notes

No notes yet.

## Next Steps

TBD`;

const PATCH_SEQUENCE: Array<{ find: string; replace: string }> = [
  { find: 'Status: pending', replace: 'Status: in progress' },
  { find: 'No notes yet.', replace: 'Notes added by agent.' },
  { find: 'TBD', replace: 'Review patch behavior' },
  { find: 'Status: in progress', replace: 'Status: complete' },
];

async function runPatchMode() {
  console.log(`\n--- Agent Simulator (v4) — patch mode ---`);
  console.log(`Doc: ${docName}`);
  console.log(`Port: ${port}`);
  console.log(`Interval: ${intervalMs}ms between patches\n`);

  // Step 1: Read current document
  let content: string;
  try {
    const docResult = await readDocument();
    if (!docResult.ok) {
      console.error(`Failed to read document: ${docResult.error ?? 'unknown error'}`);
      process.exit(1);
    }
    content = docResult.content ?? '';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`ERROR reading document — ${message}`);
    console.error('  Is the dev server running? (bun run dev)');
    process.exit(1);
  }

  // Step 2: Seed if empty or missing recognizable sections
  const hasRecognizableSections =
    content.includes('Status: pending') ||
    content.includes('Status: in progress') ||
    content.includes('No notes yet.') ||
    content.includes('TBD');

  if (content.trim().length === 0 || !hasRecognizableSections) {
    console.log('Document empty or missing patch targets — seeding with template...');
    try {
      const seedResult = await agentWriteMarkdown(PATCH_TEMPLATE, 'replace');
      if (seedResult.ok) {
        console.log('  Seeded document with template.\n');
      } else {
        console.error(`  Seed FAIL — ${seedResult.error ?? 'unknown error'}`);
        process.exit(1);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`  ERROR seeding document — ${message}`);
      process.exit(1);
    }
  } else {
    console.log('Document already contains patch targets — skipping seed.\n');
  }

  // Step 3: Run patch sequence
  for (let i = 0; i < PATCH_SEQUENCE.length; i++) {
    const { find, replace } = PATCH_SEQUENCE[i];
    console.log(`  [patch ${i + 1}/${PATCH_SEQUENCE.length}]`);
    console.log(`    find:    "${find}"`);
    console.log(`    replace: "${replace}"`);

    try {
      const result = await agentPatch(find, replace);
      if (result.ok) {
        console.log(`    OK — patch applied`);
      } else if (result.error === 'Text not found in document') {
        console.log(`    not found — skipping`);
      } else {
        console.error(`    FAIL — ${result.error ?? 'unknown error'}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`    ERROR — ${message}`);
    }

    if (i < PATCH_SEQUENCE.length - 1) {
      console.log(`    waiting ${intervalMs}ms...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  console.log('\nPatch sequence complete.');
}

// --- Main ---

if (usePatch) {
  await runPatchMode();
} else {
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
}
