/**
 * Sensortausch durch die Oberfläche: ohne Kalibrierung → nicht buchbar,
 * nachkalibrieren → buchbar; Tausch mit Kalibrierung; Doppel-Einbau wird
 * abgelehnt. Nur erfundene Testdaten (D-015).
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

test('Sensor tauschen mit und ohne Kalibrierung', async ({ page }) => {
  test.setTimeout(120_000);
  const lauf = Date.now().toString(36).toUpperCase().slice(-5);
  const kennzeichen = `B-SE ${lauf}`;
  await anmelden(page, 'ops.dev');

  // Fahrzeug mit Sensor anlegen, verfügbar setzen, kalibrieren → buchbar.
  await page.goto('/fahrzeuge/neu');
  await page.getByLabel('Kennzeichen').fill(kennzeichen);
  await page.getByLabel('Sensor-Seriennummer').fill(`SN-${lauf}-1`);
  await page.getByRole('button', { name: 'Fahrzeug anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: kennzeichen })).toBeVisible();
  const akte = page.url().split('?')[0]!;
  // Ops steuert Türen, die Wegfahrsperre nur Administratoren (F-38).
  await expect(
    page.getByRole('region', { name: 'Fernzugriff' }).getByLabel('Befehl').locator('option'),
  ).toHaveText(['Entriegeln', 'Verriegeln']);
  await page.getByLabel('Status ändern').selectOption('verfuegbar');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.waitForURL(/Status/);
  await page.getByRole('button', { name: 'Kalibrierung speichern' }).click();
  await expect(page.getByText('Buchbar – verfügbar')).toBeVisible();

  // Tausch ohne Kalibrierung → nicht buchbar, alter Sensor bleibt als ausgebaut sichtbar.
  await page.getByRole('link', { name: 'Tauschen' }).click();
  await expect(page.getByRole('heading', { name: 'Sensor tauschen' })).toBeVisible();
  await page.getByRole('button', { name: 'Sensor tauschen' }).click();
  await expect(page.getByLabel('Seriennummer (neu)')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Grund für den Tausch')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Seriennummer (neu)').fill(`SN-${lauf}-2`);
  await page.getByLabel('Grund für den Tausch').fill('Messwerte springen (Test)');
  await page.getByLabel('Kalibrierung des neuen Sensors gleich erfassen').uncheck();
  await page.getByRole('button', { name: 'Sensor tauschen' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Ohne Kalibrierung ist das Fahrzeug nicht buchbar',
  );
  await expect(page.locator('.hinweis.fehler', { hasText: 'Nicht buchbar' })).toBeVisible();
  await expect(page.locator('tr.ausgebaut')).toContainText('Messwerte springen (Test)');
  await expect(page.getByText('nicht kalibriert')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/20-sensor-ohne-kalibrierung.png`, fullPage: true });

  // Nachkalibrieren über die Akte → wieder buchbar.
  await page.getByLabel('Zertifikat-Nr. / Referenz').fill(`KAL-${lauf}-2`);
  await page.getByRole('button', { name: 'Kalibrierung speichern' }).click();
  await expect(page.getByText('Buchbar – verfügbar')).toBeVisible();

  // Zweiter Tausch: zuerst mit der Seriennummer des eingebauten Sensors → abgelehnt.
  await page.getByRole('link', { name: 'Tauschen' }).click();
  await page.getByLabel('Seriennummer (neu)').fill(`SN-${lauf}-2`);
  await page.getByLabel('Grund für den Tausch').fill('Routinetausch (Test)');
  await page.getByRole('button', { name: 'Sensor tauschen' }).click();
  await expect(page.locator('.hinweis[role=alert]')).toContainText(
    `bereits in ${kennzeichen} eingebaut`,
  );
  await expect(page.getByLabel('Grund für den Tausch')).toHaveValue('Routinetausch (Test)');

  // … dann richtig, mit Kalibrierung → bleibt buchbar.
  await page.getByLabel('Seriennummer (neu)').fill(`SN-${lauf}-3`);
  await page.getByLabel('Zertifikat-Nr. / Referenz').fill(`KAL-${lauf}-3`);
  await page.getByRole('button', { name: 'Sensor tauschen' }).click();
  await expect(page.getByRole('status')).toContainText('Sensor getauscht und kalibriert');
  await expect(page.getByText('Buchbar – verfügbar')).toBeVisible();
  await expect(page.locator('tr.ausgebaut')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Tauschen' })).toHaveCount(1);
  expect(page.url()).toContain(akte);
  // Verlauf der Akte: Anlegen, Kalibrierungen und Tausch je Sensor.
  const verlauf = page.getByRole('region', { name: 'Verlauf' });
  await expect(verlauf).toContainText(`Kennzeichen: ${kennzeichen}`);
  await expect(verlauf).toContainText(`Sensor SN SN-${lauf}-1`);
  await expect(verlauf.getByText('Sensor getauscht')).toHaveCount(2);
  await expect(verlauf.getByText('Kalibrierung erfasst')).toHaveCount(2);
  await expect(verlauf).toContainText(`Zertifikat: KAL-${lauf}-2`);
  await page.screenshot({ path: `${SCREENS}/21-sensor-historie.png`, fullPage: true });
});
