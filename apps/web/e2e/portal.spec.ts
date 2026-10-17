/**
 * Browser-Test des Kundenportals gegen den lokalen Stack (Keycloak, Mailpit,
 * Kern, Portal) – echte Anmeldung, echte Registrierung mit E-Mail-Bestätigung,
 * echte Einladung per Mail. Screenshots in test-results/screens.
 *
 *   pnpm --filter @rent2cool/web test:e2e
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const PASSWORT = process.env.E2E_PASSWORT ?? 'PLACEHOLDER_dev_passwort';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const SCREENS = 'test-results/screens';
const lauf = randomUUID().slice(0, 8);

test.describe.configure({ mode: 'serial' });

/** Jüngste Mail an `an` mit passendem Betreff aus Mailpit (wartet bis zu 20 s). */
async function mailText(an: string, betreff: RegExp): Promise<string> {
  let text = '';
  await expect
    .poll(
      async () => {
        const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${an}"`)}`);
        const { messages } = (await r.json()) as { messages: { ID: string; Subject: string }[] };
        const m = messages.find((x) => betreff.test(x.Subject));
        if (!m) return false;
        const voll = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
          Text: string;
        };
        text = voll.Text;
        return true;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return text;
}

async function anmelden(page: Page, nutzer: string) {
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.locator('#username').fill(nutzer);
  await page.locator('#password').fill(PASSWORT);
  await page.locator('#kc-login').click();
}

/** Konto in Keycloak anlegen und die E-Mail-Adresse über den Link aus Mailpit bestätigen. */
async function kontoAnlegen(page: Page, email: string, vorname: string) {
  await page.getByRole('button', { name: 'Konto anlegen' }).click();
  await page.locator('#email').fill(email);
  await page.locator('#firstName').fill(vorname);
  await page.locator('#lastName').fill('Demo');
  await page.locator('#password').fill(PASSWORT);
  await page.locator('#password-confirm').fill(PASSWORT);
  await page.locator('#kc-register-form [type=submit]').click();
  const text = await mailText(email, /.+/);
  const link = /(http:\/\/localhost:8080\/\S+action-token\S+)/.exec(text)?.[1];
  expect(link, 'Bestätigungslink in der Mail').toBeTruthy();
  await page.goto(link!);
  // Je nach Keycloak-Sitzung muss man einmal „weiter“ klicken.
  const weiter = page.getByRole('link', { name: /hier|here/i });
  if (await weiter.isVisible().catch(() => false)) await weiter.click();
}

const eingeladen = `qa-${lauf}@nordlicht-demo.example`;

test('Website ist öffentlich, Portal verlangt Anmeldung', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Kühltransporter/ })).toBeVisible();
  await page.goto('/portal/mieten');
  await expect(page).toHaveURL(/\/anmelden\?callbackUrl=%2Fportal%2Fmieten/);
  await expect(page.getByRole('button', { name: 'Konto anlegen' })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/portal-01-anmelden.png` });
});

test('Verwalter sieht sein Unternehmen, Mieten mit Nachweis und lädt jemanden ein', async ({
  page,
}) => {
  await page.goto('/portal');
  await anmelden(page, 'kunde.dev');
  await expect(
    page.getByRole('heading', { name: 'Nordlicht Arzneimittel GmbH (Demo)' }),
  ).toBeVisible();
  await expect(page.getByText('Verwaltung · Disposition · Qualitätssicherung')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/portal-02-uebersicht.png`, fullPage: true });

  await page.getByRole('link', { name: 'Mieten & Nachweise' }).first().click();
  await expect(page.getByRole('heading', { name: 'Mieten & Nachweise' })).toBeVisible();
  const zeilen = page.locator('tbody tr');
  await expect(zeilen.first()).toBeVisible();
  // Dass nur eigene Mieten kommen, prüft der Kern (Integrationstest Sichtbarkeit, D-020).
  // Beendete Miete: Nachweis mit gesiegeltem PDF liegt vor.
  await zeilen
    .filter({ hasText: /abgerechnet|beendet/ })
    .first()
    .getByRole('link')
    .click();
  await expect(page.getByRole('heading', { name: /^Miete \S+/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Temperaturnachweis' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'PDF' }).first()).toBeVisible();
  await expect(page.getByText('Testsiegel (ohne Rechtswirkung)').first()).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/portal-03-miete.png`, fullPage: true });

  await page
    .getByRole('navigation', { name: 'Portal' })
    .getByRole('link', { name: 'Unternehmen' })
    .click();
  await expect(page.getByRole('heading', { name: 'Personen' })).toBeVisible();
  await page.getByLabel('E-Mail-Adresse').fill(eingeladen);
  // Nur Qualitätssicherung.
  await page.getByLabel('Disposition (Buchungen, Fahrer, Schlüssel)').uncheck();
  await page.getByRole('button', { name: 'Einladung senden' }).click();
  await expect(page.getByText(`Einladung an ${eingeladen} verschickt.`)).toBeVisible();
  await expect(page.getByRole('cell', { name: eingeladen })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/portal-04-unternehmen.png`, fullPage: true });
});

test('Eingeladene Person legt ihr Konto an und nimmt die Einladung an', async ({ page }) => {
  const text = await mailText(eingeladen, /Einladung zu Nordlicht/);
  const link = /(http:\/\/localhost:3003\/einladung\?code=[A-Za-z0-9_-]+)/.exec(text)?.[1];
  expect(link, 'Einladungslink in der Mail').toBeTruthy();

  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'Einladung annehmen' })).toBeVisible();
  await kontoAnlegen(page, eingeladen, 'Quentin');
  await expect(page).toHaveURL(/\/einladung\?code=/);
  await page.getByRole('button', { name: 'Einladung annehmen' }).click();

  await expect(
    page.getByText('Willkommen! Sie gehören jetzt zu diesem Unternehmen.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Nordlicht Arzneimittel GmbH (Demo)' }),
  ).toBeVisible();
  await expect(page.locator('.nutzer')).toContainText('Qualitätssicherung');
  await expect(page.locator('.nutzer')).not.toContainText('Verwaltung');
  // Ohne Verwaltung: Unternehmen nur ansehen, niemanden einladen.
  await page
    .getByRole('navigation', { name: 'Portal' })
    .getByRole('link', { name: 'Unternehmen' })
    .click();
  await expect(page.getByText('Nur die Verwaltung Ihres Unternehmens')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Einladung senden' })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/portal-05-eingeladen.png`, fullPage: true });
});

test('Neues Unternehmen registriert sich selbst und wartet auf die Freigabe', async ({ page }) => {
  const email = `chefin-${lauf}@neukunde-demo.example`;
  await page.goto('/portal');
  await kontoAnlegen(page, email, 'Nora');

  await expect(page.getByRole('heading', { name: 'Unternehmen registrieren' })).toBeVisible();
  await page.getByRole('button', { name: 'Unternehmen registrieren' }).click();
  await expect(page.getByText('Firmenname fehlt')).toBeVisible();
  await page.getByLabel('Firmenname').fill(`Neukunde Pharma ${lauf} (Demo)`);
  await page.getByLabel('Ort').fill('Musterstadt');
  await page.getByLabel('E-Mail für Temperaturnachweise').fill(`qa-${lauf}@neukunde-demo.example`);
  await page.getByRole('button', { name: 'Unternehmen registrieren' }).click();

  await expect(page.getByText('Registrierung eingegangen.')).toBeVisible();
  await expect(page.getByText('Ihr Unternehmen ist in Prüfung.')).toBeVisible();
  await expect(page.locator('.nutzer')).toContainText('Verwaltung');
  await page.screenshot({ path: `${SCREENS}/portal-06-registriert.png`, fullPage: true });

  // Vor der Freigabe darf der Verwalter auch den Firmennamen korrigieren.
  await page
    .getByRole('navigation', { name: 'Portal' })
    .getByRole('link', { name: 'Unternehmen' })
    .click();
  await page.getByLabel('Firmenname').fill(`Neukunde Pharma GmbH ${lauf} (Demo)`);
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await expect(page.getByText('Unternehmensdaten gespeichert.')).toBeVisible();
  await expect(page.getByLabel('Firmenname')).toHaveValue(`Neukunde Pharma GmbH ${lauf} (Demo)`);

  // Betrieb wurde benachrichtigt.
  const hinweis = await mailText(
    'betrieb@rent2cool.example',
    new RegExp(`Neukunde Pharma ${lauf}`),
  );
  expect(hinweis).toContain('Freigabe');
});
