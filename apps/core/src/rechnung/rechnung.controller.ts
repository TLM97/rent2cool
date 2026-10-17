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
import { AuditImService, Audited } from '../audit/audited.decorator';
import { listeAbfrageSchema, rechnungErstellenSchema, rechnungStatusSchema } from './dto';
import { RechnungService } from './rechnung.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

@Controller('v1/rechnungen')
export class RechnungController {
  constructor(private readonly service: RechnungService) {}

  @Post()
  @Roles('ops', 'admin')
  @Audited('rechnung')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.erstelle(user.mandantId, parse(rechnungErstellenSchema, body));
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
