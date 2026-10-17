'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GRUPPEN: { titel: string; eintraege: { href: string; text: string }[] }[] = [
  { titel: 'Überblick', eintraege: [{ href: '/', text: 'Übersicht' }] },
  {
    titel: 'Betrieb',
    eintraege: [
      { href: '/fahrzeuge', text: 'Fahrzeuge' },
      { href: '/kunden', text: 'Kunden & Fahrer' },
      { href: '/mieten', text: 'Mieten' },
      { href: '/rechnungen', text: 'Rechnungen' },
      { href: '/standorte', text: 'Standorte' },
    ],
  },
  {
    titel: 'Qualität (GDP)',
    eintraege: [
      { href: '/alarme', text: 'Alarme' },
      { href: '/abweichungen', text: 'Abweichungen' },
    ],
  },
];

export function Navigation() {
  const pfad = usePathname();
  const aktiv = (href: string) =>
    href === '/' ? pfad === '/' : pfad === href || pfad.startsWith(`${href}/`);

  return (
    <nav className="navigation" aria-label="Hauptnavigation">
      <ul>
        {GRUPPEN.map((g) => (
          <li key={g.titel}>
            <div className="gruppe">{g.titel}</div>
            <ul>
              {g.eintraege.map((e) => (
                <li key={e.href}>
                  <Link href={e.href} aria-current={aktiv(e.href) ? 'page' : undefined}>
                    {e.text}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
