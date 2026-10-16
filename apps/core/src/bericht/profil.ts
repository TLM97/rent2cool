/**
 * Temperaturprofile (D-008). v1 aus Konfiguration, nicht aus der DB – das
 * Temperaturprofil ist im Datenmodell (T-002) erst „zusätzlich vorgeschlagen"
 * (F-4). Die Quelle ist ein Interface; sobald T-002 freigegeben ist, kann eine
 * DB-basierte Quelle ohne Änderung an den Konsumenten eingesetzt werden.
 */
import type { Temperaturprofil } from '@rent2cool/shared';

export interface ProfilQuelle {
  hole(name: string): Temperaturprofil | undefined;
  alle(): Temperaturprofil[];
}

export const STANDARD_PROFILE: Temperaturprofil[] = [
  { name: '2-8', minC: 2, maxC: 8 },
  { name: '15-25', minC: 15, maxC: 25 },
];

export class KonfigProfilQuelle implements ProfilQuelle {
  constructor(private readonly profile: Temperaturprofil[] = STANDARD_PROFILE) {}
  hole(name: string): Temperaturprofil | undefined {
    return this.profile.find((p) => p.name === name);
  }
  alle(): Temperaturprofil[] {
    return [...this.profile];
  }
}
