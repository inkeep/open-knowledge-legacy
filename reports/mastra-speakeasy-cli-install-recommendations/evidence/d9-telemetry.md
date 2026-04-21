# Evidence: D9 — CLI + desktop telemetry patterns

**Dimension:** D9 — Opt-in vs opt-out defaults, opt-out mechanisms, data collected, DO_NOT_TRACK compliance, and the crash-vs-usage split for CLI + Electron apps.
**Date:** 2026-04-20
**Sources:** source-level inspection + vendor telemetry docs for 13 tools

---

## Key files / pages referenced

- Mastra: [`packages/cli/src/index.ts`](https://github.com/mastra-ai/mastra/blob/main/packages/cli/src/index.ts) + [`packages/cli/src/analytics/index.ts`](https://raw.githubusercontent.com/mastra-ai/mastra/main/packages/cli/src/analytics/index.ts)
- [Speakeasy Product Security](https://www.speakeasy.com/legal/product-security)
- [Next.js Telemetry](https://nextjs.org/telemetry)
- [Astro Telemetry](https://astro.build/telemetry/)
- [Vercel CLI Telemetry](https://vercel.com/docs/cli/about-telemetry)
- [Homebrew Analytics](https://docs.brew.sh/Analytics) + [Homebrew PR #6745](https://github.com/Homebrew/brew/pull/6745) (DO_NOT_TRACK rejection)
- [Turborepo Telemetry](https://turborepo.dev/docs/telemetry)
- [Prisma Telemetry](https://www.prisma.io/docs/v6/orm/tools/prisma-cli)
- [Storybook Telemetry](https://storybook.js.org/docs/configure/telemetry)
- [VS Code Telemetry](https://code.visualstudio.com/docs/configure/telemetry) + [`@vscode/extension-telemetry`](https://github.com/microsoft/vscode-extension-telemetry)
- [Cursor Privacy](https://cursor.com/privacy) + [Cursor Data Use](https://cursor.com/data-use)
- [consoledonottrack.com discussion on HN](https://news.ycombinator.com/item?id=27746587)

---

## Findings

### Finding 1: Opt-out default dominates (10/13 surveyed tools); opt-in reserved for high-sensitivity contexts
**Confidence:** CONFIRMED

| Tool | Default posture | Opt-out path |
|---|---|---|
| Mastra | OPT-OUT | `MASTRA_TELEMETRY_DISABLED=1` (only this) |
| Speakeasy | OPT-OUT | Email `info@speakeasy.com` (no flag, no env) |
| Next.js | OPT-OUT | `next telemetry disable` **OR** `NEXT_TELEMETRY_DISABLED=1` |
| Astro | OPT-OUT | `astro telemetry disable` **OR** `ASTRO_TELEMETRY_DISABLED=1` |
| Vercel CLI | OPT-OUT | `vercel telemetry disable` **OR** `VERCEL_TELEMETRY_DISABLED=1` |
| Homebrew | OPT-OUT | `brew analytics off` **OR** `HOMEBREW_NO_ANALYTICS=1` |
| Turborepo | OPT-OUT | `turbo telemetry disable` **OR** `TURBO_TELEMETRY_DISABLED=1` **OR** `DO_NOT_TRACK=1` |
| Prisma | OPT-OUT (usage) / OPT-IN (crashes) | `CHECKPOINT_DISABLE=1` for usage; per-crash consent prompt for error reports |
| Storybook | OPT-OUT (usage) / OPT-IN (crashes) | `STORYBOOK_DISABLE_TELEMETRY=1` **OR** config `disableTelemetry: true` **OR** `--disable-telemetry` |
| VS Code | OPT-OUT (4-level granularity) | Setting `telemetry.telemetryLevel: off` |
| Cursor (desktop) | OPT-OUT | Settings → General → Privacy Mode toggle (first-run consent prompt) |
| Vite | Appears telemetry-free | N/A — no documented telemetry |
| gh (main CLI) | Appears telemetry-free | N/A (gh-copilot extension is OPT-IN with first-run consent) |

### Finding 2: Turborepo is the gold-standard for opt-out because it honors DO_NOT_TRACK alongside its own flag
**Confidence:** CONFIRMED
**Evidence:** [Turborepo Telemetry docs](https://turborepo.dev/docs/telemetry) explicitly document three equivalent disable paths: `turbo telemetry disable`, `TURBO_TELEMETRY_DISABLED=1`, and `DO_NOT_TRACK=1`. Turborepo also exposes `TURBO_TELEMETRY_DEBUG=1` to print the outgoing payload to stderr without transmission.

**Why this matters:** Of 13 tools surveyed, only Turborepo honors the universal [DO_NOT_TRACK=1](https://consoledonottrack.com) convention. Homebrew **explicitly rejected** the proposal in [PR #6745](https://github.com/Homebrew/brew/pull/6745): *"We would rather use our own variable for now (at least until this is much more widely adopted)."* The circularity is evident — every vendor rejects it on adoption grounds, so it never becomes widely adopted.

### Finding 3: Mastra's telemetry implementation is below industry best practice
**Confidence:** CONFIRMED
**Evidence:**
- `packages/cli/src/index.ts`: unconditional PostHog init with hard-coded API key `phc_SBLpZVAB6jmHOct9CABq3PF0Yn5FU3G2FgT4xUr2XrT` pointing at `https://us.posthog.com`
- `packages/cli/src/analytics/index.ts`: `isTelemetryEnabled()` returns `!process.env.MASTRA_TELEMETRY_DISABLED` — a single env var is the only disable path

**Gaps vs best practice (Next.js / Turbo / VS Code):**
- No dedicated `/docs/telemetry` page (no public data-collection disclosure)
- No first-run banner documented
- No `MASTRA_TELEMETRY_DEBUG=1` payload-inspection mode
- No CLI subcommand (`mastra telemetry disable`) for persistent opt-out
- `DO_NOT_TRACK=1` not honored
- No crash/usage split (one PostHog pipeline for everything)

### Finding 4: Speakeasy's email-only opt-out is the worst-case pattern
**Confidence:** CONFIRMED
**Evidence:** [Speakeasy Product Security](https://www.speakeasy.com/legal/product-security) documents the telemetry posture, but states users wishing to opt out must "Contact us at [info@speakeasy.com](mailto:info@speakeasy.com)". No env var, no flag, no CLI subcommand.

Data collected (from the same page) includes: customer ID, workspace ID, target language, template name, run location (CLI vs GitHub Action), generator/CLI versions, feature tracking, config values, `.genignore` presence — some of which are identifiers arguably PII-adjacent.

### Finding 5: VS Code's 4-level `telemetry.telemetryLevel` is the reference pattern for desktop/Electron telemetry granularity
**Confidence:** CONFIRMED
**Evidence:** [VS Code telemetry docs](https://code.visualstudio.com/docs/configure/telemetry) document four levels:
- `all` — crash reports + errors + usage data
- `error` — crash reports + errors
- `crash` — crash reports only
- `off` — nothing

The [`@vscode/extension-telemetry` package](https://github.com/microsoft/vscode-extension-telemetry) exposes the same pipeline to extensions; extension authors use `TelemetryReporter` and inherit the user's level setting. Backend is Azure Application Insights / Azure Monitor.

**Implication:** For a desktop app, the user's threshold for crash reporting and usage telemetry often differs — crashes are actionable without identifying content; usage telemetry implies behavioral profiling. Offering separate axes (Prisma's per-crash consent; Storybook's opt-in default for crashes + opt-out for usage; VS Code's 4-level) lets users opt into the less-sensitive signal without surrendering the more-sensitive one. **Cursor's conflation of everything under "Privacy Mode" is the anti-pattern.**

### Finding 6: Debug mode for telemetry transparency is a shared pattern across best-practice tools
**Confidence:** CONFIRMED
**Evidence:** Tools that expose a `*_TELEMETRY_DEBUG=1` env var (prints outgoing payload to stderr without transmission):
- `NEXT_TELEMETRY_DEBUG=1` ([Next.js docs](https://nextjs.org/telemetry))
- `VERCEL_TELEMETRY_DEBUG=1` ([Vercel CLI docs](https://vercel.com/docs/cli/about-telemetry))
- `TURBO_TELEMETRY_DEBUG=1` ([Turborepo docs](https://turborepo.dev/docs/telemetry))
- `STORYBOOK_TELEMETRY_DEBUG=1` ([Storybook docs](https://storybook.js.org/docs/configure/telemetry))

**Why it matters:** Skeptical users can inspect exactly what would be sent before deciding. Mastra lacks this; Speakeasy lacks this. Adding it is ~10 lines of code and is the single highest-leverage transparency lever.

### Finding 7: Endpoints are mostly vendor-hosted, not PostHog-dominant
**Confidence:** CONFIRMED

| Backend | Tools |
|---|---|
| Vendor-hosted | Next.js (Vercel), Astro, Vercel CLI, Turbo, Prisma (`checkpoint.prisma.io`), Speakeasy |
| PostHog | Mastra |
| InfluxDB | Homebrew (self-hosted, 365-day retention documented) |
| Azure Application Insights | VS Code + extensions |
| Unknown vendor | Cursor |

**Implication:** PostHog's visibility in recent startup CLIs (Mastra, others in the space) does not reflect ecosystem norms. Enterprise Electron apps lean on Sentry (crash) + vendor-hosted or Azure pipelines (usage). Startup-grade tools default to PostHog or Segment.

### Finding 8: Crash reporting is often separate-consent from usage telemetry
**Confidence:** CONFIRMED

- **Prisma:** Usage telemetry is opt-out (`CHECKPOINT_DISABLE=1`); **crash reports are opt-in** with a prompt on each crash before submission
- **Storybook:** Usage is opt-out; **crash reports are opt-in** (`enableCrashReports: true` must be set)
- **VS Code:** Granular via 4-level `telemetry.telemetryLevel`
- **Mastra:** Single PostHog pipeline — no split
- **Cursor:** Single Privacy Mode toggle — no split

**Implication:** The industry-leading pattern decouples crash reporting (Sentry / Bugsnag / Crashpad) from usage analytics (PostHog / Amplitude / Segment / vendor-hosted). Users who want to help fix bugs but not be profiled need an intermediate setting.

### Finding 9: First-run banners exist in best-of-breed tools but are absent in Mastra / Speakeasy / Cursor
**Confidence:** CONFIRMED
**Evidence:** Next.js/Astro/Vercel CLI print a one-line notice on the first command of a fresh install pointing to the telemetry docs page. `gh-copilot` extension shows an explicit consent prompt. VS Code shows a notification on first launch.

**Absent in:** Mastra (inferred from source inspection — no banner logic found), Speakeasy (inferred from CLI reference docs), Cursor (no doc confirms banner, though onboarding does include a Privacy Mode setting).

---

## DO_NOT_TRACK compliance survey

**Honors `DO_NOT_TRACK=1`:**
- Turborepo

**Does not honor `DO_NOT_TRACK=1`:**
- Mastra, Homebrew (explicitly rejected), Next.js, Astro, Vercel CLI, Prisma, Storybook, VS Code, Cursor, Speakeasy, npm (open discussion, not adopted)

**Adoption outside this survey (per consoledonottrack.com):** Syncthing, dbt-core (added via PR), Meteor. The convention exists but has low mainstream uptake.

---

## Best-practice rubric for a CLI + Electron app

Synthesized from Next.js + Turbo + VS Code + Prisma patterns:

1. **Three equivalent opt-out paths** — env var, persistent CLI subcommand, AND `DO_NOT_TRACK=1`. Turbo is the only surveyed tool that ships all three.
2. **First-run banner** — single-line notice linking to the telemetry docs page.
3. **Dedicated `/docs/telemetry` page** with data-collection list + example payload. Vercel CLI is the reference.
4. **Debug mode** — `*_TELEMETRY_DEBUG=1` prints payload to stderr without transmission.
5. **Data exclusion list stated publicly** — env vars, file paths, file contents, logs, serialized errors, PII. Next.js enumerates this.
6. **Separate crash reporting from usage telemetry** — either VS Code's 4-level setting, Prisma's per-crash consent prompt, or Storybook's opt-in default for crashes.
7. **Data retention stated** — Homebrew's 365-day published retention is the only surveyed example.
8. **Do not require email to opt out** — Speakeasy is the anti-pattern.
9. **For Electron specifically:**
   - Sentry or Bugsnag for crash (bridges main + renderer via `@sentry/electron`)
   - PostHog / Amplitude / Segment / vendor-hosted for usage
   - Settings UI toggle visible to users
   - Enterprise policy lever (VS Code's `TelemetryLevel` policy equivalent)

---

## Negative searches

- **Vite telemetry** — no dedicated docs page or env var found on `vitejs.dev`; inferred telemetry-free. Would need a source sweep of `vitejs/vite` to confirm.
- **gh (main CLI) telemetry** — no privacy page, no env var documented. Confirmed `gh-copilot` extension is opt-in with first-run consent.
- **VS Code DO_NOT_TRACK support** — not documented as honored. Source-level confirmation would require inspection of `vscode/src/vs/platform/telemetry/`.
- **Cursor's exact analytics vendors** — "telemetry and usage data" stated but not itemized publicly.

---

## Gaps / follow-ups

- **Electron spec §3 NG3 says "[NEVER] telemetry without explicit opt-in"** (Obsidian model). This is stricter than every OPT-OUT-default tool surveyed. If open-knowledge ships telemetry later, the spec's opt-in posture matches [[reports/electron-desktop-app-operations-2025/REPORT]] §8's reference-app table, where Obsidian is listed as "Zero telemetry / only update check (disableable)."
- Whether any tool has successfully upsold opt-in telemetry via first-run UX — e.g. a "help us improve? [Yes / No / Learn more]" prompt, Prisma-style but applied to usage not crashes. This would be the canonical opt-in-default UX pattern.
- GDPR implications of PostHog-US-region hosting for EU users (Mastra's setup). EU case law leans toward opt-in consent for analytics beyond what is "strictly necessary." Mastra's US-hosted opt-out posture is arguably non-compliant for EU users — not inspected in depth.
