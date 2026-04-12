import { HocuspocusProvider } from '@hocuspocus/provider';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from './extensions/shared.ts';
import { setupObservers } from './observers';

export type SyncState = 'connecting' | 'synced' | 'disconnected';

export interface PoolEntry {
  provider: HocuspocusProvider;
  observerCleanup: (() => void) | null;
  syncState: SyncState;
  docName: string;
  lastAccessedAt: number;
  hasSynced: boolean;
  tearingDown: boolean;
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
}

export type PoolChangeCallback = () => void;

const editorSchema = getSchema(sharedExtensions);

/**
 * How long to wait after a disconnect before recycling the provider (ms).
 * During this window the provider's built-in exponential backoff handles
 * reconnection attempts. If it reconnects and syncs, the pending recycle is
 * cancelled. If the window expires with the provider still disconnected, a
 * single recycle fires. Rapid disconnect events (server flapping) reset the
 * timer — collapsing a flap storm into one recycle at the end.
 *
 * 4s is long enough to ride out a server restart cycle (typically 1-3s) and
 * short enough that the user doesn't stare at a stale disconnected state.
 * Validated by the Liveblocks `lostConnectionTimeout` pattern (default 5s).
 */
const RECYCLE_DEBOUNCE_MS = 4_000;

/**
 * LRU pool of HocuspocusProvider instances. Plain TS class — not a React hook.
 * Owns WebSocket connections, survives React re-renders.
 */
export class ProviderPool {
  readonly entries = new Map<string, PoolEntry>();
  private lruOrder: string[] = [];
  private activeDocName: string | null = null;
  private readonly maxSize: number;
  private readonly wsUrl: string;
  private readonly recycleDebounceMs: number;
  private onChange: PoolChangeCallback | null = null;

  constructor(maxSize = 10, wsUrl?: string, recycleDebounceMs?: number) {
    this.maxSize = maxSize;
    this.wsUrl = wsUrl ?? `ws://${location.host ?? 'localhost'}/collab`;
    this.recycleDebounceMs = recycleDebounceMs ?? RECYCLE_DEBOUNCE_MS;
  }

  /** Register a callback that fires whenever pool state changes. */
  setOnChange(cb: PoolChangeCallback | null): void {
    this.onChange = cb;
  }

  private notify(): void {
    this.onChange?.();
  }

  /** Touch a doc in the LRU order (move to end = most recently used). */
  private touch(docName: string): void {
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(docName);
  }

  /**
   * Open (or reuse) a document. Returns the pool entry.
   * If the pool is at capacity, evicts the LRU entry (never the active doc).
   */
  open(docName: string): PoolEntry {
    const existing = this.entries.get(docName);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      this.touch(docName);
      this.notify();
      return existing;
    }

    // Evict if at capacity
    if (this.entries.size >= this.maxSize) {
      this.evictLru();
    }

    const provider = new HocuspocusProvider({
      url: this.wsUrl,
      name: docName,
    });

    const entry: PoolEntry = {
      provider,
      observerCleanup: null,
      syncState: 'connecting',
      docName,
      lastAccessedAt: Date.now(),
      hasSynced: false,
      tearingDown: false,
      pendingRecycleTimer: null,
    };

    // Track sync state
    const onStatus = ({ status }: { status: string }) => {
      if (entry.tearingDown || this.entries.get(docName) !== entry) return;
      if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
      }
    };
    const onSynced = () => {
      if (entry.tearingDown || this.entries.get(docName) !== entry) return;
      entry.syncState = 'synced';
      entry.hasSynced = true;
      // Cancel pending recycle — provider reconnected successfully
      if (entry.pendingRecycleTimer) {
        clearTimeout(entry.pendingRecycleTimer);
        entry.pendingRecycleTimer = null;
      }
      this.notify();

      // Set up bidirectional observers once after first sync
      if (!entry.observerCleanup) {
        try {
          const doc = provider.document;
          const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
          entry.observerCleanup = setupObservers({
            doc,
            xmlFragment: doc.getXmlFragment('default'),
            ytext: doc.getText('source'),
            mdManager: mdMgr,
            schema: editorSchema,
            onSyncError: (direction, error) => {
              console.warn(`[Sync] ${direction} failed for ${docName}:`, error.message);
            },
          });
        } catch (err) {
          this.close(docName);
          console.error(`[ProviderPool] setupObservers init failed for ${docName}:`, err);
        }
      }
    };
    const onDisconnect = () => {
      if (entry.tearingDown || this.entries.get(docName) !== entry) return;
      entry.syncState = 'disconnected';
      this.notify();

      // If this provider has no local-only CRDT changes buffered, schedule a
      // debounced recycle. During the debounce window the provider's built-in
      // exponential backoff handles reconnection — if it syncs before the timer
      // fires, onSynced cancels the pending recycle. Only the FIRST disconnect
      // sets the timer; subsequent disconnects (from failed reconnect attempts)
      // are no-ops — they shouldn't extend the window because each one just
      // means "still can't reach the server."
      if (entry.hasSynced && provider.unsyncedChanges === 0 && !entry.pendingRecycleTimer) {
        entry.pendingRecycleTimer = setTimeout(() => {
          entry.pendingRecycleTimer = null;
          if (entry.tearingDown || this.entries.get(docName) !== entry) return;
          this.recycleDisconnectedEntry(docName);
        }, this.recycleDebounceMs);
      }
    };

    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('disconnect', onDisconnect);

    this.entries.set(docName, entry);
    this.touch(docName);
    this.notify();

    return entry;
  }

  /** Close a specific document — disconnect and clean up. */
  close(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) return;

    this.destroyEntry(entry);
    this.entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);

    if (this.activeDocName === docName) {
      this.activeDocName = null;
    }
    this.notify();
  }

  /** Set the active document. Must already be open. */
  setActive(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) {
      throw new Error(`[ProviderPool] Cannot setActive — "${docName}" is not open`);
    }
    entry.lastAccessedAt = Date.now();
    this.touch(docName);
    this.activeDocName = docName;
    this.notify();
  }

  /** Get the active pool entry, or null if nothing is active. */
  getActive(): PoolEntry | null {
    if (!this.activeDocName) return null;
    return this.entries.get(this.activeDocName) ?? null;
  }

  /** Get the active document name. */
  getActiveDocName(): string | null {
    return this.activeDocName;
  }

  /** Check if a document is open in the pool. */
  has(docName: string): boolean {
    return this.entries.has(docName);
  }

  /** Dispose of all entries. */
  dispose(): void {
    for (const entry of this.entries.values()) {
      this.destroyEntry(entry);
    }
    this.entries.clear();
    this.lruOrder = [];
    this.activeDocName = null;
    this.onChange = null;
  }

  private evictLru(): void {
    // Find the LRU entry that is NOT the active doc
    for (const docName of this.lruOrder) {
      if (docName !== this.activeDocName) {
        console.log(`[ProviderPool] Evicting LRU entry: ${docName}`);
        this.close(docName);
        return;
      }
    }
  }

  private destroyEntry(entry: PoolEntry): void {
    entry.tearingDown = true;
    if (entry.pendingRecycleTimer) {
      clearTimeout(entry.pendingRecycleTimer);
      entry.pendingRecycleTimer = null;
    }
    // Observer cleanup first (observers reference Y.Doc state), then full teardown
    entry.observerCleanup?.();
    entry.observerCleanup = null;
    try {
      entry.provider.destroy(); // destroy() disconnects + removes all listeners + awareness cleanup
    } catch (err) {
      console.warn(`[ProviderPool] Provider destroy failed for ${entry.docName}:`, err);
    }
  }

  private recycleDisconnectedEntry(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.tearingDown) return;

    const wasActive = this.activeDocName === docName;
    console.log(`[ProviderPool] Recycling disconnected entry: ${docName}`);

    this.destroyEntry(entry);
    this.entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);

    if (wasActive) {
      this.open(docName);
      this.setActive(docName);
      return;
    }

    this.notify();
  }
}
