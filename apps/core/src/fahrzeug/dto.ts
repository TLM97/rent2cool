/** Eingabevalidierung der Fahrzeugakte (Schemas geteilt in @rent2cool/shared, D-001). */
import { z } from 'zod';
import { FAHRZEUG_STATUS } from '@rent2cool/shared';

export {
  aggregatEingabeSchema,
  fahrzeugErstellenSchema,
  fahrzeugStatusSchema as statusAendernSchema,
  kalibrierungSchema,
  sensorEingabeSchema,
  type FahrzeugErstellen,
  type KalibrierungEingabe,
} from '@rent2cool/shared';

export const listeAbfrageSchema = z.object({
  status: z.enum(FAHRZEUG_STATUS).optional(),
  standortId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
