/**
 * Agent identity — captured from the MCP initialize handshake.
 *
 * Long-lived identity (who is this agent?) is derived from MCP clientInfo
 * and a server-generated connectionId. Per architectural precedent #8:
 * long-lived identity is separate from short-lived session concerns.
 */

export interface AgentIdentity {
  connectionId: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  /** User-provided via AGENT_LABEL env var in .mcp.json */
  label?: string;
  /** Derived: label || clientInfo.name || "Agent" */
  displayName: string;
  /** Derived: label ?? clientInfo?.name ?? connectionId — stable seed hierarchy */
  colorSeed: string;
}
