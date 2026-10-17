import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import type { Principal, TemperaturNachweis } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Zugriff } from '../auth/zugriff';
import { Audited, AuditImService } from '../audit/audited.decorator';
import { NachweisArchiv } from './archiv.service';
import { Berichtsdienst } from './berichtsdienst';
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

  /**
   * Nachweis für beliebiges Fahrzeug und Zeitraum – intern. Kunden erhalten
   * Nachweise nur zu ihren Mieten (F-41).
   */
  @Get()
  @Roles('ops', 'admin', 'qa_approver')
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

/**
 * Archivierte Nachweise je Miete (automatisch nach Mietende, D-003 als
 * Hintergrundjob) und Echtheitsprüfung.
 */
@Controller('v1/mieten')
export class MieteNachweisController {
  constructor(
    private readonly archiv: NachweisArchiv,
    private readonly dienst: Berichtsdienst,
    private readonly zugriff: Zugriff,
  ) {}

  /** Nachweise einer Miete – auch für die Kunden (Download im Portal, F-46). */
  @Get(':id/temperaturnachweise')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa', 'kunde_dispo')
  async liste(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.zugriff.miete(user, id);
    return this.archiv.liste(user, id);
  }

  /** Neue Version anfordern (z. B. nach Nachlieferung). Der Job schreibt Archiv und Audit. */
  @Post(':id/temperaturnachweise')
  @Roles('ops', 'admin', 'qa_approver')
  @AuditImService('temperaturnachweis')
  @HttpCode(202)
  async fordereAn(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.archiv.liste(user, id); // Zugriff und Existenz prüfen
    return this.dienst.fordereAn(id, user);
  }
}

@Controller('v1/temperaturnachweise')
export class NachweisPruefungController {
  constructor(
    private readonly archiv: NachweisArchiv,
    private readonly zugriff: Zugriff,
  ) {}

  /** Echtheitsprüfung: Dateien, Signaturen und Messdaten gegen das Archiv. */
  @Get(':id/pruefung')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async pruefe(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.zugriff.nachweis(user, id);
    return this.archiv.pruefe(user, id);
  }
}
