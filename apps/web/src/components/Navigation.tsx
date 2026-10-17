'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { istAktiv, type NavPunkt } from '../lib/portal';

export function Navigation({ punkte }: { punkte: NavPunkt[] }) {
  const pfad = usePathname();
  return (
    <nav className="navigation" aria-label="Portal">
      <ul>
        {punkte.map((p) => (
          <li key={p.href}>
            <Link href={p.href} aria-current={istAktiv(p.href, pfad) ? 'page' : undefined}>
              {p.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
