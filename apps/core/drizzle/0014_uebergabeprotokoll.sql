-- 0014_uebergabeprotokoll (D-014, datenmodell §4.11): Übergabe- und
-- Rückgabeprotokoll mit Foto-Check. Fotos liegen im Objektspeicher (D-003);
-- hier nur Verweis, Größe, Typ und SHA-256. Abgeschlossene Protokolle sind
-- unveränderbar (der Kern lässt keine Änderung mehr zu, s. Trigger).

CREATE TABLE IF NOT EXISTS uebergabeprotokoll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  miete_id uuid NOT NULL REFERENCES miete(id),
  fahrzeug_id uuid NOT NULL REFERENCES fahrzeug(id),
  art text NOT NULL,
  status text NOT NULL DEFAULT 'offen',
  km_stand integer,
  checkliste jsonb,
  schaeden jsonb,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  abgeschlossen_am timestamptz,
  abgeschlossen_von text,
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_protokoll_art CHECK (art IN ('uebergabe', 'rueckgabe')),
  CONSTRAINT ck_protokoll_status CHECK (
    (status = 'offen' AND abgeschlossen_am IS NULL)
    OR (status = 'abgeschlossen' AND abgeschlossen_am IS NOT NULL)
  ),
  CONSTRAINT ck_protokoll_km CHECK (km_stand IS NULL OR km_stand >= 0)
);
-- Je Miete genau ein Übergabe- und ein Rückgabeprotokoll (wiederholtes Anlegen = dasselbe).
CREATE UNIQUE INDEX IF NOT EXISTS uq_protokoll_miete_art ON uebergabeprotokoll(miete_id, art);
CREATE INDEX IF NOT EXISTS idx_protokoll_fahrzeug_zeit ON uebergabeprotokoll(fahrzeug_id, erstellt_am DESC);

CREATE TABLE IF NOT EXISTS protokoll_foto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  protokoll_id uuid NOT NULL REFERENCES uebergabeprotokoll(id),
  perspektive text NOT NULL,
  objekt_schluessel text NOT NULL,
  content_type text NOT NULL,
  groesse integer NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'angefordert',
  verwurf_grund text,
  aufgenommen_am timestamptz,
  angefordert_von text NOT NULL,
  angefordert_am timestamptz NOT NULL DEFAULT now(),
  hochgeladen_am timestamptz,
  idempotency_key text NOT NULL,
  CONSTRAINT ck_foto_status CHECK (status IN ('angefordert', 'hochgeladen', 'verworfen'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_foto_objekt ON protokoll_foto(objekt_schluessel);
CREATE UNIQUE INDEX IF NOT EXISTS uq_foto_idempotency ON protokoll_foto(mandant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_foto_protokoll ON protokoll_foto(protokoll_id);

-- Abgeschlossen heißt abgeschlossen: auch am Kern vorbei (Skripte, Importe)
-- keine Änderung und kein Löschen von Protokoll oder Fotos mehr (D-017-Muster).
CREATE OR REPLACE FUNCTION protokoll_abgeschlossen_schuetzen() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'uebergabeprotokoll' THEN
    IF OLD.status = 'abgeschlossen' THEN
      RAISE EXCEPTION 'Abgeschlossenes Übergabeprotokoll ist unveränderbar' USING ERRCODE = 'P0001';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM uebergabeprotokoll p WHERE p.id = OLD.protokoll_id AND p.status = 'abgeschlossen') THEN
    RAISE EXCEPTION 'Fotos eines abgeschlossenen Protokolls sind unveränderbar' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_protokoll_unveraenderbar ON uebergabeprotokoll;
CREATE TRIGGER tr_protokoll_unveraenderbar BEFORE UPDATE OR DELETE ON uebergabeprotokoll
  FOR EACH ROW EXECUTE FUNCTION protokoll_abgeschlossen_schuetzen();
DROP TRIGGER IF EXISTS tr_protokoll_foto_unveraenderbar ON protokoll_foto;
CREATE TRIGGER tr_protokoll_foto_unveraenderbar BEFORE UPDATE OR DELETE ON protokoll_foto
  FOR EACH ROW EXECUTE FUNCTION protokoll_abgeschlossen_schuetzen();
