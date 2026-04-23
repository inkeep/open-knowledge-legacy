---
name: code-trace-existing-attribution-pipeline
description: Trace of how agent-write attribution flows through MCP tool → HTTP API → contributor accumulator → shadow repo commit → parser → TimelinePanel today, with the precise extension points for adding a summary field
type: spec-evidence
sources:
  - packages/cli/src/mcp/tools/write-document.ts
  - packages/cli/src/mcp/tools/edit-document.ts
  - packages/cli/src/mcp/tools/rename-document.ts
  - packages/cli/src/mcp/tools/rollback-to-version.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/contributor-tracker.ts
  - packages/server/src/persistence.ts
  - packages/server/src/shadow-repo.ts
  - packages/core/src/shadow-repo-layout.ts
  - packages/core/src/types/timeline.ts
  - packages/app/src/components/TimelinePanel.tsx
captured: 2026-04-21
---
# Existing attribution pipeline — code trace

## End-to-end pipeline (one MCP write_document call)

### 1. MCP tool layer

`packages/cli/src/mcp/tools/write-document.ts:43-118`

```typescript
server.tool(
  'write_document',
  DESCRIPTION,
  {
    docName: z.string()...,
    markdown: z.string()...,
    position: z.enum(['append', 'prepend', 'replace'])...,
  },
  async (args) => {
    // Resolves server URL via lock file, normalizes docName
    const result = await httpPost(url, '/api/agent-write-md', {
      docName: normalized.docName,
      markdown: args.markdown,
      position: args.position,
      ...(identity ? {
        agentId: identity.connectionId,
        agentName: identity.displayName,
        clientName: identity.clientInfo?.name,
        colorSeed: identity.colorSeed,
      } : {}),
    });
    // Returns text + structured response with previewUrl, hints, warning
  }
);
```

**Extension point for summary:** Add `summary: z.string().max(200).optional()` to the Zod schema, thread through to `httpPost` body.

### 2. HTTP API handler

`packages/server/src/api-extension.ts:1112-1218` (`handleAgentWriteMd`)

Body parsing extracts: `markdown`, `position`, `docName`, then `extractAgentIdentity` extracts agent fields:

```typescript
function extractAgentIdentity(body: Record<string, unknown>): {
  rawAgentId: string | undefined;
  agentId: string;
  agentName: string;
  colorSeed: string;
  clientName: string | undefined;
} { /* api-extension.ts:1011-1039 */ }
```

After the Y.Doc transaction completes:

```typescript
recordContributor(resolvedDocName, agentId, agentName, colorSeed);
```

Then `flushDocToGit(resolvedDocName, 'agent-write-md')`.

**Extension point for summary:** Add `summary` extraction in body parsing (or extend `extractAgentIdentity` → rename to `extractWriteMetadata`). Truncate to 50 chars with `…` if needed. Pass to `recordContributor` as 5th arg. Track `truncatedFrom` for response.

### 3. Contributor accumulator

`packages/server/src/contributor-tracker.ts`

```typescript
interface ContributorEntry {
  agentId: string;
  displayName: string;
  colorSeed: string;
  docs: Set<string>;
  // EXTENSION: summariesByDoc: Map<string, string[]>;
}

let pendingContributors = new Map<string, ContributorEntry>();

export function recordContributor(
  docName: string, agentId: string, displayName: string, colorSeed?: string,
  // EXTENSION: summary?: string,
): void {
  let entry = pendingContributors.get(agentId);
  if (!entry) {
    entry = {
      agentId, displayName, colorSeed: colorSeed ?? displayName,
      docs: new Set(),
      // EXTENSION: summariesByDoc: new Map(),
    };
    pendingContributors.set(agentId, entry);
  }
  entry.docs.add(docName);
  // EXTENSION:
  // if (summary) {
  //   const arr = entry.summariesByDoc.get(docName) ?? [];
  //   arr.push(summary);
  //   entry.summariesByDoc.set(docName, arr);
  // }
}
```

`swapContributors()` atomically drains; `restoreContributors(snapshot)` merges back on commit failure (must also merge `summariesByDoc` arrays).

`formatContributorsFrom(snapshot)` emits one `ok-contributors:` line per contributor:

```typescript
ok-contributors: {"v":1,"id":"agent-abc","name":"Claude","colorSeed":"...","docs":["foo.md"]}
```

**Extension:** When `summariesByDoc` non-empty, include in JSON.

### 4. L2 debounce + shadow commit

`packages/server/src/persistence.ts:164-203` (`commitToWipRef`)

```typescript
const snapshot = swapContributors();
const contributors = formatContributorsFrom(snapshot);
const message = `WIP auto-save ${new Date().toISOString()}${contributors}`;
const sha = await commitWip(shadow, defaultWriter, contentRoot, message, branch);
```

On failure: `restoreContributors(snapshot)` merges contributor map back (preserves attribution + summaries).

**No changes needed at this layer** — message format is opaque to the persistence code; `formatContributorsFrom` handles the new field.

### 5. Shadow commit

`packages/server/src/shadow-repo.ts:126-203` (`commitWip`)

Plumbing only — uses `git commit-tree` with the message string. No knowledge of contributor schema.

### 6. Read path

`packages/core/src/shadow-repo-layout.ts:127-157` (`parseContributors`)

```typescript
export function parseContributors(body: string): ShadowContributor[] {
  if (!body) return [];
  const contributors: ShadowContributor[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(OK_CONTRIBUTORS_PREFIX)) continue;
    try {
      const parsed = JSON.parse(trimmed.slice(OK_CONTRIBUTORS_PREFIX.length)) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'id' in parsed && typeof (parsed as Record<string, unknown>).id === 'string' &&
        'name' in parsed && typeof (parsed as Record<string, unknown>).name === 'string' &&
        'docs' in parsed && Array.isArray((parsed as Record<string, unknown>).docs) &&
        ((parsed as Record<string, unknown>).docs as unknown[]).every((d) => typeof d === 'string') &&
        (!('colorSeed' in parsed) || typeof (parsed as Record<string, unknown>).colorSeed === 'string')
      ) {
        contributors.push(parsed as ShadowContributor);
      }
    } catch { /* skip malformed */ }
  }
  return contributors;
}
```

**Extension point:** Add `summariesByDoc` to the type guard — validate it's `Record<string, string[]>` if present, drop if malformed (don't fail the whole parse).

### 7. Type extension

`packages/core/src/shadow-repo-layout.ts:111-118`

```typescript
export interface ShadowContributor {
  v?: number;
  id: string;
  name: string;
  colorSeed?: string;
  docs: string[];
  // EXTENSION: summariesByDoc?: Record<string, string[]>;
}
```

### 8. TimelineEntry

`packages/core/src/types/timeline.ts:9-26` — already passes through `contributors: ShadowContributor[]`. Extension is automatic.

### 9. Render

`packages/app/src/components/TimelinePanel.tsx:203-276` (`EntryRow`)

Currently:

```tsx
const allDocs = entry.contributors.flatMap((c) => c.docs);
// ...
{allDocs.length > 0 ? (
  <p className="truncate text-xs text-muted-foreground" title={allDocs.join(', ')}>
    {allDocs.join(', ')}
  </p>
) : (
  <p className="truncate text-xs text-muted-foreground" title={entry.message}>
    {entry.message}
  </p>
)}
```

**Extension point:** Add bullet rendering between author header and doc-list:

```tsx
const allSummaries = entry.contributors.flatMap((c) =>
  Object.values(c.summariesByDoc ?? {}).flat()
);
// Render <ul>{allSummaries.map(s => <li>{s}</li>)}</ul> when non-empty
```

## Commits that DON'T flow through this pipeline

- **`commitUpstreamImport`** (shadow-repo.ts:221) — uses `UPSTREAM_WRITER`, message: `upstream: import from <oldHead>..<newHead>`. Out of scope.
- **`safetyCheckpoint`** (shadow-repo.ts:260) — uses `SAFETY_WRITER`, message: `safety-checkpoint: pre-<action>`. Out of scope.
- **`saveInMemoryCheckpoint`** (shadow-repo.ts:321) — direct write, not via `commitWip`. Out of scope.
- **`saveVersion`** — not investigated in this trace; uses `defaultWriter` per persistence path.

## Endpoints that need API-side summary plumbing

| Endpoint                                      | Calls `recordContributor`?  | Notes                                                     |
| --------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| `/api/agent-write` (api-extension.ts:1041)    | ✅ yes (line 1098)           | legacy non-md endpoint; used by agent-sim                 |
| `/api/agent-write-md` (api-extension.ts:1112) | ✅ yes (line 1183)           | primary MCP write\_document path                          |
| `/api/agent-patch` (api-extension.ts:\~1660)  | ✅ yes (need to verify line) | MCP edit\_document path                                   |
| `/api/rename` (api-extension.ts:2657)         | ❌ NO                        | open question Q2 — needs decision on attribution plumbing |
| `/api/rollback` (api-extension.ts:2129)       | ❌ NO                        | open question Q1 — same                                   |
