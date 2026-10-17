import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuditService } from './audit.service';

/** `typ=a&typ=b` oder `typ=a,b`. */
const einOderMehrere = z
  .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
  .transform((t) => (Array.isArray(t) ? t : [t]).flatMap((x) => x.split(',')).filter(Boolean))
  .pipe(z.array(z.string()).min(1).max(10));

const verlaufSchema = z.object({
  entitaetId: z.string().min(1),
  /** Audit-Typen, z. B. `typ=miete,miete_status`. */
  typ: einOderMehrere,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Lesender Zugriff auf den Audit Trail, nur für interne Rollen. Schreiben
 * gibt es hier nicht – der Audit Trail ist append-only.
 */
@Controller('v1/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('admin', 'ops', 'qa_approver', 'dpo')
  async verlauf(@Query() q: unknown) {
    const r = verlaufSchema.safeParse(q);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const { entitaetId, typ, limit, offset } = r.data;
    const res = await this.audit.verlauf({ entitaetId, typen: typ, limit, offset });
    return { ...res, limit, offset };
  }
}
