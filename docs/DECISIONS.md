# Entscheidungen

Jede Architektur- oder Technikentscheidung bekommt einen Eintrag. Claude Code darf Einträge mit Status `vorgeschlagen` anlegen, freigegeben wird in der Planung. Dient zugleich als Nachweis für die Validierung (R-10).

Status: `vorgeschlagen` · `freigegeben` · `verworfen` · `ersetzt durch D-xxx`

---

## D-001 Technik-Stack

- **Status:** vorgeschlagen
- **Vorschlag:** Eine Sprache durchgängig. TypeScript, Node-Backend, PostgreSQL mit Zeitreihen-Erweiterung für Messwerte, Next.js für Website, Portal und Admin, React Native für iOS und Android. Hosting in einem EU-Rechenzentrum (R-44).
- **Alternative:** Backend in Python, Rest gleich.
- **Kriterium:** Was Tom allein dauerhaft warten kann.
- **Entscheidung durch:** Tom

## D-002 Architekturform

- **Status:** freigegeben
- **Inhalt:** Modularer Monolith mit einer Datenbank und einem Deployment. Website ohne Schreibzugriff auf GDP-Daten.
- **Begründung:** Kleines Team, einfacher zu validieren und zu betreiben.

## D-003 Auslegung auf 1.000 Mieten pro Tag

- **Status:** freigegeben (Vorgabe Tom, 2026-10-16)
- **Inhalt:** Die gesamte IT wird ab Tag 1 für 1.000 Mieten pro Tag ausgelegt. Annahmen für die Dimensionierung: 3.500–4.000 Fahrzeuge, 1 Telematik-Nachricht pro Minute je Fahrzeug mit ca. 10 Messwerten (rund 6 Mio. Nachrichten am Tag), rund 120 GB Fotos am Tag, Betrieb rund um die Uhr.
- **Folgen:** Warteschlange vor dem Telematik-Eingang, partitionierte Zeitreihen, Objektspeicher mit Speicherklassen, zustandslose Server, idempotente APIs, offline-fähige App bei Übergabe und Rückgabe, Standort und Mandant im Datenmodell, Infrastruktur als Code, Betrieb in mindestens zwei EU-Zonen, Lasttest in Phase 2.
- **Bewusst nicht:** Microservices, aktiv-aktiv über mehrere Regionen.
- **Kosten:** Ausgelegt heißt nicht bezahlt. Die Infrastruktur startet klein und wächst über Konfiguration, nicht über Umbau.

## D-004 Vermietung ohne Fahrer

- **Status:** freigegeben (Entscheidung Gründer, 2026-10-16)
- **Inhalt:** Wir vermieten nur Fahrzeuge, keinen Transport. Der Kunde stellt den Fahrer.
- **Folgen:** Keine Güterkraftverkehrserlaubnis, keine Lenk- und Ruhezeiten für uns (R-24). Die Prüfung der Fahrerlaubnis jedes Fahrers des Kunden ist eine Kernfunktion: Identität, Klasse gegen Fahrzeuggewicht, wiederkehrende Prüfung, Sperre bei Ablauf (R-22). Die GDP-Verantwortung für die Ware bleibt beim Kunden; wir bleiben qualifizierter Dienstleister mit Qualitätsvereinbarung (R-01). Im Datenmodell gibt es keine eigenen Fahrer als Mitarbeiter, nur Fahrer, die zu einem Kunden gehören.
