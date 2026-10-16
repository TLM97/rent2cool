import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Principal } from '@rent2cool/shared';
import { RolesGuard } from './roles.guard';

function ctxMit(principal?: Principal): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  } as unknown as ExecutionContext;
}

function guardMit(erforderlich: string[] | undefined): RolesGuard {
  return new RolesGuard({
    getAllAndOverride: () => erforderlich,
  } as unknown as Reflector);
}

describe('RolesGuard', () => {
  it('lässt Routen ohne @Roles durch', () => {
    expect(guardMit(undefined).canActivate(ctxMit({ akteurId: 'u', rollen: [] }))).toBe(true);
  });

  it('erlaubt bei passender Rolle', () => {
    const guard = guardMit(['admin']);
    expect(guard.canActivate(ctxMit({ akteurId: 'u', rollen: ['admin'] }))).toBe(true);
  });

  it('verweigert bei fehlender Rolle', () => {
    const guard = guardMit(['admin']);
    expect(() => guard.canActivate(ctxMit({ akteurId: 'u', rollen: ['ops'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('verweigert ohne Principal', () => {
    expect(() => guardMit(['admin']).canActivate(ctxMit(undefined))).toThrow(ForbiddenException);
  });
});
