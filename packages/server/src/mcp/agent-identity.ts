export interface AgentIdentity {
  connectionId: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  displayName: string;
  colorSeed: string;
}

export const MCP_CONNECTION_ID_HEADER = 'x-ok-connection-id';
