# Weltspiel · Strategieatlas

Brettspiel im Browser für 2–6 Spieler, mit Hotseat, Einladungslinks und lokalen Computergegnern. Das Grundspiel enthält klassische Regeln und die Karte „Klassische Welt“. „Aufbau & Eroberung“, „Mini-Welt“, „Welt um 1700“ und „Europa um 1871“ werden als getrennte DLC-Pakete mitgeliefert.

Neue Partien starten standardmäßig mit klassischen Eroberungsregeln, der klassischen Weltkarte und steigenden Kartenboni.

Diese Spielversion enthält keine LLM-Anbindung, Trainingsdienste oder Modellgewichte. Lokale Strategie-Bots, Ragnar und Klaus Störtebeker sind enthalten.

## DLCs

Pakete liegen unter `web/dlcs/`, werden automatisch mitgebaut und beim Spielstart geladen. „Aufbau & Eroberung“ enthält Karte und eigene Regeln. Die beiden Karten-DLCs erlauben beim Aufstellen Figuren mit 1, 5 oder 10 Einheiten. Paketformat und Kompatibilität: [DLC-Dokumentation](docs/dlcs.md).

## Sprachen

Englisch ist die Standardsprache. Die Sprachauswahl unterstützt außerdem Deutsch, Französisch, Italienisch, Spanisch, vereinfachtes Chinesisch und Japanisch. Die Auswahl wird im jeweiligen Browser gespeichert; ein Wechsel lädt die Oberfläche neu und verbindet eine laufende Partie erneut.

Alle Texte liegen lokal unter `web/locales/`. Sie wurden im Spielkontext übersetzt; es werden keine Texte an Übersetzungsdienste gesendet. Spielernamen und Raumcodes bleiben unverändert. `web/i18n.mjs` übersetzt Oberflächentexte, Kartenbeschriftungen und ältere deutsche Servermeldungen, ohne das Spielstandformat zu ändern. Neue Texte müssen in allen sieben Katalogen ergänzt werden; Platzhalter `{0}`, `{1}` usw. bleiben erhalten. Die Sprachtests prüfen die Kataloge und dynamische Meldungen.

## Lokal starten

Go 1.23 oder neuer:

```sh
go run . -addr 127.0.0.1:8080
```

Öffne http://127.0.0.1:8080. Spielstände werden unter `data/` gespeichert.

## Docker

```sh
docker compose up --build -d
```

Standardport: 8080. Mit `PORT=8081 docker compose up --build -d` ändern. Spielstände liegen im Volume `games`.

## Prüfen

```sh
go test -race ./...
node --check web/app.js
node --test tools/*.test.mjs
```

## Lizenz und Quellen

GPL-3.0, siehe [LICENSE](LICENSE). Herkunft der Karten, Sounds und geografischen Daten: [THIRD_PARTY.md](THIRD_PARTY.md).

RISK und RISIKO sind Marken von Hasbro. Dieses unabhängige Projekt ist weder mit Hasbro verbunden noch von Hasbro autorisiert oder unterstützt. Die GPL gewährt keine Rechte an fremden Marken. Offene Prüfungen und Umfang der Bereinigung: [Rechteprüfung](docs/rights-review.md).
