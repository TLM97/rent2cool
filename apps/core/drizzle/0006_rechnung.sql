-- 0006_rechnung: Rechnungen (R-63). Beträge in ganzen Cent. Eine Rechnung je
-- Miete (v1; Sammelrechnung offen, F-7). Steuerliche Aufbewahrung beachten (F-2).

CREATE TABLE IF NOT EXISTS rechnung (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id      uuid NOT NULL REFERENCES mandant(id),
  kunde_id        uuid NOT NULL REFERENCES kunde(id),
  miete_id        uuid NOT NULL REFERENCES miete(id),
  rechnungsnummer text NOT NULL,
  zeitraum_von    timestamptz NOT NULL,
  zeitraum_bis    timestamptz NOT NULL,
  netto_cent      integer NOT NULL,
  steuer_satz     integer NOT NULL,
  steuer_cent     integer NOT NULL,
  brutto_cent     integer NOT NULL,
  waehrung        text NOT NULL DEFAULT 'EUR',
  status          text NOT NULL DEFAULT 'entwurf',
  gestellt_am     timestamptz,
  bezahlt_am      timestamptz,
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rechnung_nummer ON rechnung(mandant_id, rechnungsnummer);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rechnung_miete ON rechnung(miete_id);
CREATE INDEX IF NOT EXISTS idx_rechnung_kunde ON rechnung(kunde_id);
CREATE INDEX IF NOT EXISTS idx_rechnung_mandant_status ON rechnung(mandant_id, status);

-- Fortlaufende Rechnungsnummern je Mandant und Jahr (atomar per Upsert-Increment).
CREATE TABLE IF NOT EXISTS rechnung_sequenz (
  mandant_id    uuid NOT NULL,
  jahr          integer NOT NULL,
  letzte_nummer integer NOT NULL,
  PRIMARY KEY (mandant_id, jahr)
);
