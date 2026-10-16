/** Eingabevalidierung für Mieten (Zod). */
import { z } from 'zod';
import { MIETE_STATUS } from '@rent2cool/shared';

export const mieteErstellenSchema = z.object({
  kundeId: z.string().uuid(),
  fahrzeugId: z.string().uuid(),
  fahrerId: z.string().uuid().optional(),
  standortAbholId: z.string().uuid().optional(),
  standortRueckgabeId: z.string().uuid().optional(),
  region: z.string().optional(),
  startGeplant: z.string().datetime({ offset: true }),
  endeGeplant: z.string().datetime({ offset: true }),
  tarif: z.string().optional(),
  auslandsfahrtGeplant: z.boolean().default(false),
  temperaturprofil: z.string().optional(),
  idempotencyKey: z.string().min(1).optional(),
});
export type MieteErstellen = z.infer<typeof mieteErstellenSchema>;

export const mieteStatusSchema = z.object({ status: z.enum(MIETE_STATUS) });

export const listeAbfrageSchema = z.object({
  status: z.string().optional(),
  kundeId: z.string().uuid().optional(),
  fahrzeugId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
