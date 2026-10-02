# Risk – Domination Web

Brettspiel im Browser für 2–6 Spieler, mit Hotseat, Einladungslinks und lokalen Computergegnern. Enthält klassische Regeln, Domination-Hausregeln, Missionen, Hauptstädte, mehrere Karten, Gebäude und Einheitenerfahrung.

Neue Partien starten standardmäßig mit klassischen Risiko-Regeln, der klassischen Weltkarte und steigenden Kartenboni.

Diese Spielversion enthält keine LLM-Anbindung, Trainingsdienste oder Modellgewichte. Lokale Strategie-Bots, Ragnar und Klaus Störtebeker sind enthalten.

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

GPL-3.0, siehe [LICENSE](LICENSE). Herkunft der Karten, Sounds und geografischen Daten: [THIRD_PARTY.md](THIRD_PARTY.md). Unabhängiges Projekt; RISK/RISIKO ist eine Marke von Hasbro.
