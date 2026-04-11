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
}

export type PoolChangeCallback = () => void;

const editorSchema = getSchema(sharedExtensions);

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
  private onChange: PoolChangeCallback | null = null;

  constructor(maxSize = 10, wsUrl?: string) {
    this.maxSize = maxSize;
    this.wsUrl = wsUrl ?? `ws://${globalThis.location?.host ?? 'localhost'}/collab`;
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
    };

    // Track sync state
    const onStatus = ({ status }: { status: string }) => {
      if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
      }
    };
    const onSynced = () => {
      entry.syncState = 'synced';
      this.notify();

      // Set up bidirectional observers once after first sync
      if (!entry.observerCleanup) {
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
      }
    };
    const onDisconnect = () => {
      entry.syncState = 'disconnected';
      this.notify();
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
    // Observer cleanup first (observers reference Y.Doc state), then full teardown
    entry.observerCleanup?.();
    entry.observerCleanup = null;
    entry.provider.destroy(); // destroy() disconnects + removes all listeners + awareness cleanup
  }
}
