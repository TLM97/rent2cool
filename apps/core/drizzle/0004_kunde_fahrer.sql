-- 0004_kunde_fahrer: Firmenkunden (D-010) und Fahrer (gehören zum Kunden, D-004).
-- Arbeitsgrundlage nach T-002. Personenbezogene Fahrerdaten: nur erfundene
-- Testdaten, solange DSB ein Platzhalter ist (D-015).

CREATE TABLE IF NOT EXISTS kunde (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id            uuid NOT NULL REFERENCES mandant(id),
  firmenname            text NOT NULL,
  handelsregisternummer text,
  ust_id                text,
  strasse               text,
  plz                   text,
  ort                   text,
  land                  text NOT NULL DEFAULT 'DE',
  status                text NOT NULL DEFAULT 'angelegt',
  erstellt_am           timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kunde_mandant_status ON kunde(mandant_id, status);
CREATE INDEX IF NOT EXISTS idx_kunde_ust ON kunde(ust_id);

CREATE TABLE IF NOT EXISTS fahrer (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id                  uuid NOT NULL REFERENCES kunde(id),
  name                      text NOT NULL,
  fuehrerschein_klasse      text NOT NULL,
  fuehrerschein_nummer      text,
  fuehrerschein_gueltig_bis timestamptz,
  identitaetspruefung_status text NOT NULL DEFAULT 'offen',
  status                    text NOT NULL DEFAULT 'angelegt',
  letzte_pruefung_am        timestamptz,
  erstellt_am               timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fahrer_kunde_status ON fahrer(kunde_id, status);
CREATE INDEX IF NOT EXISTS idx_fahrer_fs_gueltig ON fahrer(fuehrerschein_gueltig_bis);
