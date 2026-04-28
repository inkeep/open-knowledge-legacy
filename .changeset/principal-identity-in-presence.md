---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge": minor
---

feat(presence): use git-config name for the human presence avatar; dedupe tabs of the same checkout

The presence bar now shows the user's actual name (from `git config user.name`) and a deterministic per-principal color, instead of a random `Adjective Animal` nickname. Multi-tab users see ONE avatar with a tooltip like `"Miles Kaming-Thanassi · 2 tabs"` instead of N copies. Users on a fresh box without git config keep the existing animal-fallback experience — no regression.

Cursor labels and tooltips polish Unix-style names: `miles-kt-inkeep` floats `Miles Kt Inkeep` next to selections, matching the `MK` initials the avatar already shows.

The data plumbing reuses an existing fetch — `DocumentContext` already calls `GET /api/principal` for the auth-token claim — and threads the resolved principal into a new optional `principalId?: string` field on `AwarenessUser`. `usePresence()` dedupes humans whose `principalId` matches; cursors stay per-clientId so N tabs editing still render N cursors in the editor.

**API surface:**
- New optional wire field `AwarenessUser.principalId` on per-doc awareness (loopback-only trust today; non-loopback connections must switch to server-authoritative attribution at `onAuthenticate`).
- New public exports from `@inkeep/open-knowledge-core`: `Principal` (now an alias of the schema-inferred `PrincipalResponse`), `PrincipalResponseSchema`, `PrincipalResponse`, `computeInitials`, `formatPresenceLabel`, `HUMAN_COLORS`.
- `colorFromSeed` now accepts an optional `palette` parameter; the default remains `AGENT_COLORS` so existing single-arg callers are byte-equivalent.
- `HumanParticipant` from `@inkeep/open-knowledge-app` (internal) gains `tabCount: number`.
- `localStorage` cache keys for the random-fallback identity move from `ok-user-{name,color}-v2` to `-v3`. No migration — pre-launch state.

**Hardening:**
- `GET /api/principal` now requires loopback + Host-header gates so PII (`display_name`, `display_email`) doesn't leak under `--host 0.0.0.0` deployments. Matches the gate `/api/metrics/agent-presence` and `/api/workspace` already enforce.
- `PrincipalResponseSchema.display_name` and `display_email` use `.min(1)` so an empty git-config value routes through the silent random-identity fallback rather than rendering an empty initial / blank tooltip / blank cursor label.
