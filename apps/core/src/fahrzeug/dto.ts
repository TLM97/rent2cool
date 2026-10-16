/** Eingabevalidierung der Fahrzeugakte mit Zod (D-001). */
import { z } from 'zod';
import { FAHRZEUG_STATUS } from '@rent2cool/shared';

export const sensorEingabeSchema = z.object({
  messgroesse: z.string().min(1),
  einheit: z.string().min(1),
  modell: z.string().optional(),
  seriennummer: z.string().optional(),
});

export const aggregatEingabeSchema = z.object({
  typ: z.string().optional(),
  hersteller: z.string().optional(),
  seriennummer: z.string().optional(),
  temperaturQuelle: z.string().optional(),
  sensoren: z.array(sensorEingabeSchema).default([]),
});

export const fahrzeugErstellenSchema = z.object({
  kennzeichen: z.string().min(1),
  vin: z.string().optional(),
  fahrzeugprofil: z.string().optional(),
  zulGesamtmasseKg: z.coerce.number().int().positive(),
  benoetigteFuehrerscheinklasse: z.string().default('B'),
  hatFahrtenschreiber: z.boolean().default(false),
  standardTemperaturprofil: z.string().optional(),
  standortId: z.string().uuid().optional(),
  region: z.string().optional(),
  aggregat: aggregatEingabeSchema.optional(),
});
export type FahrzeugErstellen = z.infer<typeof fahrzeugErstellenSchema>;

export const statusAendernSchema = z.object({
  status: z.enum(FAHRZEUG_STATUS),
});

export const kalibrierungSchema = z.object({
  durchgefuehrtAm: z.string().datetime({ offset: true }),
  gueltigBis: z.string().datetime({ offset: true }),
  pruefstelle: z.string().optional(),
  zertifikatRef: z.string().optional(),
  ergebnis: z.string().optional(),
});
export type KalibrierungEingabe = z.infer<typeof kalibrierungSchema>;

export const listeAbfrageSchema = z.object({
  status: z.enum(FAHRZEUG_STATUS).optional(),
  standortId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
