import { type AnyOrama, create, insertMultiple, search } from '@orama/orama';

export type WorkspaceSearchKind = 'page' | 'folder';
export type WorkspaceSearchIntent = 'omnibar' | 'autocomplete' | 'full_text';
export type WorkspaceSearchScope = WorkspaceSearchKind | 'content';

export interface WorkspaceSearchDocument {
  id: string;
  kind: WorkspaceSearchKind;
  path: string;
  title: string;
  name: string;
  pathSegments: string;
  content: string;
  modifiedTs: number;
}

export interface WorkspaceSearchResult {
  document: WorkspaceSearchDocument;
  score: number;
  signals: {
    lexical: number;
    fullText: number;
    recency: number;
  };
}

export interface WorkspaceSearchOptions {
  intent?: WorkspaceSearchIntent;
  scopes?: readonly WorkspaceSearchScope[];
  limit?: number;
}

export interface WorkspaceSearchCorpus {
  documents: readonly WorkspaceSearchDocument[];
  index: AnyOrama;
}

export const DEFAULT_WORKSPACE_SEARCH_LIMIT = 20;
export const MAX_WORKSPACE_SEARCH_LIMIT = 100;

const WORKSPACE_SEARCH_SCHEMA = {
  id: 'string',
  kind: 'enum',
  path: 'string',
  title: 'string',
  name: 'string',
  pathSegments: 'string',
  content: 'string',
  modifiedTs: 'number',
} as const;

type WorkspaceSearchDocumentField = 'title' | 'name' | 'path' | 'pathSegments' | 'content';

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_WORKSPACE_SEARCH_LIMIT;
  return Math.max(1, Math.min(MAX_WORKSPACE_SEARCH_LIMIT, Math.trunc(limit)));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function workspaceSearchBasename(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function workspaceSearchPathSegments(path: string): string {
  return path.split('/').filter(Boolean).join(' ');
}

export function createWorkspaceSearchDocument(input: {
  kind: WorkspaceSearchKind;
  path: string;
  title?: string | null;
  content?: string | null;
  modifiedTs?: number | null;
}): WorkspaceSearchDocument {
  const name = workspaceSearchBasename(input.path);
  const title = input.title?.trim() || name;
  const modifiedTs = input.modifiedTs ?? 0;
  return {
    id: `${input.kind}:${input.path}`,
    kind: input.kind,
    path: input.path,
    title,
    name,
    pathSegments: workspaceSearchPathSegments(input.path),
    content: input.content ?? '',
    modifiedTs: Number.isFinite(modifiedTs) ? modifiedTs : 0,
  };
}

export function createWorkspaceSearchIndex(
  documents: readonly WorkspaceSearchDocument[],
): AnyOrama {
  const db = create({ schema: WORKSPACE_SEARCH_SCHEMA });
  if (documents.length > 0) {
    insertMultiple(db, documents as WorkspaceSearchDocument[]);
  }
  return db;
}

export function createWorkspaceSearchCorpus(
  documents: readonly WorkspaceSearchDocument[],
): WorkspaceSearchCorpus {
  return {
    documents,
    index: createWorkspaceSearchIndex(documents),
  };
}

function defaultScopes(intent: WorkspaceSearchIntent): readonly WorkspaceSearchScope[] {
  if (intent === 'autocomplete') return ['page'];
  if (intent === 'full_text') return ['page', 'content'];
  return ['page', 'folder'];
}

function scopeAllows(document: WorkspaceSearchDocument, scopes: ReadonlySet<WorkspaceSearchScope>) {
  if (scopes.has(document.kind)) return true;
  return document.kind === 'page' && scopes.has('content');
}

function lexicalScore(document: WorkspaceSearchDocument, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const title = normalize(document.title);
  const name = normalize(document.name);
  const path = normalize(document.path);
  const pathSegments = path.split('/');

  if (title === normalizedQuery || name === normalizedQuery) return 700;
  if (path === normalizedQuery) return 650;
  if (title.startsWith(normalizedQuery) || name.startsWith(normalizedQuery)) return 600;
  if (pathSegments.some((segment) => segment.startsWith(normalizedQuery))) return 550;
  if (title.includes(normalizedQuery) || name.includes(normalizedQuery)) return 500;
  if (path.includes(normalizedQuery)) return 450;
  return -1;
}

function recencyScores(documents: readonly WorkspaceSearchDocument[]): Map<string, number> {
  const modifiedValues = documents
    .map((document) => document.modifiedTs)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (modifiedValues.length === 0) return new Map();

  const min = Math.min(...modifiedValues);
  const max = Math.max(...modifiedValues);
  const range = Math.max(1, max - min);
  return new Map(
    documents.map((document) => [
      document.id,
      document.modifiedTs > 0 ? ((document.modifiedTs - min) / range) * 50 : 0,
    ]),
  );
}

function searchProperties(intent: WorkspaceSearchIntent): WorkspaceSearchDocumentField[] {
  if (intent === 'full_text') return ['title', 'name', 'path', 'pathSegments', 'content'];
  return ['title', 'name', 'path', 'pathSegments'];
}

function searchBoost(
  intent: WorkspaceSearchIntent,
): Partial<Record<WorkspaceSearchDocumentField, number>> {
  if (intent === 'full_text') {
    return { title: 8, name: 7, path: 5, pathSegments: 4, content: 1 };
  }
  if (intent === 'autocomplete') {
    return { title: 10, name: 9, path: 5, pathSegments: 4 };
  }
  return { title: 8, name: 7, path: 5, pathSegments: 4 };
}

function toleranceFor(intent: WorkspaceSearchIntent, query: string): number {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 4) return 0;
  return intent === 'full_text' ? 1 : 0;
}

export function searchWorkspaceDocuments(
  documents: readonly WorkspaceSearchDocument[],
  query: string,
  options: WorkspaceSearchOptions = {},
): WorkspaceSearchResult[] {
  return searchWorkspaceCorpus(createWorkspaceSearchCorpus(documents), query, options);
}

export function searchWorkspaceCorpus(
  corpus: WorkspaceSearchCorpus,
  query: string,
  options: WorkspaceSearchOptions = {},
): WorkspaceSearchResult[] {
  const intent = options.intent ?? 'omnibar';
  const limit = clampLimit(options.limit);
  const scopes = new Set(options.scopes ?? defaultScopes(intent));
  const scopedDocuments = corpus.documents.filter((document) => scopeAllows(document, scopes));
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return scopedDocuments
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((document) => ({
        document,
        score: 0,
        signals: { lexical: 0, fullText: 0, recency: 0 },
      }));
  }

  const fullTextResults = search(corpus.index, {
    term: normalizedQuery,
    properties: searchProperties(intent),
    boost: searchBoost(intent),
    tolerance: toleranceFor(intent, normalizedQuery),
    limit: Math.max(limit * 4, 40),
  }) as {
    hits: Array<{ score: number; document: WorkspaceSearchDocument }>;
  };
  const fullTextScores = new Map(
    fullTextResults.hits
      .filter((hit) => scopeAllows(hit.document, scopes))
      .map((hit) => [hit.document.id, hit.score] as const),
  );
  const recency = recencyScores(scopedDocuments);
  const candidates = new Map<string, WorkspaceSearchDocument>();

  for (const document of scopedDocuments) {
    if (lexicalScore(document, normalizedQuery) >= 0) {
      candidates.set(document.id, document);
    }
  }
  for (const hit of fullTextResults.hits) {
    if (!scopeAllows(hit.document, scopes)) continue;
    candidates.set(hit.document.id, hit.document);
  }

  return [...candidates.values()]
    .map((document) => {
      const lexical = Math.max(0, lexicalScore(document, normalizedQuery));
      const fullText = fullTextScores.get(document.id) ?? 0;
      const recencyScore = recency.get(document.id) ?? 0;
      return {
        document,
        score: lexical + fullText * 20 + recencyScore,
        signals: { lexical, fullText, recency: recencyScore },
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.document.path.localeCompare(b.document.path);
    })
    .slice(0, limit);
}
