# Evidence: Persistence and Serialization

**Dimension:** D6 — Persistence and serialization
**Date:** 2026-04-02
**Sources:** Orama source code (github.com/askorama/orama)

---

## Key files referenced

- `packages/orama/src/methods/serialization.ts` — core save/load functions
- `packages/plugin-data-persistence/src/index.ts` — persistence plugin with multiple formats
- `packages/plugin-data-persistence/src/types.ts` — persistence format types
- `packages/plugin-data-persistence/src/seqproto.ts` — binary seqproto serializer

---

## Findings

### Finding: Core Orama provides save() and load() that produce/consume a RawData object
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/serialization.ts`

```typescript
export interface RawData {
  internalDocumentIDStore: unknown
  index: unknown
  docs: unknown
  sorting: unknown
  pinning: unknown
  language: Language
}

export function save<T extends AnyOrama>(orama: T): RawData { ... }
export function load<T extends AnyOrama>(orama: T, raw: RawData): void { ... }
```

save() returns a plain JS object. load() mutates an existing Orama instance. The consumer is responsible for writing to disk.

### Finding: @orama/plugin-data-persistence supports 4 serialization formats
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-data-persistence/src/types.ts`

```typescript
export type PersistenceFormat = 'json' | 'dpack' | 'binary' | 'seqproto'
```

| Format | Implementation | Use case |
|--------|---------------|----------|
| `json` | `JSON.stringify()` | Human-readable, largest size |
| `dpack` | dpack library | Compact JSON alternative |
| `binary` | msgpack (encode/decode) | Smaller than JSON, hex-encoded |
| `seqproto` | Custom binary serializer | Most compact, schema-aware |

### Finding: persist() returns serialized data, restore() returns a new Orama instance
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-data-persistence/src/index.ts` (lines 54-92, 94-159)

```typescript
export async function persist<T extends AnyOrama>(
  db: T, format: PersistenceFormat = 'binary', runtime?: Runtime
): Promise<string | Buffer | ArrayBuffer>

export async function restore<T extends AnyOrama>(
  format: PersistenceFormat, data: string | Buffer | ArrayBuffer, runtime?: Runtime
): Promise<T>
```

### Finding: persistToFile and restoreFromFile are DEPRECATED (throw errors)
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-data-persistence/src/index.ts` (lines 161-176)

```typescript
export async function persistToFile(...): Promise<never> {
  throw new Error(METHOD_MOVED('persistToFile'))
}
```

The plugin no longer writes directly to disk. It returns serialized data; the consumer writes it.

### Finding: No incremental serialization — full snapshot on every persist()
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/methods/serialization.ts` — save() serializes the complete state. No diffing, no WAL, no incremental updates.

### Finding: seqproto format is a custom binary protocol optimized for Orama's data structures
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-data-persistence/src/seqproto.ts` — Uses the `seqproto` library with custom serializers for Radix trees, Flat trees, vectors, and document stores. Structure-aware — faster than generic msgpack for Orama data.

### Finding: Runtime auto-detection for Node.js, Deno, Bun, browser
**Confidence:** CONFIRMED
**Evidence:** `packages/plugin-data-persistence/src/types.ts` — `export type Runtime = 'deno' | 'node' | 'bun' | 'browser' | 'unknown'`

### Finding: Vector data serialized as number[] arrays in JSON/toJSON
**Confidence:** CONFIRMED
**Evidence:** `packages/orama/src/trees/vector.ts` (lines 43-65) — VectorIndex has toJSON()/fromJSON() that convert Float32Array to/from number[]. This means serialized vectors are 2-3x larger than their in-memory Float32Array representation.

---

## Implications for our use case

At 1,000 documents with 384-dim vectors:
- JSON format: likely 5-15 MB on disk (depends on document content)
- binary (msgpack): likely 3-10 MB
- seqproto: likely 2-8 MB (most compact)

Load time: JSON.parse() of 10 MB is ~50-100ms. Binary formats should be faster.

Writing to disk: we'd use Node.js fs.writeFile() with the serialized output.

---

## Gaps / follow-ups

- No incremental persistence — every save is a full snapshot
- No deserialization benchmarks published
- seqproto format is undocumented (binary protocol details internal to implementation)
- Vector serialization bloat (Float32Array -> number[] -> JSON)
