-- 0000_baseline: bewusst leere Erst-Migration (T-001).
--
-- Das fachliche Datenmodell ist in T-002 (docs/datenmodell.md) zunaechst nur
-- ein VORSCHLAG zur Pruefung durch die Planung. Erst nach Freigabe entstehen
-- hier die eigentlichen Tabellen, Hypertables (TimescaleDB), Indizes und
-- Partitionen als versionierte Migrationen.
--
-- Diese Datei existiert, damit das Migrationswerkzeug eingerichtet und
-- nachweisbar lauffaehig ist (R-10). Sie veraendert das Schema nicht.
SELECT 1;
