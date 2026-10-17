-- 0019_organisation (F-51, Tom 2026-10-17): Kunden registrieren sich selbst
-- und verwalten ihre Organisation; Rent2Cool gibt den Kunden nur frei.
-- Rollen innerhalb des Kunden stehen an der Zuordnung Login → Kunde (nicht in
-- Keycloak), damit der Kunde sie selbst vergeben kann – nie interne Rollen.
ALTER TABLE kunde_konto ADD COLUMN IF NOT EXISTS rollen text[] NOT NULL DEFAULT ARRAY['kunde_dispo', 'kunde_qa'];
DO $$ BEGIN
  ALTER TABLE kunde_konto ADD CONSTRAINT ck_kunde_konto_rollen CHECK (
    cardinality(rollen) > 0 AND rollen <@ ARRAY['kunde_admin', 'kunde_dispo', 'kunde_qa']
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE kunde_konto ADD COLUMN IF NOT EXISTS aktualisiert_am timestamptz NOT NULL DEFAULT now();
-- E-Mail des Logins (aus dem Token bei Registrierung bzw. Annahme der Einladung).
ALTER TABLE kunde_konto ADD COLUMN IF NOT EXISTS email text;

-- Einladungen in die Organisation: Link mit Einmal-Code per E-Mail. Gespeichert
-- wird nur der SHA-256 des Codes; gültig 7 Tage; einmal einlösbar.
CREATE TABLE IF NOT EXISTS kunde_einladung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id uuid NOT NULL REFERENCES mandant(id),
  kunde_id uuid NOT NULL REFERENCES kunde(id),
  email text NOT NULL,
  rollen text[] NOT NULL,
  code_hash text NOT NULL UNIQUE,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  gueltig_bis timestamptz NOT NULL,
  angenommen_von text,
  angenommen_am timestamptz,
  widerrufen_am timestamptz,
  CONSTRAINT ck_einladung_rollen CHECK (
    cardinality(rollen) > 0 AND rollen <@ ARRAY['kunde_admin', 'kunde_dispo', 'kunde_qa']
  )
);
-- Je Kunde und E-Mail höchstens eine offene Einladung.
CREATE UNIQUE INDEX IF NOT EXISTS uq_einladung_offen ON kunde_einladung(kunde_id, email)
  WHERE angenommen_am IS NULL AND widerrufen_am IS NULL;
