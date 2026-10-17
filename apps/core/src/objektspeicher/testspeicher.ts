/**
 * Objektspeicher für Integrationstests: lokaler S3-Dienst aus
 * docker-compose.yml (SeaweedFS, Platzhalter-Zugangsdaten); Umgebungsvariablen
 * haben Vorrang.
 */
import { S3ObjektSpeicher, s3AusUmgebung } from './objekt-speicher';

export function testSpeicher(): S3ObjektSpeicher {
  return new S3ObjektSpeicher(
    s3AusUmgebung({
      S3_ENDPOINT: 'http://localhost:8333',
      S3_ACCESS_KEY: 'rent2cool_local',
      S3_SECRET_KEY: 'rent2cool_local_secret',
      S3_BUCKET: 'rent2cool-local',
      ...process.env,
    }),
  );
}
