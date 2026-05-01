/**
 * Server-side constants. The MCP server name is the wire-level identity the
 * `ok start` HTTP MCP endpoint advertises and the canonical key editor configs
 * use to identify the Open Knowledge entry. CLI editor wiring imports this
 * via `@inkeep/open-knowledge-server` so name + value stay in lockstep.
 */
export const MCP_SERVER_NAME = 'open-knowledge';
