/**
 * Standortverwaltung (D-011) durch die Oberfläche: anlegen mit
 * Öffnungszeiten (inkl. Validierungsfehler), Fahrzeug zuordnen,
 * Deaktivieren nur ohne zugeordnete Fahrzeuge. Nur erfundene Daten (D-015).
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

test('Standort anlegen, Fahrzeug zuordnen, Deaktivieren erst ohne Fahrzeuge', async ({ page }) => {
  test.setTimeout(120_000);
  const lauf = Date.now().toString(36).toUpperCase().slice(-5);
  const name = `Teststandort ${lauf}`;
  await anmelden(page, 'admin.dev');

  // --- Anlegen mit Öffnungszeiten; erst ein Fehler (Ende vor Beginn) ---
  await page.goto('/standorte');
  await page.getByRole('link', { name: 'Standort anlegen' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Ort').fill('Teststadt');
  await page.getByLabel('Rund um die Uhr (kontaktlose Übergabe, D-014)').uncheck();
  await page.getByLabel('Montag, 1. Zeitfenster von').fill('22:00');
  await page.getByLabel('Montag, 1. Zeitfenster bis').fill('06:00');
  await page.getByRole('button', { name: 'Standort anlegen' }).click();
  await expect(page.locator('.hinweis[role=alert]')).toContainText(
    'Bitte die markierten Felder prüfen',
  );
  await expect(page.getByLabel('Montag, 1. Zeitfenster bis')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Name')).toHaveValue(name);

  await page.getByLabel('Montag, 1. Zeitfenster von').fill('06:00');
  await page.getByLabel('Montag, 1. Zeitfenster bis').fill('00:00'); // = Mitternacht
  await page.getByLabel('Samstag, 1. Zeitfenster von').fill('08:00');
  await page.getByLabel('Samstag, 1. Zeitfenster bis').fill('14:00');
  await page.getByRole('button', { name: 'Standort anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const oz = page.getByRole('region', { name: 'Öffnungszeiten (Ortszeit)' });
  await expect(oz).toContainText('Montag: 06:00–24:00');
  await expect(oz).toContainText('Samstag: 08:00–14:00');
  await expect(oz).toContainText('Dienstag: geschlossen');
  const standortUrl = page.url().split('?')[0]!;
  await page.screenshot({ path: `${SCREENS}/23-standort.png`, fullPage: true });

  // --- Fahrzeug anlegen und dem Standort zuordnen ---
  const kennzeichen = `B-SO ${lauf}`;
  await page.goto('/fahrzeuge/neu');
  await page.getByLabel('Heimatstandort').selectOption({ label: name });
  await page.getByLabel('Kennzeichen').fill(kennzeichen);
  await page.getByRole('button', { name: 'Fahrzeug anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: kennzeichen })).toBeVisible();
  await expect(page.getByRole('link', { name })).toBeVisible();
  const fahrzeugUrl = page.url().split('?')[0]!;

  // --- Deaktivieren abgelehnt, solange ein Fahrzeug zugeordnet ist ---
  await page.goto(standortUrl);
  await page.getByRole('button', { name: 'Deaktivieren' }).click();
  await expect(page.locator('.hinweis[role=alert]')).toContainText('Heimatstandort');
  await page.getByRole('link', { name: 'Fahrzeuge am Standort' }).click();
  await expect(page.getByRole('link', { name: kennzeichen })).toBeVisible();

  // --- Fahrzeug umziehen (kein Standort), dann deaktivieren ---
  await page.goto(`${fahrzeugUrl}/bearbeiten`);
  await page.getByLabel('Heimatstandort').selectOption('');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Änderungen gespeichert');
  await page.goto(standortUrl);
  await page.getByRole('button', { name: 'Deaktivieren' }).click();
  await expect(page.getByRole('status')).toContainText('Standort deaktiviert');
  await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText('Stammdaten geändert');

  // Deaktivierte Standorte stehen nicht mehr zur Auswahl.
  await page.goto('/fahrzeuge/neu');
  await expect(page.getByLabel('Heimatstandort').locator('option', { hasText: name })).toHaveCount(
    0,
  );
});
