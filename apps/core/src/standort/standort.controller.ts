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
import { standortAendernSchema, standortErstellenSchema, type Principal } from '@rent2cool/shared';
import { AuditImService } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../auth/decorators';
import { StandortService } from './standort.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

const listeSchema = z.object({
  aktiv: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Standorte (D-011). Pflegen darf nur `admin` (Betriebsstruktur); lesen alle internen Rollen. */
@Controller('v1/standorte')
export class StandortController {
  constructor(private readonly service: StandortService) {}

  @Get()
  @Roles('admin', 'ops', 'qa_approver', 'dpo', 'kunde_dispo')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeSchema, q);
    const res = await this.service.liste(user.mandantId, {
      aktiv: a.aktiv === undefined ? undefined : a.aktiv === 'true',
      limit: a.limit,
      offset: a.offset,
    });
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('admin', 'ops', 'qa_approver', 'dpo', 'kunde_dispo')
  hole(@CurrentUser() user: Principal, @Param('id') id: string) {
    return this.service.hole(user.mandantId, id);
  }

  @Post()
  @Roles('admin')
  @AuditImService('standort')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.erstelle(user, parse(standortErstellenSchema, body));
  }

  @Patch(':id')
  @Roles('admin')
  @AuditImService('standort')
  aendere(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.service.aendere(user, id, parse(standortAendernSchema, body));
  }
}
