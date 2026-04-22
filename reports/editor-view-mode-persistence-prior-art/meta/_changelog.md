# Changelog

## 2026-04-21 — Add D7 per-page vs global scope dimension
**Update type:** Additive
**Why this pass happened:** User flagged that per-page vs global scope was not covered as a named dimension in the initial report. Scattered findings existed across D1/D2/D3 but no synthesis. User requested Path C update to produce a proper scope-axis taxonomy and per-doc override prior-art analysis.

### Scope (delta only)

- D7 (new) — Per-page vs global scope: 5-tier taxonomy (session / document / project / user-global / cross-device); precedence semantics (override-with-fallback, hierarchical, session-on-top-of-durable, URL-authoritative, named-presets); per-doc override precedents (Obsidian community-plugin frontmatter keys, VS Code workspace rules, Notion named views); design options catalog for consuming spec (X1-X5).

### What changed (current-state)

- **REPORT.md — sections touched:**
  - Frontmatter: `updatedAt` unchanged (same day); `description` extended; `subjects` added (Notion, JupyterLab, RStudio); `topics` added (per-document scope, precedence semantics).
  - Research Rubric table: D7 row appended.
  - Executive Summary: added 4th structural takeaway + 2 Key Findings bullets (Obsidian plugin frontmatter keys; chicken-and-egg trap).
  - Detailed Findings: new D7 section inserted between D6 and Cross-Cutting Patterns.
  - Cross-Cutting Patterns: extended "Where editors diverge" bullet 3 (per-file override); added bullet 5 (scope tier composition); extended anti-pattern inventory.
  - Limitations & Open Questions: added 2 new "could go deeper" items (SilverBullet plug system, MarkText and other Electron markdown editors).
  - References → Evidence Files: added D7 entry.
  - References → External Sources: added obsidian-force-view-mode plugin source, Notion help + developer docs, nbformat docs, R Markdown RStudio docs, Zettlr YAML frontmatter docs.

- **Evidence — added:** `evidence/d7-per-page-vs-global-scope.md`
- **Evidence — edited-in-place:** none
- **Evidence — deleted:** none

### Notes on confidence / contradictions

- D7 CONFIRMED primary sources: obsidian-force-view-mode-of-note main.ts (TypeScript code quoted verbatim), Notion Help Center, nbformat docs.
- D7 NEGATIVE findings documented: Native Obsidian per-file mode (absent), Zettlr per-file mode (absent), Typora per-file mode (absent by design), SilverBullet per-page mode (not found in docs).
- Confirmed Obsidian `app.json` key names via plugin source fallback code: `defaultViewMode` (string) and `livePreview` (boolean). More precise than D2's original evidence which referenced them abstractly.
- No contradictions introduced with prior D1-D6 findings. D7 synthesis extends the scope axis without overturning prior claims.

### Drift check

- Baseline preserved: Yes.
- Stance unchanged: factual survey, not prescriptive. D7 design-options catalog (X1-X5) is listed as factual options for the consuming spec, not recommendations.
- Scope boundaries respected: non-goals unchanged (no 1P analysis, no toggle mechanic, no mobile, no CRDT fidelity, no product recommendations).
- Executive Summary churn: minimal — added one takeaway + two bullets without rewriting existing content.
- No rewrites of unrelated sections (D1-D6 findings intact).

### Open questions / gaps

- SilverBullet plug system — whether a plug could declare per-page mode via page metadata. Not pursued (low priority for spec).
- MarkText and other non-surveyed OSS markdown editors — whether any implement per-document frontmatter mode natively. Low signal expected; Obsidian community-plugin precedent is already sufficient for the spec.
- Exact install count / adoption of obsidian-force-view-mode-of-note plugin — not captured. Low signal for spec decisions.

---

## 2026-04-21 — Add D8 cross-tab `storage` event sync adoption dimension
**Update type:** Additive
**Why this pass happened:** User asked whether OSS editor-like projects (Penpot, Excalidraw, tldraw, JupyterLab, Monaco, next-themes, etc.) use `window.addEventListener('storage', ...)` to auto-propagate user preferences across live tabs — a direct follow-up to Open Question 1 from the spec ("cross-window auto-sync via storage event?"). This sharpens the adoption signal for that spec decision.

### Scope (delta only)

- D8 (new) — localStorage `storage` event cross-tab sync adoption survey. Four observed patterns (storage event listener / BroadcastChannel / focus-based re-check / no-sync) across next-themes, tldraw, Excalidraw, and VS Code. Penpot and JupyterLab/Monaco flagged UNCERTAIN.

### What changed (current-state)

- **REPORT.md — sections touched:**
  - Frontmatter: `description` extended; `subjects` added (tldraw, Excalidraw, Penpot, BroadcastChannel API); `topics` added (cross-tab sync, storage event listener).
  - Research Rubric table: D8 row appended.
  - Executive Summary: added 1 Key Findings bullet about cross-tab sync pattern taxonomy.
  - Detailed Findings: new D8 section inserted between D7 and Cross-Cutting Patterns.
  - Cross-Cutting Patterns: added bullet 6 ("Cross-tab auto-sync mechanism").
  - References → Evidence Files: added D8 entry.
  - References → External Sources: added 4 new sources (next-themes source file, tldraw TLLocalSyncClient, tldraw user preferences docs, Excalidraw Issue #2791).

- **Evidence — added:** `evidence/d8-storage-event-cross-tab-sync.md`
- **Evidence — edited-in-place:** none
- **Evidence — deleted:** none

### Notes on confidence / contradictions

- D8 CONFIRMED primary sources: next-themes/src/index.tsx (code quoted verbatim, lines 211-227), tldraw TLLocalSyncClient.ts (code quoted), Excalidraw Issue #2791 (maintainer-referenced PR #4545), VS Code Settings Sync docs.
- D8 UNCERTAIN: Penpot (ClojureScript not surface-searchable cleanly via web-search; flagged as uncertain rather than NOT FOUND), JupyterLab (no specific evidence), Monaco (library not application — N/A in a meaningful way).
- No contradictions with prior D1-D7 findings. D8 extends D3's cross-window-stickiness axis with concrete adoption patterns.

### Drift check

- Baseline preserved: Yes.
- Stance unchanged: factual survey, not prescriptive. D8's decision-triggers framing enumerates "if-then" conditions for spec consumption rather than recommending one pattern.
- Scope boundaries respected: non-goals unchanged.
- Executive Summary churn: minimal — added one bullet.
- No rewrites of D1-D7 findings.

### Open questions / gaps

- Penpot ClojureScript deep-read — would move D8's Penpot row from UNCERTAIN to CONFIRMED/NOT FOUND. Not pursued because tldraw already establishes the design-tool-peer precedent.
- Quantitative adoption survey of storage-event usage across OSS React apps — no clean measurement; ecosystem articles treat as mainstream, which is the signal we have.
