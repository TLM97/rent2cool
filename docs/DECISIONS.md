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
