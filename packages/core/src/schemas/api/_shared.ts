import { z } from 'zod';

export const safeDocNameField = z
  .string()
  .refine(
    (s) => !s.includes('..') && !s.startsWith('/') && !s.includes('\x00') && !s.includes('\\'),
    { message: 'docName contains unsafe path characters' },
  )
  .optional();

export const agentIdentityFields = {
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  colorSeed: z.string().optional(),
  clientName: z.string().optional(),
  clientVersion: z.string().optional(),
  label: z.string().optional(),
};

export const summaryField = z.string().optional();

export const URN_UUID_RE =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
