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

/** Suche buchbarer Fahrzeuge für einen Zeitraum. */
export const verfuegbarAbfrageSchema = z
  .object({
    von: z.string().datetime({ offset: true }),
    bis: z.string().datetime({ offset: true }),
    /** Teil des Kennzeichens. */
    suche: z.string().max(50).optional(),
    /** Führerscheinklasse des Fahrers – nur Fahrzeuge, die er fahren darf. */
    fahrerKlasse: z.string().max(5).optional(),
    /** `true` bei geplanter Auslandsfahrt (D-006). Bewusst kein coerce: „false“ wäre sonst wahr. */
    fahrtenschreiber: z.enum(['true', 'false']).optional(),
    /** Abholstandort: nur Fahrzeuge mit diesem Heimatstandort. */
    standortId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((a) => new Date(a.bis).getTime() > new Date(a.von).getTime(), {
    message: 'bis muss nach von liegen',
    path: ['bis'],
  });
