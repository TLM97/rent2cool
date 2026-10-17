/** Eingabevalidierung für Mieten (Schemas geteilt in @rent2cool/shared, D-001). */
import { z } from 'zod';

export { mieteErstellenSchema, mieteStatusSchema, type MieteErstellen } from '@rent2cool/shared';

export const listeAbfrageSchema = z.object({
  status: z.string().optional(),
  kundeId: z.string().uuid().optional(),
  fahrzeugId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
