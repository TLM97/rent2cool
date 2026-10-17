import {
  BadRequestException,
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
import { AuditImService } from '../audit/audited.decorator';
import { listeAbfrageSchema, mieteErstellenSchema, mieteStatusSchema } from './dto';
import { MieteService } from './miete.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

@Controller('v1/mieten')
export class MieteController {
  constructor(private readonly service: MieteService) {}

  /** Buchung anlegen. Prüft die Buchungsregeln (D-006/D-010/R-22) und bestätigt
   *  bei Erfolg; idempotent über idempotencyKey (D-003). */
  @Post()
  @Roles('ops', 'admin', 'kunde_dispo')
  @AuditImService('miete')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.erstelle(user, parse(mieteErstellenSchema, body));
  }

  @Get()
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeAbfrageSchema, q);
    const res = await this.service.liste(user.mandantId, a);
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  hole(@Param('id') id: string) {
    return this.service.holeMiete(id);
  }

  @Post(':id/status')
  @Roles('ops', 'admin', 'kunde_dispo')
  @AuditImService('miete_status')
  @HttpCode(200)
  status(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(mieteStatusSchema, body);
    if (!istMieteStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereStatus(user, id, status);
  }

  /** Temperaturnachweis zu dieser Miete (Fahrzeug + Zeitfenster der Miete). */
  @Get(':id/temperaturnachweis')
  @Roles('ops', 'admin', 'kunde_qa', 'kunde_dispo')
  temperaturnachweis(
    @Param('id') id: string,
    @Query('profil') profil?: string,
  ): Promise<TemperaturNachweis> {
    return this.service.temperaturnachweis(id, profil);
  }
}
