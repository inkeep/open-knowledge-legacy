export interface AgentIdentity {
  connectionId: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  label?: string;
  displayName: string;
  colorSeed: string;
}
