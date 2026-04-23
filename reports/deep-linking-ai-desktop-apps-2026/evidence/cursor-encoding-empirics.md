---
title: "Cursor URL-scheme encoding: empirical two-pass-decode behavior"
description: "Live-tested behavior of Cursor's anysphere.cursor-deeplink prompt router under single- vs double-encoded text= payloads, including the silent-corruption edge case that makes double-encoding the robust choice."
tags: [evidence, report, addendum-e, cursor, url-encoding]
---

# Evidence: Cursor — empirical two-pass-decode behavior of the prompt URL

**Dimension:** Supplement to D3 (Cursor Desktop) — specifically the encoding rule consumers must follow when building `cursor://anysphere.cursor-deeplink/prompt?text=…` URLs.
**Date:** 2026-04-21
**Sources:** 2026-04-21 live-testing round — four test prompts fired against installed Cursor 3.1.15 from shell, observed the confirmation modal's rendered text directly with the user reporting verbatim output; prior inference from `linear-ai-deeplinks-extraction.md` (Linear's production `AIActions.js` applies `encodeURIComponent(encodeURIComponent(x))` for Cursor, Copilot, Windsurf) and from the `cursor-desktop-deep-links.md` evidence for the extension router shape.

**Relationship to prior evidence:** The initial D3 probe (`cursor-desktop-deep-links.md`) characterized the extension-router parser statically and noted the Linear production rule of double-encoding but did not empirically verify the decoder's behavior with a live instance. This file captures that verification, including the specific cases where single-encoding silently corrupts vs. where it accidentally works.

---

## Headline finding

**Cursor's `anysphere.cursor-deeplink/prompt?text=` router does TWO decode passes — with error recovery on the second pass.** Both single-encoded and double-encoded prompts render cleanly for typical content. But single-encoding has a **silent-corruption edge case** when the user's prompt contains substrings that happen to look like valid URL escapes (e.g. `%41`, `%A0`, `%E2%80%94` for an em-dash). Double-encoding sidesteps this entirely and is the robust rule — matching Linear's production implementation.

---

## Test protocol

Four prompts fired one-at-a-time against the installed Cursor 3.1.15 on macOS, with the user watching each confirmation modal render and reporting verbatim output back. The invocation pattern was the production two-step:

```bash
cursor /Users/edwingomezcuellar/projects/open-knowledge         # step 1: focus workspace
sleep 3                                                         # let window settle
open "cursor://anysphere.cursor-deeplink/prompt?text=<ENC>&mode=agent&workspace=open-knowledge"
```

The `&workspace=open-knowledge` param was included to pin the URL to the just-opened window rather than whichever Cursor window happened to be focused — empirically necessary after a prior "opened in the wrong agents window" observation.

The `text=<ENC>` payload was built with two encoding patterns:

```bash
# Single-encoded
PROMPT='TEST A (single-encoded): I got a 50% off coupon for the 100% Pure shampoo. Is that a good deal?'
ENC=$(printf '%s' "$PROMPT" | jq -sRr @uri)

# Double-encoded
ENC=$(printf '%s' "$PROMPT" | jq -sRr @uri | jq -sRr @uri)
```

Each test fired independently; the user reported what text they saw in the confirmation modal and whether `mode=agent` had been applied.

---

## Finding 1: Both single- AND double-encoding render cleanly for "typical" text

**Confidence:** CONFIRMED (live-tested 2026-04-21)

Test payloads without literal `%` characters:
- `Look at reports/deep-linking-ai-desktop-apps-2026/REPORT.md and tell me the three most interesting…`

**Single-encoded:** clean text in the confirmation modal. Mode: `agent` applied. No visible `%20` / `%2F` sequences.
**Double-encoded:** also clean. Same visual output. Mode: `agent` applied.

If the router did only ONE decode pass, double-encoded input would have shown literal `%20`/`%2F` sequences in the modal (the second encoding layer would not have been peeled off). It didn't — therefore the router does at least two passes.

**Implication:** Linear's production double-encoding rule is not over-cautious; the router expects it.

---

## Finding 2: Single-encoded with literal `%` characters — ALSO renders cleanly (the surprise)

**Confidence:** CONFIRMED (live-tested 2026-04-21)

Specifically-chosen edge-case payload:
- `TEST A (single-encoded): I got a 50% off coupon for the 100% Pure shampoo. Is that a good deal?`

User report verbatim (modal text): *"TEST A (single-encoded): I got a 50% off coupon for the 100% Pure shampoo. Is that a good deal?"*

This is the surprise: the prompt contains two `%` characters that are NOT valid URL escapes (the `% o` and `% P` sequences break `%XX` syntax). Single-encoding produces on-wire `50%25 off coupon` + `100%25 Pure`. A naive two-decode router would:

1. **1st decode:** `50%25` → `50%`, `%20` → ` ` — correct result with `50% off coupon` intact.
2. **2nd decode:** encounters `% o` (`% ` followed by `o`, not hex digits) — invalid escape, **throws**.

Since the modal still showed clean text, the router **catches the 2nd-decode exception and falls back to the 1st-decode result**. That's error recovery on the second pass, not a skipped second pass.

---

## Finding 3: Double-encoded with literal `%` characters — renders cleanly

**Confidence:** CONFIRMED (live-tested 2026-04-21)

Same prompt, double-encoded:
- User report verbatim: *"TEST B (double-encoded): I got a 50% off coupon for the 100% Pure shampoo. Is that a good deal?"*

Wire bytes: `50%2525%2520off` →
1. **1st decode:** `50%25%20off`
2. **2nd decode:** `50% off`

Both passes succeed; no exception path; clean result.

---

## Finding 4: The silent-corruption edge case — single-encoding loses when prompts contain valid-escape-looking substrings

**Confidence:** INFERRED (from the decoder behavior established in Findings 1–3); not live-tested with a real failing prompt, but the mechanism is mechanical.

The class of prompts that single-encoding silently corrupts:

| User's literal prompt | Single-enc on wire | 1st decode | 2nd decode (succeeds!) | User sees |
|---|---|---|---|---|
| `check %41 please` | `check%20%2541%20please` | `check %41 please` | `check A please` — silent substitution | ❌ **corrupted** |
| `em-dash — here` | `em-dash%20%E2%80%94%20here` | `em-dash — here` | `em-dash <mojibake> here` — each byte of the UTF-8 em-dash gets fed back through decoding | ❌ **corrupted** |
| `pct encoded: %20 is space` | `pct%20encoded%3A%20%2520%20is%20space` | `pct encoded: %20 is space` | `pct encoded:   is space` — silent substitution | ❌ **corrupted** |
| `50% off` (no hex-digit after `%`) | `50%25%20off` | `50% off` | (exception on `% o` → fallback) | ✅ correct |

The determining factor is whether the character immediately after `%` in the 1st-decode result is a valid hex-digit pair. If it is, the second pass "succeeds" in the worst way: it substitutes the escape with whatever character it decodes to, silently corrupting the user's intent. If it isn't, the second pass throws and the router falls back to the 1st-decode result (which is correct).

**Risk profile for OK:** Wiki-page handoff prompts are short but can easily contain em-dashes (`—`), percent signs in templated contexts (`{{template.name}} at {{percentage}}%`), or prose quoting a URL (`see https://example.com/path?q=hello%20world`). Every one of those is a silent-corruption vector under single-encoding.

With double-encoding, the on-wire bytes ALWAYS pass both decode passes cleanly, because the outer encoding lifts every literal `%` to `%25` → `%2525` → `%25` → `%`. No silent-substitution pathway exists.

---

## Finding 5: Window-targeting via `&workspace=<basename>`

**Confidence:** CONFIRMED (live-tested 2026-04-21)

Observation during testing:
- Running the prompt URL without a `cursor <path>` pre-step initially landed in a different Cursor window (one for a separate agents project that happened to be focused).
- Restoring correct targeting required two steps: `cursor /path/to/open-knowledge` to focus the correct workspace window, then the prompt URL with `&workspace=open-knowledge`.
- `open-knowledge` is the basename of the workspace folder — the name Cursor auto-assigns to the window on `cursor /path`.

This matches `cursor-desktop-deep-links.md:545` — `deeplink.routeToWorkspaceName` matches by window-name (basename), not path. The empirical addition in this pass: after `cursor /path` the window's name IS the basename, so passing `workspace=<basename>` is redundant *but safe* (no-op if it matches the already-focused window). Using `workspace=<basename>` makes the invocation robust against focus-drift.

**Net pattern for OK's "Open in Cursor" handoff:**

```bash
# 1. Focus the workspace
cursor /abs/path/to/project

# 2. Small settle delay
sleep 1

# 3. Double-encoded prompt + mode + workspace pin
DOUBLE_ENC_PROMPT=$(printf '%s' "$prompt" | jq -sRr @uri | jq -sRr @uri)
open "cursor://anysphere.cursor-deeplink/prompt?text=${DOUBLE_ENC_PROMPT}&mode=agent&workspace=$(basename "$project")"
```

Exactly one CursorJack confirmation modal per invocation — no additional trust or workspace-switch dialog.

---

## Finding 6: Mode applied end-to-end

**Confidence:** CONFIRMED (live-tested 2026-04-21)

The user confirmed "agent was applied yes" after a test with `&mode=agent`. This closes the loop on the `cursor-desktop-deep-links.md` Finding that the four modes (`ask` / `agent` / `debug` / `plan`) are URL-controllable — not just parsed by the URL router and then discarded, but actually propagated to the composer's mode state.

---

## Summary: the rule set, precisely

| Rule | Statement |
|---|---|
| **R1** | Apply `encodeURIComponent` TWICE to any user-supplied prompt before embedding in `text=`. |
| **R2** | Use the two-step pattern (`cursor <path>` then prompt URL) for folder-scoping, since `cursor://` has no folder-open URL route. Never try to do this in a single URL. |
| **R3** | Pass `&workspace=<basename-of-folder>` as a safety net against window-focus drift. It's a no-op when you've just run `cursor <path>` (the window name equals the basename), but it prevents misrouted modals if focus shifted between the two steps. |
| **R4** | Pass `&mode=<ask\|agent\|debug\|plan>` explicitly — the URL-scheme parameter propagates to the composer's mode state; trusting whatever mode the window was previously in is fragile. |
| **R5** | Expect exactly one CursorJack confirmation modal per invocation. No additional trust, workspace-switch, or mode-change dialogs fire. |

---

## Negative results / non-findings

- **Single vs double encoding: "looks the same" is not equivalent to "works the same."** Finding 2 shows both render clean for typical content; Finding 4 shows the silent-corruption class that separates them. A tool that tests only with em-dash-free, percent-sign-free prompts will see no difference and wrongly conclude single-encoding is fine.
- **`text=` + `workspace=<path>` combination with path (not basename)** — not tested in this pass, but the `cursor-desktop-deep-links.md:545` evidence says paths are explicitly not accepted. Not worth re-testing without new motivation.
- **URL-length cap on `text=`** — Linear's registry documents a 10K cap on Cursor URLs; not empirically bumped against in this testing round.

---

## Gaps / follow-ups

1. Fire a live prompt that contains a literal `%41` or em-dash and empirically confirm the single-encoding silent-corruption mechanism from Finding 4. Current status is mechanical inference from the decoder behavior established in Findings 2–3 — high confidence but not a direct probe.
2. Test the URL-length cap: construct a progressively longer `text=` payload and observe the truncation point. Useful for OK's URL-builder to know when to fall back to clipboard-then-modal.
3. Cross-check that `mode=debug` and `mode=plan` also propagate (Finding 6 only verified `agent`).
4. Test whether `cursor --add-mcp` (CLI) and `cursor://anysphere.cursor-deeplink/mcp/install?config=<b64>` (URL) are functionally equivalent for OK's MCP-install menu, or if one has semantic differences.
