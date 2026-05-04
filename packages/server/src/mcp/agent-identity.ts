export interface AgentIdentity {
  connectionId: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  displayName: string;
  colorSeed: string;
}
