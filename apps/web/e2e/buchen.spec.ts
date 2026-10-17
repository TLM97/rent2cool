/**
 * Browser-Test Buchen im Kundenportal: Fahrer anlegen, Fahrzeug im Zeitraum
 * suchen, verbindlich buchen, stornieren – gegen den lokalen Stack.
 *
 *   pnpm --filter @rent2cool/web test:e2e
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const PASSWORT = process.env.E2E_PASSWORT ?? 'PLACEHOLDER_dev_passwort';
const SCREENS = 'test-results/screens';
const lauf = randomUUID().slice(0, 8);

async function anmelden(page: Page) {
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.locator('#username').fill('kunde.dev');
  await page.locator('#password').fill(PASSWORT);
  await page.locator('#kc-login').click();
  await expect(
    page.getByRole('heading', { name: 'Nordlicht Arzneimittel GmbH (Demo)' }),
  ).toBeVisible();
}

/** Zufälliger Werktag weit in der Zukunft, damit Läufe sich nicht gegenseitig blockieren. */
function zeitraum(): { start: string; ende: string } {
  const tag = new Date(Date.UTC(2027, 0, 4) + Math.floor(Math.random() * 600) * 86_400_000);
  while ([0, 6].includes(tag.getUTCDay())) tag.setUTCDate(tag.getUTCDate() + 1);
  const d = tag.toISOString().slice(0, 10);
  return { start: `${d}T09:00`, ende: `${d}T16:00` };
}

test('Disposition legt einen Fahrer an – Rent2Cool prüft ihn danach', async ({ page }) => {
  await anmelden(page);
  const nav = page.getByRole('navigation', { name: 'Portal' });
  await nav.getByRole('link', { name: 'Fahrer' }).click();
  await page.getByRole('button', { name: 'Fahrer anlegen' }).click();
  await expect(page.getByText('Name fehlt')).toBeVisible();
  await page.getByLabel('Name').fill(`Frieda Fahrerin ${lauf} (Demo)`);
  await page.getByLabel('Führerscheinklasse').fill('c1');
  await page.getByLabel('Führerschein gültig bis').fill('2031-05-31');
  await page.getByRole('button', { name: 'Fahrer anlegen' }).click();
  await expect(page.getByText(`Frieda Fahrerin ${lauf} (Demo) angelegt.`)).toBeVisible();
  const zeile = page.getByRole('row', { name: new RegExp(`Frieda Fahrerin ${lauf}`) });
  await expect(zeile).toContainText('C1');
  await expect(zeile).toContainText('angelegt');
  await page.screenshot({ path: `${SCREENS}/portal-07-fahrer.png`, fullPage: true });
});

test('Disposition sucht, bucht verbindlich und storniert wieder', async ({ page }) => {
  await anmelden(page);
  await page
    .getByRole('navigation', { name: 'Portal' })
    .getByRole('link', { name: 'Buchen' })
    .click();
  await expect(page.getByRole('heading', { name: 'Kühltransporter buchen' })).toBeVisible();

  // Ungültiger Zeitraum wird abgefangen.
  const z = zeitraum();
  await page.getByLabel('Abholung (Ortszeit)').fill(z.ende);
  await page.getByLabel('Rückgabe (Ortszeit)').fill(z.start);
  await page.getByRole('button', { name: 'Fahrzeuge suchen' }).click();
  await expect(page.getByText('Bitte einen gültigen Zeitraum angeben')).toBeVisible();

  await page.getByLabel('Abholung (Ortszeit)').fill(z.start);
  await page.getByLabel('Rückgabe (Ortszeit)').fill(z.ende);
  await page.getByRole('button', { name: 'Fahrzeuge suchen' }).click();
  await expect(page.getByRole('heading', { name: /2 · Buchbare Fahrzeuge/ })).toBeVisible();
  const waehlen = page.getByRole('link', { name: / wählen$/ }).first();
  const kennzeichen = (await waehlen.textContent())!.replace(/ wählen$/, '');
  await waehlen.click();

  await expect(page.getByRole('heading', { name: '3 · Buchung bestätigen' })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/portal-08-buchen.png`, fullPage: true });
  await page.getByRole('button', { name: 'Verbindlich buchen' }).click();

  await expect(page.getByText('Buchung bestätigt.')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Miete ${kennzeichen}` })).toBeVisible();
  await expect(page.locator('.plakette', { hasText: 'bestätigt' })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/portal-09-gebucht.png`, fullPage: true });

  await page.getByRole('button', { name: 'Buchung stornieren' }).click();
  await expect(page.getByText('Buchung storniert.')).toBeVisible();
  await expect(page.locator('.plakette', { hasText: 'storniert' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buchung stornieren' })).toHaveCount(0);
});
