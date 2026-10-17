import {
  BadRequestException,
  ForbiddenException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { istMieteStatus, type Principal, type TemperaturNachweis } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Zugriff } from '../auth/zugriff';
import { AuditImService } from '../audit/audited.decorator';
import { listeAbfrageSchema, mieteErstellenSchema, mieteStatusSchema } from './dto';
import { MieteService } from './miete.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

@Controller('v1/mieten')
export class MieteController {
  constructor(
    private readonly service: MieteService,
    private readonly zugriff: Zugriff,
  ) {}

  /** Buchung anlegen. Prüft die Buchungsregeln (D-006/D-010/R-22) und bestätigt
   *  bei Erfolg; idempotent über idempotencyKey (D-003). */
  @Post()
  @Roles('ops', 'admin', 'kunde_dispo')
  @AuditImService('miete')
  @HttpCode(201)
  async erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    const p = parse(mieteErstellenSchema, body);
    // Kunden buchen nur für sich selbst (F-41).
    const s = await this.zugriff.sicht(user);
    if (s.kundeId !== null && p.kundeId !== s.kundeId) {
      throw new ForbiddenException('Buchungen nur für den eigenen Kunden');
    }
    return this.service.erstelle(user, p);
  }

  @Get()
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeAbfrageSchema, q);
    const s = await this.zugriff.sicht(user);
    const res = await this.service.liste(s.mandantId, { ...a, kundeId: s.kundeId ?? a.kundeId });
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async hole(@CurrentUser() user: Principal, @Param('id') id: string) {
    await this.zugriff.miete(user, id);
    return this.service.holeMiete(id);
  }

  @Post(':id/status')
  @Roles('ops', 'admin', 'kunde_dispo')
  @AuditImService('miete_status')
  @HttpCode(200)
  async status(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(mieteStatusSchema, body);
    if (!istMieteStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    const s = await this.zugriff.miete(user, id);
    // Kunden stornieren nur; Übergabe/Rückgabe laufen über Betrieb bzw. Schlüssel.
    if (s.kundeId !== null && status !== 'storniert') {
      throw new ForbiddenException('Kunden können Buchungen nur stornieren');
    }
    return this.service.aendereStatus(user, id, status);
  }

  /** Temperaturnachweis zu dieser Miete (Fahrzeug + Zeitfenster der Miete). */
  @Get(':id/temperaturnachweis')
  @Roles('ops', 'admin', 'kunde_qa', 'kunde_dispo')
  async temperaturnachweis(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Query('profil') profil?: string,
  ): Promise<TemperaturNachweis> {
    await this.zugriff.miete(user, id);
    return this.service.temperaturnachweis(id, profil);
  }
}
