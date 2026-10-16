import { BadRequestException, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { TemperaturNachweis } from '@rent2cool/shared';
import { Roles } from '../auth/decorators';
import { Audited } from '../audit/audited.decorator';
import { BerichtService, type ErzeugeParams } from './bericht.service';

const anfrageSchema = z.object({
  fahrzeugId: z.string().uuid(),
  von: z.string().datetime({ offset: true }),
  bis: z.string().datetime({ offset: true }),
  profil: z.string().default('2-8'),
  messgroesse: z.string().default('temperatur_laderaum'),
  lueckeMin: z.coerce.number().positive().default(5),
  format: z.string().default('json'),
});

function parse(q: unknown): z.infer<typeof anfrageSchema> {
  const r = anfrageSchema.safeParse(q);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  }
  return r.data;
}

function zuParams(q: z.infer<typeof anfrageSchema>): ErzeugeParams {
  return {
    fahrzeugId: q.fahrzeugId,
    messgroesse: q.messgroesse,
    von: q.von,
    bis: q.bis,
    profilName: q.profil,
    lueckeSchwelleMin: q.lueckeMin,
  };
}

/**
 * Temperaturnachweis v1 (zentrales Verkaufsargument). Schnittstelle zuerst
 * (ROADMAP); Oberflächen später. Bezieht sich auf Fahrzeug + Zeitraum, bis die
 * Entität Miete freigegeben ist (siehe docs/STATUS.md).
 */
@Controller('v1/temperaturnachweis')
export class BerichtController {
  constructor(private readonly service: BerichtService) {}

  /** Nachweis berechnen und direkt zurückgeben (JSON). */
  @Get()
  @Roles('ops', 'admin', 'kunde_qa', 'kunde_dispo')
  abrufen(@Query() q: unknown): Promise<TemperaturNachweis> {
    return this.service.erzeuge(zuParams(parse(q)));
  }

  /** Nachweis erzeugen, im gewählten Format rendern und ablegen; Referenz zurück. */
  @Post()
  @Roles('ops', 'admin')
  @Audited('temperaturnachweis')
  @HttpCode(201)
  async erzeugen(@Query() q: unknown): Promise<{
    id: string;
    format: string;
    bewertung: string;
    kennzahlen: TemperaturNachweis['kennzahlen'];
    integritaet: TemperaturNachweis['integritaet'];
  }> {
    const anfrage = parse(q);
    const res = await this.service.erzeugeUndLege(zuParams(anfrage), anfrage.format);
    return {
      id: res.gespeichert.ref,
      format: res.format,
      bewertung: res.nachweis.bewertung,
      kennzahlen: res.nachweis.kennzahlen,
      integritaet: res.nachweis.integritaet,
    };
  }
}
