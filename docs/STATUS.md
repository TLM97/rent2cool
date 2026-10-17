# Status

Gepflegt von Claude Code. Neueste Einträge oben.

## Vorlage

```
### JJJJ-MM-TT – T-xxx
Erledigt:
Offen:
Fragen an Planung:
```

---

### 2026-10-17 – Kundenportal: Buchen, Stornieren, Fahrer

Tom: „Bitte fahre fort“ – nächster Schritt aus dem letzten Eintrag
(Buchen im Portal). Planung möge die Aufgabe in `TASKS.md` nachziehen.

Erledigt:
- **Buchen** (`/portal/buchen`, nur Disposition, erst nach Freigabe):
  Zeitraum in Ortszeit, Fahrer, Standort, Auslandsfahrt → buchbare
  Fahrzeuge aus `GET /v1/fahrzeuge/verfuegbar` (dieselben Regeln wie die
  Buchung, paginiert) → verbindlich buchen. Der Kunde kommt aus dem Kern,
  nie aus dem Formular; Idempotency-Key je Formular (D-003). Hinweis bei
  Abholung/Rückgabe außerhalb der Öffnungszeiten.
- Bestätigt wird aus den aktuellen Suchtreffern (Kunden sehen die
  Fahrzeugakte nur für eigene Mieten, F-41) – ist das Fahrzeug inzwischen
  vergeben, gibt es nichts zu bestätigen.
- **Stornieren** auf der Mietseite, solange die Miete nicht begonnen hat.
- **Fahrer** (`/portal/fahrer`): Liste mit Status, Anlegen durch
  Disposition/Verwaltung (Status „angelegt“, Prüfung durch Rent2Cool).
- Keine Kern-Änderung nötig (Schnittstelle zuerst war schon erfüllt).

Tests: Web 16 Unit-Tests (neu: Zeitraum/Sommer-/Winterzeit, Storno-Regel,
Navigation „Buchen“ nur Disposition); **Portal-Browser-Tests 6/6** (neu:
Fahrer anlegen mit Pflichtfeldprüfung; ungültiger Zeitraum, suchen,
verbindlich buchen, stornieren).

Abkürzungen (vor Go-live ersetzen):
- Digitaler Schlüssel und App-Konto des Fahrers (`kontoId`) noch nicht im
  Portal; Schlüssel stellt heute der Betrieb aus.
- Ein Fahrer lässt sich nach dem Anlegen nur durch Rent2Cool ändern (siehe
  F-54).

Fragen an Planung:
- **F-54:** Dürfen Kunden Fahrerdaten selbst ändern (z. B. verlängerter
  Führerschein), mit erneuter Prüfung durch Rent2Cool? Heute dürfen das nur
  `ops`/`admin`.
- F-52, F-53 und F-24, F-26 bis F-37, F-42 bis F-45, F-49, F-50 weiter
  offen.

---

### 2026-10-17 – Kundenportal v1 (Registrierung, Unternehmen, Mieten & Nachweise)

Tom: „Dann fahre fort bitte“ (Vorschlag: Portal-Oberfläche für F-51).
**Hinweis an Planung:** Laut Roadmap ist das Kundenportal Phase 3 („Portal
entwerfen“ Phase 2). Gebaut wurde es jetzt, weil Selbstregistrierung (F-51)
ohne Oberfläche nicht nutzbar ist. Bitte Aufgabe in `TASKS.md` nachziehen
und D-021 prüfen.

Erledigt:
- **`apps/web`**: öffentliche Startseite (Platzhalter bis Website v1) und
  Kundenportal unter `/portal` (Next.js, Port 3003).
- **Anmeldung** über eigenen Keycloak-Client `rent2cool-portal` mit eigenen
  Cookies und eigenem Secret (sonst überschrieben sich Admin- und
  Portal-Sitzung auf demselben Host). „Konto anlegen“ öffnet direkt die
  Keycloak-Registrierung; E-Mail ist Benutzername; Keycloak-Seiten auf
  Deutsch.
- **Seiten:** Übersicht (Status, „in Prüfung“-Hinweis, letzte Mieten),
  Unternehmen registrieren, Unternehmen verwalten (Firmendaten, Personen
  und Aufgaben, Einladungen), Einladung annehmen, Mieten mit
  Temperaturnachweisen (PDF/JSON, Siegel, SHA-256), Rechnungen. Navigation
  und Knöpfe je Aufgabe; entscheiden tut der Kern.
- **GDP-Grenze** (Vorschlag **D-021**): keine Datenbank, kein Dienstkonto;
  alles mit dem Token der angemeldeten Person über die Kern-API.
  Öffentliche Seiten sprechen nicht mit der Kern-API. Ein Test prüft
  beides.
- **`packages/oberflaeche`**: API-Client, Formatierung, Formular-, Seiten-
  und Token-Helfer aus der Admin-Oberfläche herausgelöst und von beiden
  genutzt (Admin unverändert, Tests mitgezogen).

Tests: Web 12 Unit-Tests (Regeln, Cookies, GDP-Grenze), Oberfläche 35,
Admin 26, Kern 166/166 Integration. **Browser-Tests Portal 4/4** mit echter
Keycloak-Registrierung, Mailbestätigung über Mailpit, Einladung per Mail
und Annahme; Selbstregistrierung bis „in Prüfung“. Admin-Browser-Tests 9/9
grün (Realm geändert).

Abkürzungen (vor Go-live ersetzen):
- **Buchen im Portal fehlt noch** (Kern-Route existiert: Fahrzeugsuche und
  `POST /v1/mieten`); ebenso Fahrer und Schlüssel, Alarme/Abweichungen
  und Echtheitsprüfung für die QA. Nächster Schritt.
- PDF/JSON-Links sind vorsignierte Objektspeicher-URLs (laufen ab; Seite
  neu laden). Für die Produktion: Download über eine Portal-Route.
- `next start` warnt bei `output: standalone` (wie Admin) – für Container
  `node .next/standalone/server.js`. Kein Container-Image für Web/Admin.
- Anzeigename neuer Konten ist die E-Mail (Keycloak `preferred_username`);
  Vor- und Nachname aus der Registrierung werden noch nicht angezeigt.
- Website v1 (Inhalte, Anfrage, Rechtstexte) ist nur ein Platzhalter.

Fragen an Planung:
- **F-52 (angepasst):** Mitarbeitende und Kunden nutzen jetzt getrennte
  Clients. Registrierung ist aber realm-weit an, daher steht „Registrieren“
  auch auf der Admin-Anmeldung (harmlos, ohne interne Rolle kein Zugang).
  Eigener Realm für Kunden oder MFA-Pflicht für interne Konten?
- **F-53:** Ist die Auslegung von Architekturregel 2 in D-021 so richtig?
  Das Portal ändert Daten (Unternehmen, Einladungen, künftig Buchungen) nur
  über den Kern mit dem Token des Kunden, nie selbst.
- F-24, F-26 bis F-37, F-42 bis F-45, F-49, F-50 weiter offen.

---

### 2026-10-17 – F-51: Kunden registrieren sich selbst und verwalten ihre Organisation

Tom hat F-51 direkt beantwortet: „Der Kunde kann seinen Account selbst
anlegen und seine Organisation managen. Wir müssen den Kunden nur
freigeben.“ Umgesetzt (Schnittstelle zuerst, Architekturregel 1); Planung
möge die Aufgabe in `TASKS.md` nachziehen und den Nachtrag zu D-020 prüfen.

Erledigt:
- **Selbstregistrierung:** Keycloak erlaubt Registrierung mit
  E-Mail-Bestätigung (lokal über Mailpit). `POST /v1/registrierung` legt den
  Kunden im Status `in_pruefung` an, der Login wird Verwalter; der Betrieb
  bekommt eine Mail, die Admin-Startseite zeigt „Kunden zur Freigabe“.
  Gebucht wird erst nach der Freigabe (bestehende Regel D-010). Interne
  Logins und schon zugeordnete Logins können sich nicht registrieren.
- **Organisation selbst verwalten** (`/v1/organisation`): Firmendaten
  ändern (Name, HR, USt-ID nach der Freigabe nur durch uns), Mitglieder
  einladen, Rollen ändern, entfernen; mindestens ein Verwalter bleibt.
- **Neue Kundenrolle `kunde_admin`**; Kundenrollen stehen je Login im Kern
  (`kunde_konto.rollen`, Migration `0019`) und werden beim Anmelden ergänzt
  (D-001/D-020). Interne Rollen kommen weiter nur aus Keycloak.
- **Einladungen:** Einmalcode nur in der Mail, gespeichert nur als
  SHA-256-Hash, 7 Tage gültig, eine offene Einladung je Adresse, einlösbar
  nur mit derselben **bestätigten** E-Mail (weitergeleitete Links greifen
  nicht), widerrufbar. Code steht nie im Audit Trail.
- E-Mail im Token wird nur übernommen, wenn Keycloak sie als bestätigt
  meldet.
- Admin-Oberfläche: Logins am Kunden mit Rollen und E-Mail; beim manuellen
  Zuordnen Rollen per Haken; Verlauf zeigt Einladungen und Rollenänderungen.
  Fahrer anlegen dürfen jetzt auch `kunde_admin`/`kunde_dispo` für den
  eigenen Kunden.
- Demo: `kunde.dev` ist Verwalter von „Nordlicht“.

Tests: Kern 166/166 Integration (neu: Registrierung inkl. Buchungssperre
bis zur Freigabe, Firmendaten vor/nach Freigabe, Einladung mit Hash,
E-Mail-Bindung, Einmaligkeit, Widerruf, Mitglieder mit „letzter
Verwalter“), Shared 73, Admin 61, alle 9 Browser-Tests grün. Über echte
Tokens geprüft: `kunde.dev` sieht weiter nur Nordlicht,
`/v1/organisation` liefert die Organisation.

Abkürzungen (vor Go-live ersetzen):
- Es gibt noch **keine Portal-Oberfläche** (`apps/web`); Registrierung,
  Einladung und Mitgliederverwaltung sind heute nur per API nutzbar. Der
  Einladungslink zeigt auf `PORTAL_URL` (`/einladung?code=…`), die Seite
  existiert noch nicht.
- Registrierung und interne Anmeldung teilen sich Realm und Anmeldeseite;
  der Link „Registrieren“ ist dadurch auch auf der Admin-Anmeldung sichtbar
  (harmlos: ohne interne Rolle kein Zugang, siehe F-52).
- Abgelaufene Einladungen bleiben als Historie stehen; eine neue Einladung
  an dieselbe Adresse ersetzt sie (im Audit vermerkt).

Fragen an Planung:
- **F-52:** Sollen Mitarbeitende und Kunden getrennt anmelden (eigener
  Keycloak-Client oder Realm für Kunden, Registrierung nur dort, MFA-Pflicht
  für interne Konten)? Empfehlung: ein Realm, zwei Clients; Registrierung
  nur über das Portal, MFA für interne Rollen.
- F-24, F-26 bis F-37, F-42 bis F-45, F-49, F-50 weiter offen.

---

### 2026-10-17 – F-41: Kunden sehen nur ihre eigenen Daten

**Datensichtbarkeit je Kunde – erledigt.** (Toms „Ja bitte“ zum Vorschlag;
Voraussetzung für das Kundenportal und den Portal-Teil von F-46. Planung möge
die Aufgabe in `TASKS.md` nachziehen und D-020 prüfen.)

Erledigt:
- **Zuordnung Login → Kunde im Kern** (`kunde_konto`, Migration `0018`):
  pflegen nur `admin` (Kundenseite „Logins fürs Kundenportal“), auditiert
  („Login zugeordnet/entfernt“), ein Login gehört genau einem Kunden.
  Vorschlag **D-020**.
- **Zentrale Prüfung** `apps/core/src/auth/zugriff.ts`: interne Rollen =
  eigener Mandant, Kundenrollen = eigener Kunde, ohne Zuordnung abgelehnt.
  Fremde Datensätze „nicht gefunden“; ungültige IDs ebenfalls (statt
  Datenbankfehler).
- **Alle Routen der Kundenrollen umgestellt:** Kunden, Fahrer, Mieten,
  Rechnungen, Alarme, Abweichungen, Nachweise (Liste, Prüfung), Schlüssel.
  Listen werden auf den Kunden gefiltert – ein mitgegebener fremder Filter
  wird ignoriert. Fahrzeugakte nur für Fahrzeuge eigener Mieten, Position
  nur während der laufenden Miete. Kunden buchen nur für sich und dürfen als
  Status nur „storniert“ setzen. Flottenliste und der freie Nachweis über
  beliebige Fahrzeuge/Zeiträume sind jetzt intern.
- **Mandantenlücke geschlossen:** Einzelabrufe (`GET /v1/mieten/:id` usw.)
  prüfen jetzt auch für interne Rollen den Mandanten.
- `GET /v1/ich`: Rollen und zugeordneter Kunde (für Portal und App).
- Lokal: `kunde.dev` hat eine feste Keycloak-ID und ist in den Demo-Daten
  „Nordlicht“ zugeordnet. Über die echte API geprüft: sieht 4 statt 6
  Mieten, Flottenliste 403, fremde Miete 404.

Tests: Kern 161/161 Integration (neu: Sichtbarkeit je Art, Controller-
Listen inkl. Umgehungsversuch, Buchen/Status, Logins, „Wer bin ich?“),
Audit-Abdeckung um DELETE-Route und `IchController` erweitert; alle 9
Browser-Tests grün.

Abkürzungen:
- Benutzer-IDs werden von Hand aus Keycloak übernommen; Einladung per
  E-Mail (Konto anlegen + zuordnen in einem Schritt) folgt mit dem Portal.

Fragen an Planung:
- **F-51:** Wer legt Kunden-Logins an – nur wir, oder bekommt der Kunde
  eine eigene Admin-Rolle (`kunde_admin`), die Logins für seine Leute selbst
  verwaltet?
- F-24, F-26 bis F-37, F-42 bis F-45, F-49, F-50 weiter offen.

---

### 2026-10-17 – Nachweis: elektronisches Siegel und Zustellung per E-Mail

Tom hat F-46 bis F-48 direkt beantwortet: **F-46** Kundenportal und E-Mail,
**F-47** mit elektronischem Siegel, **F-48** Karenzzeit 30 Minuten (bleibt
wie eingestellt). Umgesetzt; Planung möge die Aufgabe in `TASKS.md`
nachziehen.

Erledigt:
- **Elektronisches Siegel (F-47):** Nachweis-PDFs tragen eine eingebettete
  PDF-Signatur (`adbe.pkcs7.detached`), prüfbar in jedem PDF-Programm.
  Schnittstelle `Siegeldienst`: heute **Testsiegel** (zur Laufzeit erzeugtes,
  selbst ausgestelltes Zertifikat, im PDF und in der Oberfläche als
  „Testsiegel ohne Rechtswirkung“ gekennzeichnet, nie im Repo) oder ein
  eigenes Zertifikat per Umgebung. Archiv hält Art und Inhaber des Siegels
  (Migration `0016`). Test verifiziert die Signatur unabhängig mit OpenSSL
  und zeigt, dass ein geändertes Byte sie bricht.
- **Zustellung per E-Mail (F-46):** Feld „E-Mail für Temperaturnachweise
  (QA)“ am Kunden; jede neue Nachweis-Version geht als eigener Job mit dem
  gesiegelten PDF an diese Adresse – genau einmal (eindeutiger Index), mit
  Wiederholung, nie mit veränderter Datei (Prüfsumme vor dem Versand).
  Ergebnis (gesendet / übersprungen ohne Adresse / fehlgeschlagen) in
  `nachweis_zustellung` (Migration `0017`), im Audit Trail und in der
  Mietakte. SMTP über `SMTP_URL`; lokal und in der CI **Mailpit**.
- **Kundenportal-Teil von F-46:** Die API für den Download steht; die
  Portal-Oberfläche selbst kommt mit dem Kundenportal (Phase 3) und braucht
  vorher F-41 (Kundenrollen auf den eigenen Kunden beschränken).

Beim Testen gefunden und behoben:
- Die Signatur-Bibliothek (`@signpdf/signer-p12`) verbraucht ihr Zertifikat
  beim ersten Signieren – jedes weitere Siegeln scheiterte („Too few bytes
  to parse DER“). Jetzt je Vorgang ein frischer Signierer; Test siegelt
  zweimal mit demselben Dienst.

Tests: Kern 156/156 Integration (neu: Siegel mit OpenSSL-Prüfung,
Zustellung inkl. Manipulation, Berichtsdienst bis zur Mail in Mailpit),
alle 9 Browser-Tests grün (Ablauf: Kunde mit QA-Adresse → Nachweis →
„gesendet“).

Abkürzungen (vor Go-live ersetzen):
- **Testsiegel** statt qualifiziertem Siegel eines Vertrauensdiensteanbieters
  (TODO(D-015)); erst damit PAdES-Baseline-konform und rechtlich ein
  qualifiziertes elektronisches Siegel. Ohne Zeitstempel (TSA).
- Absender `nachweise@rent2cool.example` (Platzhalter-Domain, D-013) und
  noch kein produktiver SMTP-Dienst.

Fragen an Planung:
- **F-49:** Welcher Vertrauensdiensteanbieter für das qualifizierte Siegel
  (z. B. D-Trust/Bundesdruckerei, Swisscom, A-Trust)? Mit qualifiziertem
  Zeitstempel?
- **F-50:** Welcher E-Mail-Versanddienst (EU-Rechenzentrum, AVV) und ab wann
  die echte Domain (D-013)?
- **F-41** (Kundenrollen auf den eigenen Kunden beschränken) ist jetzt
  Voraussetzung für den Portal-Teil von F-46 – als nächste Aufgabe
  vorgeschlagen.
- F-24, F-26 bis F-37, F-42 bis F-45 weiter offen.

---

### 2026-10-17 – Temperaturnachweis automatisch nach jeder Miete

**Automatischer, archivierter Temperaturnachweis – erledigt.** (Toms
„fahre fort“; das zentrale Verkaufsargument der Roadmap. Planung möge die
Aufgabe in `TASKS.md` nachziehen. Beantwortet F-16 teilweise: Erzeugung
automatisch – Zustellung an den Kunden offen, s. F-46.)

Erledigt:
- **Berichtsdienst** (BullMQ auf Valkey, wie D-001): wiederkehrender
  Suchlauf nach beendeten Mieten ohne Nachweis (begrenzte Abfrage mit
  Teilindex, 30-Tage-Fenster, höchstens 100 je Lauf), je Miete ein Job mit
  fester Job-ID (keine Doppelten), Wiederholung mit wachsendem Abstand.
  Karenzzeit nach Mietende (Standard 30 Min.) für nachgelieferte Messwerte.
  Kein Kopplungspunkt im Miet-Modul: geht ein Job verloren, findet ihn der
  nächste Suchlauf. Eigenes Modul, später als Prozess herauslösbar.
- **Archiv** (Migration `0015_temperaturnachweis_archiv`): JSON und **PDF**
  im Objektspeicher, SHA-256 beider Dateien, Datensignatur und
  Dokumentsignatur; **unveränderbar** per Datenbank-Trigger; automatisch
  genau einmal je Miete (eindeutiger Index), manuell als neue Version.
  Audit-Eintrag je Version (Akteur `system:berichtsdienst` bzw. Anforderer).
- **PDF**: eine Seite – Ergebnis, Eckdaten, Temperaturkurve mit Profilband
  (Min/Max-Verdichtung, kurze Spitzen bleiben sichtbar), Grenzverletzungen
  zu Ereignissen zusammengefasst, Lücken, Integrität; reproduzierbar
  (gleiche Daten → bytegleiche Datei).
- **Echtheitsprüfung**: Dateien unverändert, Signaturen gültig, Messdaten
  unverändert (erkennt Nachlieferungen → neue Version empfohlen).
- **Objektspeicher** jetzt auch für den bisherigen Nachweis-Endpunkt (statt
  Arbeitsspeicher).
- **Oberfläche**: Mietakte „Temperaturnachweis für den Kunden“ mit
  Versionen, PDF/JSON, „Prüfen“, „Neue Version erzeugen“; im Verlauf.
- **Demo-Daten**: Nachweise der drei beendeten Mieten (einer „verletzt“).

Beim Testen gefunden und behoben:
- BullMQ 6 bringt `ioredis` nicht mehr mit – ohne die Abhängigkeit hing der
  Test mit stark wachsendem Speicher statt mit einer Fehlermeldung. Jetzt
  ausdrücklich installiert.
- Die Demo-Daten signierten mit einem anderen Schlüssel als der Kern → die
  Echtheitsprüfung meldete zu Recht „Signatur ungültig“. Demo nutzt jetzt
  denselben (Platzhalter-)Schlüssel.
- PDF: leere Zusatzseiten durch die Fußzeile und eine Lücke unter der Kurve.

Tests: shared 70, admin 60, Kern 151/151 Integration (neu: Archiv,
Echtheitsprüfung inkl. Manipulation und Nachlieferung, Berichtsdienst über
echtes Valkey, Demo), CI mit Valkey-Dienst; Browser-Test „Ablauf“ fordert
den Nachweis an und prüft ihn.

Abkürzungen (vor Go-live ersetzen):
- **Signatur = HMAC mit Platzhalter-Schlüssel** (D-015), ohne Schlüssel-ID:
  ein Schlüsselwechsel machte alte Nachweise „ungültig“. Für Go-live
  asymmetrische Signatur/PKI mit Schlüssel-ID im Archiv (→ F-47).
- Worker läuft im Kern-Prozess (`BERICHT_WORKER_ENABLED`); bei Last als
  eigener Prozess starten (Modul ist dafür getrennt).
- Mieten, die vor mehr als 30 Tagen endeten, sucht der Dienst nicht mehr
  (Nachweis bei Bedarf manuell).

Fragen an Planung:
- **F-46:** Wie bekommt der Kunde den Nachweis – Kundenportal (Download),
  E-Mail an die QA des Kunden, beides? Ab wann (sofort nach Erzeugung oder
  nach Freigabe durch unsere QA)?
- **F-47:** Reicht eine eigene Signatur, oder soll der Nachweis ein
  (qualifiziertes) elektronisches Siegel tragen (eIDAS), damit Auditoren
  ihn ohne unser System prüfen können?
- **F-48:** Karenzzeit 30 Minuten nach Mietende ok? Und soll eine
  nachträgliche Version (Nachlieferung) den Kunden automatisch informieren?
- F-24, F-26 bis F-37, F-41 bis F-45 weiter offen.

---

### 2026-10-17 – Übergabe- und Rückgabeprotokoll mit Foto-Check

**Foto-Check / Übergabeprotokoll – erledigt.** (Nächste Aufgabe auf Toms
„weiter“; D-014: App, Schlüssel und Foto-Check gehören ins erste Release.
Planung möge die Aufgabe in `TASKS.md` nachziehen und D-019 prüfen.)

Erledigt:
- **Objektspeicher endlich lokal verfügbar:** MinIO-Images sind nicht mehr
  beziehbar → SeaweedFS (S3-API) in `docker-compose.yml` und in der CI
  (Vorschlag **D-019**). Kern-Modul `objektspeicher` (Interface
  `ObjektSpeicher`, S3-Umsetzung mit AWS SDK, signierte Links, optional
  eigene öffentliche Adresse `S3_OEFFENTLICHER_ENDPOINT`).
- **Geteilte Regeln** `packages/shared/src/protokoll.ts`: Pflichtfotos,
  Checklisten je Art (Konfiguration), „nein“ verlangt Bemerkung,
  Vollständigkeitsprüfung, Objektschlüssel ohne Personendaten, Schemas.
- **Kern-Modul `protokoll`:** je Miete ein Übergabe- und ein
  Rückgabeprotokoll (idempotent), Fotos per signiertem Upload direkt in den
  Speicher, Bestätigung prüft Größe, Typ und SHA-256 (sonst „verworfen“ mit
  Grund), Checkliste wird ergänzt statt ersetzt, Schäden mit Fotoverweisen,
  Abschluss nur vollständig. **Abgeschlossen ist unveränderbar** – im Kern
  und per Datenbank-Trigger (auch am Kern vorbei). Zugriff: Fahrer nur mit
  gültigem Schlüssel zur Miete, Betrieb schreibt, QA liest. Alles auditiert,
  Migration `0014_uebergabeprotokoll`.
- **Oberfläche:** Mietakte mit Protokollkarte (Fotos, Checkliste, Schäden,
  was fehlt); Ausnahmeprozess mit Personal: anlegen, Fotos hochladen,
  Angaben, abschließen.
- **Demo-Daten:** Übergabe der laufenden Miete (vom Fahrer protokolliert) und
  Rückgabe mit Schaden + Detailfoto; 13 Platzhalterbilder (erzeugte PNGs,
  sichtbar keine echten Fotos, D-015).

Tests: shared 68, admin 59, Kern 144/144 Integration (neu: 4 Protokoll gegen
echten Objektspeicher, Demo), Browser-Test „Ablauf“ protokolliert eine
Übergabe mit sechs Fotos bis zum Abschluss; alle 9 grün.

Abkürzungen (vor Go-live ersetzen):
- **SHA-256 rechnet der Kern** beim Bestätigen (liest das Foto) – bei
  12.000 Fotos/Tag auf speicherseitige Prüfsummen oder Hintergrundjob
  umstellen (D-019).
- Keine Vorschaubilder: die Oberfläche lädt die Originalfotos (Hintergrundjob
  für Thumbnails fehlt).
- Nie hochgeladene oder verworfene Objekte werden nicht aufgeräumt
  (Lifecycle-Regel im Speicher fehlt).
- Der Temperaturnachweis liegt weiter im Arbeitsspeicher
  (`InMemoryBerichtSpeicher`) – kann jetzt auf den Objektspeicher umziehen.

Fragen an Planung:
- **F-42:** Soll die Miete erst mit **abgeschlossenem Übergabeprotokoll**
  starten (heute: erstes Entriegeln, F-39)? Und soll „beendet“ ein
  abgeschlossenes Rückgabeprotokoll voraussetzen?
- **F-43:** Pflichtfotos und Checklistenpunkte bitte fachlich (QA)
  bestätigen bzw. ergänzen (z. B. Temperaturanzeige, Reinigung,
  Tankstand/Ladestand).
- **F-44:** Neuer Schaden bei der Rückgabe: automatisch eine Abweichung bzw.
  einen Schadenfall anlegen?
- **F-45:** Aufbewahrungsfrist der Fotos (hängt an F-2) – und dürfen sie
  EXIF/GPS enthalten oder sollen sie beim Eingang bereinigt werden
  (Datenschutz)?
- F-24, F-26 bis F-37, F-41 weiter offen.

---

### 2026-10-17 – Schlüssel: Antworten zu F-38 bis F-40 umgesetzt

Tom hat F-38 bis F-40 direkt beantwortet; umgesetzt und in D-018 als
Nachtrag festgehalten (Status setzt die Planung).

Erledigt:
- **F-38 – Wegfahrsperre nur Administratoren:** Rolle `admin`; Ops darf
  weiter Türen öffnen/schließen. Ein Versuch von Ops wird mit Grund
  abgelehnt und protokolliert; die Oberfläche bietet Ops die Wegfahrsperre
  gar nicht erst an. („Administratoren“ = Rolle `admin` gelesen – sollen
  auch Ops dürfen, ist das eine Zeile in `packages/shared/src/schluessel.ts`.)
- **F-39 – erstes Entriegeln startet die Miete:** Bestätigte Miete → `aktiv`
  in derselben Transaktion wie die Bestätigung des Befehls (inkl.
  Übergabebereich-Prüfung und `startIst`); Akteur im Audit ist der Fahrer.
  Bei asynchronem Anbieter erst mit dessen Bestätigung. Schlägt der Wechsel
  fehl, bleibt der Befehl ausgeführt (Savepoint, Log).
- **F-40 – bestätigt (1 h Vorlauf, bis tatsächliches Mietende)**, ergänzt
  um **No-Show-Schutz:** Hat die Miete nie begonnen, gilt der Schlüssel nur
  bis zum geplanten Mietende statt unbegrenzt.
- Technisch: Anbieter in eigenes `KeyProviderModule`, Widerruf in
  `schluessel/widerruf.ts` – so braucht der Schlüssel-Dienst den Miet-Dienst
  ohne Kreisbezug.

Tests: shared 63, Kern +4 Integrationstests (Wegfahrsperre/Rollen,
automatischer Mietstart, asynchroner Anbieter, No-Show), Browser-Test prüft
die Auswahl für Ops; alle 9 Browser-Tests grün.

Offen / Fragen an Planung:
- Rest von F-38: Soll „Wegfahrsperre ein“ nur bei stehendem Fahrzeug wirken?
  Hängt vom Anbieter ab (D-012, Frage 2) – bleibt offen.
- F-39 mit Foto-Check: Sobald der Foto-Check existiert, soll der Mietstart
  dann erst nach Foto-Check erfolgen? Heute startet das Entriegeln allein.
- F-24, F-26 bis F-37, F-41 weiter offen.

---

### 2026-10-17 – Digitaler Schlüssel und Fernzugriff

**Digitaler Schlüssel und Fernzugriff – erledigt** (Simulator-Stufe). Nächster
Schritt auf dem kritischen Pfad der Roadmap („Fernöffnen und Wegfahrsperre
über den Kern → digitaler Schlüssel“). Auf Toms Auftrag („weiter mit der
nächsten Aufgabe“); Planung möge die Aufgabe in `TASKS.md` nachziehen und
D-018 prüfen.

Erledigt:
- **Geteilte Regeln** `packages/shared/src/schluessel.ts`: Befehle,
  Status, Gültigkeit (ab 1 h vor Mietbeginn, bis Mietende), Prüfung eines
  Fahrerbefehls mit allen Gründen, Eingabe-Schemas.
- **Kern-Modul `schluessel`:** Schnittstelle `KeyProvider` mit Simulator
  (`TODO(D-015)`); Schlüssel ausstellen (nur Fahrer des Mietkunden mit
  gültiger Fahrerlaubnis, nur bestätigte/aktive Mieten, idempotent je Miete
  und Fahrer, auch gleichzeitig), widerrufen (mit Grund), automatisch bei
  Mietende/Storno in der Transaktion des Statuswechsels. Befehle des Fahrers
  (nur mit eigenem Login → `fahrer.konto_id`) und des Betriebs (mit Grund).
  **Jeder Versuch wird protokolliert**, abgelehnte mit Gründen; Rückmeldung
  des Anbieters als eigener Statuswechsel mit Audit. Idempotency-Key Pflicht.
  Kein Anbieteraufruf innerhalb einer Transaktion. Migration
  `0013_schluessel_fernzugriff`, Vorschlag **D-018**.
- **Oberfläche:** Mietakte „Digitaler Schlüssel“, Fahrzeugakte
  „Fernzugriff“ (Befehl mit Grund + Protokoll), Feld „App-Konto“ beim Fahrer,
  Verlauf zeigt Schlüssel-Ereignisse.
- **Demo-Daten:** laufende Miete mit Schlüssel und drei Befehlen des Fahrers
  (zwei ausgeführt, Wegfahrsperre abgelehnt); künftige Miete mit Schlüssel,
  der erst ab Mietbeginn − 1 h gilt.

Tests: shared 60, admin 57, Kern 134/134 Integration (neu: 8 zum Schlüssel,
Demo), Audit-Abdeckung um 4 Controller erweitert, Browser-Test „Ablauf“ um
Schlüssel, Fernzugriff und automatischen Widerruf erweitert; alle 9 grün.

Abkürzungen (vor Go-live ersetzen):
- **Simulator** statt echtem Anbieter; Rückmelde-Endpunkt (Webhook) des
  Anbieters fehlt noch – `SchluesselService.schliesseAb` ist vorbereitet.
- Befehle, die auf `gesendet` hängen bleiben (Anbieter antwortet nie),
  werden noch nicht nachgefasst (Index `idx_befehl_offen` liegt bereit →
  Hintergrundjob).
- Widerruf beim Anbieter nach Mietende ohne Wiederholung (nur Log bei
  Fehler). Unkritisch, solange jeder Befehl über den Kern läuft (D-018).
- Kein Keycloak-Testnutzer mit Rolle `fahrer`; Fahrer-Endpunkte sind per
  Integrationstest abgedeckt. Kommt mit dem App-MVP.

Beim Bauen aufgefallen (bestehend, nicht in dieser Aufgabe geändert):
- `GET /v1/mieten/:id` (und weitere Einzelabrufe wie Kunde/Fahrer) prüfen den
  Mandanten nicht, und `kunde_dispo`/`kunde_qa` sind nicht auf den eigenen
  Kunden beschränkt – heute harmlos (ein Mandant, keine Kundenlogins), vor
  dem Kundenportal zwingend → F-41.

Fragen an Planung:
- **F-38:** Darf der Fahrer die Wegfahrsperre selbst steuern, oder bleibt
  das beim Betrieb (heute: nur Ops/Admin)? Soll „Wegfahrsperre ein“ nur bei
  stehendem Fahrzeug wirken (Sicherheit; hängt vom Anbieter ab)?
- **F-39:** Soll das erste Entriegeln durch den Fahrer die Miete automatisch
  auf `aktiv` setzen (kontaktlose Übergabe, D-014) – ggf. erst nach
  Foto-Check?
- **F-40:** Vorlauf des Schlüssels 1 h vor Mietbeginn ok? Und gilt er bis
  zum tatsächlichen Mietende (heute) oder endet er zum geplanten Ende plus
  Kulanz (dann könnte ein verspäteter Fahrer nicht mehr abschließen)?
- **F-41:** Kundenrollen auf den eigenen Kunden beschränken (siehe oben) –
  eigene Aufgabe vor dem Kundenportal?
- F-24, F-26 bis F-37 weiter offen (siehe unten).

---

### 2026-10-17 – Übergabebereich-Prüfung

**Übergabebereich-Prüfung – erledigt.** (Auf Toms Auftrag; Planung möge die
Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Geteilte Logik** `packages/shared/src/geo.ts`: Abstand (Haversine),
  `pruefeUebergabebereich` mit Ergebnis „im Bereich“, „außerhalb“ (mit
  Abstand und Radius) oder „unbekannt“ mit Grund (kein Standort, kein
  Geofence, keine Position, Position älter als 30 Min.). Nie stillschweigend
  „im Bereich“.
- **Kern:** letzte Position eines Fahrzeugs aus den Messwerten
  `position_lat`/`position_lng` derselben Nachricht – eine Zeile, Zeitfenster
  24 h, über den vorhandenen Index (Fahrzeug, Zeit) (D-003: keine
  unbegrenzte Abfrage). Messwerte werden nur gelesen.
  `GET /v1/fahrzeuge/:id/position[?standortId=]` mit Mandantentrennung.
- **Miete:** Beim Wechsel auf `aktiv` wird gegen den Abholstandort, beim
  Wechsel auf `beendet` gegen den Rückgabestandort geprüft; das Ergebnis
  (Position, Abstand, Zeitpunkt UTC) wird an der Miete gespeichert und steht
  im Audit-Eintrag des Statuswechsels. Migration
  `0012_miete_uebergabe_pruefung`.
- **Oberfläche:** Fahrzeugakte mit Karte „Position“; Mietakte mit
  Übergabe, Rückgabe und – bei laufender Miete – „Jetzt“ samt Hinweis vor
  dem Beenden, wenn das Fahrzeug nicht nachweislich im Rückgabebereich
  steht. Verlauf zeigt die Prüfergebnisse lesbar.
- **Demo-Daten:** Positionen über den normalen Telematik-Pfad; eine
  Rückgabe 450 m außerhalb, ein Fahrzeug unterwegs (~18 km).

Tests: shared 54, Kern 125/125 Integration (neu: Übergabebereich, Demo),
alle 9 Browser-Tests grün.

Abkürzungen / Hinweise:
- Abstand per Haversine in der Anwendung statt PostGIS – reicht für
  Kreis-Geofences, Polygone bräuchten PostGIS (F-10).
- Geprüft wird nur beim Statuswechsel und beim Anzeigen; keine laufende
  Überwachung „Fahrzeug verlässt Bereich“ (wäre ein Hintergrundjob am
  Telematik-Eingang).

Fragen an Planung:
- **F-37:** Soll Übergabe oder Rückgabe **abgelehnt** (oder automatisch
  eine Abweichung angelegt) werden, wenn das Fahrzeug außerhalb steht? Und
  was gilt bei „unbekannt“ (keine oder veraltete Position) – sperren,
  Bestätigung durch Ops, oder nur festhalten wie heute? Sind 30 Minuten
  als Höchstalter der Position richtig?
- F-24, F-26 bis F-36 weiter offen (siehe unten).

---

### 2026-10-17 – Standortverwaltung

**Standortverwaltung – erledigt.** (Auf Toms Auftrag; Planung möge die
Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Öffnungsregeln** (D-011) als Wochenplan in Ortszeit (Europe/Berlin,
  Sommer-/Winterzeit getestet), bis zu vier Zeitfenster je Tag im Kern, zwei
  im Formular; `null` = rund um die Uhr (kontaktlos, D-014). Geteilte Logik
  in `packages/shared/src/standort.ts` (`istGeoeffnet`, Texte, Schemas).
- **Kern:** Modul `standort` – `GET/POST /v1/standorte`, `GET/PATCH
  /v1/standorte/:id`. Pflegen nur `admin`, lesen alle internen Rollen und
  `kunde_dispo`. Audit beim Anlegen (vollständig) und Ändern (alt/neu),
  Versionsschutz (D-016), Name je Mandant eindeutig, Mandantentrennung.
  Kein Löschen; **Deaktivieren nur ohne Fahrzeuge und ohne
  laufende/künftige Mieten** (sonst Ablehnung mit Gründen).
  Migration `0011_standort_verwaltung`.
- **Fahrzeug:** Heimatstandort beim Anlegen und Bearbeiten (nur aktive
  Standorte des Mandanten); Liste mit Standort-Spalte und Filter
  (`?standortId=`), Akte zeigt den Heimatstandort.
- **Buchung:** Abhol- und Rückgabestandort wählbar; die Fahrzeugsuche
  filtert nach Heimatstandort; gespeichert werden Abhol- und
  Rückgabestandort; die Buchungsprüfung lehnt unbekannte oder deaktivierte
  Standorte ab. **Hinweis** (keine Ablehnung), wenn Abholung oder Rückgabe
  außerhalb der Öffnungszeiten liegt → F-35. Mietakte zeigt die Standorte.
- **Demo-Daten:** zwei Standorte („Nord“ mit Öffnungszeiten, „Süd“ rund um
  die Uhr), Fahrzeuge und Mieten zugeordnet.
- **Oberfläche:** Menüpunkt „Standorte“ mit Liste (aktiv/deaktiviert),
  Detail (Öffnungszeiten, Geofence, Verlauf, (De-)Aktivieren), Anlegen und
  Bearbeiten mit Öffnungszeiten-Tabelle.

Behobene Fehler (gefunden beim Testen):
- **Deadlock bei gleichzeitigen Buchungen:** Der Doppelbuchungs-Test
  schlug sporadisch fehl (2 von 6 Läufen). Ursache: Gleichzeitige Prüfungen
  der Überschneidungs-Regel blockierten sich gegenseitig; PostgreSQL brach
  nach ~1 s eine Buchung mit „deadlock detected“ ab → Serverfehler statt
  sauberer Ablehnung. Jetzt laufen Buchungen desselben Fahrzeugs kurz
  nacheinander (Sperre je Fahrzeug), mit Wiederholung als Rückfall. Danach
  25 von 25 Stressläufen grün (Nachtrag in D-017).
- **Gleichzeitige Wiederholung derselben Buchung** (gleicher
  Idempotency-Key) konnte als „bereits gebucht“ abgelehnt werden, statt die
  vorhandene Buchung zurückzugeben. Behoben und abgedeckt.
- **Änderungserkennung bei JSON-Feldern:** Objekte (z. B. Öffnungszeiten)
  galten bei jedem Speichern als geändert; PostgreSQL sortiert zudem
  jsonb-Schlüssel um. Jetzt inhaltlicher Vergleich – kein Schein-Eintrag im
  Audit Trail.

Tests: shared 50, admin 51, Kern 58 Unit + 63 Integration (121/121, dreimal
in Folge); neuer Browser-Test Standorte; alle 9 Browser-Tests grün.

Offen / Hinweise:
- Geofence wird gespeichert, aber noch nicht gegen Telematik-Positionen
  geprüft (z. B. „Rückgabe im Übergabebereich?“) – eigener Schritt, PostGIS
  optional (F-10).
- Rückgabe an einem anderen Standort (Einwegmiete) ist im Modell möglich,
  in der Oberfläche aber nicht vorgesehen; der Heimatstandort ändert sich
  dadurch nicht → F-36.

Fragen an Planung:
- **F-35:** Soll eine Buchung abgelehnt werden, wenn Abholung oder Rückgabe
  außerhalb der Öffnungszeiten liegt? Heute nur ein Hinweis. (Bei
  kontaktloser Übergabe, D-014, evtl. nur für Standorte mit Öffnungszeiten.)
- **F-36:** Einwegmieten (Rückgabe an anderem Standort): erlaubt? Und wird
  der Heimatstandort dann zum neuen Standort des Fahrzeugs?
- F-24, F-26 bis F-34 weiter offen (siehe unten).

---

### 2026-10-17 – Suche für die Buchung

**Buchung mit Suche statt Auswahllisten – erledigt.** (Auf Toms Auftrag;
Planung möge die Aufgabe in `TASKS.md` nachziehen. Ersetzt die Abkürzung
„Auswahllisten auf 200 Einträge begrenzt“ aus dem Eintrag „Formulare“.)

Erledigt:
- **Kern:** `GET /v1/fahrzeuge/verfuegbar?von&bis&suche&fahrerKlasse&fahrtenschreiber`
  (Rollen `ops`, `admin`, `kunde_dispo`) – eine Abfrage mit Blättern und
  Gesamtzahl: verfügbar, alle aktiven Sensoren zum Mietbeginn gültig
  kalibriert, optional Fahrtenschreiber und vom Fahrer abgedeckte Klasse,
  keine Überschneidung (nutzt den GiST-Index der Doppelbuchungs-Regel).
  `GET /v1/kunden?suche=` für die Kundensuche. Freitext wird sicher als
  „enthält“-Muster verwendet (`%`/`_` der Eingabe wirken nicht).
- **Suche und Buchung sind sich einig:** Integrationstest prüft für jeden
  Treffer, dass die Buchungsprüfung keine Gründe liefert; außerdem belegte,
  vermietete, gewartete und ablaufend kalibrierte Fahrzeuge, angrenzende
  Zeiträume, Ausland, Klasse, Kennzeichen, Blättern.
- **Oberfläche:** neuer Buchungsablauf in vier Schritten (Kunde suchen →
  Zeitraum/Fahrer/Anforderungen → buchbare Fahrzeuge → bestätigen), ohne
  JavaScript im Browser. Hinweis „läuft während der Miete ab“, wenn eine
  Kalibrierung vor Mietende endet.
- **Browser-Test** angepasst: Mit Auslandsfahrt erscheint das Fahrzeug ohne
  Fahrtenschreiber gar nicht; zwei Disponentinnen wählen in zwei Tabs
  dasselbe Fahrzeug – die zweite wird mit Grund abgelehnt, ihre Auswahl
  bleibt erhalten. Alle 8 Browser-Tests grün.
- **Tests:** shared 42, admin 44, Kern 54 Unit + 60 Integration (114/114).

Offen / Hinweise:
- Kennzeichen-Suche „enthält“ ohne Trigramm-Index: bei 4.000 Fahrzeugen je
  Mandant unkritisch (der Zeitraum- und Statusfilter greift zuerst); bei
  deutlich mehr wäre `pg_trgm` sinnvoll.
- Standort fehlt weiterhin als Filter (keine Standortverwaltung).

Fragen an Planung:
- **F-34:** Muss die Kalibrierung bis zum **Ende** der Miete gültig sein
  (heute: zum Beginn, wie bisher in der Buchungsprüfung)? Ein Messwert nach
  Ablauf der Kalibrierung ist nach EN 12830 nicht mehr beweiskräftig. Die
  Suche zeigt den Fall bereits als Hinweis; die Regel umzustellen wäre eine
  Zeile in Suche und Buchungsprüfung.
- F-24, F-26 bis F-33 weiter offen (siehe unten).

---

### 2026-10-17 – Namen in Listen, eigene Test-Datenbank, Integrationstests in der CI

**Erledigt.** (Auf Toms Auftrag; Planung möge die Aufgaben in `TASKS.md`
nachziehen.)

Namen statt Kurz-IDs:
- Mieten, Alarme, Rechnungen und Abweichungen liefern Kennzeichen bzw.
  Firmennamen gleich in der Listenabfrage mit (Join, keine Abfrage je Zeile,
  D-003). Abweichungen lösen das betroffene Fahrzeug über Miete oder Alarm
  auf.
- Oberfläche: Übersicht, Alarme, Mieten (Spalte „Zeitraum“ statt Kurz-ID),
  Rechnungen (Kunde, Leistungszeitraum), Abweichungen; Titel „Miete DEMO-102 ·
  13.10.2026“ und „Abweichung vom … · DEMO-102“. Fällige Kalibrierungen mit
  Sensor-Seriennummer.
- **Last (D-003):** Fällige Kalibrierungen und Führerscheine wurden bisher
  vollständig geladen und im Programm gefiltert (bei 4.000 Fahrzeugen bei
  jedem Aufruf der Übersicht). Jetzt filtert die Datenbank.

Eigene Test-Datenbank:
- Integrationstests laufen gegen `rent2cool_test` (bzw. `TEST_DATABASE_URL`),
  die beim Testlauf automatisch angelegt und migriert wird; Sicherung: Name
  muss auf `_test` enden. Entwicklungs- und Demo-Daten bleiben unberührt
  (geprüft). `pnpm test:integration` im Repo-Wurzelverzeichnis.
- Wartet beim Start, bis die Datenbank bereit ist (Neustart nach der
  Erstinitialisierung des Postgres-Containers).

CI:
- **Neuer Job „Integrationstests (PostgreSQL + TimescaleDB)“** mit
  Service-Container (gleiches Image wie lokal). Damit laufen die
  Integrationstests jetzt bei jedem Push, nicht mehr nur lokal.

Tests: Kern 51 Unit + 58 Integration (109/109, auch mit frisch angelegter
Test-Datenbank); alle 8 Browser-Tests grün.

Offen:
- Browser-Tests laufen weiter gegen den lokalen Stack (Entwicklungs-DB) und
  legen dort Testdatensätze an. Eine eigene Umgebung dafür bräuchte einen
  zweiten Kern – vorerst nicht nötig.

Fragen an Planung:
- Keine neuen. F-24, F-26 bis F-33 weiter offen (siehe unten).

---

### 2026-10-17 – Demo-Daten für Vorführungen

**Demo-Daten – erledigt.** (Auf Toms Auftrag; Planung möge die Aufgabe in
`TASKS.md` nachziehen.)

Erledigt:
- `pnpm --filter @rent2cool/core db:seed:demo` lädt erfundene, stimmige
  Daten (D-015: Firmen mit „(Demo)“, Kennzeichen `DEMO-…`, Mustermann-Namen,
  USt-IDs `DE00000000x`):
  - 5 Fahrzeuge mit Kühlaufbau, Sensor und Kalibrierung (eine läuft in 12
    Tagen ab), eines in Wartung, eines gerade vermietet.
  - 3 Kunden (2 freigegeben, 1 in Prüfung), 3 Fahrer (ein Führerschein läuft
    in 20 Tagen ab).
  - 6 Mieten: abgeschlossen mit eingehaltener Kühlkette (Rechnung bezahlt),
    abgeschlossen mit 35-Minuten-Ausreißer auf 9,6 °C (Alarme quittiert und
    geschlossen, Abweichung bewertet und geschlossen, Rechnung gestellt),
    abgeschlossen im Bereich 15–25 °C (Rechnung Entwurf), eine laufende mit
    kurzem Ausreißer vor zwei Stunden (offene Alarme), zwei künftige.
  - ~7.500 Messwerte (1 je Minute), deterministisch erzeugt.
- **Echte Wege:** Anlegen, Status, Kalibrierung, Rechnung, Abweichung über
  die Services (Regeln + Audit Trail, Akteur „Demo-Daten“); Messwerte durch
  die Telematik-Verarbeitung, Alarme durch die Alarm-Auswertung. Nur
  vergangene/laufende Mieten werden direkt mit ihren historischen Zeiten
  angelegt (ein Statuswechsel setzt „jetzt“) – ebenfalls mit Audit-Eintrag.
- Einmalig: Ein zweiter Lauf erkennt die vorhandenen Daten und tut nichts.
  Laden dauert ca. 6 Sekunden.
- **Fehler behoben:** Auf Miete, Rechnung und Kunde stand im Endzustand
  (z. B. „abgerechnet“) ein leeres Feld „Status“, weil es keinen erlaubten
  Folgestatus gibt. Jetzt erscheint das Feld nur mit Auswahl.
- **Tests:** Kern 46 Unit + 56 Integration (102/102); Demo-Daten mit eigenem
  Mandanten geprüft (Nachweise „eingehalten“/„verletzt“, Alarme, Rechnungen,
  Fahrzeugstatus, Audit-Akteur, zweiter Lauf). Alle 8 Browser-Tests grün.
- Lokale Datenbank dieser Cloud-Session wurde dafür neu aufgesetzt (enthielt
  nur Testdaten der Integrationstests).

Offen / Hinweise:
- Die Integrationstests schreiben in den Platzhalter-Mandanten, also in
  dieselbe Datenbank wie die Demo-Daten. (Nachtrag: erledigt, eigene
  Test-Datenbank.)
- Direkt nach `docker compose up` einer frischen Datenbank kann die erste
  Migration scheitern (das Postgres-Image startet nach der Initialisierung
  neu); einfach wiederholen.
- Übersicht und Listen zeigen bei Fahrzeugen in Alarmen noch Kurz-IDs statt
  Kennzeichen (bekannte Abkürzung aus der Admin-Oberfläche v1).

Fragen an Planung:
- Keine neuen. F-24, F-26 bis F-33 weiter offen (siehe unten).

---

### 2026-10-17 – Formatierung und Typprüfung in der CI

**Formatprüfung und Typprüfung der Tests in der CI – erledigt.** (Auf Toms
Auftrag; Planung möge die Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Typprüfung umfasst Tests:** je Paket `tsconfig.test.json`
  (core, ingest, shared, admin – admin inkl. Playwright-Tests);
  `pnpm typecheck` nutzt sie, die Build-Konfiguration bleibt unverändert.
  Zwei Typfehler in Tests gefunden und behoben (Typimport aus `fastify`, das
  keine direkte Abhängigkeit ist; Prototyp-Umwandlung im Audit-Wächtertest).
- **Einmalige Formatierung** mit Prettier in eigenem Commit (109 Dateien,
  keine inhaltlichen Änderungen). Geprüft: YAML und JSON (u. a.
  docker-compose, Keycloak-Realm, package.json) inhaltlich identisch;
  Lint, Typprüfung, Unit-, Integrations- (91/91) und Browser-Tests (8/8) grün.
- `docs/` und `CLAUDE.md` von Prettier ausgenommen – Planungsdateien sollen
  nicht automatisch umformatiert werden.
- `.git-blame-ignore-revs` mit dem Formatierungs-Commit, damit `git blame`
  die echten Autoren zeigt (GitHub berücksichtigt die Datei automatisch).
- **CI:** neuer Schritt „Formatierung“ (`pnpm format:check`) vor Lint; Job
  heißt jetzt „Format, Lint, Typecheck, Test, Build“. Keine Branch-Protection
  auf `main`, die Umbenennung bricht also keine Pflicht-Checks.

Hinweis für lokale Arbeit (auch Toms Mac): vor dem Commit `pnpm format`
ausführen, sonst schlägt die CI fehl.

Fragen an Planung:
- **F-33:** Soll `main` eine Branch-Protection bekommen (CI muss grün sein
  vor dem Merge)? Heute wird direkt auf `main` gearbeitet; eine rote CI
  hält nichts auf.
- F-24, F-26 bis F-32 weiter offen (siehe unten).

---

### 2026-10-17 – Doppelbuchung verhindern

**Doppelbuchung bei gleichzeitigen Buchungen – behoben.** (Fund aus der
vorigen Session; Planung möge die Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Datenbank-Regel** (Migration `0010_miete_keine_ueberschneidung`):
  Exclusion-Constraint `ex_miete_fahrzeug_zeitraum` – je Fahrzeug keine
  überlappenden bestätigten/aktiven Mieten, Zeiträume halboffen (Rückgabe
  10:00 und nächste Abholung 10:00 sind erlaubt). Gilt auch am Kern vorbei.
  Vorschlag als **D-017**.
- Der Kern übersetzt eine Regelverletzung in dieselbe Ablehnung wie die
  Vorabprüfung („Fahrzeug ist im gewünschten Zeitraum bereits gebucht“) –
  beim Buchen und beim Statuswechsel (z. B. angefragt → bestätigt). Die
  Oberfläche zeigt die Gründe wie bisher.
- **Nebenbei behobener Fehler:** Der Kern erkannte Datenbank-Fehler über den
  Fehlertext, postgres.js liefert den SQLSTATE aber nur im Feld `code`.
  Dadurch lief eine gleichzeitige Wiederholung mit demselben
  Idempotency-Key in einen Serverfehler statt die vorhandene Buchung
  zurückzugeben. Neuer Baustein `apps/core/src/db/fehler.ts` (SQLSTATE +
  Constraint-Name); umgestellt bei Buchung, Fahrzeug (doppeltes Kennzeichen)
  und Rechnung (gleichzeitige Rechnung zur selben Miete → 409 statt 500).
- **Tests:** Kern 41 Unit + 50 Integration (91/91 gegen den lokalen Stack).
  Neuer Integrationstest Doppelbuchung: gleichzeitige Buchungen, angrenzende
  Zeiträume, Idempotency-Key gleichzeitig, Stornierung, Statuswechsel,
  Schreiben am Kern vorbei. **Gegenprobe:** Ohne die Regel schlägt der Test
  mit abgeschalteter Vorabprüfung fehl – mit Regel ist er grün. (Der Test mit
  echter Vorabprüfung allein ist nicht beweiskräftig, weil die Anfragen lokal
  meist nacheinander ankommen.)
- Lokale Testdaten: Bei der Gegenprobe entstandene Überschneidungen
  (nur Test-Mandant „Doppelbuchung“) wurden storniert.

Hinweise:
- Die Migration schlägt fehl, wenn eine Datenbank bereits überlappende
  Buchungen enthält – gewollt; vor dem Einspielen Überschneidungen suchen und
  fachlich klären (welche Buchung gilt).
- **Formatierung:** 97 Dateien entsprachen nicht der Prettier-Konfiguration
  (schon vorher so). (Nachtrag: erledigt, siehe „Formatierung und
  Typprüfung in der CI“.)

Fragen an Planung:
- Keine neuen. F-24, F-26 bis F-32 weiter offen (siehe unten).

---

### 2026-10-17 – Protokollierung beim Anlegen

**Anlegen mit vollständigem Audit – erledigt.** (Auf Toms Auftrag; Planung
möge die Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Fahrzeugakte, Kalibrierung, Kunde, Fahrer, Buchung, Rechnung,
  Abweichung** schreiben beim Anlegen den **vollständigen neuen Datensatz**
  in den Audit Trail – in derselben Transaktion wie das Anlegen. Vorher stand
  dort nur die Antwort (meist nur die ID). Die Fahrzeugakte wird als ein
  Eintrag mit Kühlaufbau und Sensoren protokolliert.
- **Idempotente Wiederholung** einer Buchung legt nichts an und
  protokolliert daher nichts mehr (vorher entstand je Wiederholung ein
  Eintrag).
- **Kalibrierungen** werden unter der Sensor-ID protokolliert (wie der
  Sensortausch). Damit zeigt der Verlauf der Fahrzeugakte Anlegen,
  Statuswechsel, Kalibrierungen und Tausch zusammen.
- **Rechnungsnummern ohne Lücken:** Die Nummernvergabe liegt jetzt in der
  Transaktion des Anlegens. Ein abgebrochenes Anlegen gibt die Nummer zurück
  (vorher blieb eine Lücke). Getestet mit einem gleichzeitig abgewiesenen
  Doppel.
- **Mandantenprüfung** jetzt auch beim Anlegen von Fahrern und beim Erfassen
  von Kalibrierungen.
- **Verlauf:** Mehrere zusammengehörige Datensätze in einer Abfrage
  (Fahrzeug + Sensoren, Kunde + Fahrer), mit Bezug je Zeile („Sensor SN …“,
  „Fahrer …“). Anlege-Einträge zeigen die wichtigsten Felder.
- Auf der Rückfallebene (`@Audited`) bleiben nur Temperaturnachweis erzeugen
  und der Demo-Endpunkt (Nachtrag in D-016).
- **Tests:** shared 41, admin 42, Kern 38 Unit + 44 Integration (82/82 gegen
  den lokalen Stack; neuer Test für Anlegen mit eigenem Mandanten je Lauf).
  Alle 8 Browser-Tests grün, inkl. Verlauf von Fahrzeug und Kunde.

Gefunden, nicht Teil dieser Aufgabe:
- **Doppelbuchung bei gleichzeitigen Buchungen möglich:** Überschneidungsprüfung
  und Anlegen sind getrennte Schritte ohne Sperre oder Datenbank-Regel.
  Zwei gleichzeitige Buchungen desselben Fahrzeugs im selben Zeitraum könnten
  beide bestätigt werden. Vorschlag: Exclusion-Constraint auf
  (Fahrzeug, Zeitraum) für bestätigte/aktive Mieten. Als eigene Aufgabe
  vorgeschlagen – bitte in `TASKS.md` aufnehmen, **vor Go-live zwingend**.
  (Nachtrag: behoben, siehe Eintrag „Doppelbuchung verhindern“.)

Offen / Abkürzungen:
- Alarme, die die Telematik automatisch anlegt, haben keinen Audit-Eintrag
  (kein menschlicher Akteur). Vorschlag: technischer Akteur „system:telematik“
  → F-32.
- Alte Audit-Einträge (vor heute) zeigen beim Anlegen weiter nur die ID.

Fragen an Planung:
- **F-32:** Sollen automatisch erzeugte Datensätze (Alarme aus der
  Telematik) mit einem technischen Akteur im Audit Trail stehen?
- F-24, F-26 bis F-31 weiter offen (siehe unten).

---

### 2026-10-17 – Protokollierung der Statuswechsel

**Statuswechsel mit vollständigem Audit – erledigt.** (Auf Toms Auftrag;
Planung möge die Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Alle Statuswechsel** (Fahrzeug, Kunde, Fahrer, Miete, Rechnung, Alarm
  quittieren/schließen, Abweichung) laufen über einen gemeinsamen Ablauf:
  Zeile sperren → Übergang prüfen → speichern → Audit mit altem und neuem
  Wert, alles in einer Transaktion. Mitprotokolliert werden auch die
  Folgefelder (z. B. `startIst`, `gestelltAm`, `geschlossenAm`,
  `letztePruefungAm`).
- **Behobener Fehler (Gleichzeitigkeit):** Bisher wurde ohne Sperre gelesen
  und geschrieben – zwei gleichzeitige Wechsel vom selben Stand (z. B. Miete
  „aktiv“ und „storniert“) konnten beide gelingen, der zweite überschrieb den
  ersten unbemerkt. Jetzt gewinnt genau einer; getestet.
- **Rechnung gestellt → Miete abgerechnet** jetzt in derselben Transaktion
  und mit eigenem Audit-Eintrag (vorher zwei getrennte Schritte).
- **Mandantentrennung** auch bei Statuswechseln (vorher nicht geprüft).
- Gleicher Status ohne Änderung → kein Update, kein Audit-Eintrag.
  Abweichungen: Bewertung/Maßnahmen ergänzen ohne Statuswechsel wird
  protokolliert.
- **Audit-Eintrag erweitert** (Migration `0009_audit_akteur_name`):
  Anmeldename (`preferred_username`) zusätzlich zur Konto-ID; `akteur_rolle`
  enthält jetzt **alle** Rollen (vorher nur die erste). Alte Einträge bleiben
  unverändert (append-only).
- **Verlauf lesbar:** `GET /v1/audit` (nur interne Rollen, mit Blättern) und
  Abschnitt „Verlauf“ auf den Seiten von Kunde, Fahrer, Fahrzeug, Miete,
  Rechnung und Abweichung: wer, wann, Vorgang, Feld alt → neu.
- **Tests:** shared 41, admin 42, Kern 38 Unit + 39 Integration (77/77 gegen
  den lokalen Stack); neue Tests für den Ablauf (Unit), Audit-Inhalte,
  Gleichzeitigkeit, Folgeschritt in derselben Transaktion, Mandant. Alle 8
  Browser-Tests grün, inkl. Verlauf auf Miete, Rechnung, Abweichung, Kunde.

Offen / Abkürzungen:
- **Anlegen** protokolliert weiter nur die Antwort (meist nur die ID) über die
  Rückfallebene. Vollständig wäre: angelegter Datensatz als neuer Wert →
  nächster Schritt nach demselben Muster.
- Der Verlauf-Endpunkt filtert nicht nach Mandant (nur interne Rollen haben
  Zugriff; ein Kundenportal braucht vor dem Go-live eine Mandantenprüfung).
- Der Verlauf zeigt die letzten 50 Einträge je Datensatz; Blättern in der
  Oberfläche fehlt noch (die API kann es).
- Die Testdateien des Kerns werden nicht typgeprüft (`tsconfig` schließt
  `*.spec.ts` aus); falsche Aufrufe fallen erst beim Testlauf auf. Empfehlung:
  eigene `tsconfig` für Tests in der CI.

Fragen an Planung:
- **F-31:** Wer darf den Audit-Verlauf sehen? Heute: `admin`, `ops`,
  `qa_approver`, `dpo`. Soll `dpo` (Datenschutz) wegen personenbezogener
  Inhalte gesondert behandelt werden, und sollen Kunden (`kunde_qa`) den
  Verlauf ihrer eigenen Mieten sehen?
- F-24, F-26 bis F-30 weiter offen (siehe unten).

---

### 2026-10-17 – Sensortausch

**Sensortausch – erledigt.** (Auf Toms Auftrag; Planung möge die Aufgabe in
`TASKS.md` nachziehen.)

Erledigt:
- **Einbau-Historie für Sensoren** (Migration `0008_sensor_tausch`):
  eingebaut/ausgebaut, Ausbaugrund, Vorgänger. Messwerte hängen am Fahrzeug,
  nicht am Sensor – erst damit ist nachvollziehbar, welcher Sensor (und
  welche Kalibrierung) wann gemessen hat. Die Datenbank erzwingt
  „aktiv ⇔ nicht ausgebaut“ und höchstens einen Nachfolger je Sensor.
  Bestand wird übernommen (eingebaut = angelegt).
- **Kern:** `POST /v1/sensoren/:id/tausch` (Rollen `ops`/`admin`). In einer
  Transaktion: alter Sensor ausgebaut (bleibt mit Kalibrierungen erhalten),
  neuer mit gleicher Messgröße eingebaut (lückenlos, gleicher Zeitpunkt),
  optional gleich kalibriert, Audit mit altem und neuem Sensor.
  - Wiederholung derselben Anfrage (gleiche Seriennummer) liefert das
    vorhandene Ergebnis (`idempotent: true`, D-003); gleichzeitige Anfragen
    erzeugen genau einen neuen Sensor.
  - Eine Seriennummer kann nicht in zwei Fahrzeugen zugleich eingebaut sein.
  - Fremde Mandanten bekommen 404.
- Ohne Kalibrierung des neuen Sensors ist das Fahrzeug **nicht buchbar**
  (bestehende Regel R-08/R-09 greift automatisch); ausgebaute Sensoren
  verschwinden aus den fälligen Kalibrierungen.
- Die Akte liefert je Sensor „kalibriert bis“ mit einer einzigen Abfrage;
  die Buchbarkeitsprüfung nutzt das jetzt auch (vorher eine Abfrage je
  Sensor).
- **Oberfläche:** Sensortabelle der Fahrzeugakte mit Seriennummer,
  Ein-/Ausbau, Grund und Kalibrierfrist; „Tauschen“ je eingebautem Sensor;
  Tauschseite mit optionaler Kalibrierung (gemeinsame Kalibrierfelder mit der
  Akte); Hinweis, wenn das Fahrzeug gerade vermietet ist.
- **Tests:** shared 41, admin 38, Kern 34 Unit + 34 Integration (68/68 gegen
  den lokalen Stack, u. a. Gleichzeitigkeit, Idempotenz, DB-Regel). Neuer
  Browser-Test: Tausch ohne Kalibrierung → nicht buchbar → nachkalibriert →
  buchbar; Doppel-Einbau abgelehnt; Tausch mit Kalibrierung. Alle 8
  Browser-Tests grün.

Offen / Abkürzungen:
- Tauschzeitpunkt ist immer „jetzt“ (Serverzeit, UTC). Nachträgliches Erfassen
  eines früheren Tauschs ist nicht möglich → F-29.
- Kühlaufbau (Aggregat) selbst tauschen oder nachträglich erfassen geht noch
  nicht; nur Sensoren.

Fragen an Planung:
- **F-28:** Soll der Temperaturnachweis einer Miete die Sensoren mit
  Seriennummer und gültiger Kalibrierung im Mietzeitraum ausweisen (inkl.
  Tausch während der Miete)? Das ändert das Nachweis-Format
  (`schemaVersion` 2) und gehört deshalb in die Planung. Die Daten dafür
  liegen jetzt vor.
- **F-29:** Darf ein Sensortausch rückdatiert erfasst werden (Techniker trägt
  später ein)? Wenn ja: nur mit Begründung und nicht vor dem Einbau des alten
  Sensors?
- **F-30:** Soll ein Sensortausch während einer laufenden Miete automatisch
  eine Abweichung anlegen? Heute nur ein Hinweis in der Oberfläche.

---

### 2026-10-17 – Stammdaten-Bearbeitung

**Stammdaten bearbeiten – erledigt.** (Auf Toms Auftrag; Planung möge die
Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- **Kern:** neue Endpunkte `PATCH /v1/kunden/:id`, `PATCH /v1/fahrer/:id`,
  `PATCH /v1/fahrzeuge/:id` (Rollen `ops`/`admin`) und `GET /v1/fahrer/:id`.
  Nur geänderte Felder werden gespeichert; leeres Feld = Wert löschen.
- **Audit mit altem und neuem Wert** je geändertem Feld, in derselben
  Transaktion wie die Änderung (vorher protokollierte die Rückfallebene nur
  den neuen Wert). In der DB geprüft.
- **Schutz vor verlorenen Änderungen:** Speichert jemand anderes zwischendurch,
  wird abgelehnt (409) und die Eingaben bleiben im Formular stehen. Auch zwei
  gleichzeitige Anfragen mit demselben Stand getestet: genau eine gewinnt.
  Vorschlag als **D-016** in `DECISIONS.md`.
- **Mandantentrennung:** Ein anderer Mandant bekommt 404 statt Zugriff.
- Doppeltes Kennzeichen beim Ändern → verständliche Ablehnung.
- **Wächter-Test:** Jede schreibende Route im Kern muss auditiert sein – eine
  vergessene fällt künftig im Test auf.
- **Oberfläche:** „Stammdaten bearbeiten“ auf Fahrzeug- und Kundenseite,
  Fahrer über den Namen in der Fahrertabelle. Anlegen und Bearbeiten nutzen
  dieselben Feldgruppen (`apps/admin/src/components/stammdaten.tsx`) –
  Beschriftungen und Formate nur an einer Stelle. Kundenseite zeigt jetzt die
  ganze Anschrift. Hinweise, wenn ein freigegebener Kunde/Fahrer oder ein
  gebuchtes Fahrzeug geändert wird.
- **Tests:** shared 40, admin 37, Kern 34 Unit + 29 Integration (63/63 grün
  gegen den lokalen Stack); neuer Browser-Test bearbeitet Kunde, Fahrer und
  Fahrzeug inkl. Pflichtfeldfehler und Konflikt in zwei Tabs. Alle 7
  Browser-Tests grün.

Offen / Abkürzungen:
- Kühlaufbau und Sensoren lassen sich noch nicht ändern (z. B. Sensor
  tauschen → neuer Sensor braucht Kalibrierung). Eigener Ablauf nötig.
- Standort bleibt nicht wählbar (keine Standortverwaltung).
- Statuswechsel protokollieren weiterhin nur den neuen Wert (Rückfallebene);
  Umstellung auf alt/neu wie bei den Stammdaten empfohlen (D-016).
- Im Audit steht als Rolle nur die erste Rolle des Nutzers (wie bisher).

Fragen an Planung:
- **F-27:** Was passiert fachlich, wenn sich prüfrelevante Daten nach der
  Freigabe ändern? Vorschlag: Fahrer mit geänderter Führerscheinklasse,
  -nummer oder -gültigkeit fällt automatisch zurück auf
  „Identitätsprüfung“; Kunde mit geändertem Firmennamen, Handelsregister oder
  USt-ID zurück auf „in Prüfung“; bei gebuchten Fahrzeugen sind Klasse und
  Fahrtenschreiber gesperrt. Heute gibt es nur einen Hinweis in der
  Oberfläche, nichts wird erzwungen.
- F-24 und F-26 weiter offen (siehe unten).

---

### 2026-10-17 – Formulare zum Anlegen und Bearbeiten

**Formulare für den ganzen Ablauf – erledigt.** (Auf Toms Auftrag; Planung möge
die Aufgabe in `TASKS.md` nachziehen. Beantwortet damit auch F-25 vorläufig:
alle Workflows aus F-25 sind umgesetzt.)

Erledigt:
- **Fahrzeug anlegen** (mit Kühlaufbau und Laderaum-Sensor), **Kalibrierung
  erfassen** in der Fahrzeugakte; danach ist das Fahrzeug buchbar.
- **Kunde anlegen**, Prüfstatus wechseln; **Fahrer anlegen** auf der
  Kundenseite und Identitäts-/Führerscheinprüfung je Fahrer.
- **Buchung anlegen** in zwei Schritten (freigegebener Kunde → verfügbares
  Fahrzeug, freigegebener Fahrer, Zeitraum, Profil, Auslandsfahrt). Lehnt der
  Kern ab, stehen die Gründe über dem Formular, die Eingaben bleiben erhalten.
  Idempotency-Key je Formular (D-003).
- **Mietakte:** Statuswechsel, Rechnung erstellen (erst nach Mietende) bzw.
  Verweis auf die vorhandene, „Abweichung erfassen“.
- **Rechnungsseite** (neu) mit Leistungszeitraum, USt, gestellt/bezahlt und
  Statuswechsel. Der Kern kann Rechnungen jetzt nach `mieteId` filtern.
- **Abweichung erfassen** (aus Miete, Fahrzeug oder Alarm vorbelegt) und
  **Abweichungsseite** (neu) mit Bewertung, Maßnahmen, Verantwortlichem und
  Statuswechsel – nur `qa_approver`/`admin`, wie im Kern.
- Statuswechsel bieten nur die laut Statusmodell erlaubten Folgestatus an.
- **Geteilte Eingabeschemas (D-001):** Die Zod-Schemas wandern aus dem Kern
  nach `packages/shared/src/eingaben.ts`; Kern und Oberfläche prüfen mit
  denselben Regeln und deutschen Fehlermeldungen. Verhalten des Kerns
  unverändert (alle Integrationstests grün).
- Eingabe in deutscher Ortszeit, Speicherung in UTC (inkl.
  Sommer-/Winterzeit-Tests); Beträge mit Komma oder Punkt.
- **Fehler behoben, den nur der Browser-Test fand:** Nach einer abgelehnten
  Buchung sprangen Auswahlfelder auf den Anfangswert zurück (React 19 setzt
  Formulare nach dem Absenden zurück, übernimmt bei `<select>` aber den neuen
  Vorgabewert nicht). Behoben und im Test abgesichert.
- **Tests:** Unit-Tests shared 38, admin 36, Kern 28 (+25 Integration, mit
  `RUN_INTEGRATION=1` gegen den lokalen Stack grün: 53/53). **Neuer
  Browser-Test spielt den ganzen Ablauf einmal durch** – inkl. Pflichtfeldfehler,
  abgelehnter Buchung (Ausland ohne Fahrtenschreiber) und QA-Abschluss einer
  Abweichung; alle 6 Browser-Tests grün. Jeder Schritt erzeugt einen Eintrag
  im Audit Trail (in der DB geprüft).

Abkürzungen, die vor Go-live ersetzt werden müssen:
- **Auswahllisten auf 200 Einträge begrenzt** (Kunden, Fahrzeuge in der
  Buchung). Bei ~4.000 Fahrzeugen (D-003) braucht es eine Suche (Kennzeichen,
  Standort, Zeitraum-Verfügbarkeit) statt eines Auswahlfelds.
- **Standort ist nicht wählbar** (weder beim Fahrzeug noch bei der Buchung),
  weil es noch keine Standortverwaltung gibt.
- Bearbeiten von Stammdaten (z. B. Kundenanschrift ändern) fehlt; der Kern
  bietet dafür noch keine Änderungs-Endpunkte. Bisher nur Anlegen und
  Statuswechsel.
- Bewertung/Verantwortlicher bei Abweichungen sind Freitext; ob „bewertet“ eine
  Bewertung zwingend verlangt (und Vier-Augen bei „geschlossen“), entscheidet
  bisher niemand → F-26.

Fragen an Planung:
- **F-24** (offen, siehe unten): Sitzungsdauer/Token-Laufzeit.
- **F-25** (vorläufig erledigt): alle genannten Workflows sind jetzt da.
  Bitte Reihenfolge für Stammdaten-Bearbeitung festlegen.
- **F-26:** Pflichtfelder im CAPA-Ablauf: Muss beim Übergang auf „bewertet“
  eine Bewertung und bei „geschlossen“ Maßnahmen + eine zweite Person
  (Vier-Augen, nicht die erfassende) vorliegen? Heute erzwingt der Kern das
  nicht.

---

### 2026-10-17 – Admin-Oberfläche

**Admin-Oberfläche v1 – erledigt.** (Auf Toms Auftrag; Planung möge die
Aufgabe in `TASKS.md` nachziehen.)

**Fehlerkorrektur aus T-001 (wichtig):** Der Keycloak-Realm-Import enthielt ein
Feld `comment`, das Keycloak nicht kennt – Keycloak brach beim Start ab. Damit
lief Keycloak über `pnpm stack:up` seit T-001 nie wirklich. Unbemerkt, weil ich
damals nur die Compose-Syntax geprüft und Keycloak nicht gestartet hatte.
Behoben (Feld entfernt, Erläuterung nach `infra/keycloak/README.md`); jetzt
end-to-end mit echtem Login getestet. Außerdem Keycloak-Image auf Docker Hub
(`keycloak/keycloak`, identisch) umgestellt – quay.io ist aus der Cloud-Session
nicht erreichbar.

Erledigt:
- `apps/admin`: **Next.js 15.5** (App Router) mit **next-auth v4** (stabil; v5
  ist noch Beta) und **Keycloak-Login (Authorization Code + PKCE)**.
  Zugriffstoken bleibt im verschlüsselten Sitzungs-Cookie auf dem Server, an
  den Browser gehen nur Anzeigedaten. Daten kommen ausschließlich über die
  Kern-API; Rechte und Audit Trail setzt weiterhin der Kern durch.
- **Zugangsschutz** per Middleware: nur interne Rollen (`admin`, `ops`,
  `qa_approver`, `dpo`); Kundenrollen landen auf „Kein Zugriff". Abmelden
  beendet auch die Keycloak-Sitzung (nur per POST).
- **Bereiche:** Übersicht (Kennzahlen, offene Alarme, fällige Kalibrierungen und
  Führerscheine), Fahrzeuge + Akte (Buchbarkeit, Statuswechsel nach erlaubten
  Übergängen), Kunden + Fahrer (Führerschein-Fristen), Mieten + gebundener
  Temperaturnachweis, Rechnungen, Alarme (quittieren/schließen), Abweichungen.
  Listen mit Statusfilter und Blättern; deutschsprachig, barrierearm
  (Sprunglink, Beschriftungen, sichtbarer Fokus), schmale Bildschirme berücksichtigt.
- **Keycloak-Realm** um Client `rent2cool-admin` (PKCE) und erfundene
  Testnutzer erweitert (D-015: Testnutzer im Testsystem): `admin.dev`, `ops.dev`,
  `qa.dev`, `kunde.dev`, Passwort `PLACEHOLDER_dev_passwort`. Token-Laufzeit
  15 Min.
- **Tests:** 24 Unit-Tests in der CI (Formatierung inkl. Zeitzone, API-Client,
  Token-/Rollenauswertung, Seiten-/Fristenhelfer). **Browser-Test (Playwright)
  lokal gegen den echten Stack grün (5):** Umleitung ohne Anmeldung; Login als
  admin über Keycloak und alle Bereiche inkl. Detailseiten; Alarm quittieren
  (Eintrag im Audit Trail geprüft); Kundenrolle ohne Zugang; Abmelden beendet
  die Keycloak-Sitzung. Der Build läuft ohne `.env` (wie in der CI).

Bewusste Entscheidungen/Abkürzungen:
- **Keine Token-Erneuerung**: Läuft das Zugriffstoken ab (15 Min.), geht es
  über die Keycloak-Sitzung (SSO) zur erneuten Anmeldung. Spart Refresh-Logik
  und Cookie-Größe; für den Alltag ggf. zu häufig → F-24.
- **v1 ist überwiegend lesend**: Aktionen nur für Alarm quittieren/schließen und
  Fahrzeugstatus. Formulare zum Anlegen (Fahrzeug, Kunde, Buchung, Rechnung,
  Abweichung bewerten) fehlen noch – die API dafür existiert.
- Listen zeigen bei Mieten Kurz-IDs statt Namen (vermeidet N+1-Abfragen);
  ein Listen-Endpunkt mit Namen im Kern wäre die saubere Lösung.
- Browser-Test läuft **nicht in der CI** (braucht Keycloak + Kern + DB).
- Der lokale Datenbestand stammt aus den Integrationstests (Fantasie-Kennzeichen
  wie „T-a81f7791"). Für Vorführungen wäre ein Demo-Seed mit realistischen
  Fantasiedaten sinnvoll.

Fragen an Planung:
- **F-24:** Sitzungsdauer/Token-Laufzeit für interne Nutzer (15 Min. + SSO,
  oder längere Sitzung mit Token-Erneuerung)?
- **F-25:** Welche Bearbeitungs-Workflows in der Oberfläche zuerst (z. B.
  Fahrzeug anlegen + Kalibrierung erfassen, Buchung anlegen, Abweichung
  bewerten)?

---

### 2026-10-16 – Alarme & Abweichungen

**Alarme & Abweichungen – erledigt.** (Letzter Punkt der Phase-1-Reihenfolge
dieser Session; Planung möge die Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- Migration `0007_alarm_abweichung`: **Alarm** (T-002 §4.13) und **Abweichung**
  (§4.14, CAPA) mit Mandantbezug und Indizes. Alarme sind über
  `(fahrzeug_id, nachricht_id, typ)` eindeutig → idempotent bei Neuzustellung.
- **Statusmodelle** Alarm und Abweichung sowie die reine Auswertung
  `findeAlarmKandidaten` in `@rent2cool/shared` (Temperatur über/unter
  Profilgrenze, Tür offen).
- **Automatische Auswertung im Telematik-Verarbeiter**: Nach dem Speichern einer
  neuen Nachricht wird sie gegen das Standard-Temperaturprofil des Fahrzeugs
  geprüft und Alarme werden angelegt. Profil je Fahrzeug gecacht (schlanker
  Hot-Path, D-003); best-effort – Fehler blockieren die Ingestion nicht.
- **API** (rollengeschützt, auditiert T-004): Alarme listen/lesen/quittieren/
  schließen; Abweichungen anlegen/listen/lesen und durch das CAPA-Verfahren
  führen (Bewertung, Maßnahmen, Verantwortliche; Rolle `qa_approver`).
- **Tests:** Unit grün in CI (Statusmodelle, Alarm-Auswertung). Integration
  lokal grün: Alarme aus einer Nachricht (2), Neuauswertung idempotent (0 neue),
  quittieren/schließen; Abweichung komplett bis `geschlossen`; unerlaubter
  Übergang abgewiesen. Gesamte Core-Suite: 53 Tests grün (Unit + Integration).

Bewusste Entscheidungen/Abkürzungen:
- Die Verdrahtung Alarm-Auswertung ↔ Kafka-Consumer ist typgeprüft und gebaut,
  aber **nicht end-to-end über Kafka getestet** (Integrationstest prüft den
  AlarmService direkt). Beim nächsten Lasttest mitprüfen.
- Alarme werden noch **nicht automatisch der Miete zugeordnet** (`miete_id`
  bleibt leer); Zuordnung über Fahrzeug + Zeitraum ist möglich. Automatische
  Zuordnung braucht eine Lookup-Strategie für die aktive Miete (Last!).
- Profil kommt aus `standard_temperaturprofil` des Fahrzeugs; das Profil der
  aktiven Miete hat noch keinen Vorrang. Ohne Profil keine Temperatur-Alarme.
- Funkloch-, Grenzübertritts- (D-006) und Kalibrierungs-Alarme sind als Typen
  angelegt, werden aber noch nicht erzeugt.
- **Vier-Augen-Prinzip** bei Abweichungs-Abschluss (D-015) ist noch nicht
  technisch erzwungen – nur die Rolle `qa_approver`.
- Alarm-Volumen bei 1.000 Mieten/Tag offen (F-8): normale Tabelle mit Indizes;
  ggf. später Zeit-Partitionierung.

Fragen an Planung:
- **F-22:** Welche Alarmregeln genau (Hysterese/Mindestdauer statt Einzelwert,
  Türöffnung nur außerhalb von Übergaben, Eskalation/Benachrichtigung)?
- **F-23:** Vier-Augen-Prinzip für Abweichungen: Wer darf bewerten, wer
  schließen (zwei verschiedene Personen)?

---

### 2026-10-16 – Rechnung

**Rechnung – erledigt.** (Fortlaufende Phase-1-Arbeit; Planung möge die Aufgabe
in `TASKS.md` nachziehen.)

Erledigt:
- Migration `0006_rechnung`: **Rechnung** (R-63) aus einer Miete; Beträge in
  ganzen Cent; Rechnungsnummer je Mandant eindeutig; eine Rechnung je Miete
  (Unique auf `miete_id`). Plus `rechnung_sequenz` für fortlaufende Nummern.
- **Statusmodell + Betragslogik** in `@rent2cool/shared` (`rechneBetraege`,
  `formatRechnungsnummer`): kaufmännische Rundung, Format `JAHR-00001`.
- **Service** (Kern): Rechnung nur aus **beendeter** Miete; Umsatzsteuer über
  konfigurierbaren Satz (D-006/R-63, Standard 19 %); **atomare, fortlaufende
  Rechnungsnummer** je Mandant/Jahr via Upsert-Increment (race-sicher). Beim
  Stellen wird die Miete auf `abgerechnet` gesetzt. Doppelrechnung je Miete
  ausgeschlossen.
- **API** (rollengeschützt, auditiert T-004): anlegen, listen, lesen, Status.
- **Tests:** Unit grün in CI (Statusübergänge, Steuerberechnung/Rundung,
  Nummernformat). Integration lokal grün: Rechnung aus beendeter Miete
  (korrekte Steuer, Nummernformat), Duplikatschutz, Ablehnung für nicht
  beendete Miete, fortlaufende Nummern.

Bewusste Entscheidungen/Abkürzungen:
- **Netto wird eingegeben** (kein automatisches Pricing), weil das Tarifmodell
  noch offen ist (F-21). Automatische Berechnung aus dem Tarif folgt mit dem
  Tarifmodell.
- **Eine Rechnung je Miete** (v1). Sammelrechnung ist offen (F-7).
- Umsatzsteuersatz pauschal (konfigurierbar); genaue USt-Logik (Ausland,
  Reverse-Charge) vom Steuerberater bestätigen (R-63).
- Steuerliche **Aufbewahrungsfrist** noch offen (F-2) – betrifft die Rechnung.

Fragen an Planung:
- **F-21:** Tarifmodell (Stunden/Tage/Wochen) für automatisches Pricing?
- **F-7:** Eine Rechnung je Miete oder Sammelrechnung (mehrere Mieten)?

---

### 2026-10-16 – Buchung/Miete

**Buchung/Miete – erledigt.** (Fortlaufende Phase-1-Arbeit; Planung möge die
Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- Migration `0005_miete`: **Miete** (D-009) mit Bezügen zu Kunde, Fahrzeug,
  Fahrer, Standorten; `idempotency_key` pro Mandant eindeutig (Teilindex), plus
  Status-/Zeit-Indizes.
- **Statusmodell Miete** in `@rent2cool/shared` (docs/datenmodell.md §5.2).
- **Buchungsregeln** beim Anlegen (Kern): Kunde freigegeben (D-010);
  Auslandsfahrt ⇒ nur Fahrzeug mit Fahrtenschreiber (D-006); Fahrzeug buchbar
  (Fahrzeugakte); Fahrer einsatzbereit (R-22); keine Doppelbuchung im Zeitraum.
  Bei Verstoß Ablehnung mit Gründen; bei Erfolg Bestätigung.
- **Idempotenz** über `idempotencyKey` (D-003): gleicher Key liefert dieselbe
  Miete (inkl. Schutz gegen Race über Unique-Constraint).
- **Temperaturnachweis an Miete gebunden**: `GET /v1/mieten/:id/temperaturnachweis`
  leitet Fahrzeug + Zeitfenster aus der Miete ab (Ist-Zeiten, sonst geplant).
- Wiederverwendung statt Duplikat: Fahrzeug-/Kunde-/Bericht-Service werden
  importiert (Module-Grenzen), nicht neu implementiert.
- **Tests:** Unit grün in CI (Statusübergänge Miete). Integration lokal grün (5):
  Ablehnung bei nicht freigegebenem Kunden; Ablehnung Auslandsfahrt ohne Tacho;
  erfolgreiche Buchung + Idempotenz + Doppelbuchungsschutz; Status-Lebenszyklus
  bis abgerechnet; Temperaturnachweis zur Miete.

Bewusste Entscheidungen/Abkürzungen:
- `POST /v1/mieten` erzeugt **direkt eine bestätigte** Buchung (Regeln erfüllt).
  Der Zustand `angefragt` bleibt im Modell für einen späteren
  „Anfrage-vor-Bestätigung"-Ablauf (Portal). → Planung: gewünscht?
- `aktiv`/`beendet` werden derzeit per Status-Endpunkt gesetzt; später treibt
  die **Übergabe/Rücknahme** (D-014, App) diese Übergänge.
- Doppelbuchungs-Prüfung liest den committeten Stand; echte
  Nebenläufigkeits-Absicherung (Transaktions-Sperre/Exclusion-Constraint) ist
  für hohe Last noch zu ergänzen. → F-20.

Fragen an Planung:
- **F-20:** Soll gegen gleichzeitige Doppelbuchung eine DB-Sperre/
  Exclusion-Constraint her (bei 1.000 Mieten/Tag relevant)?
- **F-21:** Tarifmodell (Stunden/Tage/Wochen, D-009) – welche Felder/Regeln
  braucht die Abrechnung (→ Rechnung)?

---

### 2026-10-16 – Kunden & Fahrer

**Kunden & Fahrer – erledigt.** (Fortlaufende Phase-1-Arbeit auf Toms Ansage;
Planung möge die Aufgabe in `TASKS.md` nachziehen.)

Erledigt:
- Migration `0004_kunde_fahrer`: **Kunde** (Firmenkunde, D-010) und **Fahrer**
  (gehört zum Kunden, D-004) mit Mandantbezug, Indizes und
  Führerschein-Ablaufindex.
- **Statusmodelle** Kunde und Fahrer in `@rent2cool/shared` (docs/datenmodell.md
  §5.3/§5.4); Statuswechsel prüfen die erlaubten Übergänge.
- **Fahrerlaubnis-Prüfung (R-22)** in `shared`: `bewerteFahrerEinsatz` +
  Führerscheinklassen-Abdeckung (`klasseDeckt`). Ein Fahrer ist einsatzbereit,
  wenn er `freigegeben` ist, sein Führerschein gültig ist und seine Klasse die
  vom Fahrzeug geforderte Klasse deckt.
- **API** (rollengeschützt, auditiert T-004): Kunde anlegen/listen/lesen/Status;
  Fahrer je Kunde anlegen/listen/Status; `einsatzbereit` (gegen ein Fahrzeug);
  `faellige-fuehrerscheine` (Fristenüberwachung, Sperre bei Ablauf).
- **Tests:** Unit grün in CI (Status Kunde/Fahrer, Klassen-Abdeckung,
  Einsatz-Bewertung). Integration lokal grün: Kunde- und Fahrer-Freigabe,
  Einsatzbereitschaft gegen ein Fahrzeug (inkl. Sperre), fällige Führerscheine.

Bewusste Entscheidungen/Abkürzungen:
- **Führerscheinklassen-Abdeckung** ist vereinfacht modelliert (B/BE/C1/…);
  exakte Zuordnung von der Planung zu bestätigen (F-19).
- **Identitätsprüfung** ist noch ein Status-Feld (`identitaetspruefung_status`)
  mit Fake-Ablauf (D-015: Identitätsprüfung als Schnittstelle mit
  Fake-Implementierung); echte Anbindung später.
- Fahrer-Personendaten nur als Testdaten (D-015); Löschkonzept weiter offen (F-3).

Fragen an Planung:
- **F-19:** Verbindliche Führerscheinklassen-Zuordnung (welche Klasse darf welche
  zul. Gesamtmasse / welches Fahrzeug)?
- Weiterhin: F-3 (Fahrer-Datenschutz/Löschung), F-1 (Mandant).

---

### 2026-10-16 – Fahrzeugakte

**Hinweis an die Planung:** Auf Toms Ansage „es muss eh alles gemacht werden,
fahr in sinnvoller Reihenfolge fort" baue ich die Kernsysteme der Phase 1 ab.
Reihenfolge: **Fahrzeugakte → Kunden & Fahrer → Buchung/Miete → Rechnung →
Alarme & Abweichungen.** Das Datenmodell (T-002) ist formal noch nicht
freigegeben; ich nehme den Vorschlag (gestützt auf die freigegebenen
Entscheidungen D-004..D-012) als **Arbeitsgrundlage** und markiere Entscheidungen
hier. **Bitte diese Aufgaben in `TASKS.md` nachziehen** (T-004, Temperaturnachweis,
Fahrzeugakte …).

**Fahrzeugakte – erledigt.**

Erledigt:
- Migration `0003_fahrzeugakte`: Stammdaten-Basis **Mandant** und **Standort**
  (D-011) sowie **Fahrzeug**, **Aggregat**, **Sensor**, **Kalibrierung** mit
  Fremdschlüsseln, Indizes und Mandanten-/Standortbezug (D-003). Kennzeichen je
  Mandant eindeutig.
- **Statusmodell Fahrzeug** in `@rent2cool/shared` (erlaubte Übergänge wie in
  docs/datenmodell.md §5.1); Statuswechsel-Endpunkt prüft Übergänge.
- **API** (Kern, Schnittstelle zuerst): Akte anlegen (optional inkl. Aggregat +
  Sensoren), paginierte Liste (Filter Status/Standort, D-003), vollständige Akte,
  Statuswechsel, Kalibrierung erfassen, **Buchbarkeit** und
  **fällige Kalibrierungen** (Fristenüberwachung). Schreibzugriffe `ops`/`admin`,
  rollengeschützt und auditiert (T-004).
- **Fristen/Buchbarkeit (GDP):** Fahrzeug nur buchbar, wenn `verfuegbar` und
  jeder aktive Sensor eine gültige (nicht abgelaufene) Kalibrierung hat
  (EN 12830, R-08/R-09). Reine, getestete Logik.
- **Seed** legt den Platzhalter-Mandanten und `PLACEHOLDER_HQ` an (idempotent,
  D-015).
- **Tests:** Unit grün in CI (Statusübergänge, Buchbarkeitslogik). Integration
  lokal gegen den Stack grün (Akte anlegen → Status → Buchbarkeit über
  Kalibrierung; unerlaubter Übergang abgewiesen; fällige Kalibrierungen).

Bewusste Entscheidungen/Abkürzungen:
- **Mandant** aus dem Token-Claim; fehlt er, wird der Platzhalter-Mandant
  verwendet (D-015, hängt an F-1). Fahrzeuge referenzieren Mandant/Standort.
- **Kalibrierungen** sind derzeit änderbar (auditiert). Da sie Nachweis sind,
  ist später „append-only" zu erwägen (wie messwert/audit_event). → F-17.
- Temperaturprofil weiterhin aus Konfiguration (F-4), nicht als Fahrzeug-FK.

Fragen an Planung:
- **F-17:** Sollen Kalibrierungen unveränderbar sein (append-only), analog zu
  Messwerten/Audit?
- **F-18:** Welche weiteren Fristen gehören an die Fahrzeugakte (HU/TÜV,
  Wartung, Versicherung) und mit welchen Vorlauf-Warnungen?
- Weiterhin: F-1 (Mandant), F-2 (Aufbewahrung), F-5 (Aggregat↔Fahrzeug 1:1 vs.
  Historie – aktuell 1:n über `eingebaut_am`/`ausgebaut_am` angelegt).

---

### 2026-10-16 – Temperaturnachweis v1

**Hinweis an die Planung:** Auch diese Aufgabe stand noch nicht in `TASKS.md`.
Tom hat sie beauftragt, nachdem die Freigabe des Datenmodells (T-002) aktuell
nicht möglich ist und die Fahrzeugakte daran hängt. Der Temperaturnachweis läuft
unabhängig vom offenen Datenmodell (nutzt die Messreihe aus T-003). **Bitte als
Aufgabe (z. B. T-005) formal in `TASKS.md` aufnehmen.** Vorgabe von Tom:
„Hauptsache wir kommen weiter und alles möglichst modular, Formate etc. ohne
Weiteres änderbar."

**Temperaturnachweis v1 – erledigt.**

Gebaut (Kern-API, Schnittstelle zuerst):
- `GET /v1/temperaturnachweis` berechnet den Nachweis (Kennzahlen min/max/mittel,
  Grenzverletzungen ggü. Temperaturprofil, Lücken/Funklöcher, Signatur) und gibt
  JSON zurück. `POST` erzeugt + rendert + legt ab und gibt die Referenz zurück
  (auditiert, auf dem T-004-Fundament; Rollen gesetzt).
- **Modular** (Toms Vorgabe): austauschbar über Interfaces —
  `NachweisRenderer` (Format; v1 JSON, PDF/CSV später als weiterer Renderer),
  `BerichtSpeicher` (Ablage; v1 In-Memory, S3/MinIO als Austausch) und
  `Signierer` (Fälschungssicherheit; v1 HMAC-Platzhalter, später PKI). Wechsel
  erfordert keine Änderung an Service/Controller.
- Berechnung ist eine reine Funktion (`berechneNachweis`) → gut testbar; DB-Zugriff
  gefiltert nach Fahrzeug/Messgröße/Zeit mit Reihenfolge (D-003: nie unbegrenzt).
- **Tests:** Unit grün in CI (Berechnung inkl. Grenzverletzung/Lücke/leer/Signatur,
  JSON-Renderer, Registry). Integration lokal gegen den Stack grün: Messwerte
  eingefügt → Nachweis mit Grenzverletzung, Lücke und Signatur, abgelegt.

Bewusste Entscheidungen/Abkürzungen (bis Go-live bzw. Planungs-Freigabe):
- **Bezug Fahrzeug + Zeitraum**, noch nicht Miete (Miete gehört zum offenen
  Datenmodell T-002). Bindung an Miete folgt nach Freigabe – API-Form bleibt.
- **Temperaturprofile aus Konfiguration** (`KonfigProfilQuelle`, Profile 2–8/
  15–25 °C, D-008), nicht aus einer DB-Tabelle, um das Datenmodell (F-4) nicht
  vorwegzunehmen. Quelle ist ein Interface → später DB-gestützt ohne Umbau.
- **Ablage v1 In-Memory**: Der produktive Weg ist S3/MinIO (D-003). Die
  `S3BerichtSpeicher`-Implementierung steckt man über dasselbe Interface ein;
  das MinIO-Image ließ sich in dieser Umgebung derzeit nicht ziehen (Registry
  verweigert), daher S3 noch nicht integrationsgetestet.
- **Ausgabeformat v1 JSON**; PDF ist ein weiterer Renderer (bewusst später).
- Signatur-Schlüssel ist ein gemeinsamer HMAC-Platzhalter (D-015).

Fragen an Planung:
- **F-15:** Pflichtinhalte/Layout des Nachweises für die QA-Abteilungen der
  Kunden (was muss drin sein, welches Format – PDF?), damit v2 passt?
- **F-16:** Wird der Nachweis je Miete automatisch nach Rückgabe erzeugt und dem
  Kunden zugestellt (Roadmap-Verkaufsargument) – welcher Auslöser/Kanal?
- Weiterhin: F-2 (Aufbewahrung) betrifft auch die Nachweis-Ablage; F-4
  (Temperaturprofil als Entität).

---

### 2026-10-16 – T-004 (Rollen + Audit Trail)

**Hinweis an die Planung:** Diese Aufgabe stand noch nicht in `TASKS.md`. Tom
hat sie in der Umsetzungs-Session beauftragt (nächster Roadmap-Schritt, Phase 0:
„Rollen, Audit Trail"; zugleich CLAUDE.md „ab dem ersten Commit Pflicht"). Ich
lege in `TASKS.md` regelkonform selbst keine Aufgaben an – **bitte T-004 dort
formal mit Akzeptanzkriterien aufnehmen.** Gebauter Scope und Akzeptanz siehe
unten.

**T-004 Rollen + Audit Trail – erledigt (Fundament).**

Erledigt:
- **Authentifizierung** (`apps/core/src/auth`): Keycloak-Zugriffstoken (JWT)
  werden geprüft (RS256 über JWKS des Issuers, Issuer + Ablauf). Daraus entsteht
  der `Principal` (Akteur, Rollen, optional Mandant aus Claim `mandant_id`).
  Der Key-Resolver ist injizierbar → ohne echten Keycloak testbar.
- **Autorisierung**: Rollenmodell in `@rent2cool/shared` (admin, ops, dpo,
  qa_approver, kunde_dispo, kunde_qa, fahrer – deckungsgleich mit dem
  Keycloak-Realm). `JwtAuthGuard` + `RolesGuard` **global** via `APP_GUARD`
  erzwungen; `@Public()` nur für `/health*`, `@Roles(...)` je Route.
- **Audit Trail**: Migration `0002_audit` legt `audit_event` an (append-only
  per Trigger). `AuditService.protokolliere()` für präzise alt/neu-Einträge aus
  dem Fachmodul; `AuditInterceptor` als Backstop protokolliert jede erfolgreiche
  `@Audited(...)`-Route **vor** der Antwort (kein Verlust).
- **Nachweis**: geschützter, auditierter Demo-Endpunkt
  `POST /v1/admin/audit-demo` (Rolle `admin`). Klar als temporär markiert
  (TODO), nimmt das noch offene Datenmodell (T-002) nicht vorweg.
- **Tests:** Unit grün in CI (JWT-Verifikation inkl. Ablauf/Issuer/Rollenfilter,
  RolesGuard, AuditService). Integration lokal gegen den Stack grün (5 Tests):
  `/health` bleibt öffentlich (200), ohne Token 401, falsche Rolle 403, admin
  202 **mit geschriebener Audit-Zeile** (korrekter Akteur, neuer Wert),
  `audit_event` lehnt UPDATE ab (append-only).

Offen / Abkürzungen bis Go-live:
- Der **Demo-Endpunkt** ersetzt noch kein echtes GDP-Modul; er wird mit der
  ersten Fachfunktion (z. B. Fahrzeugakte) abgelöst. Die automatische
  Audit-Protokollierung ist dort je schreibender Aktion über `@Audited` bzw.
  `AuditService` anzuwenden.
- **Mandant im Audit** kommt aus dem Token-Claim `mandant_id` (noch Platzhalter,
  hängt an F-1). `audit_event.mandant_id` ist bewusst `text`, damit der
  Audit-Sink nie am Claim-Format scheitert.
- `audit_event` wächst stark (jede Schreibaktion); Partitionierung/Retention wie
  bei `messwert` später als Policy (F-2).

Fragen an Planung:
- **F-13:** Verbindlicher Katalog der Audit-`aktion`-Werte und `entitaet_typ`-
  Namen (für auswertbare, revisionssichere Audit-Trails)?
- **F-14:** Soll auch **lesender** Zugriff auf besonders sensible GDP-Daten
  auditiert werden (Zugriffsprotokoll), oder nur schreibender?
- Weiterhin offen: F-1 (Mandantenbegriff) bestimmt `mandant_id` im Audit.

---

### 2026-10-16 – T-003

**T-003 Telematik-Simulator und Eingang – erledigt.**

Gebauter Datenweg: Simulator → Eingang (`apps/ingest`) → Warteschlange
(Kafka/Redpanda) → Verarbeiter (Kern) → unveränderbare Messreihe
(TimescaleDB-Hypertable).

Erledigt:
- **Neutrales Adapter-Format + Signatur** in `packages/shared`
  (`telemetry.ts`): Zod-Schemas, HMAC-SHA256 über die exakte Payload, reine
  Prüffunktion. Schlüssel ist Platzhalter bis Anbieterwahl (D-015).
- **`apps/ingest`** (Fastify, eigener Prozess): nimmt Nachrichten an, prüft
  Format (400) und Signatur (401), vergibt **keine eigenen IDs**, schreibt nur
  in die Warteschlange (keyed nach `fahrzeugId`), antwortet mit 202. Health/
  Readiness vorhanden. `publish` ist injizierbar → ohne Kafka testbar.
- **Verarbeiter im Kern** (`apps/core/src/telemetry`): Kafka-Consumer liest aus
  `telemetry.raw`, erkennt Duplikate über `nachrichtId` und schreibt Messwerte
  append-only in die Hypertable `messwert`. Dedup-Eintrag und Messwerte in
  **einer Transaktion** (atomar) → at-least-once + idempotent = effektiv
  exactly-once-Speicherung. Consumer über `TELEMETRY_CONSUMER_ENABLED`
  schaltbar (aus in Tests/CI).
- **Migration `0001_telemetrie`**: `messwert` als TimescaleDB-Hypertable
  (Tages-Chunks), Dedup-Ledger `telemetrie_nachricht`, Indizes, und ein
  **Append-only-Trigger** (UPDATE/DELETE je Zeile werden abgewiesen).
- **`tools/simulator`**: virtuelle Fahrzeuge (Profile 2–8 °C und 15–25 °C,
  D-008), Türöffnungen, **Funklöcher mit Nachlieferung**, **Ausreißer** für
  Alarmtests, gezielte Duplikate; Lasttest-/Burst-Modus mit Durchsatzmessung.
- **Tests:** Unit grün in der CI (shared Signatur/Format, Eingang 202/400/401,
  Simulator-Generator). Integration lokal gegen den Stack grün (Dedup:
  zweimal dieselbe Nachricht → 1× gespeichert, 2× Duplikat; Append-only:
  UPDATE wird abgewiesen).

**Lasttest-Ergebnis (lokaler Docker-Stack, Einzelinstanz je Dienst):**
- Eingang: 8.389 Nachrichten (8.000 eindeutig + 389 Duplikate, 10 %
  Funkloch-Anteil) in 5,9 s angenommen, 0 abgelehnt, 0 Fehler →
  **~1.400 Nachrichten/s** Annahmedurchsatz (bis ~1.740/s im reinen Senden).
- Verarbeiter: 8.000 eindeutige Nachrichten → **80.000 Messwerte** in ~26 s
  gedrängt (**~300 Nachr./s** Schreibpfad, Einzel-Consumer). Die 389 Duplikate
  wurden verworfen (keine Doppelspeicherung).
- Einordnung D-003: Eine Minute Last von 4.000 Fahrzeugen = 4.000 Nachrichten;
  Annahme in ~2,3 s, Verarbeitung in ~13 s – also weit unter 60 s, klare
  Reserve. Skaliert horizontal über mehr Consumer auf den 6 Partitionen
  (zustandslos) und mehr Partitionen.

**Verlustfreiheit / keine Doppelung bei Neustart (nachgewiesen):**
- Eingang aus → 4.000 Nachrichten gesendet, in Kafka gehalten, DB blieb 0
  (nichts verloren, nichts verarbeitet).
- Verarbeiter gestartet, mitten im Drain **hart gekillt** (`kill -9` bei
  635/4.000), neu gestartet → Endstand exakt **4.000 Nachrichten / 40.000
  Messwerte / 4.000 eindeutige IDs / 0 Nachrichten mit ≠10 Werten**. Kein
  Verlust, keine Doppelung.
- Der Eingang ist zustandslos (schreibt nur in Kafka); ein Neustart verliert
  nichts bereits Angenommenes. In-flight-HTTP-Anfragen während eines
  Eingang-Absturzes bekommen kein 202 und werden vom Client (App/Simulator)
  wiederholt.

Offen / Abkürzungen bis Go-live (in der Reihenfolge der Dringlichkeit):
- **Kompression + Aufbewahrung** der Hypertable noch nicht als Policy gesetzt
  (hängt an den Fristen, Frage F-2). Beim Aktivieren der Kompression ist der
  Append-only-Trigger zu berücksichtigen (Timescale re-komprimiert intern).
- **Alarme** (Temperatur außerhalb Profil, Tür offen, Funkloch, Grenzübertritt
  ohne Tacho) werden noch nicht erzeugt/gespeichert – der Simulator liefert
  bereits Ausreißer dafür. Eigene Aufgabe (Alarmauswertung, Abweichungen).
- **Signatur-Schlüsselverwaltung**: aktuell ein gemeinsamer HMAC-Platzhalter
  (D-015). Für echte Boxen pro-Gerät-Schlüssel/PKI nötig.
- Reihenfolge je Fahrzeug ist über Partition-Key `fahrzeugId` gewahrt; eine
  echte Mehr-Consumer-Messung steht noch aus (Einzel-Consumer getestet).

Fragen an Planung:
- **F-11:** Welche Messgrößen/Einheiten sind verbindlich (Katalog)? Aktuell
  frei als Text (`temperatur_laderaum`, `position_lat`, …). Soll das ein
  festes Enum/Register werden?
- **F-12:** Soll der Eingang zusätzlich pro Gerät authentifizieren (mTLS/Token)
  oder reicht die HMAC-Signatur der Nachricht?
- Weiterhin offen aus T-002: F-2 (Aufbewahrungsfristen) betrifft direkt die
  Hypertable-Retention.

---

### 2026-10-16 – T-001, T-002

**T-001 Repo-Grundgerüst – erledigt.**

Erledigt:
- Monorepo (pnpm Workspaces + Turborepo, TypeScript strikt, D-001): `apps/core`,
  `apps/ingest`, `apps/admin`, `apps/web`, `apps/mobile`, `packages/shared`.
  Die vier letztgenannten Apps sind bewusst leere Gerüste (Ausbau in eigenen
  Aufgaben; `apps/ingest` in T-003).
- `apps/core` als lauffähiges NestJS-Grundgerüst mit Fastify-Adapter:
  Liveness `GET /health` und Readiness `GET /health/ready`, Konfiguration
  ausschließlich aus Env mit Zod-Validierung (startet nur mit gültiger Env),
  strukturierte JSON-Logs (pino) und OpenTelemetry-Grundkonfiguration (nur aktiv,
  wenn `OTEL_EXPORTER_OTLP_ENDPOINT` gesetzt ist).
- `docker-compose.yml`: PostgreSQL+TimescaleDB, Redpanda (Kafka-API), Valkey,
  MinIO (+ Bucket-Setup), Keycloak (Realm-Import). Ein Befehl: `pnpm stack:up`.
- Migrationswerkzeug (drizzle-kit) eingerichtet, erste **leere** Baseline-Migration
  `0000_baseline` (Schema folgt erst nach T-002-Freigabe). Runner `db:migrate`.
- Platzhalter nach D-015 als Konfiguration: `.env.example` (nur lokale
  Platzhalterwerte, keine echten Secrets; Domain `rent2cool.example`), Seed mit
  `PLACEHOLDER_HQ` und `PLACEHOLDER_DPO`.
- ESLint + Prettier + Vitest, Beispieltests (Health-Controller, Platzhalter-Seed,
  `shared`). GitHub-Actions-CI (`.github/workflows/ci.yml`): bei jedem Push
  install → lint → typecheck → test → build.
- README mit lokalem Start in wenigen Befehlen.
- **Lokal verifiziert grün** mit denselben Befehlen wie die CI (install
  `--frozen-lockfile`, lint, typecheck, test: 9 Tests, build) und zusätzlich echter
  App-Boot mit funktionierenden Health-/Readiness-Antworten (JSON, UTC).
- **CI auf GitHub Actions nach dem Push bestätigt grün** (Lauf 38871685328:
  install → lint → typecheck → test → build alle erfolgreich). Akzeptanz-
  kriterium „CI ist grün“ erfüllt.

**T-002 Vorschlag Datenmodell v0 – erledigt.**

Erledigt:
- `docs/datenmodell.md` als Vorschlag (keine Migration): alle geforderten
  Entitäten inkl. Statusmodelle (Fahrzeug, Miete, Kunde, Fahrer, Abweichung) mit
  erlaubten Übergängen, GDP-Flag je Entität, Mandant/Standort/Region (D-003/D-011),
  Berücksichtigung von D-004–D-011, Mengengerüst und Indizes/Partitionen bei
  1.000 Mieten/Tag, ER- und State-Diagramme in Mermaid.

Offen:
- Aufbewahrungsfristen GDP/Steuer offen gelassen (siehe Fragen F-2).
- Abkürzung/Technische Schuld bis Go-live: Readiness prüft derzeit nur, dass die
  Konfiguration geladen ist – echte Checks auf DB/Warteschlange/Objektspeicher
  kommen mit den jeweiligen Modulen. OIDC/Keycloak-Realm, Identitätsprüfung,
  Signatur und Zahlung sind Platzhalter/Fakes (D-015).
- T-003 noch nicht begonnen (wie beauftragt).

Fragen an Planung (aus T-002, Details in `docs/datenmodell.md` Abschnitt 7):
- **F-1 Mandantenbegriff:** `mandant_id` = Betreiber (so vorgeschlagen) oder =
  Firmenkunde?
- **F-2 Aufbewahrungsfristen:** Fristen für GDP-Nachweise (Messreihe, Kalibrierung,
  Übergabe, Alarm, Abweichung, AuditEvent) und für Rechnungen (Steuerrecht, R-63)?
- **F-3 Fahrer-Personendaten:** zulässiger Umfang, Speicherdauer und Löschkonzept
  (Datenminimierung; abhängig vom DSB, D-015-Platzhalter `dpo`)?
- **F-4 Temperaturprofil** als eigene Entität (nötig wegen D-008) ok?
- **F-5 Aggregat ↔ Fahrzeug:** fest verbaut (1:1) oder wechselnder Aufbau mit
  Historie (1:n über Zeit)?
- **F-6 Messreihe-Dedup:** separater Dedup-Ledger oder Unique-Constraint auf
  `(nachricht_id, messgroesse)`? (betrifft auch T-003)
- **F-7 Rechnung ↔ Miete:** 1:1 oder Sammelrechnung?
- **F-8 Alarm-Volumen:** erwartete Rate – normale Tabelle oder zeit-partitioniert?
- **F-9 Region/EU-Zonen (D-003):** `region` als Attribut je Datensatz vs. getrennte
  DB je Zone?
- **F-10 Geofence:** einfacher Kreis vs. PostGIS-Polygon mit räumlichem Index?

Außerdem zur Umgebung:
- Beim Sessionstart war kein Repository eingebunden; `TLM97/rent2cool` wurde nach
  Rückfrage nachgezogen. Für künftige Cloud-Sessions das Repo direkt beim Start
  auswählen.

---

### 2026-10-16 – Setup

Erledigt: Repo angelegt, Übergabedateien und CLAUDE.md eingerichtet (durch Planung).
Offen: T-001, T-002.
Fragen an Planung: keine.
