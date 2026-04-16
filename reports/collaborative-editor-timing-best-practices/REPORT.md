---
title: "Collaborative Editor Timing Best Practices — Evidence-Based Debounce, Throttle, and Delay Values"
description: "Systematic survey of timing constants in collaborative real-time editors: human perception thresholds, CRDT sync frequency, typing detection, auto-save, file watcher batching, version history, and derived-view invalidation. Maps production values from Yjs, Hocuspocus, Liveblocks, Figma, Google Docs, VS Code, and academic research."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Yjs
  - Hocuspocus
  - Liveblocks
  - CodeMirror
  - ProseMirror
  - Figma
  - Google Docs
  - VS Code
topics:
  - debounce timing
  - collaborative editing latency
  - CRDT sync frequency
---

# Collaborative Editor Timing Best Practices

**Purpose:** For each of 8 timing scenarios in a collaborative CRDT editor, determine the evidence-based optimal value by surveying human perception research, production system prior art, and ecosystem conventions.

---

## Executive Summary

Most timing constants in collaborative editors cluster around a few perception-grounded thresholds. The evidence reveals a clear hierarchy:

**Key Findings:**

- **Cross-CRDT bridge debounce (50ms): CONFIRMED APPROPRIATE.** Sits between the 10-15ms perceptual fusion threshold and the ~100ms "instantaneous" perception limit. Matches Figma's 33ms frame-based batching and Liveblocks' 100ms throttle. No production system uses a lower debounce for cross-representation sync.

- **Typing defer (300ms): CONFIRMED APPROPRIATE.** Average inter-keystroke interval at 50 WPM is 239ms (CHI 2018, 168K participants). A 300ms window captures the end of a typing burst for the median user. ProseMirror's 200ms scheduleDOMUpdate fallback and VS Code's 300ms hover delay bracket the same range.

- **Persistence debounce (2000ms/10000ms): MATCHES HOCUSPOCUS DEFAULT EXACTLY.** Hocuspocus uses 2000ms/10000ms. VS Code afterDelay is 1000ms. Obsidian is ~2000ms. The 2000ms value is the ecosystem standard for "save after typing stops."

- **File watcher batch (50ms): ON THE LOW END BUT DEFENSIBLE.** Webpack uses 200ms, @parcel/watcher uses 500ms (hardcoded), chokidar uses 100ms atomic. The 50ms value prioritizes responsiveness for rename detection over coalescing, which is correct for a system where immediate CRDT sync matters more than batch efficiency.

- **Git commit debounce (15s): REASONABLE, within range.** VS Code local history merges within 10s. JetBrains idle-saves at ~15s. Figma checkpoints at 30-60s. The 15s value provides good attribution granularity without excessive git overhead.

- **CC1 broadcast debounce (100ms): CONFIRMED APPROPRIATE.** Matches Liveblocks' 100ms default throttle and Figma's cursor update rate. Aligns with the sub-100ms target for "real-time" derived-view invalidation.

- **Write tracker TTL (10s): MATCHES CHOKIDAR PATTERN.** chokidar's awaitWriteFinish stabilityThreshold defaults to 2000ms. The 10s TTL is conservative — more than enough for any reasonable write→watcher→event pipeline to complete. Could be 5s without risk.

- **Remote tree sync grace (150ms): VALIDATED.** 3x the 50ms debounce (150ms) provides headroom for network latency + server processing + Observer A debounce firing. Google Docs batches within 120-180ms. The grace window is well-calibrated.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | Human perception thresholds | P0 | Deep |
| D2 | CRDT sync frequency (Observer A/B equivalent) | P0 | Deep |
| D3 | Typing detection and defer windows | P0 | Deep |
| D4 | Auto-save / persistence debounce | P0 | Deep |
| D5 | File watcher event batching | P0 | Moderate |
| D6 | Version history / commit granularity | P1 | Moderate |
| D7 | Derived-view invalidation / broadcast coalescing | P1 | Moderate |
| D8 | Self-write detection TTL | P1 | Moderate |

---

## Detailed Findings

### D1: Human Perception Thresholds

**Finding:** Four perception tiers govern editor timing decisions.

**Evidence:** [evidence/d1-human-perception-thresholds.md](evidence/d1-human-perception-thresholds.md)

| Tier | Threshold | User Experience | Editor Mapping |
|------|-----------|-----------------|----------------|
| Instantaneous | <100ms | Direct manipulation — no perceived delay | Keystroke→character, cursor, selection, cross-mode sync |
| Responsive | 100-300ms | Delay noticed but flow maintained | Autocomplete, remote cursor, observer sync |
| Noticeable | 300-1000ms | Deliberate wait — user expects feedback | Save indicator, search results, complex operations |
| Slow | >1000ms | Flow broken — needs progress indicator | Document load, initial sync, large operations |

**Critical numbers for editor timing:**
- **10-15ms:** Perceptual fusion — two events feel simultaneous ([Wikipedia: Flicker Fusion](https://en.wikipedia.org/wiki/Flicker_fusion_threshold))
- **50ms:** RAIL idle chunk budget — processing must yield to preserve input responsiveness ([web.dev RAIL](https://web.dev/articles/rail))
- **100ms:** Nielsen "instantaneous" limit ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/))
- **200ms:** Typing correction tasks degrade significantly ([ACM MUM 2023](https://dl.acm.org/doi/10.1145/3626705.3627784))
- **239ms:** Average inter-keystroke interval at 51.56 WPM ([Aalto/Cambridge CHI 2018](https://userinterfaces.aalto.fi/136Mkeystrokes/))

**Implications:** A 50ms cross-CRDT debounce sits in the "instantaneous" tier. A 300ms typing defer sits at the boundary of "responsive." Both are perception-appropriate for their use cases.

---

### D2: CRDT Sync Frequency

**Finding:** The Yjs ecosystem sends document updates immediately per transaction (0ms). Debounce is applied only at persistence and awareness layers. The 50ms cross-CRDT bridge debounce is a unique architectural layer.

**Evidence:** [evidence/d2-crdt-sync-frequency.md](evidence/d2-crdt-sync-frequency.md)

| System | Sync Approach | Comparable Debounce |
|--------|--------------|-------------------|
| y-websocket | 0ms (immediate per tx) | N/A — single CRDT |
| Hocuspocus | 0ms (immediate per tx) | 2,000ms persistence only |
| Liveblocks | 100ms throttle | Network-level, not CRDT-bridge |
| Figma | 33ms (30 FPS batch) | Frame-based, not debounce |
| Google Docs | 120-180ms batch | OT operation batching |

**Key insight:** No other Yjs system has a cross-CRDT bridge to debounce — they use a single Y.Doc structure. Open Knowledge's 50ms debounce is a novel layer that doesn't have direct prior art. The closest analogues are Liveblocks' 100ms network throttle (higher) and Figma's 33ms frame batch (lower).

**Decision triggers:**
- If cross-mode sync latency becomes perceptible (>100ms end-to-end): consider reducing to 30ms
- If WebSocket traffic becomes a scaling concern at >10 concurrent users: consider increasing to 100ms
- Current 50ms is well-centered in the 33-100ms range of production systems

---

### D3: Typing Detection and Defer Windows

**Finding:** Production editors use synchronous per-transaction dispatch (0ms internal debounce). Typing defer is an application-layer concern, with 200-300ms being the standard range.

**Evidence:** [evidence/d3-typing-detection-defer.md](evidence/d3-typing-detection-defer.md)

| Editor | Internal Debounce | IME Safety Margin |
|--------|-------------------|-------------------|
| CodeMirror 6 | 0ms | 20ms compositionend |
| ProseMirror | 0ms | 50ms compositionend |
| TipTap | 0ms (inherits PM) | Inherits PM |
| Slate.js | 0ms (microtask batch) | — |

**Typing pause detection:**
- Average IKI at 50 WPM: **239ms** ([Aalto CHI 2018](https://userinterfaces.aalto.fi/136Mkeystrokes/))
- Fast typist (100 WPM): **120ms**
- The 300ms defer captures "end of burst" for all but elite typists (>125 WPM, ~96ms IKI)

**Implications for TYPING_DEFER_MS (300ms):**
- At 300ms, the system waits for a pause that exceeds the average IKI by ~25%. This correctly identifies typing pauses vs. inter-keystroke gaps.
- Reducing to 200ms (ProseMirror's scheduleDOMUpdate fallback) would miss some slow typists' inter-keystroke gaps.
- Increasing to 500ms would add unnecessary latency for the 90%+ of users who type at <100 WPM.

**Implications for REMOTE_TREE_SYNC_GRACE_MS (150ms):**
- 3x the 50ms debounce = 150ms provides headroom for: network RTT (~5-15ms) + server Observer A debounce (50ms) + processing (<1ms) + network return (~5-15ms) = ~75ms typical. The 150ms grace is approximately 2x the expected pipeline latency — a reasonable safety margin.

---

### D4: Auto-save / Persistence Debounce

**Finding:** 2000ms is the ecosystem standard for CRDT persistence debounce. Open Knowledge matches the Hocuspocus default exactly.

**Evidence:** [evidence/d4-autosave-persistence.md](evidence/d4-autosave-persistence.md)

| System | Save Interval | Tier |
|--------|--------------|------|
| VS Code (afterDelay) | 1,000ms | Aggressive |
| Obsidian | ~2,000ms | Standard |
| Hocuspocus | 2,000ms / 10,000ms max | Standard (Open Knowledge matches) |
| Tiptap Cloud | 5,000ms / 30,000ms max | Conservative |
| JetBrains | ~15,000ms (idle) | Very conservative |

**Implications:**
- The 2000ms/10000ms values are exactly the Hocuspocus defaults — no deviation needed.
- The 10000ms maxDebounce ensures at-most 10s of unsaved data during continuous typing. This is well within the "no anxiety" threshold for users who see auto-save indicators.

---

### D5: File Watcher Event Batching

**Finding:** Build tools use 200-500ms batch windows. Open Knowledge's 50ms is on the low end, prioritizing responsiveness.

**Evidence:** [evidence/d5-file-watcher-batching.md](evidence/d5-file-watcher-batching.md)

| Tool | Batch Window | Purpose |
|------|-------------|---------|
| Webpack 5 | 200ms | Rebuild coalescing |
| @parcel/watcher | 500ms | Event coalescing (hardcoded) |
| chokidar atomic | 100ms | Same-file rename detection |
| fabiospampinato/watcher | 300ms debounce, 1250ms rename | Full rename detection |
| Open Knowledge | 50ms | Rename detection batch |

**Implications:**
- The 50ms batch window is sufficient for detecting delete+create pairs from atomic writes (OS delivers both events within a few ms on macOS/Linux).
- Cross-directory renames (user drags a file in Finder) may arrive with wider gaps. The 50ms window may miss these — but the watcher currently classifies them as separate events (delete + create), which is handled correctly by the CRDT reconciliation layer.
- Increasing to 100ms would improve cross-directory rename detection with negligible latency impact.

---

### D6: Version History / Commit Granularity

**Finding:** 10-30 seconds is the standard range for local version history granularity.

| System | Granularity |
|--------|------------|
| VS Code local history | 10s mergeWindow |
| JetBrains local history | ~15s (per idle-save) |
| Figma checkpoints | 30-60s |

**Implications:** The 15s git commit debounce falls squarely in the 10-30s range. At 15s, each WIP commit represents roughly one "editing burst." This provides good attribution granularity (who wrote what) without creating excessive git objects.

---

### D7: Derived-View Invalidation / Broadcast Coalescing

**Finding:** 100ms is the standard throttle for real-time derived-view updates.

| System | Throttle |
|--------|---------|
| Liveblocks WebSocket | 100ms default |
| React Query staleTime | 0ms default (refetch immediately) |
| SWR revalidateOnFocus | Immediate |

**Implications:** The 100ms CC1 broadcast debounce matches Liveblocks' default. It coalesces git checkout bursts (200 files = 200 events → 1 signal) while keeping derived views feeling "live" (10 updates/sec maximum).

---

### D8: Self-Write Detection TTL

**Finding:** The 10s write tracker TTL is conservative but safe.

The pipeline: persistence writes file → watcher detects event → checks write tracker → skips if self-write. The maximum latency of this pipeline is: persistence debounce (2000ms) + disk write (<10ms) + watcher delivery (@parcel 500ms) + batch window (50ms) = ~2560ms. The 10s TTL provides ~4x safety margin.

**Implications:**
- 5s would be sufficient (2x safety margin over the ~2.5s pipeline).
- 10s is not harmful — the only cost is slightly delayed eviction of tracker entries (bounded memory: one entry per recently-written file).
- chokidar's awaitWriteFinish stabilityThreshold (2000ms) suggests the industry considers 2s sufficient for write completion detection.

---

## Assessment: Open Knowledge Current Values vs. Evidence

| Constant | Current | Evidence Range | Verdict |
|----------|---------|---------------|---------|
| Observer A/B debounce | **50ms** | 33ms (Figma) — 100ms (Liveblocks) | **APPROPRIATE** — centered in range |
| TYPING_DEFER_MS | **300ms** | 200ms (PM fallback) — 500ms (search) | **APPROPRIATE** — matches average IKI |
| REMOTE_TREE_SYNC_GRACE_MS | **150ms** | 120ms (Docs batch) — 200ms (cursor tolerance) | **APPROPRIATE** — 2x pipeline latency |
| L1 persistence debounce | **2000ms** | 1000ms (VS Code) — 5000ms (Tiptap Cloud) | **APPROPRIATE** — exact Hocuspocus default |
| L1 maxDebounce | **10000ms** | 10000ms (Hocuspocus) — 30000ms (Tiptap Cloud) | **APPROPRIATE** — exact Hocuspocus default |
| L2 git commit | **15000ms** | 10000ms (VS Code) — 60000ms (Figma) | **APPROPRIATE** — good attribution granularity |
| File watcher batch | **50ms** | 100ms (chokidar) — 500ms (@parcel) | **LOW END** — consider 100ms for rename detection |
| CC1 broadcast | **100ms** | 100ms (Liveblocks) | **APPROPRIATE** — matches prior art exactly |
| Write tracker TTL | **10000ms** | 2000ms (chokidar stability) — 10000ms | **CONSERVATIVE** — 5s would suffice, 10s is safe |

---

## Limitations & Open Questions

### Not fully covered
- **Figma exact sync rate:** Figma's 33ms frame-based batching is documented in blog posts but the exact protocol-level sync frequency is proprietary.
- **Google Docs exact batch window:** The 120-180ms estimate is from reverse-engineering, not official documentation.
- **Notion sync internals:** No published numbers; "real-time" is the only documentation.

### Out of scope
- Network-level WebSocket batching (Yjs protocol level)
- Memory/GC pressure from high-frequency observer firings
- Mobile vs. desktop perception differences

---

## References

### Evidence Files
- [evidence/d1-human-perception-thresholds.md](evidence/d1-human-perception-thresholds.md) — Nielsen, RAIL, Fatin, CHI research
- [evidence/d2-crdt-sync-frequency.md](evidence/d2-crdt-sync-frequency.md) — Yjs, Hocuspocus, Liveblocks, Figma, Google Docs
- [evidence/d3-typing-detection-defer.md](evidence/d3-typing-detection-defer.md) — CodeMirror, ProseMirror, IME, inter-keystroke intervals
- [evidence/d4-autosave-persistence.md](evidence/d4-autosave-persistence.md) — VS Code, JetBrains, Obsidian, Hocuspocus
- [evidence/d5-file-watcher-batching.md](evidence/d5-file-watcher-batching.md) — chokidar, @parcel, Webpack, Vite, VS Code

### External Sources
- [NN/g: Response Times](https://www.nngroup.com/articles/response-times-3-important-limits/) — Nielsen's 3 thresholds
- [web.dev RAIL Model](https://web.dev/articles/rail) — Google's response time budgets
- [Aalto 136M Keystrokes (CHI 2018)](https://userinterfaces.aalto.fi/136Mkeystrokes/) — Inter-keystroke interval data
- [Pavel Fatin: Typing with Pleasure](https://pavelfatin.com/typing-with-pleasure/) — Editor latency benchmarks
- [Dan Luu: Computer Latency 1977-2017](http://danluu.com/input-lag/) — Historical input latency survey
- [Figma: How Multiplayer Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — 33ms frame batching
- [Hocuspocus Configuration](https://tiptap.dev/docs/hocuspocus/server/configuration) — Default timing values
- [Liveblocks API Reference](https://liveblocks.io/docs/api-reference/liveblocks-client) — Throttle configuration

### Related Research
- [reports/crdt-observer-bridge-latency-analysis/](../crdt-observer-bridge-latency-analysis/) — Latency pipeline breakdown and optimization recommendations (deeper on per-stage timing; this report covers optimal values across the system)
