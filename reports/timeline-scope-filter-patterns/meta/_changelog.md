# Changelog

## 2026-04-20 — initial report + audit pass

- Published REPORT.md with 6 dimensions (D1-D6), 4 evidence files.
- Audit run by cold-read subagent (meta/audit-findings.md): 0 high, 5 medium, 4 low findings.
- Post-audit edits applied to REPORT.md:
  - Softened Notion "removed All/Following tabs" claim to hedged language with unconfirmed-source caveat (Finding 1).
  - Changed "10 products" to "~10 external products (plus Open Knowledge's 1P state)" for counting consistency (Finding 2).
  - Added "API-level only; UI rendering inferred, not confirmed" qualifier to Google Drive consolidation claim in Exec Summary (Finding 3).
  - Corrected `TimelinePanel.tsx:427-430` → `:426-430` in D6 (Finding 4).
  - Sharpened Dropbox framing to "Folder activity" as single feature name across three entry points (Finding 6).
  - Removed "2-10×" numeric anchor from Exec Summary Bloom-filter claim; kept qualitative framing (Finding 7).
  - Softened Linear "AND/OR combinators" claim in Exec Summary to note uncorroborated in primary docs (Finding 9).
- Finding 5 (shadow-repo-layout.ts line range) left as-is per auditor's borderline note.
- Finding 8 (Figma "first-class" phrasing) left as-is — defensible as design-read; low impact.

## 2026-04-20 — Bloom-filter enablement policy note

- Added enablement-policy discussion in D3 Implications ("not a free win" framing; three policy options as a table: init-time scheduled, lazy on-threshold, opt-in subcommand).
- Softened Exec Summary Bloom-filter bullet to remove "standard upgrade path" framing and surface the operational cost (maintenance job, split-chain growth, corruption surface, version floor).
- Updated Open Questions to mark enablement as "Deferred as of 2026-04-20" with revisit trigger (measured `git log -- <path>` latency as user-visible bottleneck).
- No evidence file changes — the technical mechanism claims in `d3-git-mechanics.md` were already correctly hedged on speedup numbers; this update concerns how/when to enable, not whether filters work.
