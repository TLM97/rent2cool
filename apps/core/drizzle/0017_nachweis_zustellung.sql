-- 0017_nachweis_zustellung (F-46): Temperaturnachweise gehen per E-Mail an den
-- QA-Kontakt des Kunden (zusätzlich zum Download im Kundenportal). Jede
-- Zustellung wird festgehalten – auch übersprungene und fehlgeschlagene.
ALTER TABLE kunde ADD COLUMN IF NOT EXISTS nachweis_email text;

CREATE TABLE IF NOT EXISTS nachweis_zustellung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  archiv_id uuid NOT NULL REFERENCES temperaturnachweis_archiv(id),
  kanal text NOT NULL,
  empfaenger text,
  status text NOT NULL,
  grund text,
  nachricht_id text,
  zeit timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_zustellung_kanal CHECK (kanal IN ('email')),
  CONSTRAINT ck_zustellung_status CHECK (status IN ('gesendet', 'uebersprungen', 'fehlgeschlagen'))
);
-- Je Nachweis und Kanal genau ein Ergebnis: wiederholte Jobs senden nicht doppelt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_zustellung_archiv_kanal ON nachweis_zustellung(archiv_id, kanal);
