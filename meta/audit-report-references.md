# Audit Findings: Report Reference Integrity

**Artifact:** PROJECT.md + evidence/ files
**Audit date:** 2026-04-08
**Scope:** Cross-reference all report paths cited in PROJECT.md body and evidence files against the `reports/` submodule
**Total findings:** 6 (5 high, 1 medium)

---

## High Severity

### [H1] Missing from submodule: `automerge-prosemirror-migration-assessment`

**Category:** FACTUAL
**Source:** T1 (filesystem verification)
**Location:** PROJECT.md line 93 (TQ13 — CRDT decision)
**Issue:** Report is referenced as evidence for rejecting Automerge ("12-20 week migration, 1.7MB WASM bundle") but does not exist in the `reports/` submodule.
**Current text:** `"see /reports/automerge-prosemirror-migration-assessment/"`
**Evidence:** Directory exists at `~/reports/automerge-prosemirror-migration-assessment/` (REPORT.md + evidence/ + meta/) but was never committed to the `inkeep/nick-reports` submodule.
**Status:** INCOHERENT — report cited as backing for a Locked decision is not accessible from this repo
**Suggested resolution:** Commit to `inkeep/nick-reports` and update submodule pointer. Also add to the report table (lines 548-592).

---

### [H2] Missing from submodule: `loro-ecosystem-readiness-assessment`

**Category:** FACTUAL
**Source:** T1 (filesystem verification)
**Location:** PROJECT.md line 93 (TQ13 — CRDT decision)
**Issue:** Report is referenced as evidence for rejecting Loro ("content-wipe bug #77, 1 production user") but does not exist in the `reports/` submodule.
**Current text:** `"see /reports/loro-ecosystem-readiness-assessment/"`
**Evidence:** Directory exists at `~/reports/loro-ecosystem-readiness-assessment/` (REPORT.md + evidence/) but was never committed to the submodule.
**Status:** INCOHERENT — report cited as backing for a Locked decision is not accessible from this repo
**Suggested resolution:** Commit to `inkeep/nick-reports` and update submodule pointer. Also add to the report table.

---

### [H3] Missing from submodule: `yjs-dual-key-shimmer-analysis`

**Category:** FACTUAL
**Source:** T1 (filesystem verification)
**Location:** PROJECT.md lines 75 (TQ9), 108 (TQ25)
**Issue:** Report is referenced twice — as evidence for source toggle architecture (TQ9) and for bidirectional observer sync (TQ25, "CONFIRMED by PR #6") — but does not exist in the `reports/` submodule.
**Current text:** `"See /reports/yjs-dual-key-shimmer-analysis/"`
**Evidence:** Directory exists at `~/reports/yjs-dual-key-shimmer-analysis/` (REPORT.md + evidence/) but was never committed.
**Status:** INCOHERENT — report cited as backing for two Locked decisions is not accessible
**Suggested resolution:** Commit to submodule and add to report table.

---

### [H4] Missing from submodule: `yjs-constrained-observer-sync`

**Category:** FACTUAL
**Source:** T1 (filesystem verification)
**Location:** PROJECT.md lines 75 (TQ9), 108 (TQ25)
**Issue:** Report is referenced alongside `yjs-dual-key-shimmer-analysis` for source toggle and observer sync decisions but does not exist in the `reports/` submodule.
**Current text:** `"See /reports/yjs-constrained-observer-sync/"`
**Evidence:** Directory exists at `~/reports/yjs-constrained-observer-sync/` (REPORT.md + evidence/) but was never committed.
**Status:** INCOHERENT — report cited as backing for two Locked decisions is not accessible
**Suggested resolution:** Commit to submodule and add to report table.

---

### [H5] Missing from submodule: `parcel-watcher-crdt-disk-bridge`

**Category:** FACTUAL
**Source:** T1 (filesystem verification)
**Location:** PROJECT.md line 109 (TQ26 — Disk↔CRDT bridge)
**Issue:** Report is referenced as evidence for the @parcel/watcher disk bridge implementation ("CONFIRMED by PR #6") but does not exist in the `reports/` submodule.
**Current text:** `"See /reports/parcel-watcher-crdt-disk-bridge/"`
**Evidence:** Directory exists at `~/reports/parcel-watcher-crdt-disk-bridge/` (REPORT.md + evidence/) but was never committed.
**Status:** INCOHERENT — report cited as backing for a Locked, PR-confirmed decision is not accessible
**Suggested resolution:** Commit to submodule and add to report table.

---

## Medium Severity

### [M1] Report table count will be stale after adding missing reports

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** PROJECT.md line 546
**Issue:** The text states "43 research reports inform the architectural decisions in this document." The table currently has exactly 43 entries. Once the 5 missing reports are added to the table, the count should become 48.
**Current text:** `"43 research reports inform the architectural decisions in this document."`
**Evidence:** 43 table entries + 5 body-only references = 48 unique reports referenced in PROJECT.md
**Status:** INCOHERENT (will be after fix)
**Suggested resolution:** After committing the 5 reports and adding them to the table, update the count to 48.

---

## Confirmed Claims (summary)

- **43/43 table entries verified:** Every report listed in the report table (lines 550-592) exists in the `reports/` submodule with a REPORT.md file.
- **5/5 evidence file references verified:** All report references in `evidence/*.md` files point to reports that exist in the submodule (bun-vs-node-runtime, fumadocs-full-pipeline, mdx-crdt-roundtrip-fidelity, obsidian-vs-fumadocs-component-inventory, tiptap-2026-direction-overlap).
- **5/5 missing reports located:** All missing reports exist at `~/reports/` with REPORT.md + evidence/ files — they were generated but never committed to the submodule.

## Root Cause

All 5 missing reports were produced after the last `reports/` submodule commit and reference decisions that were locked more recently (TQ13 CRDT decision, TQ9/TQ25 source toggle, TQ26 disk bridge). The reports exist locally at `~/reports/` but the submodule pointer was not updated.
