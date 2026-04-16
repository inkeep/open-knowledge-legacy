/**
 * Chunked Y.Text insertion for large pastes (FR-21).
 *
 * Inserting a 1MB+ markdown string into Y.Text in one transaction freezes
 * the UI on iOS Safari and slower desktop setups. We split large inserts
 * into ~50KB segments and yield between segments via `requestAnimationFrame`,
 * keeping per-frame work well under 16ms to preserve 60fps.
 *
 * The final Observer B re-parse on the completed Y.Text is a single pass
 * of O(total-doc-size) — mitigating that is Future Work (incremental
 * re-parse). This module addresses the input-phase latency only.
 *
 * Transaction semantics: each chunk lands in its own Y.Doc transaction,
 * so the CRDT logs carry N append ops instead of one. Observer A/B
 * typing-defer still batches the downstream work to a single post-paste
 * re-parse. Origin is preserved across chunks.
 *
 * Threshold defaults are chosen to make the 500KB boundary ship the same
 * behavior as single-shot insertion (one transaction). Large inputs
 * (>500KB markdown) trigger chunking.
 */

export const DEFAULT_CHUNK_THRESHOLD_BYTES = 500 * 1024;
export const DEFAULT_CHUNK_SIZE_BYTES = 50 * 1024;

export interface InsertableYText {
  insert(index: number, text: string): void;
  length: number;
}

export interface InsertableYDoc {
  transact<T>(fn: () => T, origin?: unknown): T;
}

export interface ChunkedInsertOptions {
  /** Inclusive: payloads at-or-below this size skip chunking. Default 500KB. */
  thresholdBytes?: number;
  /** Target bytes per chunk. Default 50KB. */
  chunkSizeBytes?: number;
  /**
   * Yield function between chunks. Default `requestAnimationFrame`.
   * Injectable for tests.
   */
  yieldFn?: () => Promise<void>;
  /**
   * Transaction origin passed to `doc.transact(..., origin)` for each chunk.
   * Callers pass their `LocalTransactionOrigin` ref so downstream observers
   * see the right identity.
   */
  origin?: unknown;
}

/**
 * Insert `text` into `ytext` starting at `insertAt`. Below threshold → one
 * transaction. Above threshold → chunked inserts separated by
 * `requestAnimationFrame` yields so the UI stays at 60fps.
 *
 * Returns a Promise that resolves when the final chunk has landed.
 */
export async function chunkedYTextInsert(
  ydoc: InsertableYDoc,
  ytext: InsertableYText,
  insertAt: number,
  text: string,
  options: ChunkedInsertOptions = {},
): Promise<void> {
  const threshold = options.thresholdBytes ?? DEFAULT_CHUNK_THRESHOLD_BYTES;
  const chunkSize = options.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES;
  const origin = options.origin;
  const yieldFn = options.yieldFn ?? defaultRafYield;

  // Byte length uses UTF-16 length as a reasonable proxy — the vast majority
  // of markdown content is ASCII-ish and UTF-16 length is `string.length`.
  if (text.length <= threshold) {
    ydoc.transact(() => {
      ytext.insert(insertAt, text);
    }, origin);
    return;
  }

  let offset = 0;
  let writeIndex = insertAt;
  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);
    const chunk = text.slice(offset, end);
    ydoc.transact(() => {
      ytext.insert(writeIndex, chunk);
    }, origin);
    writeIndex += chunk.length;
    offset = end;
    if (offset < text.length) {
      await yieldFn();
    }
  }
}

function defaultRafYield(): Promise<void> {
  return new Promise((resolve) => {
    // Browser: rAF. Non-browser envs (unit tests, Node server): setTimeout 0.
    const g = globalThis as { requestAnimationFrame?: (cb: () => void) => void };
    if (typeof g.requestAnimationFrame === 'function') {
      g.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(() => resolve(), 0);
    }
  });
}
