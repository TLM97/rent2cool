import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { istFahrerStatus, istKundeStatus, type Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Zugriff } from '../auth/zugriff';
import { AuditImService } from '../audit/audited.decorator';
import {
  fahrerAendernSchema,
  fahrerErstellenSchema,
  fahrerStatusSchema,
  kundeAendernSchema,
  kundeErstellenSchema,
  kundeKontoSchema,
  kundeStatusSchema,
  listeAbfrageSchema,
} from './dto';
import { KundeService } from './kunde.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

@Controller('v1/kunden')
export class KundeController {
  constructor(
    private readonly service: KundeService,
    private readonly zugriff: Zugriff,
  ) {}

  @Post()
  @Roles('ops', 'admin')
  @AuditImService('kunde')
  @HttpCode(201)
  erstelle(@CurrentUser() user: Principal, @Body() body: unknown): Promise<{ id: string }> {
    return this.service.erstelleKunde(user, parse(kundeErstellenSchema, body));
  }

  @Get()
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async liste(@CurrentUser() user: Principal, @Query() q: unknown) {
    const a = parse(listeAbfrageSchema, q);
    const s = await this.zugriff.sicht(user);
    const res = await this.service.listeKunden(s.mandantId, {
      ...a,
      nurKundeId: s.kundeId ?? undefined,
    });
    return { ...res, limit: a.limit, offset: a.offset };
  }

  @Get(':id')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async hole(@CurrentUser() user: Principal, @Param('id') id: string) {
    await this.zugriff.kunde(user, id);
    return this.service.holeKunde(id);
  }

  /** Stammdaten ändern (Status über `/status`). Audit mit alt/neu im Service. */
  @Patch(':id')
  @Roles('ops', 'admin')
  @AuditImService('kunde')
  aendere(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.service.aendereKunde(user, id, parse(kundeAendernSchema, body));
  }

  @Post(':id/status')
  @Roles('ops', 'admin')
  @AuditImService('kunde_status')
  @HttpCode(200)
  status(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(kundeStatusSchema, body);
    if (!istKundeStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereKundeStatus(user, id, status);
  }

  @Post(':kundeId/fahrer')
  @Roles('ops', 'admin')
  @AuditImService('fahrer')
  @HttpCode(201)
  erstelleFahrer(
    @CurrentUser() user: Principal,
    @Param('kundeId') kundeId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    return this.service.erstelleFahrer(user, kundeId, parse(fahrerErstellenSchema, body));
  }

  // --- Logins des Kunden (F-41): wer sieht als dieser Kunde ---

  @Get(':id/konten')
  @Roles('ops', 'admin')
  async konten(@CurrentUser() user: Principal, @Param('id') id: string) {
    await this.zugriff.kunde(user, id);
    return this.service.listeKonten(id);
  }

  @Post(':id/konten')
  @Roles('admin')
  @AuditImService('kunde_konto')
  @HttpCode(201)
  async ordneKontoZu(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.zugriff.kunde(user, id);
    return this.service.ordneKontoZu(user, id, parse(kundeKontoSchema, body));
  }

  @Delete(':id/konten/:kontoId')
  @Roles('admin')
  @AuditImService('kunde_konto')
  @HttpCode(204)
  async entferneKonto(
    @CurrentUser() user: Principal,
    @Param('id') id: string,
    @Param('kontoId') kontoId: string,
  ) {
    await this.zugriff.kunde(user, id);
    await this.service.entferneKonto(user, id, kontoId);
  }

  @Get(':kundeId/fahrer')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async listeFahrer(@CurrentUser() user: Principal, @Param('kundeId') kundeId: string) {
    await this.zugriff.kunde(user, kundeId);
    return this.service.listeFahrer(kundeId);
  }
}

@Controller('v1/fahrer')
export class FahrerController {
  constructor(
    private readonly service: KundeService,
    private readonly zugriff: Zugriff,
  ) {}

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

  @Get(':id')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async hole(@CurrentUser() user: Principal, @Param('id') id: string) {
    await this.zugriff.fahrer(user, id);
    return this.service.holeFahrer(id);
  }

  /** Name und Führerscheindaten ändern. Audit mit alt/neu im Service. */
  @Patch(':id')
  @Roles('ops', 'admin')
  @AuditImService('fahrer')
  aendere(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.service.aendereFahrer(user, id, parse(fahrerAendernSchema, body));
  }

  @Post(':id/status')
  @Roles('ops', 'admin')
  @AuditImService('fahrer_status')
  @HttpCode(200)
  status(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(fahrerStatusSchema, body);
    if (!istFahrerStatus(status)) {
      throw new BadRequestException('Unbekannter Status');
    }
    return this.service.aendereFahrerStatus(user, id, status);
  }

  @Get(':id/einsatzbereit')
  @Roles('ops', 'admin', 'kunde_dispo', 'kunde_qa')
  async einsatzbereit(
    @CurrentUser() user: Principal,
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
    await this.zugriff.fahrer(user, id);
    return this.service.einsatzbereit(id, fahrzeugId, t);
  }
}
