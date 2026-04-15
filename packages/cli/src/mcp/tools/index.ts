/**
 * MCP tool registry.
 *
 * Aggregates workflow tools (init-content, ingest, research, consolidate),
 * document tools (write_document, edit_document, rename_document,
 * undo_agent_edit, redo_agent_edit, list_documents), link-graph tools
 * (get_backlinks, get_forward_links, get_orphans, get_hubs, find_dead_links),
 * and enriched tools
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
import {
  DESCRIPTION as CONSOLIDATE_DESCRIPTION,
  register as registerConsolidate,
} from './consolidate.ts';
import {
  DESCRIPTION as EDIT_DOCUMENT_DESCRIPTION,
  register as registerEditDocument,
} from './edit-document.ts';
import { DESCRIPTION as EXEC_DESCRIPTION, register as registerExec } from './exec.ts';
import {
  DESCRIPTION as GET_BACKLINKS_DESCRIPTION,
  register as registerGetBacklinks,
} from './get-backlinks.ts';
import {
  DESCRIPTION as GET_DEAD_LINKS_DESCRIPTION,
  register as registerGetDeadLinks,
} from './get-dead-links.ts';
import {
  DESCRIPTION as GET_FORWARD_LINKS_DESCRIPTION,
  register as registerGetForwardLinks,
} from './get-forward-links.ts';
import {
  DESCRIPTION as GET_HISTORY_DESCRIPTION,
  register as registerGetHistory,
} from './get-history.ts';
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
  DESCRIPTION as RENAME_DOCUMENT_DESCRIPTION,
  register as registerRenameDocument,
} from './rename-document.ts';
import { DESCRIPTION as RESEARCH_DESCRIPTION, register as registerResearch } from './research.ts';
import {
  DESCRIPTION as ROLLBACK_DESCRIPTION,
  register as registerRollbackToVersion,
} from './rollback-to-version.ts';
import {
  register as registerSaveVersion,
  DESCRIPTION as SAVE_VERSION_DESCRIPTION,
} from './save-version.ts';
import { register as registerSearch, DESCRIPTION as SEARCH_DESCRIPTION } from './search.ts';
import type { ServerInstance } from './shared.ts';
import {
  register as registerSuggestLinks,
  DESCRIPTION as SUGGEST_LINKS_DESCRIPTION,
} from './suggest-links.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

export type { ServerInstance } from './shared.ts';
export { textResult } from './shared.ts';

/** Tool descriptions keyed by name — used by INSTRUCTIONS in server.ts to avoid duplication. */
export const TOOL_DESCRIPTIONS = {
  exec: EXEC_DESCRIPTION,
  'init-content': INIT_CONTENT_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
  consolidate: CONSOLIDATE_DESCRIPTION,
  read_document: READ_DOCUMENT_DESCRIPTION,
  rename_document: RENAME_DOCUMENT_DESCRIPTION,
  search: SEARCH_DESCRIPTION,
  suggest_links: SUGGEST_LINKS_DESCRIPTION,
  write_document: WRITE_DOCUMENT_DESCRIPTION,
  edit_document: EDIT_DOCUMENT_DESCRIPTION,
  get_history: GET_HISTORY_DESCRIPTION,
  save_version: SAVE_VERSION_DESCRIPTION,
  rollback_to_version: ROLLBACK_DESCRIPTION,
  list_documents: LIST_DOCUMENTS_DESCRIPTION,
  get_backlinks: GET_BACKLINKS_DESCRIPTION,
  get_forward_links: GET_FORWARD_LINKS_DESCRIPTION,
  get_orphans: GET_ORPHANS_DESCRIPTION,
  get_hubs: GET_HUBS_DESCRIPTION,
  find_dead_links: GET_DEAD_LINKS_DESCRIPTION,
} as const;

export interface RegisterAllToolsOptions {
  serverUrl?: string;
  projectDir: string;
  config: Config;
}

export function registerAllTools(server: ServerInstance, opts: RegisterAllToolsOptions): void {
  // exec — the primary surface (V0-24 / L2-aggressive per D2).
  registerExec(server, {
    projectDir: opts.projectDir,
    serverUrl: opts.serverUrl,
  });

  // Workflow tools — return instructional text, no server connection needed
  registerInitContent(server, opts.config);
  registerIngest(server, opts.config);
  registerResearch(server, opts.config);
  registerConsolidate(server, opts.config);

  // Enriched read/search — kept as typed call sites (advanced); exec is primary.
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
  registerSuggestLinks(server, opts.serverUrl);

  // Document tools — make HTTP calls to Hocuspocus
  registerWriteDocument(server, opts.serverUrl);
  registerEditDocument(server, opts.serverUrl);
  registerRenameDocument(server, opts.serverUrl);
  registerGetHistory(server, opts.serverUrl);
  registerSaveVersion(server, opts.serverUrl);
  registerRollbackToVersion(server, opts.serverUrl);
  registerListDocuments(server, opts.serverUrl);
  registerGetBacklinks(server, opts.serverUrl);
  registerGetForwardLinks(server, opts.serverUrl);
  registerGetOrphans(server, opts.serverUrl);
  registerGetHubs(server, opts.serverUrl);
  registerGetDeadLinks(server, opts.serverUrl);
}
