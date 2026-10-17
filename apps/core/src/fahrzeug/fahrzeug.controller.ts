import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { abgedeckteKlassen, type Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Zugriff } from '../auth/zugriff';
import { AuditImService } from '../audit/audited.decorator';
import {
  fahrzeugAendernSchema,
  fahrzeugErstellenSchema,
  kalibrierungSchema,
  listeAbfrageSchema,
  sensorTauschSchema,
  statusAendernSchema,
  verfuegbarAbfrageSchema,
} from './dto';
import { FahrzeugService } from './fahrzeug.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

@Controller('v1/fahrzeuge')
export class FahrzeugController {
  constructor(
    private readonly service: FahrzeugService,
    private readonly zugriff: Zugriff,
  ) {}

  @Post()
  @Roles('ops', 'admin')
  @AuditImService('fahrzeug')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown): Promise<{ id: string }> {
    return this.service.erstelle(user, parse(fahrzeugErstellenSchema, body));
  }

  /** Flottenliste – intern. Kunden finden Fahrzeuge über die Buchungssuche (F-41). */
  @Get()
  @Roles('ops', 'admin', 'qa_approver')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeAbfrageSchema, q);
    const res = await this.service.liste(user.mandantId, a);
    return { ...res, limit: a.limit, offset: a.offset };
  }

  /** Buchbare Fahrzeuge im Zeitraum (Suche für die Buchung). */
  @Get('verfuegbar')
  @Roles('ops', 'admin', 'kunde_dispo')
  async verfuegbar(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(verfuegbarAbfrageSchema, q);
    const s = await this.zugriff.sicht(user);
    const res = await this.service.sucheVerfuegbare(s.mandantId, {
      von: new Date(a.von),
      bis: new Date(a.bis),
      suche: a.suche,
      klassen: a.fahrerKlasse ? abgedeckteKlassen(a.fahrerKlasse) : undefined,
      fahrtenschreiber: a.fahrtenschreiber === 'true',
      standortId: a.standortId,
      limit: a.limit,
      offset: a.offset,
    });
    return { ...res, limit: a.limit, offset: a.offset };
  }

  /** Fristenüberwachung: Sensoren mit ablaufender/fehlender Kalibrierung. */
  @Get('faellige-kalibrierungen')
  @Roles('ops', 'admin')
  faellige(@CurrentUser() user: Principal, @Query('bis') bis?: string) {
    const stichtag = bis ? new Date(bis) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
    if (Number.isNaN(stichtag.getTime())) {
      throw new BadRequestException('Ungültiges Datum in "bis"');
    }
    return this.service.faelligeKalibrierungen(user.mandantId, stichtag);
  }

  @Get(':id')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async holeAkte(@CurrentUser() user: Principal, @Param('id') id: string) {
    // Kunden: nur Fahrzeuge ihrer Mieten (z. B. Kalibriernachweise für die QA).
    await this.zugriff.fahrzeug(user, id);
    return this.service.holeAkte(id);
  }

  /** Letzte Position und Übergabebereich (Heimatstandort oder `?standortId=`). */
  @Get(':id/position')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_dispo')
  async position(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Query('standortId') standortId?: string,
  ) {
    if (standortId !== undefined && !/^[0-9a-f-]{36}$/i.test(standortId)) {
      throw new BadRequestException('standortId ist keine UUID');
    }
    // Kunden sehen die Position nur während ihrer laufenden Miete.
    const s = await this.zugriff.fahrzeug(user, id, { nurLaufend: true });
    return this.service.positionUndBereich(s.mandantId, id, standortId);
  }

  @Get(':id/buchbarkeit')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async buchbarkeit(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Query('stichtag') stichtag?: string,
  ) {
    const t = stichtag ? new Date(stichtag) : new Date();
    if (Number.isNaN(t.getTime())) {
      throw new BadRequestException('Ungültiges Datum in "stichtag"');
    }
    await this.zugriff.fahrzeug(user, id, { nurMandant: true });
    return this.service.buchbarkeit(id, t);
  }

  /** Stammdaten ändern (Status über `/status`). Audit mit alt/neu im Service. */
  @Patch(':id')
  @Roles('ops', 'admin')
  @AuditImService('fahrzeug')
  aendere(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.service.aendere(user, id, parse(fahrzeugAendernSchema, body));
  }

  @Post(':id/status')
  @Roles('ops', 'admin')
  @AuditImService('fahrzeug_status')
  @HttpCode(200)
  aendereStatus(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(statusAendernSchema, body);
    return this.service.aendereStatus(user, id, status);
  }
}

@Controller('v1/sensoren')
export class SensorController {
  constructor(private readonly service: FahrzeugService) {}

  @Post(':sensorId/kalibrierungen')
  @Roles('ops', 'admin')
  @AuditImService('kalibrierung')
  @HttpCode(201)
  kalibriere(
    @CurrentUser() user: Principal,
    @Param('sensorId') sensorId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    return this.service.fuegeKalibrierungHinzu(user, sensorId, parse(kalibrierungSchema, body));
  }

  /** Sensor tauschen (Ausbau + Einbau, optional mit Kalibrierung). Audit mit alt/neu im Service. */
  @Post(':sensorId/tausch')
  @Roles('ops', 'admin')
  @AuditImService('sensor_tausch')
  @HttpCode(201)
  tausche(
    @CurrentUser() user: Principal,
    @Param('sensorId') sensorId: string,
    @Body() body: unknown,
  ) {
    return this.service.tauscheSensor(user, sensorId, parse(sensorTauschSchema, body));
  }
}
