# Evidence: GBrain Integrations & Enrichment (D10)

**Dimension:** D10 — External integrations & enrichment parity
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README "Integrations" + recipes/ tree; docs/integrations/README.md

---

## Findings

### Finding: 7 self-installing integration recipes — voice, email, calendar, X, meetings, ngrok tunnel, credential gateway
**Confidence:** CONFIRMED
**Evidence:** docs/integrations/README.md (verbatim from fetch):

| Recipe | Purpose |
|---|---|
| `ngrok-tunnel` | Fixed public URL for MCP + voice ($8/mo) |
| `credential-gateway` | Gmail + Calendar access (ClawVisor or Google OAuth) |
| `voice-to-brain` | Phone calls create brain pages via Twilio + OpenAI Realtime |
| `email-to-brain` | Gmail messages flow into entity pages via deterministic collector |
| `x-to-brain` | Twitter timeline, mentions, keyword monitoring with deletion detection |
| `calendar-to-brain` | Google Calendar events become searchable daily brain pages |
| `meeting-sync` | Circleback meeting transcripts auto-import with attendee propagation |

Each follows the pattern: **external signal → collector code (deterministic capture) → LLM analysis → brain page creation → GBrain indexing.**

CLI dashboard: `gbrain integrations` — Integration recipe dashboard.

Manual integration guides (in docs):
- Credential Gateway — Gmail/Calendar/Contacts access
- Meeting & Call Webhooks — Circleback, Quo, OpenPhone

**Implications:**
- **OK has zero shipped integrations.** Adding even one (Gmail, Calendar) would be a meaningful step toward parity.
- The **recipe pattern** is novel and worth replicating: a folder with `recipe.yaml` + `setup.md` + collector script + skill that interprets results. `gbrain integrations` shows what's available + status.
- The **deterministic collector + LLM analyst split** mirrors Minions (D6) — collectors are jobs, interpretation is a skill. Both halves are queueable.
- Most ambitious: **voice-to-brain via Twilio + OpenAI Realtime + WebRTC.** A phone call creates a brain page; the agent can also answer the phone with brain context. This is closer to a personal-assistant product than a wiki, and explains why GBrain's dimensions are people/companies/meetings rather than concepts/decisions/specs.

### Finding: Tiered enrichment — deterministic 1/3/8+-mention thresholds escalate enrichment depth
**Confidence:** CONFIRMED
**Evidence:** README "Tiered Entity Enrichment":

> Self-escalating deterministic classification:
> - **1 mention** → Tier 3 stub page
> - **3+ mentions** → Tier 2 (web + social enrichment)
> - **Meeting or 8+ mentions** → Tier 1 (full pipeline)
>
> "Deterministic classifiers improve via fail-improve loop logging."

**Implications:**
- Solves a concrete problem: when an entity is mentioned once in passing, you don't want to spawn a full enrichment pipeline (cost, noise). When mentioned 8+ times or in a meeting, the entity is clearly relevant — full pipeline is justified.
- The thresholds (1/3/8+) are **deterministic**, not LLM-judged. Cheap to evaluate at every page write.
- OK has no enrichment concept today. If/when OK adds external-data ingestion, this tiered model is a strong default.

### Finding: Webhook transforms — external events route to brain pages with entity extraction
**Confidence:** CONFIRMED
**Evidence:** README skill: "`webhook-transforms` — External events (SMS, meetings, social mentions) → brain pages with entity extraction."

**Implications:** Generic event-router pattern. SMS, meetings, social mentions all hit the same skill, which handles routing/dedup/entity-extraction/page-creation. OK could ship a similar router once the integration substrate exists.

### Finding: Audio/video transcription — `gbrain transcribe <audio>` via Groq Whisper
**Confidence:** CONFIRMED
**Evidence:** README: "`gbrain transcribe <audio>` — Transcribe audio (Groq Whisper)". Tech stack lists "Models: Claude (Opus/Haiku), Groq Whisper (transcription)".

**Implications:**
- Built-in transcription enables **media-ingest** skill (video, audio, books, screenshots) — drops barrier to capturing non-text inputs.
- Vendor-locked to Groq Whisper today; OK could implement via local whisper.cpp (offline) or any provider.
- For OK, this is a **late-stage parity item** — relevant only once the integration/media-ingest substrate is in place.

### Finding: Cloud blob file storage — `gbrain files mirror|redirect|clean|restore` for large binaries
**Confidence:** CONFIRMED
**Evidence:** README "Files (cloud blob storage)":
- `gbrain files mirror <dir>` — Copy to cloud, local untouched
- `gbrain files redirect <dir>` — Replace local with `.redirect` pointers
- `gbrain files clean <dir>` — Remove pointers, cloud only
- `gbrain files restore <dir>` — Download everything back (undo)

Tech stack: "Supabase Storage, S3-compatible (AWS/R2/MinIO)".

**Implications:**
- Solves a real markdown-canonical problem: large media (videos, PDFs, screenshots) shouldn't be in git. Mirror to cloud, replace with pointer files locally, optionally garbage-collect local copies. Reversible.
- Same problem will hit OK at scale. Today OK assumes everything is markdown text; binary assets aren't first-class.
- The **`.redirect` pointer convention** is a useful pattern: a local marker file containing the cloud URL + metadata, looking like markdown to the index but resolving to a remote blob.

---

## Negative searches

- Searched for Slack/Discord/Linear integrations → NOT FOUND. Current integrations are personal-productivity-flavored (Gmail, Calendar, Twitter, voice, meetings).
- Searched for fetch-on-demand vs. scheduled-pull semantics → mostly scheduled (cron + Minions); voice-to-brain is event-driven (incoming call).

---

## Gaps / follow-ups

- The full `recipes/<name>/recipe.yaml` schema not fetched. Would clarify the contract a 3rd-party integration must satisfy.
- Whether integrations can be installed independently or require the credential-gateway recipe first is unclear from the docs summary.
