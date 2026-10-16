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
import { istFahrerStatus, istKundeStatus, type Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Audited } from '../audit/audited.decorator';
import {
  fahrerErstellenSchema,
  fahrerStatusSchema,
  kundeErstellenSchema,
  kundeStatusSchema,
  listeAbfrageSchema,
} from './dto';
import { KundeService } from './kunde.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

@Controller('v1/kunden')
export class KundeController {
  constructor(private readonly service: KundeService) {}

  @Post()
  @Roles('ops', 'admin')
  @Audited('kunde')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown): Promise<{ id: string }> {
    return this.service.erstelleKunde(user.mandantId, parse(kundeErstellenSchema, body));
  }

  @Get()
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeAbfrageSchema, q);
    const res = await this.service.listeKunden(user.mandantId, a);
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  hole(@Param('id') id: string) {
    return this.service.holeKunde(id);
  }

  @Post(':id/status')
  @Roles('ops', 'admin')
  @Audited('kunde_status')
  @HttpCode(200)
  status(@Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(kundeStatusSchema, body);
    if (!istKundeStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereKundeStatus(id, status);
  }

  @Post(':kundeId/fahrer')
  @Roles('ops', 'admin')
  @Audited('fahrer')
  @HttpCode(201)
  erstelleFahrer(@Param('kundeId') kundeId: string, @Body() body: unknown): Promise<{ id: string }> {
    return this.service.erstelleFahrer(kundeId, parse(fahrerErstellenSchema, body));
  }

  @Get(':kundeId/fahrer')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  listeFahrer(@Param('kundeId') kundeId: string) {
    return this.service.listeFahrer(kundeId);
  }
}

@Controller('v1/fahrer')
export class FahrerController {
  constructor(private readonly service: KundeService) {}

  /** Fristenüberwachung Führerscheine (Sperre bei Ablauf, R-22). */
  @Get('faellige-fuehrerscheine')
  @Roles('ops', 'admin')
  faellige(@CurrentUser() user: Principal, @Query('bis') bis?: string) {
    const stichtag = bis ? new Date(bis) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
    if (Number.isNaN(stichtag.getTime())) {
      throw new BadRequestException('Ungültiges Datum in "bis"');
    }
    return this.service.faelligeFuehrerscheine(user.mandantId, stichtag);
  }

  @Post(':id/status')
  @Roles('ops', 'admin')
  @Audited('fahrer_status')
  @HttpCode(200)
  status(@Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(fahrerStatusSchema, body);
    if (!istFahrerStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereFahrerStatus(id, status);
  }

  @Get(':id/einsatzbereit')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  einsatzbereit(
    @Param('id') id: string,
    @Query('fahrzeugId') fahrzeugId?: string,
    @Query('stichtag') stichtag?: string,
  ) {
    if (!fahrzeugId) {
      throw new BadRequestException('Query-Parameter "fahrzeugId" fehlt');
    }
    const t = stichtag ? new Date(stichtag) : new Date();
    if (Number.isNaN(t.getTime())) {
      throw new BadRequestException('Ungültiges Datum in "stichtag"');
    }
    return this.service.einsatzbereit(id, fahrzeugId, t);
  }
}
