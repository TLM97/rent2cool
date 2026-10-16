-- 0002_audit (T-004): Audit Trail. Append-only, unveränderbar (CLAUDE.md).

CREATE TABLE IF NOT EXISTS audit_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zeit          timestamptz NOT NULL DEFAULT now(),
  akteur_id     text NOT NULL,
  akteur_rolle  text,
  aktion        text NOT NULL,
  entitaet_typ  text NOT NULL,
  entitaet_id   text,
  alt_wert      jsonb,
  neu_wert      jsonb,
  mandant_id    text,
  quelle        text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entitaet
  ON audit_event (entitaet_typ, entitaet_id, zeit DESC);
CREATE INDEX IF NOT EXISTS idx_audit_akteur
  ON audit_event (akteur_id, zeit DESC);

-- Append-only erzwingen.
CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event ist unveraenderbar: % nicht erlaubt', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_append_only ON audit_event;
CREATE TRIGGER trg_audit_append_only
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
