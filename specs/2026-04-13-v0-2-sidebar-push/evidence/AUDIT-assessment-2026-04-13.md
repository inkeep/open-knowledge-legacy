---
name: Audit + challenge findings assessment
description: Step 7 assess-findings output — routing each audit and design-challenge finding to apply/reopen/dismiss with evidence.
type: synthesis
sources:
  - meta/audit-findings.md
  - meta/design-challenge.md
  - packages/server/src/api-extension.ts
  - packages/server/src/file-watcher.ts
  - packages/app/src/editor/provider-pool.ts
  - node_modules/@hocuspocus/server/src/Hocuspocus.ts
  - node_modules/@hocuspocus/server/src/Document.ts
---

# Audit + Challenge Assessment (2026-04-13)

Routing each finding to APPLY (pure correction), REOPEN (user judgment), or DISMISS with evidence.

## Audit findings (11)

| ID | Severity | Verdict | Notes |
|---|---|---|---|
| H1 | HIGH | APPLIED | `__system__` bootstrap gap real. Added §9 "Server-side bootstrap" + §6 requirement row. `openDirectConnection('__system__')` on startup before broadcaster enables. |
| H2 | HIGH | **REOPEN** | Slow-arrival bursts miss 100 ms window. Conflated with Design M3. Presented to user in reopens batch. |
| M1 | MED | APPLIED | Seq recovery edge cases clarified in §9 "Sequence discipline" (regression, late-arrival, in-flight coalesce). |
| M2 | MED | APPLIED | ProviderPool pinning semantic: D14 added. Pin doesn't count toward maxSize. |
| M3 | MED | APPLIED | Persistence-skip surface expanded to all 8 audited subsystems via single `isSystemDoc()` helper. §9 "Cross-cutting skip surface" + §16 SCOPE expanded. |
| M4 | MED | APPLIED | Test location corrected to `packages/app/tests/integration/cc1-broadcast.test.ts` (existing Tier-1 harness). |
| M5 | MED | APPLIED | `__system__` reserved-name policy: D13 LOCKED. ContentFilter rejects; API returns 400. |
| M6 | MED | APPLIED | D12 phrasing corrected: in-memory but O(N) iteration, ~1-2 ms/1k files; re-open trigger widened. |
| L1 | LOW | APPLIED | Hocuspocus citation framed as "public API" not line-pinned. |
| L2 | LOW | DISMISSED | Citations within tolerance; no action. |
| L3 | LOW | APPLIED | §16 SCOPE + EXCLUDE expanded (added `main.tsx`, excluded TiptapEditor/observers/docs/cli). |

## Design challenges (7)

| ID | Severity | Verdict | Notes |
|---|---|---|---|
| H1 | HIGH | **REOPEN** | `__system__` as cross-cutting leak. Partially addressed by M3 (centralized `isSystemDoc` helper) but user should see the trade vs. 3c (thin server-wide primitive). Presented. |
| H2 | HIGH | **REOPEN** | Hybrid contract may be over-engineering; pure signal may be simpler + cheaper + match CC1 literal text better. Requires measurement of `/api/documents` response size. Presented. |
| M3 | MED | **REOPEN** (merge with Audit H2) | 100 ms window has no evidence on Linux. Suggested: measure against real `git checkout` before locking. If H2 goes pure-signal, this simplifies to plain debounce. Presented merged. |
| M4 | MED | **REOPEN** | Excluding `update` forces V0-3 to extend contract or parallel-channel. Contradicts D2. Presented. |
| M5 | MED | **REOPEN** | L1-only leaves sidebar DOM patch untested in V0-2 merge window. Suggested: add one narrow V0-2 Playwright test (~30 lines). Presented. |
| L6 | LOW | APPLIED | Contract addendum added to §9: `v: 1`, namespacing, malformed-payload policy, explicit no-auth note. |
| L7 | LOW | APPLIED | §9 ETag rejection rationale reframed honestly — primarily CC1 constraint, not independent technical rejection. |

## Route summary

- **Applied silently:** 11 findings (6 audit M/L + 3 audit H/M + 2 design L). SPEC.md updated in place; diff captured in commit.
- **Reopened to user (5 items):** Audit H2 + Design H1, H2, M3, M4, M5 — consolidated into a single presentation batch.
- **Dismissed:** 1 finding (audit L2, citations within tolerance).
