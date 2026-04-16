# Evidence: CRDT Sync Frequency

**Dimension:** D2 — CRDT/OT sync frequency in production systems
**Date:** 2026-04-16
**Sources:** Yjs ecosystem source code, Liveblocks docs, Figma blog, Automerge docs, Google Docs analysis

---

## Production system sync values

| System | Document Sync | Persistence Debounce | Architecture |
|--------|--------------|---------------------|-------------|
| y-websocket | 0ms (immediate per tx) | 2,000ms (HTTP callback) | CRDT (Yjs) |
| Hocuspocus | 0ms (immediate per tx) | 2,000ms / 10,000ms max | CRDT (Yjs) |
| Tiptap Cloud (recommended) | 0ms | 5,000ms / 30,000ms max | CRDT (Yjs) |
| y-indexeddb | — | 1,000ms | CRDT (Yjs) |
| Liveblocks | 100ms throttle | — | CRDT (Yjs-compatible) |
| Automerge-repo | Per-change | 100ms (saveDebounceRate) | CRDT (Automerge) |
| Figma | 33ms (30 FPS batched) | 30-60s checkpoints | Server-auth LWW |
| Google Docs | 120-180ms batch window | — | OT |
| Fluid Framework | Per-JS-turn (0ms effective) | — | OT-like (total order) |
| ShareDB | 0ms (immediate per op) | None built-in | OT |

## Key insight
Yjs ecosystem sends document updates **immediately per transaction** with zero built-in throttle. Debounce is applied only at persistence (2,000ms) and awareness (30,000ms) layers. The 50ms cross-CRDT bridge debounce in Open Knowledge is a distinct architectural layer not present in other Yjs systems (they don't have dual CRDTs to bridge).

## Notable values
- Figma durability P95: 600ms
- Figma checkpoint interval: 30-60s
- Neil Fraser (Google) differential sync: 1-10s adaptive cycle
- Yjs awareness offline timeout: 30,000ms
- Hocuspocus reconnect delay: 1,000ms base, 30,000ms max

Sources: y-websocket source, Hocuspocus source/docs, Liveblocks API reference, Figma engineering blog, Google Wave whitepaper
