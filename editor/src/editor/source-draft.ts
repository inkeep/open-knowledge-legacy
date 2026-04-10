export interface SourceDraftGateInput {
  isEditable: boolean;
  diskConflict: string;
  isDirty: boolean;
  draftBaseRevision: number;
  canonicalRevision: number;
}

export interface SourceDraftGateState {
  isStale: boolean;
  canApply: boolean;
}

export function evaluateSourceDraftGate(input: SourceDraftGateInput): SourceDraftGateState {
  const isStale =
    input.isEditable && input.isDirty && input.draftBaseRevision !== input.canonicalRevision;
  const canApply = input.isEditable && input.isDirty && !input.diskConflict && !isStale;
  return { isStale, canApply };
}
