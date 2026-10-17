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
import type { Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuditImService, Audited } from '../audit/audited.decorator';
import {
  fahrzeugAendernSchema,
  fahrzeugErstellenSchema,
  kalibrierungSchema,
  listeAbfrageSchema,
  sensorTauschSchema,
  statusAendernSchema,
} from './dto';
import { FahrzeugService } from './fahrzeug.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

@Controller('v1/fahrzeuge')
export class FahrzeugController {
  constructor(private readonly service: FahrzeugService) {}

  @Post()
  @Roles('ops', 'admin')
  @Audited('fahrzeug')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown): Promise<{ id: string }> {
    return this.service.erstelle(user.mandantId, parse(fahrzeugErstellenSchema, body));
  }

  @Get()
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeAbfrageSchema, q);
    const res = await this.service.liste(user.mandantId, a);
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
  holeAkte(@Param('id') id: string) {
    return this.service.holeAkte(id);
  }

  @Get(':id/buchbarkeit')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  buchbarkeit(@Param('id') id: string, @Query('stichtag') stichtag?: string) {
    const t = stichtag ? new Date(stichtag) : new Date();
    if (Number.isNaN(t.getTime())) {
      throw new BadRequestException('Ungültiges Datum in "stichtag"');
    }
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
  @Audited('fahrzeug_status')
  @HttpCode(200)
  aendereStatus(@Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(statusAendernSchema, body);
    return this.service.aendereStatus(id, status);
  }
}

@Controller('v1/sensoren')
export class SensorController {
  constructor(private readonly service: FahrzeugService) {}

  @Post(':sensorId/kalibrierungen')
  @Roles('ops', 'admin')
  @Audited('kalibrierung')
  @HttpCode(201)
  kalibriere(
    @CurrentUser() user: Principal,
    @Param('sensorId') sensorId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    return this.service.fuegeKalibrierungHinzu(sensorId, user.akteurId, parse(kalibrierungSchema, body));
  }

  /** Sensor tauschen (Ausbau + Einbau, optional mit Kalibrierung). Audit mit alt/neu im Service. */
  @Post(':sensorId/tausch')
  @Roles('ops', 'admin')
  @AuditImService('sensor_tausch')
  @HttpCode(201)
  tausche(@CurrentUser() user: Principal, @Param('sensorId') sensorId: string, @Body() body: unknown) {
    return this.service.tauscheSensor(user, sensorId, parse(sensorTauschSchema, body));
  }
}
