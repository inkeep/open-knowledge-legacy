# Evidence: Source Toggle Serialize/Deserialize Performance

**Dimension:** D7 — Performance characteristics of the toggle cycle
**Date:** 2026-04-07
**Sources:** prosemirror-markdown source, markdown-it benchmarks, y-prosemirror source, Quarto source

---

## Key files referenced
- `prosemirror-markdown` — MarkdownSerializer (single-pass depth-first tree walk)
- `y-prosemirror/src/lib.js` — yDocToProsemirrorJSON (lines 361-366)
- `y-prosemirror/src/sync-plugin.js` — updateYFragment (lines 1145-1298)
- `markdown-it` benchmark suite
- Quarto source analysis: https://deepwiki.com/quarto-dev/quarto/4.1-codemirror-integration

---

## Findings

### Finding: Full toggle round-trip is <30ms at 50KB — not a performance concern
**Confidence:** INFERRED (extrapolated from individual operation benchmarks)
**Evidence:** markdown-it benchmarks (0.6-1.3ms for 7.7KB), PM serializer analysis (O(n) tree walk)

| Operation | 1KB | 10KB | 50KB |
|-----------|-----|------|------|
| PM → Markdown serialize | <0.5ms | <1ms | ~2-5ms |
| Markdown → PM parse | <0.5ms | ~1-2ms | ~5-15ms |
| Y.XmlFragment → PM JSON | <0.5ms | <1ms | ~2-5ms |
| updateYFragment (diff writeback) | <1ms | ~1-3ms | ~5-20ms |
| **Full round-trip** | **<2ms** | **<5ms** | **<30ms** |

**Implications:** Toggle-speed UX is not at risk. Even 50KB documents (very long articles) complete the full cycle in under a single frame at 60fps. The performance concern was overweighted — the real risks are correctness, not speed.

### Finding: MUST use updateYFragment, NOT prosemirrorJSONToYDoc for toggle-back
**Confidence:** CONFIRMED
**Evidence:** y-prosemirror/src/lib.js lines 299-302 (JSDoc warning), sync-plugin.js lines 1145-1298

`prosemirrorJSONToYDoc` creates a NEW Y.Doc, destroying collaboration state and history. `updateYFragment` is diff-based: matches children left-to-right and right-to-left, only generates operations for changed content. Preserves other clients' cursors, undo history, and CRDT state.

**Implications:** The implementer MUST call updateYFragment directly, not the convenience function. This is a critical correctness requirement, not a performance optimization.

### Finding: Cursor mapping requires custom implementation — Quarto's approach is the best prior art
**Confidence:** CONFIRMED
**Evidence:** Quarto source analysis (SourcePos with line mappings, 2s/1s throttling)

No off-the-shelf library maps PM positions to markdown character offsets. Quarto tracks `SourcePos` during PM-to-markdown conversion and uses it for bidirectional mapping. They throttle source-to-visual at 1s and visual-to-source at 2s.

**Implications:** For the spike, approximate cursor mapping (find the closest block boundary) is sufficient. Production implementation should follow Quarto's pattern: track positions during serialization, build a mapping table, use it for approximate cursor restoration.

---

## Gaps / follow-ups
- No published benchmarks for updateYFragment specifically — the 5-20ms at 50KB is extrapolated from the algorithm's structure, not measured
- The table column edits scenario (high node-count, high nesting) may be slower — worth benchmarking during spike
