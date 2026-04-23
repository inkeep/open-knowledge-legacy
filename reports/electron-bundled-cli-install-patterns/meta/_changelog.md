# Changelog — electron-bundled-cli-install-patterns

Append-only record of post-initial-write changes to this report. Maintained in sync with `meta/audit-findings.md`.

---

## 2026-04-21 — Audit-driven corrections

Per `meta/audit-findings.md` (audit agent run at commit `169ac41a`), applied:

### High severity

- **H1 (coherence)** — `evidence/application-to-open-knowledge.md`: added a post-D14 breadcrumb on the "Bun-in-CLI audit" gotcha (lines 88–89) and struck the retired `✋ #2` item from the "M6 checklist additions" list. D13 and D14 now read coherently.
- **H2 (factual)** — REPORT.md D15 finding + Exec-Summary bullet and `evidence/npm-electron-coexistence.md` Case B: corrected the "npm silently overwrites" framing. npm's actual default is `EEXIST` — both sides are symmetric-fail-safe; only `--force` (npm) or explicit Replace-click (Electron) stomps. The `fs.lstat` guard recommendation stands for ergonomic reasons, but is no longer framed as defending against npm's stomp (which doesn't happen by default).

### Medium severity

- **M3 (factual)** — `evidence/sublime-atom-github-desktop.md`: corrected Atom's `apm` symlink target path from `apm/bin/apm` to `apm/node_modules/.bin/apm`.
- **M4 (factual/coherence)** — REPORT.md lineage prose (lines 43, 60, 115, 166): reframed "~10 years" from a single undifferentiated number to "~10 years under VS Code (2015/2016–present) + ~7-year Atom overlap (2014–2022) = ~12 years combined." Matches the internal prose already in `evidence/sublime-atom-github-desktop.md`.
- **M5 (coherence / factual)** — `evidence/application-to-open-knowledge.md`: corrected the wrapper-symlink target path from `Contents/Resources/app.asar.unpacked/cli/bin/ok.sh` (the D52 spec's phrasing, which misuses the `asarUnpack` mechanism) to `Contents/Resources/cli/bin/ok.sh` (what electron-builder's `extraResources` actually produces, per D16's concrete implementation). D13 and D16 now agree on the path; flagged the D52 spec wording as worth post-hoc-correcting on a future /ship pass.
- **M6 (quantitative)** — `evidence/m6-implementation-design.md` §7 + REPORT.md D16 LOC claim: replaced the "~300 net lines" estimate with a breakdown table summing to ~435 lines, accounting for `cli-install.test.ts` (~60) and `packages/desktop/README.md` (~40) that were in the file inventory but missing from the LOC math.

### Low severity

- **L7** (prose) — `evidence/vscode-pattern.md`: replaced "Symlink/copy placed at `/usr/local/bin/code`" with "Symlink placed at…" plus a short clarification that the wrapper's `app_realpath` requires a symlink (not a copy) to function.

### Low severity — NOT fixed

- **L8** (cosmetic) — `evidence/vscode-pattern.md`: the quoted `code.sh` content was verified byte-accurate by the audit; only deviation is spaces-vs-tabs indentation (Markdown rendering convention). Skipped per "Fix only if trivial" policy — the content is correct and readers don't see a functional difference.

### Confirmed by the audit (unchanged)

- VS Code `code.sh` content byte-accurate.
- VS Code issue #209356 / #213909 disposition verified.
- SIP classification of `/usr/local/bin` (unprotected) vs `/usr/bin` (protected) verified.
- `ELECTRON_RUN_AS_NODE=1` behavior verified against Electron docs.
- D14 Bun-import audit independently replicated — zero matches confirmed.
- All cross-referenced reports and specs resolve on disk.
- Cursor's inheritance of the VS Code install action confirmed from community reports + fork behavior.

The audit report itself lives at `meta/audit-findings.md` for future reference.
