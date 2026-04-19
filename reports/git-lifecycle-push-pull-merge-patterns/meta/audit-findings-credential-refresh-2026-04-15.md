# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/reports/git-lifecycle-push-pull-merge-patterns/REPORT.md
**Scope:** New content from credential helper token refresh update pass (2026-04-15) only
**Audit date:** 2026-04-15
**Total findings:** 4 (1 high, 2 medium, 1 low)

---

## High Severity

### [H1] Finding: Bitbucket refresh token TTL contradicts official docs and the existing report

**Category:** FACTUAL + COHERENCE
**Source:** L1 (cross-finding contradiction), T4 (web verification)
**Location:** Per-forge refresh token table (line ~503), evidence file Finding 5 table (line ~144 of evidence)
**Issue:** The new per-forge table states Bitbucket refresh token TTL is "3 months (rolling)." This contradicts (a) the existing report's own "Sustained Auth Lifecycle" table at line 436 which says "Refresh token (no expiry)" and (b) Bitbucket's official OAuth2 documentation which states refresh tokens do not expire. The "3 months" figure does not appear in any Bitbucket official source found via web search. The closest match is that Bitbucket workspace admins can configure *access token* expiry at 90/180/365 days — a different mechanism applying to access tokens, not OAuth refresh tokens.
**Current text:** "Bitbucket | 1 hour | 3 months (rolling) | Yes | **Yes**"
**Evidence:** [Bitbucket OAuth2 docs](https://developer.atlassian.com/cloud/bitbucket/oauth-2/) — refresh tokens have no expiry. [Atlassian community thread](https://community.developer.atlassian.com/t/oauth2-token-lifetime-expiration-clarification/22136) — "there is no expiry time for refresh token." Existing report line 436: "Refresh token (no expiry)."
**Status:** CONTRADICTED
**Suggested resolution:** Change the Bitbucket refresh TTL to "No expiry" in both the new per-forge table (body line ~503) and the evidence file table (evidence line ~149). Also verify whether the "3 months unused" qualifier in the evidence file's table (evidence line ~149) has any basis — if not, remove it entirely. The existing report's characterization at line 436 ("Refresh token (no expiry)") is consistent with official docs and should be treated as the correct value.

---

## Medium Severity

### [M1] Finding: git-credential-oauth LOC understated in body relative to evidence and source

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** Executive summary (line ~108), body (line ~514), evidence file (line ~114)
**Issue:** Three different LOC figures appear across the artifact for git-credential-oauth:
- Executive summary and body: "~500 LOC"
- Evidence file: "586 LOC"
- Actual `main.go` as of 2026-04-15: 658 lines

The body's "~500 LOC" understates the evidence's own measurement by 15%. The evidence's "586 LOC" may have been accurate when captured but the file has since grown. The body's tilde (~) signals approximation, but the gap between ~500 and the actual 658 is material enough that a reader relying on the estimate for scoping decisions would be misled.
**Current text:** (exec summary) "git-credential-oauth's protocol-level stateless pattern (~500 LOC, 14 forges)" / (body) "A ~500 LOC Go CLI" / (evidence) "586 LOC, 2 dependencies"
**Evidence:** [git-credential-oauth main.go](https://github.com/hickford/git-credential-oauth/blob/main/main.go) — 658 lines as of 2026-04-15.
**Status:** INCOHERENT
**Suggested resolution:** Update the evidence file to "~660 LOC" (or re-measure). Update body and exec summary to match the evidence (e.g., "~650 LOC" or "~600 LOC" — any figure that doesn't understate the evidence by >10%).

---

### [M2] Finding: Scoping assessment table uses prescriptive language inconsistent with report's factual stance

**Category:** COHERENCE
**Source:** L6 (stance consistency)
**Location:** "Scoping assessment for a new credential helper" table (lines ~516-524)
**Issue:** The scoping assessment table uses product-advisory language: "Tolerable for v1," "essential," "~150 LOC for the protocol-level approach," "Can refresh be delegated instead of built-in?" These read as recommendations directed at a builder making implementation decisions. The rest of the report maintains a factual/analytical stance — reporting what exists, how things work, and what the landscape looks like without advising what to build. This table breaks that stance.
**Current text:** "Is re-auth-on-expiry (no refresh) acceptable for non-GitHub forges? | **Tolerable for v1** but noticeably degraded." / "What's the implementation delta to add refresh? | **~150 LOC** for the protocol-level approach" / "Graceful degradation [...] is essential."
**Evidence:** The report's other sections consistently describe capabilities, patterns, and gaps without advising implementation choices. The existing D5 sections, the error taxonomy (D6), and the sync-engine comparisons all maintain factual stance.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) reframe the scoping table as factual observations ("GCM and git-credential-oauth both implement refresh, setting a baseline; the protocol-level approach is ~150 LOC; users on Git <2.45 on macOS would not benefit from persistent refresh token storage") or (b) explicitly label the table as an editorial/scoping addendum, distinguishing it from the factual body. Option (a) is preferred for consistency.

---

## Low Severity

### [L1] Finding: "All non-GitHub forges use single-use refresh tokens" stated unconditionally when Forgejo/Codeberg is inferred

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** Body line ~508, evidence file line ~152
**Issue:** The body states "All non-GitHub forges use single-use refresh tokens (token rotation on each exchange)" as an unconditional universal claim. However, the evidence file's per-forge table marks Forgejo/Codeberg refresh token single-use behavior as "Yes (inferred)" — derived from shared Gitea codebase, not confirmed from Forgejo documentation or source. The Limitations section (line ~1074) does note this gap, but the body's blanket assertion does not carry the conditionality.
**Current text:** "All non-GitHub forges use single-use refresh tokens (token rotation on each exchange)."
**Evidence:** Evidence file line ~152: "Forgejo/Codeberg | 1 hour (configurable) | ~30 days (inferred) | Yes (inferred)". Limitations line ~1074: "Forgejo/Codeberg token behavior: Inferred from shared Gitea codebase."
**Status:** INCOHERENT
**Suggested resolution:** Add "confirmed" qualifier: "All confirmed non-GitHub forges use single-use refresh tokens" or "Every non-GitHub forge examined uses single-use refresh tokens (Forgejo/Codeberg inferred from shared Gitea codebase)."

---

## Confirmed Claims (summary)

**Git version/commit claims (T4 — web verification):**
- `password_expiry_utc` introduced in Git 2.40 by commit `d208bfdfe` (M Hickford) — CONFIRMED via git/git source
- `oauth_refresh_token` introduced in Git 2.41 by commit `a5c76569e` (M Hickford) — CONFIRMED via git/git source
- `credential_clear_secrets()` frees `password` and `credential` but preserves `oauth_refresh_token` and `username` — CONFIRMED via git/git `credential.c` source
- Git 2.46 added multi-stage auth fields (`state[]`, `continue`, `authtype`, `credential`) — CONFIRMED
- osxkeychain requires Git 2.45 for both fields — CONFIRMED via hickford/git-credential-oauth#20
- `credential-store` never gained support for either field — CONFIRMED via git/git source
- Ubuntu 22.04 ships Git 2.34 — CONFIRMED (package: 1:2.34.1-1ubuntu1.x)
- Ubuntu 24.04 ships Git 2.43 — CONFIRMED (package: 1:2.43.0-1ubuntu7.x)

**Per-forge token claims (T4/T5 — web verification):**
- `gho_` is the correct prefix for GitHub OAuth App tokens — CONFIRMED via GitHub blog
- GitHub App user tokens: 8h access, 6mo refresh, single-use — CONFIRMED via GitHub docs
- GitHub App installation tokens: 1h hard expiry — CONFIRMED via GitHub docs
- GitLab 2h hardcoded access token expiry — CONFIRMED
- GitLab concurrent refresh race condition documented by HashiCorp — CONFIRMED (exact article URL matches)
- Azure DevOps OAuth sunset 2026, no new apps since April 2025 — CONFIRMED via Microsoft blog
- Bitbucket app passwords removed June 2026 — CONFIRMED via Atlassian blog

**Implementation claims (T4 — web verification):**
- GCM PR #1464 open since Nov 2023, unmerged — CONFIRMED
- GCM Issue #2059 opened Sep 2025 — CONFIRMED
- GCM Issue #789 `blocked-external-dependency` — CONFIRMED
- git-credential-oauth has exactly 2 direct dependencies (`golang.org/x/oauth2`, `rsc.io/qr`) — CONFIRMED via source
- git-credential-oauth supports 14+ pre-configured forge hosts — CONFIRMED (source shows ~15 entries)
- Chained helper architecture (storage before generating) — CONFIRMED via git docs and source

**Cross-section consistency:**
- Executive summary bullet accurately reflects the detailed section content — CONFIRMED
- Token Refresh brief subsection correctly cross-references the deeper subsection — CONFIRMED
- Limitations section appropriately scopes the gaps — CONFIRMED

## Unverifiable Claims

- **Git 2.40+ adoption ">60-70% by mid-2026"** — No authoritative public source publishes git client version distribution. The evidence file labels this INFERRED and the body hedges it, but the specific range is unverifiable. Checked: Stack Overflow Developer Survey (git usage only, no version breakdown), GitHub Octoverse, git-scm.com. NOT FOUND.
- **~150 LOC implementation estimate for refresh** — This is a forward-looking estimate based on the git-credential-oauth reference implementation. Not verifiable without building it. Plausible given the ~10 LOC refresh exchange in git-credential-oauth, but unverified.
- **wincred Git 2.41/2.44, libsecret Git 2.43/2.43 version thresholds** — Sourced from hickford/git-credential-oauth#20. Not independently verified against git/git changelogs for each storage helper. The issue is the most authoritative community-maintained matrix but is not an official git project document.
