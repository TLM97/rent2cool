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
import {
  abweichungErstellenSchema,
  abweichungStatusSchema,
  type Principal,
} from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Zugriff } from '../auth/zugriff';
import { AuditImService } from '../audit/audited.decorator';
import { AlarmService } from './alarm.service';
import { AbweichungService } from './abweichung.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
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
  constructor(
    private readonly service: AlarmService,
    private readonly zugriff: Zugriff,
  ) {}

  @Get()
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(alarmListeSchema, q);
    const s = await this.zugriff.sicht(user);
    const res = await this.service.liste(s.mandantId, { ...a, kundeId: s.kundeId ?? undefined });
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async hole(@CurrentUser() user: Principal, @Param('id') id: string) {
    await this.zugriff.alarm(user, id);
    return this.service.hole(id);
  }

  @Post(':id/quittieren')
  @Roles('ops', 'admin')
  @AuditImService('alarm_quittieren')
  @HttpCode(200)
  quittieren(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.service.quittiere(user, id);
  }

  @Post(':id/schliessen')
  @Roles('ops', 'admin', 'qa_approver')
  @AuditImService('alarm_schliessen')
  @HttpCode(200)
  schliessen(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.service.schliesse(user, id);
  }
}

const abwListeSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@Controller('v1/abweichungen')
export class AbweichungController {
  constructor(
    private readonly service: AbweichungService,
    private readonly zugriff: Zugriff,
  ) {}

  @Post()
  @Roles('ops', 'admin', 'qa_approver')
  @AuditImService('abweichung')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.erstelle(user, parse(abweichungErstellenSchema, body));
  }

  @Get()
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(abwListeSchema, q);
    const s = await this.zugriff.sicht(user);
    const res = await this.service.liste(s.mandantId, { ...a, kundeId: s.kundeId ?? undefined });
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'qa_approver', 'kunde_qa')
  async hole(@CurrentUser() user: Principal, @Param('id') id: string) {
    await this.zugriff.abweichung(user, id);
    return this.service.hole(id);
  }

  /** Bewertung/Abschluss durch die qualitätsverantwortliche Person (qa_approver). */
  @Post(':id/status')
  @Roles('qa_approver', 'admin')
  @AuditImService('abweichung_status')
  @HttpCode(200)
  status(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(abweichungStatusSchema, body);
    return this.service.aendereStatus(user, id, b.status, {
      bewertung: b.bewertung,
      massnahmen: b.massnahmen,
      verantwortlich: b.verantwortlich,
    });
  }
}
