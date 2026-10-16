import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { Principal } from '@rent2cool/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import { Audited } from '../audit/audited.decorator';

/**
 * Demonstrationsendpunkt für das Fundament aus T-004: Authentifizierung
 * (gültiges Keycloak-Token nötig), Autorisierung (Rolle `admin`) und
 * automatischer Audit Trail (`@Audited`).
 *
 * TODO(T-004): Entfernen bzw. ersetzen, sobald echte GDP-schreibende Module
 * (Fahrzeugakte, Kunden, Buchung ...) existieren. Er dient nur dem Nachweis,
 * dass die Kette Guard -> Rolle -> Audit greift, ohne das noch nicht
 * freigegebene Datenmodell (T-002) vorwegzunehmen.
 */
@Controller('v1/admin')
export class AdminController {
  @Post('audit-demo')
  @Roles('admin')
  @Audited('demo')
  @HttpCode(202)
  demo(
    @CurrentUser() user: Principal,
    @Body() body: { notiz?: string } | undefined,
  ): { status: string; id: string; akteur: string; notiz: string | null } {
    return {
      status: 'ok',
      id: 'demo-1',
      akteur: user.akteurId,
      notiz: body?.notiz ?? null,
    };
  }
}
