-- 0007_alarm_abweichung: Alarme (aus Telematik-Auswertung) und GDP-Abweichungen
-- (CAPA). Arbeitsgrundlage nach T-002 §4.13/§4.14. GDP-relevant, auditiert.

CREATE TABLE IF NOT EXISTS alarm (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    uuid NOT NULL REFERENCES mandant(id),
  fahrzeug_id   uuid NOT NULL REFERENCES fahrzeug(id),
  miete_id      uuid REFERENCES miete(id),
  sensor_id     uuid,
  typ           text NOT NULL,
  messgroesse   text,
  wert          double precision,
  schwelle      double precision,
  ausgeloest_am timestamptz NOT NULL,
  nachricht_id  text,
  status        text NOT NULL DEFAULT 'offen',
  quittiert_von text,
  quittiert_am  timestamptz,
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);
-- Idempotenz: dieselbe Nachricht erzeugt denselben Alarm nicht doppelt
-- (robust gegen Neuzustellung/Neuauswertung).
CREATE UNIQUE INDEX IF NOT EXISTS uq_alarm_nachricht_typ
  ON alarm(fahrzeug_id, nachricht_id, typ) WHERE nachricht_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alarm_mandant_status ON alarm(mandant_id, status);
CREATE INDEX IF NOT EXISTS idx_alarm_miete ON alarm(miete_id);
CREATE INDEX IF NOT EXISTS idx_alarm_fahrzeug_zeit ON alarm(fahrzeug_id, ausgeloest_am DESC);

CREATE TABLE IF NOT EXISTS abweichung (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    uuid NOT NULL REFERENCES mandant(id),
  bezug_typ     text NOT NULL,
  bezug_id      uuid NOT NULL,
  beschreibung  text NOT NULL,
  schweregrad   text,
  status        text NOT NULL DEFAULT 'erfasst',
  bewertung     text,
  massnahmen    text,
  verantwortlich text,
  erfasst_am    timestamptz NOT NULL DEFAULT now(),
  geschlossen_am timestamptz,
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abweichung_bezug ON abweichung(bezug_typ, bezug_id);
CREATE INDEX IF NOT EXISTS idx_abweichung_mandant_status ON abweichung(mandant_id, status);
