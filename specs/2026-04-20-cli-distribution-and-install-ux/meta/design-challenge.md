# Design Challenge Findings — 2026-04-20-cli-distribution-and-install-ux

**Date:** 2026-04-20
**Challenger:** general-purpose subagent (design challenge pass)
**Artifact:** specs/2026-04-20-cli-distribution-and-install-ux/SPEC.md
**Total findings:** 7 (2 High, 3 Medium, 2 Low)

## Summary

Design holds up well on the load-bearing 1-way-door decisions (D2, D5, D6, D8 — all have strong rejection rationale in the Decision Log and matching evidence in the research report). The spec's weakest seams are (a) its *framing* as a codification spec — half the decisions are DIRECTED/Future Work, not LOCKED, and the codification value is asymmetric across them — and (b) two Future Work items (D13 Cask ownership/cadence, D14 vendor non-selection) that are "Explored" but leave operationally load-bearing gaps. The `ok` alias (D1) is defensible on collision evidence but the spec under-plans for migration optionality given its "NEVER revisit" posture (NG5). Strongest sections: the D3 reconciliation framing, the D5/D8 rejection of postinstall-CLI, and the NG1-NG4 anti-pattern closure.

## Major challenges (worth discussing)

### [H] 1. Codification framing mixes LOCKED facts with DIRECTED judgments — Option A rejection is under-argued

**Location:** §1 Resolution (lines 26-27), §9 Alternatives Considered (lines 188-192), §10 Decision Log (entire)

**Issue:** The spec's own decision shape undermines the "durable record" framing. Of 14 decisions, only 4 are LOCKED (D1 already-shipped, D2 current-state, D3 breadcrumb, D4 current-state); 8 are DIRECTED NEVER/NOT NOW/NOT UNLESS (durable non-goals that belong in AGENTS.md or a non-goal registry); 2 are DIRECTED Future Work (D13, D14 — not yet decisions at all). A spec is justified when there's genuine design to codify. The Decision Log's load-bearing design content reduces to: (1) D3 reconciliation text, (2) D14 telemetry playbook sketch.

**Current design:** "fragments the 8 decisions across 3 artifacts; no single place to look for CLI distribution/install/telemetry posture; makes it easy to miss one" (line 189).

**Alternative:** Three-file amendment pattern: (a) reconciliation breadcrumb on 2026-04-08 spec (D3), (b) a new `specs/2026-04-11-electron-desktop-app/` addendum or AGENTS.md §CLI-Distribution-Non-Goals enumerating D5-D12 as bullets with trigger conditions, (c) a single `specs/2026-04-20-telemetry-implementation/` Future Work sketch for D14 only. The "single place to look" claim is undermined by the fact that P1 contributors already must read the parent Electron spec for G5/G9 + NG2/NG3 — two specs, not one.

**Trade-off:** Gained: reduced spec-count, lighter amendment cost, non-goals live next to the code they constrain. Lost: the 8 items don't share a changelog; if the whole posture needs to shift (e.g., cloud-SaaS pivot), there's no single file to amend.

**Status:** CHALLENGED. Option A's rejection (line 189) deserves explicit evidence that the three-artifact fragmentation has caused or would cause a concrete failure — right now it's asserted, not demonstrated. The user rejected Option A during scope confirmation (line 191 on Option C), but the spec should record *why* — "user wants telemetry included as Future Work" doesn't address Option A directly.

**Suggested resolution:** Either (i) explicitly tie Option A rejection to a past drift incident ("last time we dispersed non-goals, X happened"), or (ii) accept the challenge and collapse to the three-file pattern. If neither, document that the chosen shape is a maintenance bet.

---

### [H] 2. D13 Homebrew Cask "auto_updates true" directive is not self-sustaining

**Location:** §10 D13 Implications column (line 210), §15 Future Work Explored "Recommended approach" (lines 294-299), §12 A3 (line 233)

**Issue:** `auto_updates true` in a Homebrew Cask tells `brew upgrade --cask` to skip its own upgrade path and trust the app's internal updater — but it does **not** remove the maintenance burden of the cask formula itself. Each new release still requires a `Casks/open-knowledge.rb` PR updating `version`, `url`, and crucially `sha256`. A3 (line 233) claims "activatable in ~1 PR once DMG exists. No additional infrastructure needed (e.g., no automated homebrew-cask version-bump workflow required at launch)" — this is correct for the first submission but wrong for ongoing operation.

**Current design:** D13 Triggers: "V0-20 ships signed DMG AND GitHub Release URL pattern is stable. Expect activation within 7 days of those conditions." No mention of ongoing SHA256 rotation, no ownership for the community cask, no CI automation for the bump PR.

**Alternative:** Either (a) maintain the cask as first-party inside the inkeep org (`inkeep/homebrew-cask` tap) with a post-release GitHub Action that opens the bump PR automatically — several reference apps in the Electron ops report do this — or (b) explicitly accept community-maintained cask with the risk that cask version lags DMG releases by weeks (community-maintained casks for Claude Desktop historically lag by 1-2 weeks per the Electron ops report, line 302).

**Trade-off:** Gained: first-party tap eliminates drift risk + keeps electron-updater as the true update path. Lost: one more release-pipeline surface to own.

**Status:** CHALLENGED. The D13 sketch is implementation-ready for the *first* cask submission but silently incomplete for ongoing operation. "Spec owner" as Homebrew Cask risk-mitigation owner (line 286) conflates two kinds of work.

**Suggested resolution:** Add a D13 sub-decision: "Who owns cask SHA bumps?" with options (community-maintained vs first-party tap vs electron-builder's `publish` config auto-opening the PR). This should resolve before the D13 trigger fires, not at trigger-fire time.

## Minor challenges (worth noting)

### [M] 3. D2 CLI-stays-npm-only: Bun #29120 treated as permanent blocker, not tracked

**Location:** §10 D2 (line 199), research report D8 Finding 5 (quoted via evidence report)

**Issue:** D2 locks CLI to npm-only distribution. The research report cites Bun #29120 (macOS code-signature truncation) as the reason single-file-bundle is "NOT production-ready." If #29120 resolves (open but actively worked), the calculus for a Bun-compiled second-channel CLI changes — specifically, offline/corporate/air-gapped personas (Noted in §15) get a viable serving path that npm cannot cleanly address. D2 does not carry a revisit-trigger for this fix.

**Current design:** D2 rationale: "Different personas, different channels. Mastra's npm-only pattern is the correct fit for Node/TS CLIs." Reversibility: "Reversible if a driver emerges (unlikely)."

**Alternative:** Add explicit trigger: "Revisit if Bun #29120 resolves AND a corporate/air-gapped install request materializes (§15 Noted)." Keeps D2 LOCKED today but makes the reversal-signal observable.

**Status:** CHALLENGED on trigger specificity only — the LOCKED decision itself holds.

### [M] 4. D14 vendor non-selection is a real constraint gap, not just latitude

**Location:** §10 D14 (line 211), §11 Q3 resolution (line 225), §15 Future Work Explored Telemetry (lines 313-314)

**Issue:** D14 locks POSTURE (opt-in, DO_NOT_TRACK, crash/usage split) but leaves VENDOR to trigger-time. Q3 resolution says "no single vendor is ecosystem-dominant." Fair. But the posture constraints meaningfully narrow the vendor set — a vendor that ignores DO_NOT_TRACK, doesn't expose debug-mode hooks, or forces SaaS-hosted-only is incompatible. Mastra's PostHog shows unconditional collection is feasible with that vendor, but D14 doesn't tell the trigger-time implementer which vendors can satisfy all constraints. When the trigger fires, they will re-derive the compatibility matrix.

**Current design:** "The activation-time implementer decides based on current GDPR posture, pricing, team preference, and whether self-hosting is worth the operational cost" (line 313).

**Alternative:** Enumerate known-compatible vendors + known-incompatible — e.g., "PostHog self-host / PostHog Cloud EU satisfy; vendor X does not expose debug-mode payload capture; VS Code's Azure App Insights is a reference but not OSS-consumable." Even 3-4 bullets would turn D14 from "sketch" into "selection matrix."

**Status:** CHALLENGED. Low-cost addition; high-leverage at trigger-time.

### [M] 5. D10 `ok update` trigger ("user-reported confusion") is unobservable

**Location:** §10 D10 (line 207), NG7 (line 51), §15 Identified (lines 324-327)

**Issue:** Trigger is "User-reported confusion about how to upgrade, OR installed-version drift causes support tickets." There is no issue-label convention, no ownership for spotting the pattern, no counter. Given the spec's own success metric is "citation count" (line 131), the D10 trigger risks never firing even when it should — because nobody is watching for it.

**Current design:** Relies on ad-hoc reviewer judgment.

**Alternative:** Tie trigger to an observable artifact: "N GitHub issues labeled `install-upgrade-confusion` within any 90-day window" or "any npm support-workflow asking how to upgrade." Assigns implicit ownership to whoever triages issues.

**Status:** CHALLENGED. Applies equally to D11 completions trigger ("subcommand count crosses ~10").

### [L] 6. D1 `ok` alias "NEVER revisit" (NG5) closes a door that may need reopening

**Location:** §3 NG5 (line 47), §10 D1 (line 198), §16 ASK_FIRST (line 367)

**Issue:** NG5 says "Revisit: never — removing `ok` breaks user muscle memory." The cli-command-name-ok-okb report itself notes `ok` is "a short prefix for many English words a user may have as aliases or scripts. Not a hard collision; only a minor autocompletion-noise concern." At global scale (thousands of users), soft-collision reports *will* emerge — users who have `alias ok='...'` or scripts named `ok` in their PATH. The spec has no plan for what to do when a credible collision report lands.

**Current design:** Lock the alias, treat removal as spec amendment requiring "user-communication plan."

**Alternative:** Add a latent contingency: "If collision reports reach N/quarter, evaluate migration path (e.g., `okn`, `okm`, user-configurable alias via `ok config set-alias`)." Keeps D1 LOCKED but pre-designs reversal.

**Status:** CHALLENGED at LOW severity — the collision evidence is strong, but "NEVER revisit" is unusually absolute for a 2-char name.

### [L] 7. Future Work omits MCP bundle (.dxt) and Windows/Linux desktop — Noted without trigger

**Location:** §15 Noted (lines 336-340)

**Issue:** §15 Noted lists `.dxt` MCPB bundle, Windows+Linux desktop, and air-gapped install as "not investigated." These are all adjacent to the spec's stated scope (CLI distribution + install UX). "Noted" is the weakest Future Work tier — no trigger, no sketch. The Windows+Linux deferral is particularly weak because parent Electron NG4 already locked it as NOT NOW; this spec could at least mirror that trigger.

**Alternative:** Promote Windows+Linux desktop from Noted to Identified with the trigger inherited from parent spec; move `.dxt` to Identified with trigger "Claude Desktop Extensions adoption measurable." Air-gapped can stay Noted.

**Status:** CHALLENGED at LOW severity — editorial polish.

## Strengths (what the spec got right)

- **DC1 Simpler alternative:** D5 (NEVER postinstall-CLI) is well-argued against the esbuild/sharp migration evidence — the Pattern A precedent is load-bearing and correctly cited.
- **DC2 Stakeholder gap:** D7 (email-only opt-out banned) + D14 posture (DO_NOT_TRACK + debug mode + docs page) pre-closes the GDPR / privacy-engineer gap; parent Electron NG3 + this spec's D14 sketch hit the Turbo + VS Code gold-standard bar.
- **DC3 Framing validity:** D3 reconciliation framing is precise — the spec correctly identifies that line 34 (auto-update NOT NOW) needs scope-split, not just blanket reversal, because the CLI/desktop split is load-bearing.
- **Resolution status discipline:** The 14 decisions cover LOCKED / DIRECTED / Future Work tiers without ambiguity; every row has evidence pointers; no ASSUMED or INVESTIGATING left over.
- **Anti-pattern closure:** NG1-NG4 cleanly close the door on known-bad patterns from the D1-D9 evidence, with each NG having a revisit condition (even if some triggers are under-observable per finding 5).