/** Eingabevalidierung für Rechnungen (Zod). */
import { z } from 'zod';
import { RECHNUNG_STATUS } from '@rent2cool/shared';

export const rechnungErstellenSchema = z.object({
  mieteId: z.string().uuid(),
  /** Nettobetrag in Euro (wird in Cent umgerechnet). */
  netto: z.coerce.number().positive(),
  /** Optionaler Steuersatz in Prozent; sonst Standard aus der Konfiguration. */
  steuerSatz: z.coerce.number().int().min(0).max(100).optional(),
});
export type RechnungErstellen = z.infer<typeof rechnungErstellenSchema>;

export const rechnungStatusSchema = z.object({ status: z.enum(RECHNUNG_STATUS) });

export const listeAbfrageSchema = z.object({
  status: z.string().optional(),
  kundeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
