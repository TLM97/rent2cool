# Keycloak-Realm (lokal)

`rent2cool-realm.json` wird beim Start von `docker compose` importiert
(`start-dev --import-realm`). Platzhalter-Realm für die lokale Entwicklung
(D-005/D-015):

- Realm-Rollen wie im Kern (`admin`, `ops`, `dpo`, `qa_approver`,
  `kunde_dispo`, `kunde_qa`, `fahrer`). Rechte setzt der Kern durch (D-001).
- Clients: `rent2cool-core` und `rent2cool-admin` (Admin-Oberfläche, PKCE).
- Nur **erfundene Testnutzer** mit Platzhalter-Passwort
  `PLACEHOLDER_dev_passwort`: `admin.dev`, `ops.dev`, `qa.dev`, `kunde.dev`.
  Keine echten Zugangsdaten, nur lokal verwenden.

Hinweis: Keycloak akzeptiert in der Import-Datei keine unbekannten Felder
(z. B. `comment`) – Erläuterungen gehören in diese README.
