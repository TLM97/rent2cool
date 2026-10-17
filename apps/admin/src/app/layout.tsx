import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Rent2Cool Admin', template: '%s · Rent2Cool Admin' },
  description: 'Interne Oberfläche für Flotte, Kunden, Buchungen, Alarme und Abweichungen.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
