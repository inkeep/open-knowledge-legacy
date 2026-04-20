# Evidence: Candidate 3 — Loro

**Dimension:** Primary candidate
**Date:** 2026-04-16
**Sources:** `reports/loro-ecosystem-readiness-assessment/REPORT.md`, GitHub loro-dev, npm registry

---

## A. Production Readiness (2026-04-16)

- **Core:** Loro v1.10.8 Rust (1.0 since October 2024). MIT. 5.5k stars.
- **JS binding:** `loro-crdt` via WASM. 970KB gzipped.
- **ProseMirror binding:** `loro-prosemirror@0.4.3` (Feb 2026) — PRE-1.0.
- **CodeMirror binding:** `loro-codemirror@0.3.3` (Oct 2025) — pre-1.0, simpler scope, 1 open issue.
- **Issue #77 (CONTENT WIPE BUG):** Opened 2026-03-28. Patch proposed by reporter, no PR merged. **STILL OPEN as of 2026-04-16** (verified via GitHub fetch). Direct data-loss race when `docChanged` transaction fires before `init()` completes; `updateLoroToPmState` with empty mapping replaces all Loro content. **BLOCKER for production use until resolved.**
- **Issue #75:** Race condition `addEphemeral` racing with auto-created `TimerlessEphemeralStore` — presence sync concurrency bug. Open.
- **Maintainer count:** Socket.dev reports "1 open source maintainer" on loro-prosemirror — high bus factor risk. Core Loro team: 2-4 contributors.
- **npm downloads:** 18.6k/week (loro-crdt) vs Yjs 3.2M/week (172x gap). Growing faster than Automerge (7.8k/week).
- **Production users:** SchoolAI (publicly identified, with their own `loro-extended` wrapper filling infrastructure gaps). No major knowledge-base product on Loro in production.
- **Sync server:** `SimpleServer` explicitly marked testing-grade. No production-grade server exists. `loro-websocket` minimal.

**Confidence:** CONFIRMED.

---

## B. Migration Scope — Structural

**Architecture:** Flat text (`LoroText`) with mark annotations. Style anchors (special control characters) rather than Peritext's original algorithm, but achieves SAME semantics (per-mark expand via `configTextStyle`). Block-level structure not in Loro's rich text model — handled at PM schema level or via Loro's `LoroTree`/`LoroList` containers.

**File-by-file 1P impact:**

Bridge code DELETED (same as Candidates 1/2): server-observers.ts, observers.ts, apply-by-prefix-suffix.ts, diff-lines-fast.ts, mergeThreeWay.

Client editor integration:
- `loro-prosemirror@0.4.3` provides `LoroSyncPlugin`, `LoroUndoPlugin`, `LoroEphemeralCursorPlugin` — full parity with y-prosemirror plugin surface.
- **No TipTap extension exists.** Must wrap (~1-2 weeks) similar to Automerge.
- Schema handled automatically via `configLoroTextStyle(schema)` — less schema-annotation overhead than Automerge.
- **Architectural concern:** Loro-to-PM sync path replaces entire PM document content on each remote update (not incremental). Performance concerns on large docs, cursor jumps.
- **Atom node support:** undocumented, unvalidated. Likely works through generic node creation but untested for our jsxComponent / rawMdxFallback pattern.

Source-mode integration (CodeMirror):
- `loro-codemirror@0.3.3` works. Flat text model maps cleanly to LoroText. Custom `getTextFromDoc` parameter allows mapping any Loro structure to the text container.
- BUT: shares SAME translation problem as Candidates 1/2. Loro stores block markers via style anchors; CM doesn't natively display those as markdown. Still need a span-to-markdown projection layer.

Server persistence:
- **No Hocuspocus equivalent exists.** SimpleServer is testing-grade. No `openDirectConnection`, no `onStoreDocument`, no document lifecycle, no extension system, no auth hooks.
- SchoolAI's `loro-extended` third-party wrapper provides network/persistence adapters (SSE, WebSocket, IndexedDB, LevelDB, PostgreSQL), but is community-maintained.
- **Custom sync server required: 4-8 weeks minimum** to reach the capability surface that Hocuspocus + `agent-sessions.ts` + `external-change.ts` provides today.

Fidelity invariants: same situation as Candidates 1/2 (markdown pipeline preserved, layer boundary collapses, branch path gains new semantics via Fugue fork/merge).

---

## C. Ecosystem Integration

**Hocuspocus:** INCOMPATIBLE (Yjs-specific). Build custom.

**Markdown pipeline:** preserved at PM JSON boundary. `loroToPmDoc() → PM JSON → mdManager.serialize() → markdown`.

**Source-mode:** loro-codemirror exists. CodeMirror 6 compatible. Simpler than dual-projection problem.

**Novel capability — fork/merge branching:** Loro's `doc.fork()` + `Fugue` algorithm provides **maximal non-interleaving** merge. Two branches editing the same text region merge as contiguous blocks, not character-by-character interleaving. This directly solves the problem documented in `reports/crdt-branching-namespacing-prior-art`: "Merging two independently-edited Y.Docs produces interleaved text."

---

## D. Effort Estimate (engineer-weeks)

Per prior report:
- Prototype: 2-4 wk (if you accept current ecosystem gaps)
- Production sync server: 4-8 wk
- Persistence layer: 2-4 wk
- loro-prosemirror stabilization (fork or wait): 2-4 wk
- TipTap integration: 1-2 wk
- Branch merge UI: 4-8 wk
- Server-side write pipeline: 1-2 wk
- Testing: 2-3 wk

| Scenario | Weeks |
|---|---|
| Optimistic | 12-16 |
| Realistic | 16-22 |
| Conservative | 20-28 |

---

## E. Risk Profile

- **Pre-1.0 binding risk:** HIGH. `loro-prosemirror@0.4.3` has an open active data-loss bug (#77). One maintainer. Breaking API changes in recent past.
- **Migration breakage:** bridge test suite (~40 tests) DELETED. Hocuspocus-dependent tests (~30 files) need rewrite.
- **Performance:** 970KB WASM bundle (12-20x Yjs). Keystroke operations cross WASM boundary (serialization overhead). Rust-level numbers (82us import snapshot) promising but not equivalent to JS bindings performance.
- **Reverse migration cost:** VERY HIGH. No export tooling to Yjs. Loro uses Fugue/Eg-walker internally, incompatible with Yjs YATA.
- **Ecosystem maturity:** Growing but 172x behind Yjs in downloads. No managed service. SchoolAI is lone major production user.
- **Boundary semantics:** CORRECT. Per-mark expand (before/after/none) matches Peritext.
- **Fork/merge advantage:** Non-interleaving merge at CRDT level is unique competitive feature not available in any Yjs path.

---

## F. Key Advantage

**Three simultaneous structural wins:**
1. Single CRDT collapse — bridge disappears. Content preservation structural.
2. Correct Peritext boundary semantics (unlike Yjs — Candidate 1 does not give you this).
3. Native git-style fork/merge with Fugue non-interleaving — unique to Loro. Solves the hard problem from `crdt-branching-namespacing-prior-art`.

Loro is the only candidate that gives all three.

---

## G. Key Disadvantage

**Prototype-ready, production-unready infrastructure.** Active data-loss bug #77 in the ProseMirror binding is a blocker. No production sync server. One maintainer on the binding. 970KB WASM bundle. TipTap integration requires custom wrapper.

Prior report verdict survives: "Loro is a prototype-ready, production-unready CRDT stack."

---

## Gaps / follow-ups

- When does issue #77 land a merged fix? Unknown.
- Does `loro-prosemirror` reach 1.0 in 2026?
- Has SchoolAI published any production learnings or observed stability?
- Loro's `configLoroTextStyle` with our custom extensions (Callout, jsxInline, rawMdxFallback) — validated? unvalidated.
