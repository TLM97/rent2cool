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
import { istAbweichungStatus, type Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Audited } from '../audit/audited.decorator';
import { AlarmService } from './alarm.service';
import { AbweichungService } from './abweichung.service';
import { PLACEHOLDER_MANDANT_ID } from '../db/seed/placeholder-data';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

const alarmListeSchema = z.object({
  status: z.string().optional(),
  fahrzeugId: z.string().uuid().optional(),
  mieteId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@Controller('v1/alarme')
export class AlarmController {
  constructor(private readonly service: AlarmService) {}

  @Get()
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(alarmListeSchema, q);
    const res = await this.service.liste(user.mandantId ?? PLACEHOLDER_MANDANT_ID, a);
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  hole(@Param('id') id: string) {
    return this.service.hole(id);
  }

  @Post(':id/quittieren')
  @Roles('ops', 'admin')
  @Audited('alarm_quittieren')
  @HttpCode(200)
  quittieren(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.service.quittiere(id, user.akteurId);
  }

  @Post(':id/schliessen')
  @Roles('ops', 'admin', 'qa_approver')
  @Audited('alarm_schliessen')
  @HttpCode(200)
  schliessen(@Param('id') id: string) {
    return this.service.schliesse(id);
  }
}

const abwErstellenSchema = z.object({
  bezugTyp: z.enum(['alarm', 'miete', 'fahrzeug']),
  bezugId: z.string().uuid(),
  beschreibung: z.string().min(1),
  schweregrad: z.string().optional(),
});
const abwStatusSchema = z.object({
  status: z.string(),
  bewertung: z.string().optional(),
  massnahmen: z.string().optional(),
  verantwortlich: z.string().optional(),
});
const abwListeSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@Controller('v1/abweichungen')
export class AbweichungController {
  constructor(private readonly service: AbweichungService) {}

  @Post()
  @Roles('ops', 'admin', 'qa_approver')
  @Audited('abweichung')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.erstelle(user.mandantId, parse(abwErstellenSchema, body));
  }

  @Get()
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(abwListeSchema, q);
    const res = await this.service.liste(user.mandantId, a);
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  hole(@Param('id') id: string) {
    return this.service.hole(id);
  }

  /** Bewertung/Abschluss durch die qualitätsverantwortliche Person (qa_approver). */
  @Post(':id/status')
  @Roles('qa_approver', 'admin')
  @Audited('abweichung_status')
  @HttpCode(200)
  status(@Param('id') id: string, @Body() body: unknown) {
    const b = parse(abwStatusSchema, body);
    if (!istAbweichungStatus(b.status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereStatus(id, b.status, {
      bewertung: b.bewertung,
      massnahmen: b.massnahmen,
      verantwortlich: b.verantwortlich,
    });
  }
}
