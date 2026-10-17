-- 0016_nachweis_siegel (F-47): Nachweis-PDFs tragen ein elektronisches Siegel
-- (eingebettete PDF-Signatur). Im Archiv steht, mit welchem Siegel (Art und
-- Inhaber laut Zertifikat). Ältere Einträge bleiben unverändert (leer).
ALTER TABLE temperaturnachweis_archiv ADD COLUMN IF NOT EXISTS siegel_art text;
ALTER TABLE temperaturnachweis_archiv ADD COLUMN IF NOT EXISTS siegel_aussteller text;
