-- 0009_audit_akteur_name: lesbarer Anmeldename im Audit Trail. Nur ergänzend –
-- maßgeblich bleibt akteur_id (Keycloak-sub). Bestehende Einträge bleiben
-- unverändert (append-only). akteur_rolle enthält ab jetzt alle Rollen,
-- kommagetrennt (vorher nur die erste).
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS akteur_name text;
