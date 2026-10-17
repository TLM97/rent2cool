/** Eingabevalidierung der Fahrzeugakte (Schemas geteilt in @rent2cool/shared, D-001). */
import { z } from 'zod';
import { FAHRZEUG_STATUS } from '@rent2cool/shared';

export {
  aggregatEingabeSchema,
  fahrzeugAendernSchema,
  fahrzeugErstellenSchema,
  fahrzeugStatusSchema as statusAendernSchema,
  kalibrierungSchema,
  sensorEingabeSchema,
  sensorTauschSchema,
  type FahrzeugAendern,
  type FahrzeugErstellen,
  type KalibrierungEingabe,
  type SensorTausch,
} from '@rent2cool/shared';

export const listeAbfrageSchema = z.object({
  status: z.enum(FAHRZEUG_STATUS).optional(),
  standortId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
