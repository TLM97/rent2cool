-- 0003_fahrzeugakte: Fahrzeugakte + Stammdaten-Basis (Mandant/Standort).
-- Arbeitsgrundlage nach Datenmodell-Vorschlag T-002 (docs/datenmodell.md),
-- gestützt auf freigegebene Entscheidungen D-004..D-011. GDP-relevant; jede
-- schreibende Aktion wird auditiert (T-004).

CREATE TABLE IF NOT EXISTS mandant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  aktiv       boolean NOT NULL DEFAULT true,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS standort (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id       uuid NOT NULL REFERENCES mandant(id),
  name             text NOT NULL,
  strasse          text,
  plz              text,
  ort              text,
  land             text NOT NULL DEFAULT 'DE',
  geofence_lat     double precision,
  geofence_lng     double precision,
  geofence_radius_m integer,
  region           text,
  aktiv            boolean NOT NULL DEFAULT true,
  erstellt_am      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_standort_mandant ON standort(mandant_id);

CREATE TABLE IF NOT EXISTS fahrzeug (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id                     uuid NOT NULL REFERENCES mandant(id),
  standort_id                    uuid REFERENCES standort(id),
  region                         text,
  kennzeichen                    text NOT NULL,
  vin                            text,
  fahrzeugprofil                 text NOT NULL DEFAULT 'PLACEHOLDER_Mercedes_Kuehltransporter_bis_3_5t',
  zul_gesamtmasse_kg             integer NOT NULL,
  benoetigte_fuehrerscheinklasse text NOT NULL DEFAULT 'B',
  hat_fahrtenschreiber           boolean NOT NULL DEFAULT false,
  standard_temperaturprofil      text,
  status                         text NOT NULL DEFAULT 'angelegt',
  erstellt_am                    timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am                timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fahrzeug_kennzeichen ON fahrzeug(mandant_id, kennzeichen);
CREATE INDEX IF NOT EXISTS idx_fahrzeug_mandant_status ON fahrzeug(mandant_id, status);
CREATE INDEX IF NOT EXISTS idx_fahrzeug_standort ON fahrzeug(standort_id);
CREATE INDEX IF NOT EXISTS idx_fahrzeug_tacho ON fahrzeug(hat_fahrtenschreiber);

CREATE TABLE IF NOT EXISTS aggregat (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fahrzeug_id       uuid NOT NULL REFERENCES fahrzeug(id),
  typ               text,
  hersteller        text,
  seriennummer      text,
  temperatur_quelle text,
  eingebaut_am      timestamptz,
  ausgebaut_am      timestamptz,
  erstellt_am       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aggregat_fahrzeug ON aggregat(fahrzeug_id);

CREATE TABLE IF NOT EXISTS sensor (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregat_id  uuid NOT NULL REFERENCES aggregat(id),
  messgroesse  text NOT NULL,
  einheit      text NOT NULL,
  modell       text,
  seriennummer text,
  aktiv        boolean NOT NULL DEFAULT true,
  erstellt_am  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sensor_aggregat ON sensor(aggregat_id);

CREATE TABLE IF NOT EXISTS kalibrierung (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id       uuid NOT NULL REFERENCES sensor(id),
  durchgefuehrt_am timestamptz NOT NULL,
  gueltig_bis     timestamptz NOT NULL,
  pruefstelle     text,
  zertifikat_ref  text,
  ergebnis        text,
  erfasst_von     text,
  erstellt_am     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kalibrierung_sensor ON kalibrierung(sensor_id, gueltig_bis DESC);
