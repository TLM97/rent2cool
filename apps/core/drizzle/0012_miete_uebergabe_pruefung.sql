-- 0012_miete_uebergabe_pruefung (D-011, D-014): Ergebnis der Übergabebereich-
-- Prüfung beim Mietbeginn (Übergabe) und Mietende (Rückgabe) – Position aus der
-- Telematik gegen den Geofence des Abhol- bzw. Rückgabestandorts. Wird im selben
-- Schritt wie der Statuswechsel gespeichert und damit auditiert.
ALTER TABLE miete ADD COLUMN IF NOT EXISTS uebergabe_pruefung jsonb;
ALTER TABLE miete ADD COLUMN IF NOT EXISTS rueckgabe_pruefung jsonb;
