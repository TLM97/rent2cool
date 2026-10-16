-- 0005_miete: Mieten/Buchungen (D-009). Buchungsregeln (D-006/D-010/R-22)
-- prüft der Kern. Idempotente Buchung über idempotency_key (D-003).

CREATE TABLE IF NOT EXISTS miete (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id             uuid NOT NULL REFERENCES mandant(id),
  kunde_id               uuid NOT NULL REFERENCES kunde(id),
  fahrzeug_id            uuid NOT NULL REFERENCES fahrzeug(id),
  fahrer_id              uuid REFERENCES fahrer(id),
  standort_abhol_id      uuid REFERENCES standort(id),
  standort_rueckgabe_id  uuid REFERENCES standort(id),
  region                 text,
  start_geplant          timestamptz NOT NULL,
  ende_geplant           timestamptz NOT NULL,
  start_ist              timestamptz,
  ende_ist               timestamptz,
  tarif                  text,
  auslandsfahrt_geplant  boolean NOT NULL DEFAULT false,
  temperaturprofil       text,
  status                 text NOT NULL DEFAULT 'angefragt',
  idempotency_key        text,
  erstellt_am            timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_miete_idempotency ON miete(mandant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_miete_mandant_status ON miete(mandant_id, status);
CREATE INDEX IF NOT EXISTS idx_miete_kunde ON miete(kunde_id);
CREATE INDEX IF NOT EXISTS idx_miete_fahrzeug_zeit ON miete(fahrzeug_id, start_geplant);
