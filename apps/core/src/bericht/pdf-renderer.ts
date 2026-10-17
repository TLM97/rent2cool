/**
 * PDF des Temperaturnachweises für Kunden und Auditoren (A4, eine Seite plus
 * Anhang bei vielen Ereignissen). Zeiten in Ortszeit Berlin mit Hinweis,
 * gespeichert wird in UTC. Die Kurve zeigt das Profil als Band; kurze
 * Spitzen bleiben dank Min/Max-Verdichtung sichtbar.
 */
import PDFDocument from 'pdfkit';
import type {
  Grenzverletzung,
  KurvenPunkt,
  NachweisDokument,
  Temperaturprofil,
} from '@rent2cool/shared';
import type { NachweisRenderer } from './renderer';

const FARBE = {
  text: '#17212b',
  leise: '#5b6875',
  rand: '#c9d2db',
  akzent: '#0b6e7a',
  band: '#e5f4ea',
  kurve: '#1f4c8f',
  eingehalten: '#1d6136',
  verletzt: '#a3261e',
  unvollstaendig: '#7a4f00',
};

const BEWERTUNG_TEXT: Record<string, string> = {
  eingehalten: 'Temperaturprofil eingehalten',
  verletzt: 'Temperaturprofil verletzt',
  unvollstaendig: 'Messreihe unvollständig',
};

const ortszeit = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const zeit = (iso: string | null | undefined) => (iso ? ortszeit.format(new Date(iso)) : '–');
const grad = (w: number | null | undefined) =>
  w === null || w === undefined
    ? '–'
    : `${w.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C`;

export interface Ereignis {
  von: string;
  bis: string;
  art: 'ueber' | 'unter';
  anzahl: number;
  /** Extremwert: höchster (über) bzw. niedrigster (unter) Wert. */
  spitze: number;
}

/**
 * Grenzverletzungen zu Ereignissen zusammenfassen: aufeinanderfolgende Werte
 * derselben Art mit höchstens `maxAbstandMin` Abstand bilden ein Ereignis.
 * Für Menschen lesbarer als jede Minute einzeln; das JSON behält alle Werte.
 */
export function zuEreignissen(
  verletzungen: readonly Grenzverletzung[],
  maxAbstandMin = 5,
): Ereignis[] {
  const ergebnis: Ereignis[] = [];
  for (const v of verletzungen) {
    const letztes = ergebnis.at(-1);
    const nah =
      letztes &&
      letztes.art === v.art &&
      new Date(v.zeit).getTime() - new Date(letztes.bis).getTime() <= maxAbstandMin * 60_000;
    if (nah) {
      letztes.bis = v.zeit;
      letztes.anzahl++;
      letztes.spitze =
        v.art === 'ueber' ? Math.max(letztes.spitze, v.wert) : Math.min(letztes.spitze, v.wert);
    } else {
      ergebnis.push({ von: v.zeit, bis: v.zeit, art: v.art, anzahl: 1, spitze: v.wert });
    }
  }
  return ergebnis;
}

export class PdfNachweisRenderer implements NachweisRenderer {
  readonly format = 'pdf';
  readonly contentType = 'application/pdf';
  readonly dateiendung = 'pdf';

  render(d: NachweisDokument): Promise<Buffer> {
    const n = d.nachweis;
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      // Reproduzierbar: Erstellungsdatum = Erzeugung des Nachweises.
      info: {
        Title: d.titel,
        Author: 'Rent2Cool (Platzhalter, D-015)',
        Subject: d.miete ? `Miete ${d.miete.mieteId}` : `Fahrzeug ${n.fahrzeugId}`,
        CreationDate: new Date(n.erzeugtAm),
      },
    });
    const teile: Buffer[] = [];
    pdf.on('data', (t: Buffer) => teile.push(t));
    const fertig = new Promise<Buffer>((ok, fehler) => {
      pdf.on('end', () => ok(Buffer.concat(teile)));
      pdf.on('error', fehler);
    });

    const links = pdf.page.margins.left;
    const breite = pdf.page.width - links - pdf.page.margins.right;

    // Kopf
    pdf.fillColor(FARBE.akzent).fontSize(9).text('RENT2COOL · KÜHLTRANSPORTER FÜR PHARMA', links);
    pdf.moveDown(0.3).fillColor(FARBE.text).fontSize(20).text(d.titel);
    pdf
      .fontSize(9)
      .fillColor(FARBE.leise)
      .text(
        `Version ${d.version} · ${d.ausloeser === 'automatisch' ? 'automatisch nach Mietende erzeugt' : 'manuell erzeugt'} · ${zeit(n.erzeugtAm)} (Ortszeit Berlin)`,
      );
    pdf.moveDown(0.8);

    // Ergebnis
    const ergebnisFarbe = FARBE[n.bewertung] ?? FARBE.text;
    const y0 = pdf.y;
    pdf.rect(links, y0, breite, 34).fillAndStroke('#ffffff', ergebnisFarbe);
    pdf
      .fillColor(ergebnisFarbe)
      .fontSize(14)
      .text(BEWERTUNG_TEXT[n.bewertung] ?? n.bewertung, links + 12, y0 + 10, {
        width: breite - 24,
      });
    pdf.y = y0 + 46;

    // Eckdaten
    const zeilen: [string, string][] = [
      ...(d.miete
        ? ([
            ['Kunde', d.miete.kunde],
            ['Fahrzeug', d.miete.kennzeichen],
            [
              'Mietzeitraum',
              `${zeit(d.miete.startIst)} – ${zeit(d.miete.endeIst)} (Ortszeit Berlin)`,
            ],
          ] as [string, string][])
        : ([['Zeitraum', `${zeit(n.von)} – ${zeit(n.bis)} (Ortszeit Berlin)`]] as [
            string,
            string,
          ][])),
      [
        'Temperaturprofil',
        `${n.profil.name} °C (zulässig ${grad(n.profil.minC)} bis ${grad(n.profil.maxC)})`,
      ],
      ['Messgröße', n.messgroesse],
      ['Messwerte', n.kennzahlen.anzahl.toLocaleString('de-DE')],
      [
        'Minimum / Mittel / Maximum',
        `${grad(n.kennzahlen.minC)} / ${grad(n.kennzahlen.mittelC)} / ${grad(n.kennzahlen.maxC)}`,
      ],
      ['Grenzverletzungen', String(n.grenzverletzungen.length)],
      ['Lücken in der Messreihe', String(n.luecken.length)],
    ];
    pdf.fontSize(10);
    for (const [k, v] of zeilen) {
      const y = pdf.y;
      pdf.fillColor(FARBE.leise).text(k, links, y, { width: 160 });
      pdf.fillColor(FARBE.text).text(v, links + 170, y, { width: breite - 170 });
      pdf.moveDown(0.25);
    }

    // Kurve
    pdf.moveDown(0.8);
    const kurveOben = pdf.y;
    zeichneKurve(pdf, d.kurve, n.profil, links, kurveOben, breite, 180, n.von, n.bis);
    // Unter Grafik und Zeitachse weiter (die Beschriftungen verschieben pdf.y).
    pdf.x = links;
    pdf.y = kurveOben + 180 + 22;

    // Ereignisse
    const ereignis = (titel: string, eintraege: string[]) => {
      if (eintraege.length === 0) return;
      pdf.moveDown(0.6).fillColor(FARBE.text).fontSize(11).text(titel, links);
      pdf.fontSize(9).fillColor(FARBE.text);
      for (const e of eintraege.slice(0, 40)) pdf.text(`• ${e}`, links + 8);
      if (eintraege.length > 40) {
        pdf
          .fillColor(FARBE.leise)
          .text(`… und ${eintraege.length - 40} weitere (vollständig im JSON-Nachweis)`);
      }
    };
    ereignis(
      'Grenzverletzungen',
      zuEreignissen(n.grenzverletzungen).map(
        (e) =>
          `${zeit(e.von)}${e.bis !== e.von ? ` – ${zeit(e.bis)}` : ''}: ${e.anzahl} ${e.anzahl === 1 ? 'Messwert' : 'Messwerte'} ${e.art === 'ueber' ? 'über' : 'unter'} dem Profil, ${e.art === 'ueber' ? 'Höchstwert' : 'Tiefstwert'} ${grad(e.spitze)}`,
      ),
    );
    ereignis(
      'Lücken in der Messreihe',
      n.luecken.map((l) => `${zeit(l.von)} – ${zeit(l.bis)} (${l.dauerMin} Min.)`),
    );

    // Integrität – als Block zusammenhalten
    if (pdf.y > pdf.page.height - pdf.page.margins.bottom - 120) pdf.addPage();
    pdf.moveDown(0.8).fillColor(FARBE.text).fontSize(11).text('Integrität', links);
    pdf
      .fontSize(8)
      .fillColor(FARBE.leise)
      .text(
        'Die Messdaten sind mit SHA-256 zusammengefasst und signiert. Das Archiv sichert diese Datei zusätzlich mit einer eigenen Prüfsumme und Signatur; jede nachträgliche Änderung fällt bei der Echtheitsprüfung auf.',
        links,
        pdf.y,
        { width: breite },
      );
    pdf.moveDown(0.3).font('Courier').fontSize(7.5).fillColor(FARBE.text);
    pdf.text(`Algorithmus: ${n.integritaet.algorithmus}`);
    pdf.text(`Datenhash:   ${n.integritaet.datenHash}`);
    pdf.text(`Signatur:    ${n.integritaet.signatur}`);
    if (d.miete) pdf.text(`Miete:       ${d.miete.mieteId}`);
    if (d.siegel) {
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor(d.siegel.art === 'testsiegel' ? FARBE.unvollstaendig : FARBE.text)
        .text(
          d.siegel.art === 'testsiegel'
            ? `Elektronisch gesiegelt mit einem TESTSIEGEL ohne Rechtswirkung (Platzhalter bis zur Wahl des Vertrauensdiensteanbieters): ${d.siegel.aussteller}`
            : `Elektronisch gesiegelt (${d.siegel.art === 'qualifiziert' ? 'qualifiziertes elektronisches Siegel' : 'Zertifikat'}): ${d.siegel.aussteller}. Prüfbar in jedem PDF-Programm.`,
          { width: breite },
        )
        .font('Courier')
        .fontSize(7.5)
        .fillColor(FARBE.text);
    }
    pdf.text(`Fahrzeug:    ${n.fahrzeugId}`);
    pdf.font('Helvetica');

    // Fußzeile auf jeder Seite
    const seiten = pdf.bufferedPageRange();
    for (let i = 0; i < seiten.count; i++) {
      pdf.switchToPage(seiten.start + i);
      // Fußzeile liegt im unteren Rand: Rand kurz aufheben, sonst beginnt pdfkit eine neue Seite.
      const rand = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      const unten = pdf.page.height - 35;
      pdf
        .fontSize(7.5)
        .fillColor(FARBE.leise)
        .text(
          `Erzeugt ${n.erzeugtAm} (UTC) · Seite ${i + 1} von ${seiten.count} · Platzhalter-Angaben (D-015)`,
          links,
          unten,
          { width: breite, align: 'center', lineBreak: false },
        );
      pdf.page.margins.bottom = rand;
    }
    pdf.end();
    return fertig;
  }
}

function zeichneKurve(
  pdf: PDFKit.PDFDocument,
  kurve: readonly KurvenPunkt[],
  profil: Temperaturprofil,
  x: number,
  y: number,
  breite: number,
  hoehe: number,
  von: string,
  bis: string,
): void {
  const t0 = new Date(von).getTime();
  const t1 = Math.max(new Date(bis).getTime(), t0 + 1);
  const werte = kurve.map((p) => p.wert);
  const unten = Math.floor(Math.min(profil.minC - 2, ...werte));
  const oben = Math.ceil(Math.max(profil.maxC + 2, ...werte));
  const px = (t: number) => x + 30 + ((t - t0) / (t1 - t0)) * (breite - 30);
  const py = (w: number) => y + hoehe - ((w - unten) / (oben - unten)) * hoehe;

  pdf.save();
  // Zulässiger Bereich als Band
  pdf
    .rect(x + 30, py(profil.maxC), breite - 30, py(profil.minC) - py(profil.maxC))
    .fill(FARBE.band);
  // Rahmen und Achsenbeschriftung
  pdf
    .lineWidth(0.5)
    .rect(x + 30, y, breite - 30, hoehe)
    .stroke(FARBE.rand);
  pdf.fontSize(7).fillColor(FARBE.leise);
  for (const w of [unten, profil.minC, profil.maxC, oben]) {
    pdf.text(`${w} °C`, x, py(w) - 3, { width: 26, align: 'right', lineBreak: false });
  }
  pdf.text(ortszeit.format(new Date(t0)), x + 30, y + hoehe + 4, { lineBreak: false });
  pdf.text(ortszeit.format(new Date(t1)), x + breite - 80, y + hoehe + 4, {
    width: 80,
    align: 'right',
    lineBreak: false,
  });
  // Messkurve
  if (kurve.length > 1) {
    pdf.lineWidth(0.8).strokeColor(FARBE.kurve);
    kurve.forEach((p, i) => {
      const a = px(new Date(p.zeit).getTime());
      const b = py(p.wert);
      if (i === 0) pdf.moveTo(a, b);
      else pdf.lineTo(a, b);
    });
    pdf.stroke();
  } else {
    pdf.text('Keine Messwerte im Zeitraum', x + 40, y + hoehe / 2, { lineBreak: false });
  }
  pdf.restore();
}
