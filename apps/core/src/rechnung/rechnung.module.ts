import { Module } from '@nestjs/common';
import { MieteModule } from '../miete/miete.module';
import { RechnungController } from './rechnung.controller';
import { RechnungService } from './rechnung.service';

/**
 * Rechnung (R-63): aus einer beendeten Miete, fortlaufende Nummer je Mandant/
 * Jahr, Umsatzsteuer. Schreibzugriffe rollengeschützt und auditiert (T-004).
 */
@Module({
  imports: [MieteModule],
  controllers: [RechnungController],
  providers: [RechnungService],
})
export class RechnungModule {}
