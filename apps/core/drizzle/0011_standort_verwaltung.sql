-- 0011_standort_verwaltung (D-011): Standorte pflegbar machen – Öffnungsregeln
-- (Wochenplan in Ortszeit, JSON), Versionsstand für Änderungen, eindeutiger
-- Name je Mandant. Indizes für die Prüfung „noch in Benutzung?“ beim
-- Deaktivieren und für die Fahrzeugsuche je Abholstandort.

ALTER TABLE standort ADD COLUMN IF NOT EXISTS oeffnungsregeln jsonb;
ALTER TABLE standort ADD COLUMN IF NOT EXISTS aktualisiert_am timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_standort_mandant_name ON standort(mandant_id, name);
CREATE INDEX IF NOT EXISTS idx_miete_standort_abhol ON miete(standort_abhol_id) WHERE standort_abhol_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_miete_standort_rueckgabe ON miete(standort_rueckgabe_id) WHERE standort_rueckgabe_id IS NOT NULL;
