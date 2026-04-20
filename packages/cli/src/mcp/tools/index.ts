/**
 * MCP tool registry.
 *
 * Aggregates workflow tools (init-content, ingest, research, consolidate),
 * document tools (write_document, edit_document, rename_document,
 * undo_agent_edit, redo_agent_edit, list_documents), link-graph tools
 * (get_backlinks, get_forward_links, get_orphans, get_hubs, get_dead_links),
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
import type { AgentIdentity } from '../agent-identity.ts';
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
import {
  DESCRIPTION as GET_PREVIEW_URL_DESCRIPTION,
  register as registerGetPreviewUrl,
} from './get-preview-url.ts';
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
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  register as registerSuggestLinks,
  DESCRIPTION as SUGGEST_LINKS_DESCRIPTION,
} from './suggest-links.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

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
  get_dead_links: GET_DEAD_LINKS_DESCRIPTION,
  get_preview_url: GET_PREVIEW_URL_DESCRIPTION,
} as const;

/**
 * Per-call cwd resolver. Returns the absolute host directory that the
 * current tool call should operate against. Priority:
 *   1. explicit `cwd` arg from the tool call
 *   2. first MCP root advertised by the client
 *   3. server startup cwd (fallback)
 */
type ResolveCwd = (explicit?: string) => Promise<string>;

interface RegisterAllToolsOptions {
  /**
   * Hocuspocus URL. Accept a string (explicit override, e.g. `--port`), or a
   * lazy resolver that re-discovers per-call from the live project root. The
   * resolver variant is what makes writes work when the MCP process is spawned
   * before the user starts the Hocuspocus server, or when `cwd` at spawn time
   * doesn't match the project root (e.g. Claude Desktop launches with `cwd=/`).
   */
  serverUrl?: ServerUrlOrResolver;
  /** Resolves the cwd for a given tool call (see `ResolveCwd` docs). */
  resolveCwd: ResolveCwd;
  /** Server startup cwd — used only as a test/fallback identity anchor. */
  startupCwd: string;
  config: Config;
  identityRef?: { current: AgentIdentity };
}

export function registerAllTools(server: ServerInstance, opts: RegisterAllToolsOptions): void {
  // exec — the primary surface (V0-24 / L2-aggressive per D2).
  registerExec(server, {
    resolveCwd: opts.resolveCwd,
    serverUrl: opts.serverUrl,
    config: opts.config,
  });

  // Workflow tools — return instructional text, no server connection needed
  registerInitContent(server, {
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerIngest(server, opts.config);
  registerResearch(server, opts.config);
  registerConsolidate(server, opts.config);

  // Enriched read/search — kept as typed call sites (advanced); exec is primary.
  registerReadDocument(server, {
    resolveCwd: opts.resolveCwd,
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerSearch(server, {
    resolveCwd: opts.resolveCwd,
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerSuggestLinks(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });

  // Document tools — make HTTP calls to Hocuspocus
  registerWriteDocument(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
    identityRef: opts.identityRef,
  });
  registerEditDocument(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
    identityRef: opts.identityRef,
  });
  registerRenameDocument(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerGetHistory(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerSaveVersion(server, opts.serverUrl, opts.identityRef);
  registerRollbackToVersion(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerListDocuments(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerGetBacklinks(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerGetForwardLinks(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerGetOrphans(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerGetHubs(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });
  registerGetDeadLinks(server, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: opts.resolveCwd,
  });

  // Preview URL — no Hocuspocus dependency; reads config + server.lock directly.
  registerGetPreviewUrl(server, {
    resolveCwd: opts.resolveCwd,
    config: opts.config,
  });
}
