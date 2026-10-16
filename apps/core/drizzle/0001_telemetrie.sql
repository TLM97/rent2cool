-- 0001_telemetrie (T-003): Telematik-Eingang und unveränderbare Messreihe.
--
-- Dieser Teil des Datenmodells wird durch T-003 ausdrücklich gebaut
-- (TimescaleDB-Hypertable, nur anhängen). Die breitere Freigabe des
-- Datenmodells (T-002) bleibt davon unberührt.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Duplikaterkennung: eine Zeile je verarbeiteter Nachricht (nachricht_id ist
-- die von der Quelle vergebene eindeutige ID, D-003).
CREATE TABLE IF NOT EXISTS telemetrie_nachricht (
  nachricht_id  text PRIMARY KEY,
  fahrzeug_id   uuid NOT NULL,
  quelle        text NOT NULL,
  gesendet_am   timestamptz NOT NULL,
  empfangen_am  timestamptz NOT NULL DEFAULT now(),
  werte_anzahl  integer NOT NULL
);

-- Messwerte als Zeitreihe. Append-only, unveränderbar (CLAUDE.md).
CREATE TABLE IF NOT EXISTS messwert (
  zeit         timestamptz NOT NULL,
  fahrzeug_id  uuid NOT NULL,
  messgroesse  text NOT NULL,
  wert         double precision NOT NULL,
  einheit      text NOT NULL,
  nachricht_id text NOT NULL,
  quelle       text NOT NULL,
  miete_id     uuid
);

-- Hypertable: Partitionierung nach Zeit (Tages-Chunks). Kompression und
-- Aufbewahrung (Retention) folgen als eigene Policies, sobald die Fristen
-- feststehen (F-2). Beim Setzen der Kompression ist der Append-only-Trigger
-- unten zu beachten.
SELECT create_hypertable('messwert', 'zeit', if_not_exists => TRUE,
                         chunk_time_interval => INTERVAL '1 day');

CREATE INDEX IF NOT EXISTS idx_messwert_fahrzeug_zeit
  ON messwert (fahrzeug_id, zeit DESC);
CREATE INDEX IF NOT EXISTS idx_messwert_messgroesse_zeit
  ON messwert (messgroesse, zeit DESC);
CREATE INDEX IF NOT EXISTS idx_messwert_nachricht
  ON messwert (nachricht_id);

-- Append-only erzwingen: kein UPDATE, kein DELETE auf Einzelzeilen.
CREATE OR REPLACE FUNCTION messwert_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'messwert ist unveraenderbar (append-only): % nicht erlaubt', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messwert_append_only ON messwert;
CREATE TRIGGER trg_messwert_append_only
  BEFORE UPDATE OR DELETE ON messwert
  FOR EACH ROW EXECUTE FUNCTION messwert_append_only();
