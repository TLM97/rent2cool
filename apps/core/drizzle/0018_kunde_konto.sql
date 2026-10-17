-- 0018_kunde_konto (F-41): Welcher Login (Keycloak-Benutzer-ID) gehört zu
-- welchem Firmenkunden? Kundenrollen sehen nur Daten dieses Kunden. Die
-- Zuordnung liegt im Kern (D-001: Rollen und Rechte im Kern), Keycloak meldet
-- nur an. Ein Login gehört genau einem Kunden.
CREATE TABLE IF NOT EXISTS kunde_konto (
  konto_id text PRIMARY KEY,
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  kunde_id uuid NOT NULL REFERENCES kunde(id),
  bezeichnung text,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kunde_konto_kunde ON kunde_konto(kunde_id);
