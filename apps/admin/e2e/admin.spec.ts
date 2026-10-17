/**
 * Browser-Test der Admin-Oberfläche gegen den lokalen Stack (Keycloak, Kern,
 * Admin). Echter Login über Keycloak – keine Abkürzung am Login vorbei.
 * Screenshots landen in test-results/screens (zur Sichtprüfung).
 *
 *   pnpm --filter @rent2cool/admin test:e2e
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORT = process.env.E2E_PASSWORT ?? 'PLACEHOLDER_dev_passwort';
const SCREENS = 'test-results/screens';

async function anmelden(page: Page, nutzer: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/anmelden/);
  await page.getByRole('button', { name: 'Mit Rent2Cool-Konto anmelden' }).click();
  await page.locator('#username').fill(nutzer);
  await page.locator('#password').fill(PASSWORT);
  await page.locator('#kc-login').click();
}

test('ohne Anmeldung geht es zur Anmeldeseite', async ({ page }) => {
  await page.goto('/fahrzeuge');
  await expect(page).toHaveURL(/\/anmelden\?callbackUrl=%2Ffahrzeuge/);
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/01-anmelden.png` });
});

test('admin meldet sich an und sieht alle Bereiche', async ({ page }) => {
  await anmelden(page, 'admin.dev');
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  await expect(page.getByText('Admin Testnutzer')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/02-uebersicht.png`, fullPage: true });

  const bereiche: [string, string][] = [
    ['Fahrzeuge', '03-fahrzeuge'],
    ['Kunden & Fahrer', '05-kunden'],
    ['Mieten', '06-mieten'],
    ['Rechnungen', '08-rechnungen'],
    ['Alarme', '09-alarme'],
    ['Abweichungen', '10-abweichungen'],
  ];
  for (const [name, datei] of bereiche) {
    await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name })
      .click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/${datei}.png`, fullPage: true });

    // Detailseiten öffnen, wo vorhanden.
    if (name === 'Fahrzeuge') {
      await page.locator('tbody a').first().click();
      await expect(page.getByRole('heading', { name: 'Buchbarkeit' })).toBeVisible();
      await page.screenshot({ path: `${SCREENS}/04-fahrzeugakte.png`, fullPage: true });
    }
    if (name === 'Mieten') {
      await page.locator('tbody a').first().click();
      await expect(
        page.getByRole('heading', { name: 'Temperaturnachweis', exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `${SCREENS}/07-miete.png`, fullPage: true });
    }
  }
});

test('admin quittiert einen offenen Alarm', async ({ page }) => {
  await anmelden(page, 'admin.dev');
  await page.goto('/alarme?status=offen');
  const knopf = page.getByRole('button', { name: 'Quittieren' }).first();
  test.skip((await knopf.count()) === 0, 'kein offener Alarm vorhanden');
  await knopf.click();
  await expect(page.getByRole('status')).toContainText('Alarm quittiert');
});

test('Kundenrolle hat keinen Zugang zur internen Oberfläche', async ({ page }) => {
  await anmelden(page, 'kunde.dev');
  await expect(page).toHaveURL(/\/kein-zugriff/);
  await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toBeVisible();
});

test('Abmelden beendet auch die Keycloak-Sitzung', async ({ page }) => {
  await anmelden(page, 'ops.dev');
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/anmelden\?grund=abgemeldet/);
  // Erneuter Zugriff verlangt wieder das Keycloak-Passwort (keine SSO-Sitzung mehr).
  await page.getByRole('button', { name: 'Mit Rent2Cool-Konto anmelden' }).click();
  await expect(page.locator('#username')).toBeVisible();
});
