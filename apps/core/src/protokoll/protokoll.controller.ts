/**
 * Übergabe- und Rückgabeprotokoll (D-014). Fahrer (App, mit Schlüssel zur
 * Miete) und Betrieb schreiben; die QA liest mit.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  fotoAnfordernSchema,
  protokollAendernSchema,
  protokollAnlegenSchema,
  type Principal,
} from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuditImService } from '../audit/audited.decorator';
import { ProtokollService } from './protokoll.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

const UUID = new ParseUUIDPipe();

@Controller('v1/mieten')
export class MieteProtokollController {
  constructor(private readonly service: ProtokollService) {}

  /** Protokoll anlegen (je Miete eine Übergabe und eine Rückgabe; Wiederholung = dasselbe). */
  @Post(':id/protokolle')
  @Roles('ops', 'admin', 'fahrer')
  @AuditImService('protokoll')
  @HttpCode(201)
  legeAn(@CurrentUser() user: Principal, @Param('id', UUID) id: string, @Body() body: unknown) {
    return this.service.legeAn(user, id, parse(protokollAnlegenSchema, body).art);
  }

  @Get(':id/protokolle')
  @Roles('ops', 'admin', 'qa_approver', 'fahrer')
  liste(@CurrentUser() user: Principal, @Param('id', UUID) id: string) {
    return this.service.listeZurMiete(user, id);
  }
}

@Controller('v1/protokolle')
export class ProtokollController {
  constructor(private readonly service: ProtokollService) {}

  @Get(':id')
  @Roles('ops', 'admin', 'qa_approver', 'fahrer')
  hole(@CurrentUser() user: Principal, @Param('id', UUID) id: string) {
    return this.service.hole(user, id);
  }

  @Patch(':id')
  @Roles('ops', 'admin', 'fahrer')
  @AuditImService('protokoll')
  aendere(@CurrentUser() user: Principal, @Param('id', UUID) id: string, @Body() body: unknown) {
    return this.service.aendere(user, id, parse(protokollAendernSchema, body));
  }

  /** Foto anfordern: liefert den signierten Upload-Link in den Objektspeicher. */
  @Post(':id/fotos')
  @Roles('ops', 'admin', 'fahrer')
  @AuditImService('protokoll_foto')
  @HttpCode(201)
  fotoAnfordern(
    @CurrentUser() user: Principal,
    @Param('id', UUID) id: string,
    @Body() body: unknown,
  ) {
    return this.service.fordereFotoAn(user, id, parse(fotoAnfordernSchema, body));
  }

  /** Hochladen bestätigen: der Kern prüft Größe, Typ und SHA-256. */
  @Post(':id/fotos/:fotoId/bestaetigung')
  @Roles('ops', 'admin', 'fahrer')
  @AuditImService('protokoll_foto_status')
  @HttpCode(200)
  fotoBestaetigen(
    @CurrentUser() user: Principal,
    @Param('id', UUID) id: string,
    @Param('fotoId', UUID) fotoId: string,
  ) {
    return this.service.bestaetigeFoto(user, id, fotoId);
  }

  @Post(':id/abschluss')
  @Roles('ops', 'admin', 'fahrer')
  @AuditImService('protokoll_status')
  @HttpCode(200)
  schliesseAb(@CurrentUser() user: Principal, @Param('id', UUID) id: string) {
    return this.service.schliesseAb(user, id);
  }
}
