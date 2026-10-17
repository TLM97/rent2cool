/**
 * Stammdaten bearbeiten (Kunde, Fahrer, Fahrzeug) durch die Oberfläche, inkl.
 * Konflikt bei gleichzeitiger Bearbeitung in zwei Tabs. Nur erfundene
 * Testdaten (D-015).
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

test('Kunde, Fahrer und Fahrzeug bearbeiten', async ({ page, context }) => {
  test.setTimeout(120_000);
  const lauf = Date.now().toString(36).toUpperCase().slice(-5);
  const firma = `Stammtest ${lauf} GmbH`;
  await anmelden(page, 'ops.dev');

  // --- Kunde anlegen und bearbeiten ---
  await page.goto('/kunden/neu');
  await page.getByLabel('Firmenname').fill(firma);
  await page.getByLabel('Ort').fill('Berlin');
  await page.getByRole('button', { name: 'Kunde anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: firma })).toBeVisible();
  const kundeUrl = page.url().split('?')[0]!;

  await page.getByRole('link', { name: 'Stammdaten bearbeiten' }).click();
  await expect(page.getByLabel('Firmenname')).toHaveValue(firma);
  await page.getByLabel('Straße und Hausnummer').fill('Testweg 1');
  await page.getByLabel('PLZ').fill('14467');
  await page.getByLabel('Ort').fill('Potsdam');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Änderungen gespeichert');
  await expect(page.getByText('Testweg 1, 14467 Potsdam, DE')).toBeVisible();
  const verlauf = page.getByRole('region', { name: 'Verlauf' });
  await expect(verlauf).toContainText('Stammdaten geändert');
  await expect(verlauf).toContainText('Ort: Berlin → Potsdam');
  await expect(verlauf).toContainText('ops.dev');

  // Ohne Änderung speichern → nichts gespeichert.
  await page.getByRole('link', { name: 'Stammdaten bearbeiten' }).click();
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Keine Änderungen');

  // --- Konflikt: zwei Tabs bearbeiten denselben Stand ---
  const zweiter = await context.newPage();
  await page.goto(`${kundeUrl}/bearbeiten`);
  await zweiter.goto(`${kundeUrl}/bearbeiten`);
  await page.getByLabel('Ort').fill('Hamburg');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Änderungen gespeichert');
  await zweiter.getByLabel('Ort').fill('München');
  await zweiter.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(zweiter.locator('.hinweis[role=alert]')).toContainText('inzwischen von jemand anderem geändert');
  await expect(zweiter.getByLabel('Ort')).toHaveValue('München');
  await zweiter.screenshot({ path: `${SCREENS}/17-konflikt.png`, fullPage: true });
  await zweiter.close();
  await page.goto(kundeUrl);
  await expect(page.getByText('14467 Hamburg')).toBeVisible();

  // --- Fahrer anlegen und bearbeiten ---
  const fahrerName = `Max Stamm ${lauf}`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(fahrerName);
  await page.getByLabel('Führerschein gültig bis').fill('2030-12-31');
  await page.getByRole('button', { name: 'Fahrer anlegen' }).click();
  await expect(page.getByRole('status')).toContainText('Fahrer angelegt');
  await page.getByRole('link', { name: fahrerName }).click();
  await expect(page.getByLabel('Führerschein gültig bis')).toHaveValue('2030-12-31');
  await page.getByLabel('Führerscheinklasse').selectOption('C1');
  await page.getByLabel('Führerschein gültig bis').fill('2035-06-30');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Änderungen gespeichert');
  const zeile = page.getByRole('row', { name: new RegExp(fahrerName) });
  await expect(zeile).toContainText('C1');
  await expect(zeile).toContainText('30.06.2035');
  await page.screenshot({ path: `${SCREENS}/18-kunde-bearbeitet.png`, fullPage: true });

  // --- Fahrzeug anlegen und bearbeiten (inkl. Pflichtfeld) ---
  const kennzeichen = `B-ST ${lauf}`;
  await page.goto('/fahrzeuge/neu');
  await page.getByLabel('Kennzeichen').fill(kennzeichen);
  await page.getByRole('button', { name: 'Fahrzeug anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: kennzeichen })).toBeVisible();
  await page.getByRole('link', { name: 'Stammdaten bearbeiten' }).click();
  await page.getByLabel('zul. Gesamtmasse (kg)').fill('');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByLabel('zul. Gesamtmasse (kg)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('zul. Gesamtmasse (kg)').fill('7490');
  await page.getByLabel('Benötigte Führerscheinklasse').selectOption('C1');
  await page.getByLabel('Fahrtenschreiber verbaut').check();
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Änderungen gespeichert');
  await expect(page.getByText('7.490 kg')).toBeVisible();
  await expect(page.getByText('ja (auslandstauglich, D-006)')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/19-fahrzeug-bearbeitet.png`, fullPage: true });
});
