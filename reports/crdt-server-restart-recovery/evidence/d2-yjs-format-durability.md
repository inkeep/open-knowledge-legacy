# Evidence: D2 — Yjs Binary Format Durability + Cross-Version Migration

**Dimension:** D2 — Is pinning Yjs 13.x + recovering binary state N weeks later a safe durable strategy?
**Date:** 2026-04-23
**Sources:** Yjs source, Yjs README, Yjs discussion forum, GitHub issues

---

## Key sources referenced

- `/Users/edwingomezcuellar/projects/open-knowledge/node_modules/yjs/src/utils/encoding.js` (yjs 13.6.30)
- [Yjs README](https://github.com/yjs/yjs/blob/main/README.md)
- [Yjs Document Updates docs](https://docs.yjs.dev/api/document-updates)
- [discuss.yjs.dev — Converting to V2 update format](https://discuss.yjs.dev/t/converting-to-the-v2-update-format/3890) (dmonad comment)
- [Yjs issue #479](https://github.com/yjs/yjs/issues/479) — Invalid update causes infinite loop
- [Yjs issue #591](https://github.com/yjs/yjs/issues/591) — Misordered updates silently miss Map keys
- [Yjs GitHub Releases](https://github.com/yjs/yjs/releases) (v14.0.0-rc.13 as of 2026-04-14)

---

## Findings

### Finding 1: `encodeStateAsUpdate` output has NO version header

**Confidence:** CONFIRMED

**Evidence:** From `yjs/src/utils/encoding.js:555`:
```js
export const encodeStateAsUpdate = (doc, encodedTargetStateVector) =>
  encodeStateAsUpdateV2(doc, encodedTargetStateVector, new UpdateEncoderV1())
```

Output is a raw varint-encoded struct stream followed by a delete set. First bytes are `writeVarUint(numStates)` then per-state `(numStructs, client, clock, structs...)` — no magic bytes, no version tag.

Confirmed by Yjs author (dmonad) on discuss.yjs.dev:

> **"y-websocket only supports v1. Also, you can't tell whether an update is v1 or v2. I recommend, that you store the encoding format alongside of the update message."**

**Implication:** The binary format is NOT self-describing. Any durable storage system must store format metadata (version, variant) externally. Open Knowledge cannot rely on "read the bytes and decide what version they are."

### Finding 2: 13.x minor-version format is stable

**Confidence:** CONFIRMED

**Evidence:** V1 encoding is explicitly preserved for wire compatibility across all 13.x minors. The V1 struct-stream encoding (info-flag bits 0-7, `writeLeftID`/`writeRightID`) has been stable since ~13.0. No record of 13.x minor-to-minor breaking the binary format. `convertUpdateFormatV1ToV2` / `convertUpdateFormatV2ToV1` are first-class exports (`updates.js:717-722`), indicating cross-format round-trip is supported.

**Implication:** Within a pinned 13.x installation, binary state written today is safe to load N weeks later. Across minor upgrades (13.6 → 13.7 → 13.8), format compatibility holds.

### Finding 3: Yjs 14 is RC-stage; format impact UNCERTAIN

**Confidence:** UNCERTAIN

**Evidence:** v14.0.0-rc.13 published 2026-04-14 (9 days before this research). Release notes are sparse. Documented changes in rc.4/rc.5 are bug fixes (`applyDelta modifyOp`, stack overflow in spread, skipping uncountables) — not format changes. No published migration guide. Package is RC, not GA. The renamed npm scope (`@y/y`) suggests a major rebrand, not necessarily a wire break, but this cannot be verified without a published changelog.

**Implication:** 13 → 14 migration is an open question. OK must either (a) pin 13.x for the foreseeable future, (b) plan for a migration path when 14.x reaches GA and a compatibility story exists, or (c) embed a version header so a future migration pass can target only pre-14 blobs.

### Finding 4: `applyUpdate` on corrupt input has three distinct failure modes

**Confidence:** CONFIRMED

**Evidence:** [Yjs issue #479](https://github.com/yjs/yjs/issues/479) — "Passing an invalid update Uint8array to Y.applyUpdate causes infinite loop in lib0", OPEN, unresolved.

Three modes:
1. **Infinite loop** in lib0 varint reader on certain malformed byte sequences (#479, unfixed)
2. **Thrown `Error: Unexpected end of array`** on truncated input ([discuss.yjs.dev thread 1724](https://discuss.yjs.dev/t/unexpected-end-of-array-when-trying-to-apply-big-update/1724))
3. **Silent partial-apply with pending buffer** — `readUpdateV2` (encoding.js:382-448) integrates what it can and stores the rest in `store.pendingStructs` without error if dependencies haven't arrived yet. Document appears partially changed but is quietly incomplete.

Yjs has **no validation API** — no `Y.isValidUpdate(bytes): boolean`.

**Implication:** Any binary-as-cache design must:
- Wrap `applyUpdate` in a try/catch AND a timeout (to defend against the infinite-loop case)
- Verify post-apply state against expected shape (e.g., non-zero XmlFragment length when markdown is non-empty)
- Fall back to markdown reconstruction on ANY anomaly — thrown error, timeout, or post-apply shape mismatch

The silent partial-apply is the most dangerous failure mode for Open Knowledge: the Y.Doc looks loaded but is missing content that didn't pass dependency checks.

### Finding 5: Yjs's own doctrine does NOT bless binary as long-term archival

**Confidence:** CONFIRMED

**Evidence:** [Yjs Document Updates docs](https://docs.yjs.dev/api/document-updates) describe the binary-update pattern (`ydoc.on('update', handler)` → persist/transmit) as the blessed path, but never guarantee format stability and never recommend binary as a primary durable store. The `y-indexeddb` provider is presented as the canonical browser-persistence answer. There is no "save full doc state to disk for archival" pattern in the official docs.

**Implication:** Yjs treats binary updates as a sync-layer / short-term persistence primitive, not as a long-term storage format. OK's use of binary-as-cache aligns with this spirit — keep markdown as archival truth, binary as operational cache.

### Finding 6: Corruption-hostile by design = markdown fallback is load-bearing

**Confidence:** INFERRED from Findings 4+5

**Implication:** OK must treat binary sidecar as "best-effort recovery." If the sidecar is corrupt, missing, stale, or from an incompatible format version, the system must gracefully fall back to markdown reconstruction (the current path, which produces the bug under restart). This elevates the importance of a defense-in-depth mechanism: even in fallback, detect stale-client-reconnect and force recycle rather than merge.

---

## Direct answers to decision questions

### Q: Is pinning Yjs 13.x today + recovering binary state N weeks later safe?

**Safe within a pinned 13.x installation; UNCERTAIN across 13→14; NEVER safe without an external format tag.** Binary updates written by 13.6.30 will round-trip through 13.6.30 and almost certainly through the rest of 13.x. Across 13→14 (or any future major), the library author's own guidance is "store the format alongside."

### Q: What happens if binary state is corrupt / stale / missing?

**Heterogeneous and partially silent** — infinite loop, thrown error, OR silent partial-apply with buffered leftovers. The silent partial-apply is the dangerous one: the doc looks loaded but is missing content.

### Q: Recommendation on format versioning

**Embed a minimal external header.** At minimum `{yjsVersion, formatVariant, schemaVersion}` as a JSON prefix or sidecar alongside every binary blob. Cost is ~80 bytes; upside is:
- (a) Detecting 14.x bytes hitting a 13.x reader BEFORE `applyUpdate` is called
- (b) Enabling a future `convertUpdateFormatV1ToV2` migration pass at read time
- (c) Gating fallback-to-markdown on format mismatch vs other anomalies

**Pair binary-as-cache with markdown-as-truth AND a post-apply state assertion.** A silent partial-apply via `pendingStructs` is the failure mode most likely to corrupt downstream observers; cheap to defend against with `fragment.length > 0` + frontmatter-present checks post-load.

---

## Gaps / follow-ups

- Yjs 14 GA timeline + binary format impact: not determinable until migration guide lands.
- Real-world corruption rates in the wild (how often do `.bin` files actually corrupt?): no published data found.
- Whether `y-indexeddb` (similar shape to a sidecar approach but browser-side) has observed corruption in production: not investigated.
