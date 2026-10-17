-- 0013_schluessel_fernzugriff (D-014, D-015): digitaler Schlüssel je Miete und
-- Fahrer sowie das Protokoll aller Befehle an Fahrzeuge (Entriegeln,
-- Verriegeln, Wegfahrsperre) – auch der abgelehnten. Ausgeführt werden die
-- Befehle über einen austauschbaren KeyProvider (Simulator bis Entscheid).

-- Login-Konto des Fahrers (Keycloak-Benutzer-ID): verbindet den angemeldeten
-- Fahrer in der App mit seinem Datensatz und damit mit seinen Schlüsseln.
ALTER TABLE fahrer ADD COLUMN IF NOT EXISTS konto_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fahrer_konto ON fahrer(konto_id) WHERE konto_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS schluessel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  miete_id uuid NOT NULL REFERENCES miete(id),
  fahrer_id uuid NOT NULL REFERENCES fahrer(id),
  fahrzeug_id uuid NOT NULL REFERENCES fahrzeug(id),
  status text NOT NULL DEFAULT 'aktiv',
  gueltig_von timestamptz NOT NULL,
  -- NULL: gilt bis zum Ende der Miete (dann automatisch widerrufen).
  gueltig_bis timestamptz,
  -- Referenz beim KeyProvider (z. B. Schlüssel-ID des Herstellers).
  anbieter_ref text,
  ausgestellt_von text NOT NULL,
  widerrufen_am timestamptz,
  widerrufen_von text,
  widerruf_grund text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_schluessel_status CHECK (
    (status = 'aktiv' AND widerrufen_am IS NULL)
    OR (status = 'widerrufen' AND widerrufen_am IS NOT NULL)
  ),
  CONSTRAINT ck_schluessel_zeitraum CHECK (gueltig_bis IS NULL OR gueltig_bis > gueltig_von)
);
-- Höchstens ein aktiver Schlüssel je Miete und Fahrer: wiederholtes Ausstellen
-- (auch gleichzeitig) liefert denselben Schlüssel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_schluessel_aktiv ON schluessel(miete_id, fahrer_id) WHERE status = 'aktiv';
CREATE INDEX IF NOT EXISTS idx_schluessel_miete ON schluessel(miete_id);
CREATE INDEX IF NOT EXISTS idx_schluessel_fahrer_status ON schluessel(fahrer_id, status);

CREATE TABLE IF NOT EXISTS fahrzeug_befehl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  fahrzeug_id uuid NOT NULL REFERENCES fahrzeug(id),
  miete_id uuid REFERENCES miete(id),
  -- Gesendet mit dem Fahrerschlüssel; NULL = direkt durch Ops/Admin.
  schluessel_id uuid REFERENCES schluessel(id),
  befehl text NOT NULL,
  status text NOT NULL,
  -- Ablehnungsgründe des Kerns bzw. Fehlermeldung des Anbieters.
  gruende jsonb,
  grund text,
  angefordert_von text NOT NULL,
  angefordert_am timestamptz NOT NULL DEFAULT now(),
  abgeschlossen_am timestamptz,
  anbieter_ref text,
  idempotency_key text NOT NULL,
  CONSTRAINT ck_befehl_status CHECK (status IN ('gesendet', 'ausgefuehrt', 'fehlgeschlagen', 'abgelehnt'))
);
-- Die App wiederholt bei schlechtem Netz (D-003): gleicher Key = derselbe Befehl.
CREATE UNIQUE INDEX IF NOT EXISTS uq_befehl_idempotency ON fahrzeug_befehl(mandant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_befehl_fahrzeug_zeit ON fahrzeug_befehl(fahrzeug_id, angefordert_am DESC);
CREATE INDEX IF NOT EXISTS idx_befehl_miete_zeit ON fahrzeug_befehl(miete_id, angefordert_am DESC) WHERE miete_id IS NOT NULL;
-- Offene Befehle (Bestätigung des Anbieters steht aus) für Abgleich/Nachfassen.
CREATE INDEX IF NOT EXISTS idx_befehl_offen ON fahrzeug_befehl(angefordert_am) WHERE status = 'gesendet';
