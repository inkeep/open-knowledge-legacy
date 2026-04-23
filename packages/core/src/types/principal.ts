import type { PrincipalId } from './actor.ts';

export type Principal = {
  id: PrincipalId;
  display_name: string;
  display_email: string;
  source: 'git-config' | 'synthesized';
  created_at: string;
};
