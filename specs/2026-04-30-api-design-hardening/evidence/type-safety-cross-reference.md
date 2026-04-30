---
date: 2026-04-30
sources: /type-safety SKILL.md + references/{discriminated-unions,validation-narrowing,zod-v4-patterns}.md
type: cross-reference
applies-to: IS1, IS2, IS5
---

# Type-safety cross-reference — sharpenings + new considerations for In Scope items

## Sharpenings to existing In Scope items

### IS1 — `UploadResponseSchema` (Zod) — refined construction discipline

From `zod-v4-patterns.md`:

- **Use `z.discriminatedUnion('ok', [...])`** keyed on the literal `ok` field. This matches the codebase's own precedent at `core/src/schemas/cc1.ts` (10 schemas in a `discriminatedUnion('ch', [...])`).
- **Members MUST be `z.object(...)` or another `z.discriminatedUnion(...)` with the SAME discriminator key.** Plain `z.union(...)` as a member, OR a nested DU with a *different* discriminator key, both pass construction silently and throw at parse time — and `safeParse` *re-throws* breaking the discriminated-result contract (footgun 7, HIGH impact).
- **Add a smoke-test at module load** — round-trip a known-good payload for each variant against the assembled union. Cheap, mechanical, defends against the lazy-validation footgun without requiring schema introspection. Pattern from `discriminated-unions.md`:
  ```ts
  function assertDiscriminatedUnionParses<T extends z.ZodDiscriminatedUnion<any, any>>(
    union: T,
    validSamples: ReadonlyArray<unknown>,
  ): void { /* ... */ }
  ```
- **Avoid `.transform()` on the schema** if there's any future intent to convert via `z.toJSONSchema()` (MCP, OpenAPI). Use `.overwrite()` for type-preserving normalization. Default `z.toJSONSchema()` throws on `.transform()` (footgun 6).
- **Object modes** matter (footgun 8 area): for request schemas, prefer `z.strictObject` (catch typos at the boundary). For response parsing on the client side, prefer `z.looseObject` (server may add fields without breaking client). This is a hybrid: server emission uses `strictObject` (own the contract), client consumption uses `looseObject` (forward-compat). The outer DU is naturally strict; the discriminator forces the variant choice.
- **Native Standard Schema:** Zod v4 schemas auto-expose `~standard`. Exporting `UploadResponseSchema satisfies StandardSchemaV1<UploadResponse>` lets future consumers (SDK gen, Hono validators, etc.) accept it without pinning to Zod. Zero runtime cost.

### IS2 — `assertNeverLinkTarget` — confirms naming discipline + adds lint option

From `discriminated-unions.md`:

- **Per-DU naming (`assertNeverFoo`) over single shared `assertNever`** — codebase precedent already (`assertNeverDiskEvent`). Skill notes both patterns are valid; codebase consistency wins.
- **Production volume:** VS Code 40 call sites, Vercel AI SDK 115, Claude Code 24. This is a canonical pattern, not a style suggestion.
- **Optional lint:** `@typescript-eslint/switch-exhaustiveness-check` flags `switch` missing `default` (defense-in-depth for `assertNever`). NOT in `recommended` or `strict` preset — opt in. Repo uses biome (not eslint); this would require running both linters or waiting for biome support. Out of scope for this hardening spec; flag as Future Work — Noted.

### IS5 — Server-client error union sharing — confirms the upstream-narrowing fix

From `validation-narrowing.md`:

- **The convergent practitioner advice:** "Narrow upstream, not at the call site." Both `!` and defensive `?.` camps converge here. The current state at `image-upload/index.ts:319` (parsing `e.message` substring back to a typed reason) is exactly the failure mode this advice exists to prevent.
- **The fix shape:** server emits typed `error.code` field via `UploadResponseSchema.parse()`; client `safeParse`s the response to get typed values. No `!`, no `?.`, no substring parsing. Both ends share the same Zod-derived TS types via `z.infer<typeof UploadResponseSchema>` (or `z.input` / `z.output` if they diverge).
- **Zod's `safeParse` discriminated-union narrowing** is the cleanest version of this pattern (`{ success: true; data } | { success: false; error }`). Both camps in the contested `!` vs `?.` debate accept this as the right shape.

## New considerations surfaced (small, propose merging into IS1)

### IS1.a — Object-mode hybrid (strictObject vs looseObject)

Server-side emission: `z.strictObject` for the inner error/success variants (we own the contract). Client-side consumption: `z.looseObject` for forward-compat (server may add fields). Easy to express in one schema with conditional mode:

```ts
// In core/src/schemas/upload.ts
export const UploadResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), src: z.string(), deduped: z.boolean().optional(), sha: z.string().optional(), byteLength: z.number().optional() }),
  z.object({ ok: z.literal(false), error: z.object({ code: UploadErrorCodeSchema, message: z.string(), instance: z.string().optional() }) }),
]);
```

Or, if we want stricter typo-catch on server emission and looser parsing on client, two derived schemas (`UploadResponseStrictSchema`, `UploadResponseLooseSchema`). My read: **start with one default `z.object` schema (strips unknowns)** — equivalent to looseObject behavior on parse, strict behavior on the literals. If we hit a "server-added-field-broke-client" issue, split then. Avoid premature splitting.

### IS1.b — Standard Schema export

Export `UploadResponseSchema satisfies StandardSchemaV1<UploadResponse>` from `core`. Zero runtime cost in Zod v4 (native `~standard` property). Buys:

- Future SDK gen consumers (e.g., Speakeasy, Stainless) can accept the schema without pinning to Zod.
- Form validators (TanStack Form, React Hook Form via Standard-Schema resolvers) accept it.
- Hono `zValidator` / oRPC / Better-fetch already accept Standard Schema as of April 2026.

Recommendation: **yes**. The cost is one `satisfies StandardSchemaV1<...>` annotation; the option value is real.

## NOT new (already covered by typescript-api-design audit)

- Branded types — not adding for `parentDocName` / `agentId` / `sha` / etc. The audit didn't recommend them; the type-safety skill's `branded-ids.md` would only justify them for "two same-base-type IDs that get passed together where swapping is realistic." Upload handler params don't fit. Save brands for cross-package ID confusion (no clear hit in scope).
- Negative type tests (`@ts-expect-error` files) — defense-in-depth nicety; not load-bearing for the in-scope items. Defer to Future Work — Noted.

## Updated In Scope formulation

| # | Item | Refined formulation |
|---|---|---|
| IS1 | `UploadResponseSchema` Zod-as-SSOT | Express via `z.discriminatedUnion('ok', [...])`. Members are plain `z.object` (footgun 7 compliance). Add smoke-test at module load (defense). Export with `satisfies StandardSchemaV1<UploadResponse>` (zero-cost Standard Schema). Default object mode for now (single schema; split if a "server-added field broke client" issue lands). |
| IS2 | `assertNeverLinkTarget` exhaustiveness guard | Per-DU helper matching codebase precedent (`assertNeverDiskEvent`). Lint integration deferred (biome doesn't ship `switch-exhaustiveness-check`; Future Work — Noted). |
| IS3 | `ok`/`found` field-name normalization | Migrate `AssetViewerLookupResult.found` → `ok`. Touches 1 file + 3 callers. |
| IS4 | `AssetViewerRegistry` lifecycle | `register()` returns unregister fn; document ordering model (last-registered wins by default; or pick first-wins / explicit-priority); warn on ext collision. |
| IS5 | Client-side typed reason consumption | Server emits `error.code: UploadErrorCode` typed literal union; client uses `safeParse(UploadResponseSchema, response)` and consumes typed values. No `e.message` substring parsing. Server + client share types via `z.infer`. |
