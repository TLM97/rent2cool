/** Eingabevalidierung für Kunde & Fahrer (Zod). */
import { z } from 'zod';
import { FAHRER_STATUS, KUNDE_STATUS } from '@rent2cool/shared';

export const kundeErstellenSchema = z.object({
  firmenname: z.string().min(1),
  handelsregisternummer: z.string().optional(),
  ustId: z.string().optional(),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  land: z.string().default('DE'),
});
export type KundeErstellen = z.infer<typeof kundeErstellenSchema>;

export const kundeStatusSchema = z.object({ status: z.enum(KUNDE_STATUS) });

export const fahrerErstellenSchema = z.object({
  name: z.string().min(1),
  fuehrerscheinKlasse: z.string().min(1),
  fuehrerscheinNummer: z.string().optional(),
  fuehrerscheinGueltigBis: z.string().datetime({ offset: true }).optional(),
});
export type FahrerErstellen = z.infer<typeof fahrerErstellenSchema>;

export const fahrerStatusSchema = z.object({ status: z.enum(FAHRER_STATUS) });

export const listeAbfrageSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
