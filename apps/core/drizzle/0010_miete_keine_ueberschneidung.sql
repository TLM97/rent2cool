-- 0010_miete_keine_ueberschneidung: Ein Fahrzeug kann nicht zweimal für
-- überlappende Zeiträume bestätigt/aktiv gebucht sein – erzwungen von der
-- Datenbank, auch bei gleichzeitigen Buchungen (D-003). Die Prüfung im Kern
-- bleibt für verständliche Ablehnungsgründe; diese Regel ist die Garantie.
-- Zeiträume halboffen [start, ende): Rückgabe 10:00 und neue Abholung 10:00
-- überschneiden sich nicht (wie die Prüfung im Kern).

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  ALTER TABLE miete ADD CONSTRAINT ex_miete_fahrzeug_zeitraum
    EXCLUDE USING gist (
      fahrzeug_id WITH =,
      tstzrange(start_geplant, ende_geplant, '[)') WITH &&
    ) WHERE (status IN ('bestaetigt', 'aktiv'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
