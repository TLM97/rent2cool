/**
 * Ganzer Geschäftsablauf einmal durch die Oberfläche (gegen den lokalen Stack):
 * Fahrzeug → Kalibrierung → Kunde → Fahrer → Buchung → Miete → Rechnung →
 * Abweichung. Nur erfundene Testdaten (D-015); eindeutige Namen je Lauf.
 *
 *   pnpm --filter @rent2cool/admin test:e2e
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORT = process.env.E2E_PASSWORT ?? 'PLACEHOLDER_dev_passwort';
const SCREENS = 'test-results/screens';
/** Kleinstes gültiges PNG (1×1, grau) als Testfoto – keine echten Bilder (D-015). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==',
  'base64',
);

async function anmelden(page: Page, nutzer: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mit Rent2Cool-Konto anmelden' }).click();
  await page.locator('#username').fill(nutzer);
  await page.locator('#password').fill(PASSWORT);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
}

/** Status über ein Inline-Statusformular wechseln (Auswahl per Label, dann „Übernehmen“). */
async function statusWechseln(page: Page, label: string, status: string, meldung: RegExp | string) {
  const auswahl = page.getByLabel(label, { exact: true });
  await auswahl.selectOption(status);
  const vorher = page.url();
  await page.locator('form', { has: auswahl }).getByRole('button', { name: 'Übernehmen' }).click();
  // Erst weiter, wenn die Weiterleitung mit der neuen Meldung da ist (sonst tippt der Test in die alte Seite).
  await page.waitForURL((u) => u.href !== vorher);
  await expect(page.getByRole('status')).toContainText(meldung);
}

test('kompletter Ablauf von Fahrzeug bis Abweichung', async ({ page, context }) => {
  test.setTimeout(180_000);
  const lauf = Date.now().toString(36).toUpperCase().slice(-5);
  const kennzeichen = `B-RC ${lauf}`;
  const firma = `Testpharma ${lauf} GmbH`;
  const fahrerName = `Erika Test ${lauf}`;

  await anmelden(page, 'admin.dev');

  // --- Fahrzeug anlegen; Pflichtfeldfehler behält die Eingaben ---
  await page.goto('/fahrzeuge');
  await page.getByRole('link', { name: 'Fahrzeug anlegen' }).click();
  await page.getByLabel('Sensor-Seriennummer').fill(`SN-${lauf}`);
  await page.getByRole('button', { name: 'Fahrzeug anlegen' }).click();
  await expect(page.locator('.hinweis[role=alert]')).toContainText(
    'Bitte die markierten Felder prüfen',
  );
  await expect(page.getByLabel('Kennzeichen')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Sensor-Seriennummer')).toHaveValue(`SN-${lauf}`);
  await page.screenshot({ path: `${SCREENS}/11-fahrzeug-fehler.png`, fullPage: true });

  await page.getByLabel('Kennzeichen').fill(kennzeichen);
  await page.getByRole('button', { name: 'Fahrzeug anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: kennzeichen })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Fahrzeug angelegt');
  const fahrzeugUrl = page.url();

  await statusWechseln(page, 'Status ändern', 'verfuegbar', 'Status');
  await expect(page.locator('.hinweis.fehler', { hasText: 'Nicht buchbar' })).toBeVisible();

  // --- Kalibrierung ---
  await page.getByLabel('Prüfstelle').fill('Testlabor (erfunden)');
  await page.getByLabel('Zertifikat-Nr. / Referenz').fill(`KAL-${lauf}`);
  await page.getByRole('button', { name: 'Kalibrierung speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Kalibrierung erfasst');
  await expect(page.getByText('Buchbar – verfügbar')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/12-fahrzeug-buchbar.png`, fullPage: true });

  // --- Kunde anlegen und freigeben ---
  await page.goto('/kunden');
  await page.getByRole('link', { name: 'Kunde anlegen' }).click();
  await page.getByLabel('Firmenname').fill(firma);
  await page.getByLabel('USt-ID').fill('DE000000000');
  await page.getByLabel('Ort').fill('Berlin');
  await page.getByLabel('E-Mail für Temperaturnachweise (QA)').fill(`qa-${lauf}@testkunde.example`);
  await page.getByRole('button', { name: 'Kunde anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: firma })).toBeVisible();
  await statusWechseln(page, 'Kundenstatus ändern', 'in_pruefung', 'Status');
  await statusWechseln(page, 'Kundenstatus ändern', 'freigegeben', 'Status');

  // --- Fahrer anlegen und freigeben ---
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(fahrerName);
  await page.getByLabel('Führerschein gültig bis').fill('2030-12-31');
  await page.getByRole('button', { name: 'Fahrer anlegen' }).click();
  await expect(page.getByRole('status')).toContainText('Fahrer angelegt');
  await statusWechseln(page, `Status von ${fahrerName} ändern`, 'identitaet_pruefung', 'Status');
  await statusWechseln(page, `Status von ${fahrerName} ändern`, 'freigegeben', 'Status');
  await page.screenshot({ path: `${SCREENS}/13-kunde-fahrer.png`, fullPage: true });

  // --- Buchung: Kunde suchen, Zeitraum/Fahrer, buchbare Fahrzeuge, bestätigen ---
  await page.goto('/mieten');
  await page.getByRole('link', { name: 'Buchung anlegen' }).click();
  await page.getByLabel('Firmenname (freigegebene Kunden)').fill(`Testpharma ${lauf}`);
  await page.getByRole('button', { name: 'Kunde suchen' }).click();
  await page.getByRole('link', { name: firma }).click();
  await page
    .getByLabel('Fahrer', { exact: true })
    .selectOption({ label: `${fahrerName} · Klasse B` });
  await page.getByLabel('Kennzeichen enthält').fill(kennzeichen);

  // Mit Auslandsfahrt erscheint das Fahrzeug ohne Fahrtenschreiber gar nicht erst.
  await page.getByLabel('Auslandsfahrt geplant').check();
  await page.getByRole('button', { name: 'Fahrzeuge suchen' }).click();
  await expect(
    page.getByText('Kein Fahrzeug ist im Zeitraum buchbar (mit Fahrtenschreiber)'),
  ).toBeVisible();
  await page.getByLabel('Auslandsfahrt geplant').uncheck();
  await page.getByRole('button', { name: 'Fahrzeuge suchen' }).click();
  await page.getByRole('link', { name: `${kennzeichen} wählen` }).click();
  await expect(page.getByRole('heading', { name: 'Buchung bestätigen' })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/13b-buchung-suche.png`, fullPage: true });

  // Zweite Disponentin öffnet dieselbe Auswahl, bevor die erste bestätigt.
  const zweite = await context.newPage();
  await zweite.goto(page.url());
  await zweite.getByLabel('Temperaturprofil').selectOption('15-25');

  await page.getByRole('button', { name: 'Buchung bestätigen' }).click();
  await expect(page.getByRole('status')).toContainText('Buchung bestätigt');
  await expect(page.getByRole('link', { name: kennzeichen })).toBeVisible();

  // Die zweite wird mit Grund abgelehnt; ihre Auswahl bleibt erhalten.
  await zweite.getByRole('button', { name: 'Buchung bestätigen' }).click();
  await expect(zweite.locator('.hinweis[role=alert]')).toContainText('bereits gebucht');
  await expect(zweite.getByLabel('Temperaturprofil').locator('option:checked')).toHaveText(
    '15-25 °C',
  );
  await zweite.screenshot({ path: `${SCREENS}/14-buchung-abgelehnt.png`, fullPage: true });
  await zweite.close();

  // --- Miete durchlaufen, Rechnung erstellen ---
  await statusWechseln(page, 'Mietstatus ändern', 'aktiv', 'Status');
  // Ohne Standort und Position: Übergabebereich ehrlich „unbekannt“, nie „im Bereich“.
  await expect(page.getByText('unbekannt – Kein Standort festgelegt').first()).toBeVisible();

  // --- Digitaler Schlüssel (D-014): ausstellen; Fernzugriff durch den Betrieb ---
  const mieteUrl = page.url().split('?')[0]!;
  const schluesselKarte = page.getByRole('region', { name: 'Digitaler Schlüssel' });
  await schluesselKarte
    .getByLabel('Fahrer des Kunden')
    .selectOption({ label: `${fahrerName} (freigegeben)` });
  await schluesselKarte.getByRole('button', { name: 'Schlüssel ausstellen' }).click();
  await expect(page.getByRole('status')).toContainText('Schlüssel ausgestellt');
  await expect(schluesselKarte.getByRole('row', { name: new RegExp(fahrerName) })).toContainText(
    'bis Mietende',
  );

  await page.goto(fahrzeugUrl);
  const fernzugriff = page.getByRole('region', { name: 'Fernzugriff' });
  await fernzugriff.getByLabel('Befehl').selectOption('entriegeln');
  await fernzugriff.getByRole('button', { name: 'Befehl senden' }).click();
  await expect(fernzugriff.getByLabel('Grund')).toHaveAttribute('aria-invalid', 'true');
  await fernzugriff.getByLabel('Grund').fill('Fahrer ausgesperrt (Test)');
  await fernzugriff.getByRole('button', { name: 'Befehl senden' }).click();
  await expect(page.getByRole('status')).toContainText('Entriegeln ausgeführt');
  await expect(fernzugriff.getByRole('row').nth(1)).toContainText('Fahrer ausgesperrt (Test)');
  await page.screenshot({ path: `${SCREENS}/23-fernzugriff.png`, fullPage: true });

  // Der Befehl hängt an der laufenden Miete.
  await page.goto(mieteUrl);
  await expect(schluesselKarte).toContainText('Fahrer ausgesperrt (Test)');

  // --- Übergabeprotokoll mit Foto-Check (Ausnahmeprozess mit Personal) ---
  const protokoll = page.getByRole('region', { name: 'Übergabe- und Rückgabeprotokoll' });
  await protokoll.getByRole('button', { name: 'Übergabeprotokoll anlegen' }).click();
  await expect(page.getByRole('status')).toContainText('Übergabeprotokoll angelegt');
  for (const [wert, name] of [
    ['vorne', 'Front'],
    ['hinten', 'Heck'],
    ['links', 'Fahrerseite links'],
    ['rechts', 'Beifahrerseite rechts'],
    ['laderaum', 'Laderaum innen'],
    ['tacho', 'Kilometerstand / Kühlanzeige'],
  ] as const) {
    await protokoll.getByLabel('Ansicht').selectOption(wert);
    await protokoll.locator('input[type=file]').setInputFiles({
      name: `${wert}.png`,
      mimeType: 'image/png',
      buffer: PNG,
    });
    await protokoll.getByRole('button', { name: 'Foto hochladen' }).click();
    await expect(page.getByRole('status')).toContainText('Foto gespeichert');
    await expect(protokoll.getByRole('img', { name })).toBeVisible();
  }
  // Ohne Checkliste und Kilometerstand kein Abschluss – mit Liste, was fehlt.
  await protokoll.getByRole('button', { name: 'Übergabeprotokoll abschließen' }).click();
  await expect(protokoll.locator('.hinweis[role=alert]')).toContainText('Kilometerstand fehlt');
  await protokoll.getByLabel('Kilometerstand').fill('12345');
  for (const punkt of await protokoll.locator('select[name^="uebergabe_check_"]').all()) {
    await punkt.selectOption('ja');
  }
  await protokoll.getByRole('button', { name: 'Angaben speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Änderungen gespeichert');
  await protokoll.getByRole('button', { name: 'Übergabeprotokoll abschließen' }).click();
  await expect(page.getByRole('status')).toContainText('Übergabeprotokoll abgeschlossen');
  await expect(protokoll).toContainText('12.345 km');
  await expect(protokoll.getByRole('button', { name: 'Foto hochladen' })).toHaveCount(0);
  await protokoll.screenshot({ path: `${SCREENS}/24-uebergabeprotokoll.png` });
  await statusWechseln(page, 'Mietstatus ändern', 'beendet', 'Status');
  // Mietende widerruft den Schlüssel automatisch.
  await expect(schluesselKarte).toContainText('widerrufen – Miete beendet');
  await expect(schluesselKarte.getByRole('heading', { name: 'Schlüssel ausstellen' })).toHaveCount(
    0,
  );
  // Verlauf: jeder Statuswechsel mit Person, altem und neuem Wert.
  const mietVerlauf = page.getByRole('region', { name: 'Verlauf' });
  await expect(mietVerlauf).toContainText('admin.dev');
  await expect(mietVerlauf).toContainText('Status: bestätigt → aktiv');
  await expect(mietVerlauf).toContainText('Status: aktiv → beendet');

  // --- Temperaturnachweis: nach Mietende anfordern, im Archiv prüfen ---
  const archiv = page.getByRole('region', { name: 'Temperaturnachweis für den Kunden' });
  await archiv.getByRole('button', { name: 'Neue Version erzeugen' }).click();
  await expect(page.getByRole('status')).toContainText('Neuer Nachweis angefordert');
  // Der Berichtsdienst arbeitet im Hintergrund – bis die Version erscheint, neu laden.
  await expect(async () => {
    await page.reload();
    await expect(archiv.getByRole('link', { name: 'PDF' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  // … und geht per E-Mail an die QA des Kunden (lokal: Mailpit).
  await expect(async () => {
    await page.reload();
    await expect(archiv.getByText('gesendet')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(archiv).toContainText(`qa-${lauf}@testkunde.example`);
  await archiv.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByRole('status')).toContainText('Version 1 ist echt');
  await archiv.screenshot({ path: `${SCREENS}/25-nachweis-archiv.png` });
  await mietVerlauf.screenshot({ path: `${SCREENS}/22-miete-verlauf.png` });
  await page.getByLabel('Nettobetrag (EUR)').fill('250.00');
  await page.getByRole('button', { name: 'Rechnung erstellen' }).click();
  await expect(page.getByRole('status')).toContainText('Rechnung als Entwurf angelegt');
  await statusWechseln(page, 'Rechnungsstatus ändern', 'gestellt', 'Status');
  await statusWechseln(page, 'Rechnungsstatus ändern', 'bezahlt', 'Status');
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
    'Status: gestellt → bezahlt',
  );
  await expect(page.getByRole('region', { name: 'Rechnungsdaten' })).toContainText('297,50');
  await page.screenshot({ path: `${SCREENS}/15-rechnung.png`, fullPage: true });

  // --- Abweichung aus der Miete erfassen und durch die QA abschließen ---
  await page.getByRole('link', { name: 'Mietakte öffnen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Temperaturnachweis', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Abweichung erfassen' }).click();
  await page
    .getByLabel('Beschreibung')
    .fill(`Testabweichung ${lauf}: Tür bei Übergabe offen (erfunden).`);
  await page.getByLabel('Schweregrad').selectOption('mittel');
  await page.getByRole('button', { name: 'Abweichung erfassen' }).click();
  await expect(page.getByRole('status')).toContainText('Abweichung erfasst');

  for (const [status, feld, text] of [
    ['in_bewertung', null, null],
    ['bewertet', 'Bewertung', 'Keine Produktauswirkung, Temperatur im Profil.'],
    ['geschlossen', 'Maßnahmen (CAPA)', 'Fahrer nachgeschult.'],
  ] as const) {
    await page.getByLabel('Neuer Status').selectOption(status);
    if (feld && text) await page.getByLabel(feld).fill(text);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('status')).toContainText('Abweichung aktualisiert');
  }
  await expect(page.getByRole('region', { name: 'Erfassung' })).toContainText(
    'Fahrer nachgeschult.',
  );
  const abwVerlauf = page.getByRole('region', { name: 'Verlauf' });
  await expect(abwVerlauf).toContainText('Maßnahmen: – → Fahrer nachgeschult.');
  await expect(abwVerlauf).toContainText('Status: bewertet → geschlossen');
  await expect(page.getByRole('heading', { name: 'Bewerten und weiterführen' })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/16-abweichung.png`, fullPage: true });

  // Fahrzeugakte bleibt erreichbar (Rückweg).
  await page.goto(fahrzeugUrl);
  await expect(page.getByRole('heading', { level: 1, name: kennzeichen })).toBeVisible();
});
