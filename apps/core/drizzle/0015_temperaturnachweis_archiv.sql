-- 0015_temperaturnachweis_archiv: Je Miete archivierte, unveränderbare
-- Temperaturnachweise (zentrales Verkaufsargument, Roadmap). Dateien (JSON und
-- PDF) liegen im Objektspeicher (D-003); hier Kennzahlen, Prüfsummen und
-- Signaturen. Neue Erkenntnisse (z. B. nachgelieferte Messwerte) = neue
-- Version, nie Überschreiben.

CREATE TABLE IF NOT EXISTS temperaturnachweis_archiv (
  id uuid PRIMARY KEY,
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  miete_id uuid NOT NULL REFERENCES miete(id),
  version integer NOT NULL,
  ausloeser text NOT NULL,
  erzeugt_von text NOT NULL,
  erzeugt_am timestamptz NOT NULL DEFAULT now(),
  von timestamptz NOT NULL,
  bis timestamptz NOT NULL,
  profil text NOT NULL,
  bewertung text NOT NULL,
  kennzahlen jsonb NOT NULL,
  anzahl_grenzverletzungen integer NOT NULL,
  anzahl_luecken integer NOT NULL,
  -- Integrität der Messdaten (aus dem Nachweis) …
  daten_hash text NOT NULL,
  signatur_algorithmus text NOT NULL,
  daten_signatur text NOT NULL,
  -- … und der Dateien im Objektspeicher.
  json_schluessel text NOT NULL,
  json_sha256 text NOT NULL,
  json_groesse integer NOT NULL,
  pdf_schluessel text NOT NULL,
  pdf_sha256 text NOT NULL,
  pdf_groesse integer NOT NULL,
  dokument_signatur text NOT NULL,
  CONSTRAINT ck_archiv_ausloeser CHECK (ausloeser IN ('automatisch', 'manuell')),
  CONSTRAINT ck_archiv_version CHECK (version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_archiv_miete_version ON temperaturnachweis_archiv(miete_id, version);
-- Genau ein automatischer Nachweis je Miete (Wiederholungen des Jobs legen nichts doppelt an).
CREATE UNIQUE INDEX IF NOT EXISTS uq_archiv_miete_automatisch ON temperaturnachweis_archiv(miete_id) WHERE ausloeser = 'automatisch';

-- Archiv ist unveränderbar: kein Update, kein Delete – auch nicht am Kern vorbei.
CREATE OR REPLACE FUNCTION archiv_unveraenderbar() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Archivierte Temperaturnachweise sind unveränderbar' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_archiv_unveraenderbar ON temperaturnachweis_archiv;
CREATE TRIGGER tr_archiv_unveraenderbar BEFORE UPDATE OR DELETE ON temperaturnachweis_archiv
  FOR EACH ROW EXECUTE FUNCTION archiv_unveraenderbar();

-- Fällige Nachweise finden (beendete Mieten nach Karenzzeit) – ohne Vollscan.
CREATE INDEX IF NOT EXISTS idx_miete_ende_ist_beendet ON miete(ende_ist)
  WHERE status IN ('beendet', 'abgerechnet');
