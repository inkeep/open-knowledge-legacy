/**
 * The `Principal` type is the Zod-inferred shape of the `/api/principal`
 * response — schema-first to eliminate parallel-declaration drift between
 * runtime parse and TypeScript types. See `../schemas/api.ts` for the
 * authoritative definition. The schema's `id` field is `z.string().min(1)`
 * which is structurally compatible with `PrincipalId` (an unbranded
 * `string` alias on `actor.ts`).
 */
export type { PrincipalResponse as Principal } from '../schemas/api.ts';
