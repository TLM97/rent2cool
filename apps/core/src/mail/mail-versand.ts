/**
 * E-Mail-Versand (F-46). Über das Interface austauschbar: SMTP (lokal Mailpit,
 * in der Cloud jeder SMTP-Dienst) oder später eine Versand-API.
 */
import { createTransport, type Transporter } from 'nodemailer';

export const MAIL_VERSAND = Symbol('MAIL_VERSAND');

export interface MailAnhang {
  dateiname: string;
  inhalt: Buffer;
  typ: string;
}

export interface Mail {
  an: string;
  betreff: string;
  text: string;
  anhaenge?: MailAnhang[];
}

export interface MailVersand {
  sende(m: Mail): Promise<{ nachrichtId: string }>;
}

export class SmtpMailVersand implements MailVersand {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly absender: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async sende(m: Mail): Promise<{ nachrichtId: string }> {
    const info = await this.transport.sendMail({
      from: this.absender,
      to: m.an,
      subject: m.betreff,
      text: m.text,
      attachments: (m.anhaenge ?? []).map((a) => ({
        filename: a.dateiname,
        content: a.inhalt,
        contentType: a.typ,
      })),
    });
    return { nachrichtId: info.messageId };
  }
}

/** Für Tests: merkt sich gesendete Mails; `fehler` simuliert einen Ausfall. */
export class SpeicherMailVersand implements MailVersand {
  readonly gesendet: Mail[] = [];
  fehler: Error | null = null;
  async sende(m: Mail): Promise<{ nachrichtId: string }> {
    if (this.fehler) throw this.fehler;
    this.gesendet.push(m);
    return { nachrichtId: `speicher-${this.gesendet.length}` };
  }
}
