/**
 * Agent identity — captured from the MCP initialize handshake.
 *
 * Long-lived identity (who is this agent?) is derived from MCP `clientInfo`
 * and a server-generated `connectionId`. Per architectural precedent #8:
 * long-lived identity is separate from short-lived session concerns.
 *
 * `connectionId` is the per-session UUID and is the only stable disambiguator
 * when multiple clients report the same `clientInfo.name` (e.g. two Claude
 * Code instances connected to the same `ok start`). `clientInfo.name` is
 * mandatory in the MCP `InitializeRequestSchema`, so post-handshake every
 * session has a name.
 */

export interface AgentIdentity {
  connectionId: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  /** Derived: clientInfo.name once handshake completes; connectionId beforehand. */
  displayName: string;
  /** Derived: clientInfo.name once handshake completes; connectionId beforehand. */
  colorSeed: string;
}
