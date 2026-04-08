# Changelog

## 2026-04-07 — Initial draft
- Created SPEC.md from prior research (3 reports), init-spike code exploration, and session discussion
- Problem framing validated via stress-test probes
- All decisions grounded in existing research findings (shimmer analysis, observer mechanics, MDX content analysis)
- Test scenarios pulled from next-sync-explorations.md universal test matrix + spec-specific additions
- D7 (agent write path) left as INVESTIGATING

## 2026-04-07 — First audit + design challenge
- Spawned auditor and challenger in parallel
- 19 findings total (12 audit + 7 challenger)
- Critical finding H1: Observer A's full-replacement Y.Text writes destroy concurrent source-mode edits
- Resolved with D10 LOCKED: incremental diff-based Y.Text writes using `diffLines` from `diff` package
- Other resolutions: M1 (y-codemirror.next as new dependency), M3 (gap decomposition note), M4 (UndoManager test scenarios + STOP_IF), L1 (parse-error UX documented), S2 (D8/D9 added to Decision Log), S3 (OQ4/OQ5 added), S4 (Future Work maturity tiers), S5 (template section justification)

## 2026-04-07 — Reframed as foundational work
- Removed "spike" framing per user direction (agents skimp on quality with spike framing)
- Added End-to-End Validation Principle matching init-spike standard
- Real browsers, real multi-tab, real concurrent editing as required validation

## 2026-04-07 — Disk bridge added (Section 3.10)
- Moved disk bridge from deferred to in-scope
- Added @parcel/watcher integration with content-hash feedback loop prevention
- Strategy C: piggyback on open documents
- 9 disk sync test scenarios (T50-T58)
- Phase 5 added to implementation order
- Triple backtick bug fix added (Section 3.9)

## 2026-04-07 — Second audit + design challenge
- Spawned auditor and challenger in parallel for revised spec
- 17 findings total (10 audit + 7 challenger)
- Critical finding: `skipStoreHooks` doesn't exist in Hocuspocus v3.4.4 (it's a v4 API)
- Verified against installed source (`node_modules/@hocuspocus/server@3.4.4`) — confirmed absent
- Verified against `~/.claude/oss-repos/hocuspocus/` — present in v4 source (types.ts:16-18)
- Decision: remove Layer 2 from disk bridge, document Layer 1 (content hash) as sole defense
- Load-bearing invariant: A3 (round-trip idempotency) is now load-bearing for the disk bridge — not just an assumption but a correctness requirement
- Concurrent edit handling aligned: text and code now both describe CRDT-merge strategy (was inconsistent)
- T53 updated to reflect merge semantics, not deferral
- Diff granularity: hybrid approach added (diffLines → diffChars within changed lines) for cursor preservation
- Observer B performance targets added (PB01, PB02)
- writeTracker TTL cleanup added (3-line addition)
- 5th gap (disk → browser) added to SCR Complication
- OQ3 marked RESOLVED (frontmatter handling implemented in Section 3.3)
- A5 added: Y.Text contains full document including frontmatter (load-bearing)
- STOP_IF undo criterion broadened to "either UndoManager"
- FB01 fallback test scenario added
- Test scenario attribution clarified (T = universal, others = spec-specific)
