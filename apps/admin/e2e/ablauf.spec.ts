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
  await statusWechseln(page, 'Mietstatus ändern', 'beendet', 'Status');
  // Verlauf: jeder Statuswechsel mit Person, altem und neuem Wert.
  const mietVerlauf = page.getByRole('region', { name: 'Verlauf' });
  await expect(mietVerlauf).toContainText('admin.dev');
  await expect(mietVerlauf).toContainText('Status: bestätigt → aktiv');
  await expect(mietVerlauf).toContainText('Status: aktiv → beendet');
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
  await expect(page.getByRole('heading', { name: 'Temperaturnachweis' })).toBeVisible();
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
