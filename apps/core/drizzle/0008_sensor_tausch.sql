-- 0008_sensor_tausch: Sensoren bekommen eine Einbau-Historie. Messwerte hängen
-- am Fahrzeug (nicht am Sensor); erst Ein-/Ausbauzeitpunkt machen nachvollziehbar,
-- welcher Sensor (und welche Kalibrierung) wann gemessen hat (EN 12830, GDP).

ALTER TABLE sensor ADD COLUMN IF NOT EXISTS eingebaut_am timestamptz;
ALTER TABLE sensor ADD COLUMN IF NOT EXISTS ausgebaut_am timestamptz;
ALTER TABLE sensor ADD COLUMN IF NOT EXISTS ausbau_grund text;
ALTER TABLE sensor ADD COLUMN IF NOT EXISTS vorgaenger_id uuid REFERENCES sensor(id);

-- Bestand: eingebaut seit Anlage; bereits inaktive gelten ab Anlage als ausgebaut.
UPDATE sensor SET eingebaut_am = erstellt_am WHERE eingebaut_am IS NULL;
UPDATE sensor SET ausgebaut_am = erstellt_am WHERE NOT aktiv AND ausgebaut_am IS NULL;
ALTER TABLE sensor ALTER COLUMN eingebaut_am SET DEFAULT now();
ALTER TABLE sensor ALTER COLUMN eingebaut_am SET NOT NULL;

-- Aktiv genau dann, wenn nicht ausgebaut; Ausbau nie vor Einbau.
DO $$ BEGIN
  ALTER TABLE sensor ADD CONSTRAINT ck_sensor_ausbau CHECK (
    (aktiv AND ausgebaut_am IS NULL)
    OR (NOT aktiv AND ausgebaut_am IS NOT NULL AND ausgebaut_am >= eingebaut_am)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ein Sensor hat höchstens einen Nachfolger: eindeutige Tausch-Kette, auch bei
-- gleichzeitigen oder wiederholten Anfragen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sensor_vorgaenger ON sensor(vorgaenger_id) WHERE vorgaenger_id IS NOT NULL;
-- Suche nach eingebauten Sensoren je Seriennummer (Doppel-Einbau verhindern).
CREATE INDEX IF NOT EXISTS idx_sensor_seriennummer_aktiv ON sensor(seriennummer) WHERE aktiv;
