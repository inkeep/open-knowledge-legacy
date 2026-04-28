# Design Challenge — OK Shell-Job Runner Spec

**Date:** 2026-04-28
**Spec:** [SPEC.md](../SPEC.md)
**Reviewer:** Cold-reader pass against spec decisions D1-D22 + scope NG1-NG9.
**Note:** Sandbox policy blocked the spawned-Claude subprocess; this pass runs inline against the same conversation context. Findings are flagged with severity and recommended action.

---

## Challenge 1 [LOW] — D1 (no default agent CLI): is the principle truly load-bearing for v1?

**Spec position:** D1 LOCKED — OK ships no default agent CLI; even if 90% of users would pick Claude Code, encoding that assumption violates agent-agnostic principle and creates vendor-lock-in moral hazard.

**Independent reasoning:** The cost-benefit of "no default" is asymmetric. The friction cost for the 90% who would use Claude is one extra line of YAML (`cmd: claude`). The benefit for the 10% on Codex / Cursor / local-Ollama is being first-class instead of second-class citizens. **Asymmetric tradeoff favors no-default** — small friction for the majority buys equal-status for the minority. The principle holds.

Counter-pressure tested: would a smart-detection default (`if claude on PATH, use it; else error`) reduce friction without violating the principle? **No** — it makes Claude Code de facto privileged in OK's culture even if technically pluggable. The spec's stance is correct.

**Recommended action:** ACCEPT current design. D1 holds.

---

## Challenge 2 [MEDIUM] — D3 (SQLite-only state) + NFR claim: WAL mode isn't explicitly decided

**Spec position:** D3 DIRECTED — SQLite for state, separate file at `.open-knowledge/jobs.db`. NFR §6 says "State survives worker crash (SQLite WAL durable)."

**Independent reasoning:** "WAL durable" is asserted in the NFR but **never decided**. SQLite default is `journal_mode=DELETE` (rollback journal, not WAL). For crash safety with concurrent reads-during-write (e.g., `ok schedule status` while a job is running), `journal_mode=WAL` is required. The spec assumes WAL but doesn't lock it.

This is a **load-bearing implementation detail** — wrong journal mode means concurrent `status` reads can block writes, or worse, crash recovery becomes unreliable.

**Recommended action:** ADD a new decision D23 LOCKED specifying `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000ms` at SQLite-init time. Single line in §9 data model. Trivially adds, prevents a real implementation gap.

---

## Challenge 3 [LOW] — D17 (cron-entry indirection): failure-mode chain not surfaced as a risk

**Spec position:** D17 LOCKED — scheduler invokes `ok schedule run --once --job=<name>` (indirection), not `cmd` directly.

**Independent reasoning:** The benefits (observability, retry, idempotency) are real. The failure-mode chain isn't surfaced: what happens if `ok schedule run` itself crashes between recording `status=running` and exec-ing `cmd`? The user's actual job never runs, but `jobs.db` records it as run. The boot-time reconciliation (D18) catches this — but only on the *next* run, which could be 24h later for a daily job. **For 24 hours, the user's KB hasn't been linted but the system thinks it has.**

This is a real edge case worth a §14 risk row. The mitigation is "any cron entry that calls `ok schedule run` should also be paired with monitoring of the produced report file's mtime" — but that's downstream of the spec.

**Recommended action:** ADD a §14 risk row: "OK runner crash between status=running and cmd-exec → user job silently skipped until next scheduled run." Mitigation: stranded-row reconciliation (D18) catches this at next-run boot; document monitoring recommendation in user-facing docs.

---

## Challenge 4 [MEDIUM] — D2+D5+D22 dual-gate security: insufficient against malicious-config attacks

**Spec position:** D2 + D5 + D22 LOCKED — `OK_ALLOW_SHELL_JOBS=1` env gate (off by default), explicit `launchctl load` step (no auto-enable), env baked into generated scheduler config with prominent warning.

**Independent reasoning:** The gate model protects against accidental-execution and against a misconfigured scheduler enabling itself. **It does NOT protect against:** a malicious wiki edit (e.g., a compromised agent or a malicious PR that lands in the user's KB) modifying `.open-knowledge/config.yml` to add a job whose `cmd` does something harmful. Once installed and enabled, that job will run.

The attack surface: if anyone (agent, teammate via PR, automated process) can write to `.open-knowledge/config.yml` AND scheduled jobs are enabled, they can RCE the user's machine on the next cron fire.

Mitigations the spec doesn't propose but should consider:
- **Job-config integrity check**: `automation.jobs[]` is gated by a separate signature / hash file, refused if changed without explicit re-acknowledgment.
- **Documented threat model**: explicitly state in docs that `automation.jobs[]` is treated as trusted code; users on shared repos should review job changes in PRs.
- **`config.yml` modification audit**: log every config-load with a hash; surface diffs in `ok schedule status`.

The first is heavy for v1. The second + third are cheap.

**Recommended action:** ADD §14 risk row: "Malicious modification of `automation.jobs[]` after install → unintended cmd executed at next cron fire." Mitigation: documented threat model ("automation.jobs[] is trusted code; review changes like you'd review CI configs"). Consider for v2: config-hash audit. **Don't add config integrity verification to v1 scope.**

---

## Challenge 5 [MEDIUM] — D13 (v1 lint scope): hollow MVP risk for users who expect "knowledge lint"

**Spec position:** D13 LOCKED — v1 `ok lint` wraps 5 existing graph-health endpoints + redlinks; net-new check primitives (source traceability, contradictions, etc.) are separate specs (NG5).

**Independent reasoning:** The pragmatic-MVP framing is correct, but there's a **positioning risk**: users hearing "OK ships `ok lint`" will reasonably expect it to detect what the broader Karpathy lint vocabulary calls "lint" — including source-traceability ("does every claim cite its source?"), which the prior research explicitly identifies as the highest-stakes content-quality rule.

If `ok lint` ships and a user runs it on a KB full of unsourced claims and gets ZERO findings, they will reasonably conclude "my KB is clean" — when in fact the most important checks haven't run.

The fix isn't expanding v1 scope (that's a slippery slope to NG5 violation). The fix is **clarity in docs and CLI output**:
- `ok lint --help` should explicitly say "v1 scope: graph integrity (links + orphans + redlinks). Source traceability, contradictions, and 8 other checks are separate commands shipped in future versions."
- The default human-readable output should include a footer: "Checks run: dead-links, orphans, hubs, redlinks. Not yet checked: source traceability, contradictions, [...] (future). See `ok lint --help` for roadmap."
- The markdown report should list "What was NOT checked in this run" alongside the findings.

**Recommended action:** ADD a small FR (FR23 or extension to FR17): `ok lint` output (human, JSON, markdown) MUST surface what checks ran AND what checks are not yet implemented. Prevents the "looks clean, isn't" failure mode without expanding scope. This is the **most important challenge finding** — addresses a real user-trust risk.

---

## Challenge 6 [LOW] — Hocuspocus-extension shape as alternative to runner

**Spec position:** §9 Alternatives Considered lists Option A (Hocuspocus extension as runner) as rejected because Hocuspocus is OK's CRDT server, not a job runner.

**Independent reasoning:** The "live-knowledge-lint" extension (Phase 5 in the integration architecture report) does in-process per-doc-change lint. That's a different workload from scheduled deep audit, but they could share the lint engine. Is `ok lint`'s aggregation logic shareable between runner-driven and extension-driven contexts?

**Recommended action:** Not a v1 concern. The shared types (D15 `Finding` + Zod schema) already enable future code-sharing between extension and CLI. Note in §15 Future Work that Phase 5 should reuse `Finding` schema. Doesn't affect v1 scope.

---

## Challenge 7 [MEDIUM] — Personas P1/P2 framing assumes terminal access; G1 cross-host claim partially overstated

**Spec position:** G1 — "Cross-host automated bookkeeping. Make scheduled lint / maintenance work for users on every OK target host — including hosts with zero automation hooks (Claude Desktop, Cowork, Claude.ai web)."

**Independent reasoning:** The runner runs on the user's **OS**, not on the agent host. Setup requires `OK_ALLOW_SHELL_JOBS=1` in shell + `ok schedule install` in terminal + `launchctl load` in terminal. **Claude Desktop / Cowork / Claude.ai web users still need terminal access to set this up.** The deliverable (markdown reports in `.open-knowledge/lint-reports/`) is consumable in any host, but the *setup* is not.

The spec is technically correct — automated bookkeeping happens regardless of which host the user uses to read the output. But G1 reads as if the runner is host-portable; it's actually OS-portable, with output consumable on any host.

**Recommended action:** Rewrite G1 for clarity: "Cross-host automated bookkeeping output. The runner executes on the user's OS (cron / launchd / systemd / GH Actions); the produced reports are consumable from any OK target host (including hosts with no terminal access — Claude Desktop, Cowork, Claude.ai web, where the user reads reports inside their interactive session)." Distinguishes setup-requires-terminal from output-consumable-anywhere.

---

## Challenge 8 [LOW] — D14 (`--strict` default): cron-email failure-spam risk

**Spec position:** D14 LOCKED — `--strict` default exits 1 on any finding. `--no-strict` opts out.

**Independent reasoning:** Many cron / launchd / systemd setups send email-on-non-zero-exit. A user who installs `ok lint` as a nightly via cron and has 5 orphan pages (a normal/healthy state for an active KB) will get email every night. **The default UX choice may be hostile for cron use.**

The spec's example YAMLs use the default `--strict`. If users follow the example, they get spam. Mitigation: example YAMLs in `examples/scheduling/` should explicitly use `--no-strict` for the cron-based examples; `--strict` is right for hook integration but wrong for cron.

**Recommended action:** Update FR22 (bundled examples) to specify `--no-strict` is used in the deterministic-only YAML / bash example by default. Document in the `ok lint --help` text: "Use `--strict` (default) for CI/hooks; use `--no-strict` for cron/launchd to avoid failure-spam on expected findings."

---

## Challenge 9 [LOW] — D19 (`--dry-run` credential redaction): heuristic not specified

**Spec position:** D19 LOCKED — `--dry-run` prints substituted `cmd argv...` and env block with credentials redacted to `<sensitive>`.

**Independent reasoning:** "Credentials" is undefined. Without a spec, the implementer might:
- Redact only `*_API_KEY` (misses `*_TOKEN`, `*_SECRET`, `PASSWORD`, etc.)
- Redact too much (redacts `LANG`, `PATH`, etc.)
- Redact based on a fixed list (misses user-defined credential vars)

A safe default: redact env vars matching regex `/^(.*_)?(KEY|TOKEN|SECRET|PASSWORD|PASSPHRASE|CREDENTIAL|AUTH)$/i`. Override via `automation.dry_run.redact_pattern` config.

**Recommended action:** ADD a small FR or extend D19 with the redaction heuristic + override. Single regex line. Prevents implementer ambiguity.

---

## Challenge 10 [LOW] — Q2 (where prompt templates ship) deferred; could create install friction

**Spec position:** Q2 marked deferrable, currently open. Recommendation in Q2: "package both in npm package and surface in docs. `npx @inkeep/open-knowledge schedule examples` could copy them to project."

**Independent reasoning:** If the bundled bash example (`examples/scheduling/scripts/lint-deterministic.sh`) is in the npm package but not auto-copied, the user needs to find it. With turn-by-turn install instructions ("After `npm install`, copy `node_modules/.bin/...` to `/usr/local/bin/`..."), this is friction.

A single `ok schedule install --bundle-examples` flag (or `ok schedule install-examples`) that copies examples into the project's `.open-knowledge/examples/` would make the install-day path frictionless.

**Recommended action:** RESOLVE Q2 LOCKED — ship `ok schedule install-examples [--target-dir <path>]` as a v1 sub-command that copies the bundled examples into the user's project. ~30 LOC. Big UX win.

---

## Summary of recommended actions

| # | Severity | Recommendation | Spec impact |
|---|---|---|---|
| 1 | LOW | Accept D1 — agent-agnostic principle holds | None |
| 2 | MEDIUM | Add D23 LOCKED specifying `journal_mode=WAL` + `synchronous=NORMAL` + `busy_timeout=5000ms` | New decision; trivial |
| 3 | LOW | Add §14 risk row for runner-crash-between-status-and-exec | New row in risks table |
| 4 | MEDIUM | Add §14 risk row for malicious-config-edit attack; document threat model | New row + docs note |
| 5 | **MEDIUM (highest priority)** | Add FR23: `ok lint` output MUST surface what checks ran + what's not yet implemented | New FR; medium impact |
| 6 | LOW | Note in §15 Future Work that Phase 5 lint extension should reuse `Finding` schema | Note only |
| 7 | MEDIUM | Rewrite G1 to distinguish setup-requires-terminal from output-consumable-anywhere | Goal text edit |
| 8 | LOW | Update FR22 bundled examples to use `--no-strict` for cron use; document `ok lint --help` guidance | Examples + docs |
| 9 | LOW | Add redaction heuristic to D19 (regex pattern + config override) | Extend D19 |
| 10 | LOW | Resolve Q2 LOCKED with `ok schedule install-examples` sub-command (~30 LOC) | New command, small |

**Net effect:** No decisions reopened. 1 new decision (D23 WAL config). 1 new functional requirement (FR23 lint-scope-disclosure). 2 new risk rows. 2 doc/UX clarifications. 1 new sub-command (Q2 resolution). All additions are small (~50 LOC implementation impact).

The spec's load-bearing principles (D1 agent-agnostic, D2/D5/D22 dual-gate, D3 SQLite-only, D13 lint-scope-bounded) all hold up. The challenger pass identified one user-trust risk (Challenge 5 — lint-scope disclosure) that's worth the most attention; the others are tightening.
