# Evidence: ee/ Directory Patterns Across 13 Companies

**Dimension:** ee/ Directory Patterns
**Date:** 2026-04-11
**Sources:** GitHub repos (code-first), company docs, LICENSE files

---

## Company Pattern Matrix

| Company | Base License | ee/ Location | Boundary Mechanism | Ships ee/ Source? | License Template |
|---------|-------------|-------------|-------------------|------------------|-----------------|
| Cal.com | AGPL-3.0 | `packages/features/ee/` | Direct imports, runtime key | Yes | Cal.com Commercial |
| Formbricks | AGPL-3.0 | `apps/web/modules/ee/` | Runtime license check (fetch + TTL) | Yes | Formbricks EE |
| Documenso | AGPL-3.0 | `packages/ee/` | Workspace package, server-only | Yes | Cal.com-derived |
| Dub.co | AGPL-3.0 | `apps/web/app/(ee)/` | Next.js route groups | Yes | Cal.com-derived |
| Papermark | AGPL-3.0 | `ee/` + `app/(ee)/` | Direct imports | Yes | Cal.com-derived |
| Twenty | AGPL-3.0 | File-level markers | `/* @license Enterprise */` + NestJS guard | Yes | Custom in LICENSE |
| Appsmith | Apache-2.0 | `app/client/src/ee/` (stubs) | Path alias swap; real code in private repo | No (stubs only) | Separate private |
| Infisical | MIT | `backend/src/ee/` | Separate route registration | Yes | Infisical EE |
| Mastra | Apache-2.0 | `packages/core/src/auth/ee/` | Inline imports | Yes | Mastra EE |
| Activepieces | MIT | `packages/ee/` + `packages/server/api/src/app/ee/` | Dual workspace + nested | Yes | Activepieces EE |
| Grafana | AGPL-3.0 | Separate private repo | Go build tags (`//go:build enterprise`) | No | Grafana Enterprise |
| n8n | SUL | `.ee.` filename suffix | Filename convention | Yes | n8n Enterprise |
| GitLab | MIT (CE) | `ee/` top-level | Ruby `prepend_mod` runtime injection | Yes | Proprietary |

## Key Patterns

### Pattern 1: Directory-based with shared EE license template
Cal.com, Documenso, Dub.co, Papermark, Formbricks, Infisical, Activepieces, Mastra all use nearly identical EE license text: "May only be used in production if you have a valid [Company] Enterprise License." Dev/testing is permitted without subscription.

### Pattern 2: Build-time separation (Grafana, Appsmith)
Enterprise code physically absent from OSS repo. Grafana uses Go build tags; Appsmith uses path alias stubs swapped at build time.

### Pattern 3: File-level markers (Twenty, n8n)
No ee/ directory. Twenty uses `/* @license Enterprise */` JSDoc comments. n8n uses `.ee.` filename suffixes. Both grep-discoverable.

### Pattern 4: Runtime license key gating (universal)
All companies that ship ee/ source use env-var license keys validated at startup. Cal.com validates via `https://goblin.cal.com/v1/license`. EE features are disabled (not removed) without a key.

## ee/ Feature Commonalities

Features consistently placed in ee/ across companies:
- SSO/SAML/OIDC (Cal.com, Formbricks, Twenty, Infisical)
- Audit logs (Formbricks, Documenso, Infisical, Activepieces, Dub.co)
- RBAC/permissions (Formbricks, Twenty, Papermark)
- Billing/Stripe (Cal.com, Formbricks, Documenso, Dub.co)
- Teams/organizations (Cal.com, Formbricks, Activepieces)
- Directory sync/SCIM (Cal.com, Infisical, Activepieces)
- White-labeling (Formbricks, Documenso)

---

## Gaps / follow-ups
* Revenue impact of shipping ee/ source (do companies lose sales to self-hosters bypassing license checks?) not investigated
* Enforcement mechanisms when ee/ license is violated not documented
