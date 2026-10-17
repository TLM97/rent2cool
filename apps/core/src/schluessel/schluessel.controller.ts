/**
 * Digitaler Schlüssel und Fernzugriff (D-014). Vier Einstiege:
 * - Miete: Schlüssel ausstellen/auflisten, Befehle der Miete
 * - Schlüssel: Befehl des Fahrers (App), Widerruf, eigene Schlüssel
 * - Fahrzeug: Befehl durch Ops/Admin mit Grund, Befehlsprotokoll
 * - Befehl: Status abfragen (die App fragt nach, solange `gesendet`)
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  fahrzeugBefehlSchema,
  schluesselAusstellenSchema,
  schluesselBefehlSchema,
  schluesselWiderrufenSchema,
  type Principal,
} from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuditImService } from '../audit/audited.decorator';
import { SchluesselService } from './schluessel.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

const seiteSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const UUID = new ParseUUIDPipe();

@Controller('v1/mieten')
export class MieteSchluesselController {
  constructor(private readonly service: SchluesselService) {}

  /** Schlüssel für einen Fahrer des Mietkunden ausstellen (idempotent je Miete und Fahrer). */
  @Post(':id/schluessel')
  @Roles('ops', 'admin', 'kunde_dispo')
  @AuditImService('schluessel')
  @HttpCode(201)
  stelleAus(@CurrentUser() user: Principal, @Param('id', UUID) id: string, @Body() body: unknown) {
    return this.service.stelleAus(user, id, parse(schluesselAusstellenSchema, body).fahrerId);
  }

  @Get(':id/schluessel')
  @Roles('ops', 'admin', 'kunde_dispo')
  schluessel(@CurrentUser() user: Principal, @Param('id', UUID) id: string) {
    return this.service.listeZurMiete(user.mandantId, id);
  }

  @Get(':id/befehle')
  @Roles('ops', 'admin', 'kunde_dispo', 'qa_approver')
  async befehle(
    @CurrentUser() user: Principal,
    @Param('id', UUID) id: string,
    @Query() q: unknown,
  ) {
    const s = parse(seiteSchema, q);
    return { ...(await this.service.liste(user.mandantId, { mieteId: id }, s)), ...s };
  }
}

@Controller('v1/schluessel')
export class SchluesselController {
  constructor(private readonly service: SchluesselService) {}

  /** Aktive Schlüssel des angemeldeten Fahrers (App). */
  @Get('meine')
  @Roles('fahrer')
  meine(@CurrentUser() user: Principal) {
    return this.service.meineSchluessel(user);
  }

  /** Befehl mit dem eigenen Schlüssel. Wiederholungen mit gleichem Key liefern denselben Befehl. */
  @Post(':id/befehle')
  @Roles('fahrer')
  @AuditImService('fahrzeug_befehl')
  @HttpCode(200)
  befehl(@CurrentUser() user: Principal, @Param('id', UUID) id: string, @Body() body: unknown) {
    return this.service.befehlMitSchluessel(user, id, parse(schluesselBefehlSchema, body));
  }

  @Post(':id/widerruf')
  @Roles('ops', 'admin', 'kunde_dispo')
  @AuditImService('schluessel_status')
  @HttpCode(200)
  widerrufe(@CurrentUser() user: Principal, @Param('id', UUID) id: string, @Body() body: unknown) {
    return this.service.widerrufe(user, id, parse(schluesselWiderrufenSchema, body));
  }
}

@Controller('v1/fahrzeuge')
export class FahrzeugBefehlController {
  constructor(private readonly service: SchluesselService) {}

  /** Befehl durch Ops/Admin (Hilfe, Notfall) – Grund ist Pflicht und steht im Audit Trail. */
  @Post(':id/befehle')
  @Roles('ops', 'admin')
  @AuditImService('fahrzeug_befehl')
  @HttpCode(200)
  befehl(@CurrentUser() user: Principal, @Param('id', UUID) id: string, @Body() body: unknown) {
    return this.service.befehlDurchBetrieb(user, id, parse(fahrzeugBefehlSchema, body));
  }

  @Get(':id/befehle')
  @Roles('ops', 'admin', 'qa_approver')
  async befehle(
    @CurrentUser() user: Principal,
    @Param('id', UUID) id: string,
    @Query() q: unknown,
  ) {
    const s = parse(seiteSchema, q);
    return { ...(await this.service.liste(user.mandantId, { fahrzeugId: id }, s)), ...s };
  }
}

@Controller('v1/befehle')
export class BefehlController {
  constructor(private readonly service: SchluesselService) {}

  @Get(':id')
  @Roles('ops', 'admin', 'fahrer')
  hole(@CurrentUser() user: Principal, @Param('id', UUID) id: string) {
    return this.service.holeBefehl(user, id);
  }
}
