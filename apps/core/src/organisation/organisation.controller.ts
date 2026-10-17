/**
 * Selbstregistrierung und Organisation des Kunden (F-51). Registrierung und
 * Annahme einer Einladung stehen jedem angemeldeten Login offen (noch ohne
 * Kunde); die Verwaltung der Organisation nur ihren Verwaltern.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  einladungAnnehmenSchema,
  einladungSchema,
  mitgliedRollenSchema,
  organisationAendernSchema,
  registrierungSchema,
  type Principal,
} from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuditImService } from '../audit/audited.decorator';
import { OrganisationService } from './organisation.service';

function parse<S extends z.ZodTypeAny>(schema: S, wert: unknown): z.infer<S> {
  const r = schema.safeParse(wert);
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

/** Ohne Rolle erreichbar: Wer sich gerade registriert hat, hat noch keine. */
@Controller('v1')
export class RegistrierungController {
  constructor(private readonly service: OrganisationService) {}

  /** Eigenen Kunden anlegen (Status „in Prüfung“) – der Login wird dessen Verwalter. */
  @Post('registrierung')
  @AuditImService('kunde')
  @HttpCode(201)
  registriere(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.registriere(user, parse(registrierungSchema, body));
  }

  /** Einladung in eine Organisation annehmen (Code aus der E-Mail). */
  @Post('einladungen/annehmen')
  @AuditImService('kunde_konto')
  @HttpCode(200)
  nehmeAn(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.nehmeAn(user, parse(einladungAnnehmenSchema, body).token);
  }
}

@Controller('v1/organisation')
export class OrganisationController {
  constructor(private readonly service: OrganisationService) {}

  @Get()
  @Roles('kunde_admin', 'kunde_dispo', 'kunde_qa')
  organisation(@CurrentUser() user: Principal) {
    return this.service.organisation(user);
  }

  @Patch()
  @Roles('kunde_admin')
  @AuditImService('kunde')
  aendere(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.aendere(user, parse(organisationAendernSchema, body));
  }

  @Post('einladungen')
  @Roles('kunde_admin')
  @AuditImService('kunde_einladung')
  @HttpCode(201)
  ladeEin(@CurrentUser() user: Principal, @Body() body: unknown) {
    return this.service.ladeEin(user, parse(einladungSchema, body));
  }

  @Delete('einladungen/:id')
  @Roles('kunde_admin')
  @AuditImService('kunde_einladung')
  @HttpCode(204)
  async widerrufe(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.service.widerrufeEinladung(user, id);
  }

  @Patch('mitglieder/:kontoId')
  @Roles('kunde_admin')
  @AuditImService('kunde_konto')
  @HttpCode(204)
  async rollen(
    @CurrentUser() user: Principal,
    @Param('kontoId') kontoId: string,
    @Body() body: unknown,
  ) {
    await this.service.aendereRollen(user, kontoId, parse(mitgliedRollenSchema, body).rollen);
  }

  @Delete('mitglieder/:kontoId')
  @Roles('kunde_admin')
  @AuditImService('kunde_konto')
  @HttpCode(204)
  async entferne(@CurrentUser() user: Principal, @Param('kontoId') kontoId: string) {
    await this.service.entferneMitglied(user, kontoId);
  }
}
