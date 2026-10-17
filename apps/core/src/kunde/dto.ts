/** Eingabevalidierung für Kunde & Fahrer (Schemas geteilt in @rent2cool/shared, D-001). */
import { z } from 'zod';

export {
  fahrerAendernSchema,
  fahrerErstellenSchema,
  fahrerStatusSchema,
  kundeAendernSchema,
  kundeErstellenSchema,
  kundeStatusSchema,
  type FahrerAendern,
  type FahrerErstellen,
  type KundeAendern,
  type KundeErstellen,
} from '@rent2cool/shared';

export const listeAbfrageSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
