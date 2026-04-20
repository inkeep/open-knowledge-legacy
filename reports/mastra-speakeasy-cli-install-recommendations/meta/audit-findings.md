# Audit Findings — mastra-speakeasy-cli-install-recommendations

**Date:** 2026-04-20
**Auditor:** general-purpose subagent (audit pass)
**Artifact:** REPORT.md + 7 evidence files (d1-d7)

## Summary

Report is well-evidenced, internally consistent, and calibrated. Every D-section finding in REPORT.md maps to a supporting evidence file with CONFIRMED confidence and verbatim snippets. Confidence-prose alignment is solid: uncertainties ("Mastra may not ship completions; not inspected", "Speakeasy auth mechanism is not pinned") are carried forward from evidence into the Limitations section without overclaiming. No stats drift across duplicated numbers. A handful of minor phrasing choices merit a look, but nothing blocks shipping.

## High-severity findings (fix before shipping)

None.

## Medium-severity findings (fix if easy)

**M1. D5 Executive Summary slightly understates auth storage path security.**
REPORT Executive Summary says credentials are stored "at `~/.mastra/credentials.json` (mode 0600)." Evidence d5 shows the directory is created with `mode: 0o700` AND the file with `mode: 0o600` — both are load-bearing for the security posture (a 0700 dir prevents other-user `ls` of the credentials file). Not wrong; just partial. **Recommendation:** append "(directory 0700)" or leave as is — low impact.

**M2. D5 editor-MCP enumeration collapses two Cursor options into one.**
REPORT lists "Cursor/Windsurf/VS Code/Antigravity" (4 editors). Evidence d5 shows the raw enum is `cursor | cursor-global | windsurf | vscode | antigravity` (5 options, 4 editors — the split matters because `cursor-global` writes to `~/.cursor/mcp.json` and `cursor` writes to `.cursor/mcp.json`). REPORT is faithful at the editor level but loses the local-vs-global distinction. **Recommendation:** no change needed — 4-editor framing is correct and more readable.

## Low-severity findings (note for awareness)

**L1. "4-way tab switcher" phrasing is technically fine but "4-PM tab switcher" would be more precise.**
REPORT D1 says "a 4-way tab switcher" and "inside a PM tab switcher (npm → pnpm → yarn → bun)" — both accurate. Minor nit; no action.

**L2. Cross-cutting Pattern #5 generalizes a Speakeasy-only reason to both vendors.**
"Plausible reasons: shell completions mitigate the typing cost" — only Speakeasy ships completions per evidence d7. Mastra's reason is left unexplored. The "plausible reasons" hedge keeps this from being wrong. **Recommendation:** no action; phrasing is appropriately soft.

**L3. D6 REPORT drops the "~1GB+ image" size estimate from evidence d6.**
Evidence d6 notes the Speakeasy Action image is "\~1GB+ given all toolchains." REPORT calls it "heavy but self-contained" without the number. Dropping speculative sizing is actually the right call (the "\~1GB+" is not independently verified in evidence), so this is a feature, not a bug.

**L4. D7 shell-completion inspection asymmetry acknowledged in both.**
REPORT says "Mastra may not ship completions; not inspected" — evidence d7 confirms exact same caveat. Good confidence-prose alignment. No action.

**L5. Report uses em-dashes inside the D4 finding's markdown link anchor text.**
`[speakeasy.com ...](...install.sh)[`VERSION=`](...install.sh)[ env var](...install.sh)` appears as three adjacent links wrapping "install.sh supports a `VERSION=` env var." Renders fine; slightly awkward source. Cosmetic only.

## What passed

- **Every Finding header** in REPORT.md (D1-D7) links to a concrete evidence file with matching confidence labels (all CONFIRMED).
- **Verbatim snippets** present throughout evidence: `.goreleaser.yaml` disclaimer, `npm view @mastra/cli` 404, `install.sh BINARY_NAME` default, `speakeasy update` doc quote, peer-dep check lines from `dev.ts`, `@clack/prompts` 5-prompt flow, credentials file mode, Mastra CI snippet.
- **Stats consistency:** `@v15` action tag, Node `22.13.0` engines floor, 4-way PM tab order, 5-entry Speakeasy install ordering — all consistent across REPORT + evidence.
- **Negative searches documented** in every evidence file (e.g. "no `mastra update` command", "no `speakeasy` Docker image", "no `@speakeasy-api/cli` package"). Strong factual hygiene.
- **Gaps called out up-front:** Limitations & Open Questions section explicitly notes Speakeasy auth mechanism not pinned, Mastra telemetry opt-out unknown, both vendors' rollback un-documented — matches the "Gaps / follow-ups" blocks in each evidence file.
- **D8 descoping** handled correctly: rubric table strikes D8 with "dropped mid-run at user request"; Limitations section mirrors this. Not flagged as missing per audit instructions.
- **No overclaiming.** Every inference is either labeled ("Plausible reasons...", "...not inspected", "likely OS keychain") or backed by code/doc quote.
- **Cross-cutting patterns** don't introduce new claims beyond what individual D-sections support.
