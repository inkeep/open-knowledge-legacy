# Evidence: D2 — Collision audit for `okb`

**Dimension:** D2 — Is `okb` a viable CLI command name?
**Date:** 2026-04-16
**Sources:** local shell probes, npm registry, Homebrew, Debian, GitHub, crypto market references

---

## Key sources referenced
- Local shell probes
- `npm view okb`
- `brew info okb` → "Did you mean oksh?"
- https://www.okx.com/en-us/learn/okb — OKB token official page
- https://coinmarketcap.com/currencies/okb/ — OKB market-cap ranking

---

## Findings

### Finding: `okb` has no shell, PATH, or package-manager collision
**Confidence:** CONFIRMED
**Evidence:**
```text
$ which okb                  → okb not found
$ bash -c 'type okb'         → bash: type: okb: not found
$ brew info okb              → Error: No available formula... Did you mean oksh?
$ npm view okb
okb@0.0.0 | MIT | deps: none | versions: 1
okb
(no bin field; 387 B unpacked — clearly a placeholder squat)
```
Subagent confirmed no Debian/Ubuntu/Arch/AUR packages named `okb`.
**Implications:** System-level, `okb` is fully clear.

### Finding: OKB is the utility token of the OKX cryptocurrency exchange
**Confidence:** CONFIRMED
**Evidence:** https://www.okx.com/en-us/learn/okb — "OKB is the official utility token of the OKX exchange." Launched 2018. Consistently ranked top-50 by market capitalization on CoinMarketCap and CoinGecko. OKX is one of the largest centralized crypto exchanges globally (top-5 by spot volume during the research window).
**Implications:** In developer communities that overlap with crypto/blockchain, `okb` reads primarily as a token ticker, not as a knowledge-base CLI. A Google search for "okb" returns nearly exclusively crypto results above the fold. Tutorials, blog posts, or social media mentions of `okb <command>` will be miscategorized by search engines as crypto content.

### Finding: Homebrew suggests `oksh` as the nearest match
**Confidence:** CONFIRMED
**Evidence:** `brew info okb → Did you mean oksh?`. `oksh` is a portable OpenBSD KornShell implementation. Not a direct collision, but indicates `okb` is close to existing tool-naming space.
**Implications:** Users running `brew install okb` who fat-finger might get shell-install suggestions; low-severity UX nit.

### Finding: `okb` is phonetically awkward to say aloud
**Confidence:** INFERRED
**Evidence:** No natural English phoneme for "okb" — sounds like "oh-kay-bee," a 3-syllable spell-out. Contrast with `bun`, `bat`, `dust`, `zed` (one syllable, pronounceable) or `gh`, `rg`, `fd` (spell-out is acceptable because they're universally known acronyms).
**Implications:** Memorability and spoken discoverability suffer — tool names that have to be spelled out letter-by-letter in conversation are less sticky than pronounceable or acronym-backed ones.

---

## Negative searches (NOT FOUND)
- No GitHub CLI tool named `okb` with non-trivial stars
- No Debian/Ubuntu/Arch package
- No Homebrew formula or cask
- No prior art for `okb` as a developer-tool acronym

---

## Gaps / follow-ups
- Could not locate any active `okb` developer-tool. Space is open aside from the crypto brand.

---

## Severity: **HARD (brand)**
`okb` is system-clear but carries strong brand association with a top-50 cryptocurrency. For a knowledge-management CLI whose audience includes AI/dev-tools builders who also frequent crypto communities, this creates persistent confusion in search results, social posts, and screencasts. The system-level viability is irrelevant if the name is semantically pre-claimed.
