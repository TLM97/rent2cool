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
import { istRechnungStatus, type Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Zugriff } from '../auth/zugriff';
import { AuditImService } from '../audit/audited.decorator';
import { listeAbfrageSchema, rechnungErstellenSchema, rechnungStatusSchema } from './dto';
import { RechnungService } from './rechnung.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

@Controller('v1/rechnungen')
export class RechnungController {
  constructor(
    private readonly service: RechnungService,
    private readonly zugriff: Zugriff,
  ) {}

  @Post()
  @Roles('ops', 'admin')
  @AuditImService('rechnung')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.erstelle(user, parse(rechnungErstellenSchema, body));
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
    await this.zugriff.rechnung(user, id);
    return this.service.holeRechnung(id);
  }

  @Post(':id/status')
  @Roles('ops', 'admin')
  @AuditImService('rechnung_status')
  @HttpCode(200)
  status(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(rechnungStatusSchema, body);
    if (!istRechnungStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereStatus(user, id, status);
  }
}
