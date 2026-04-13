/**
 * MCP tool registry.
 *
 * Aggregates workflow tools (init-content, ingest, research, consolidate),
 * document tools (write_document, edit_document, undo_agent_edit,
 * redo_agent_edit, list_documents), link-graph tools (get_backlinks,
 * get_forward_links, get_orphans, get_hubs), and enriched tools
 * (read_document, search) into a single `registerAllTools` function that
 * `server.ts` calls during startup.
 *
 * - Workflow tools return instructional text and don't need a server connection.
 * - Document tools make HTTP calls to Hocuspocus and require `serverUrl`.
 * - Enriched tools (read_document, search) need filesystem + catalog access
 *   plus (optionally) Hocuspocus for backlinks.
 *
 * To add a new tool: create `packages/cli/src/mcp/tools/<name>.ts` with a
 * `register(...)` export, then import and call it from here.
 */
import type { Config } from '../../config/schema.ts';
import type { CatalogStore } from '../../content/catalog-store.ts';
import {
  DESCRIPTION as CONSOLIDATE_DESCRIPTION,
  register as registerConsolidate,
} from './consolidate.ts';
import {
  DESCRIPTION as EDIT_DOCUMENT_DESCRIPTION,
  register as registerEditDocument,
} from './edit-document.ts';
import {
  DESCRIPTION as GET_BACKLINKS_DESCRIPTION,
  register as registerGetBacklinks,
} from './get-backlinks.ts';
import {
  DESCRIPTION as GET_FORWARD_LINKS_DESCRIPTION,
  register as registerGetForwardLinks,
} from './get-forward-links.ts';
import { DESCRIPTION as GET_HUBS_DESCRIPTION, register as registerGetHubs } from './get-hubs.ts';
import {
  DESCRIPTION as GET_ORPHANS_DESCRIPTION,
  register as registerGetOrphans,
} from './get-orphans.ts';
import { DESCRIPTION as INGEST_DESCRIPTION, register as registerIngest } from './ingest.ts';
import {
  DESCRIPTION as INIT_CONTENT_DESCRIPTION,
  register as registerInitContent,
} from './init-content.ts';
import {
  DESCRIPTION as LIST_DOCUMENTS_DESCRIPTION,
  register as registerListDocuments,
} from './list-documents.ts';
import {
  DESCRIPTION as READ_DOCUMENT_DESCRIPTION,
  register as registerReadDocument,
} from './read-document.ts';
import {
  DESCRIPTION as REDO_AGENT_EDIT_DESCRIPTION,
  register as registerRedoAgentEdit,
} from './redo-agent-edit.ts';
import { DESCRIPTION as RESEARCH_DESCRIPTION, register as registerResearch } from './research.ts';
import { register as registerSearch, DESCRIPTION as SEARCH_DESCRIPTION } from './search.ts';
import type { ServerInstance } from './shared.ts';
import {
  register as registerUndoAgentEdit,
  DESCRIPTION as UNDO_AGENT_EDIT_DESCRIPTION,
} from './undo-agent-edit.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

export type { ServerInstance } from './shared.ts';
export { textResult } from './shared.ts';

/** Tool descriptions keyed by name — used by INSTRUCTIONS in server.ts to avoid duplication. */
export const TOOL_DESCRIPTIONS = {
  'init-content': INIT_CONTENT_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
  consolidate: CONSOLIDATE_DESCRIPTION,
  read_document: READ_DOCUMENT_DESCRIPTION,
  search: SEARCH_DESCRIPTION,
  write_document: WRITE_DOCUMENT_DESCRIPTION,
  edit_document: EDIT_DOCUMENT_DESCRIPTION,
  undo_agent_edit: UNDO_AGENT_EDIT_DESCRIPTION,
  redo_agent_edit: REDO_AGENT_EDIT_DESCRIPTION,
  list_documents: LIST_DOCUMENTS_DESCRIPTION,
  get_backlinks: GET_BACKLINKS_DESCRIPTION,
  get_forward_links: GET_FORWARD_LINKS_DESCRIPTION,
  get_orphans: GET_ORPHANS_DESCRIPTION,
  get_hubs: GET_HUBS_DESCRIPTION,
} as const;

export interface RegisterAllToolsOptions {
  serverUrl?: string;
  projectDir: string;
  config: Config;
  catalog: CatalogStore;
}

export function registerAllTools(server: ServerInstance, opts: RegisterAllToolsOptions): void {
  // Workflow tools — return instructional text, no server connection needed
  registerInitContent(server);
  registerIngest(server);
  registerResearch(server);
  registerConsolidate(server);

  // Enriched read/search — filesystem + shadow-repo + (optionally) Hocuspocus for backlinks.
  // Folder catalog was removed in D19 (per-file frontmatter is source of truth).
  registerReadDocument(server, {
    projectDir: opts.projectDir,
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerSearch(server, {
    projectDir: opts.projectDir,
    config: opts.config,
    serverUrl: opts.serverUrl,
  });

  // Document tools — make HTTP calls to Hocuspocus
  registerWriteDocument(server, opts.serverUrl);
  registerEditDocument(server, opts.serverUrl);
  registerUndoAgentEdit(server, opts.serverUrl);
  registerRedoAgentEdit(server, opts.serverUrl);
  registerListDocuments(server, opts.serverUrl);
  registerGetBacklinks(server, opts.serverUrl);
  registerGetForwardLinks(server, opts.serverUrl);
  registerGetOrphans(server, opts.serverUrl);
  registerGetHubs(server, opts.serverUrl);
}
