import { Module } from '@nestjs/common';
import { KundeModule } from '../kunde/kunde.module';
import { OrganisationController, RegistrierungController } from './organisation.controller';
import { OrganisationService } from './organisation.service';

/** Selbstregistrierung und Organisation des Kunden (F-51). */
@Module({
  imports: [KundeModule],
  controllers: [RegistrierungController, OrganisationController],
  providers: [OrganisationService],
})
export class OrganisationModule {}
