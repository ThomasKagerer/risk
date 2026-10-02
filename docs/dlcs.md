# Mitgelieferte DLCs

Ein DLC ist ein Ordner unter `web/dlcs/<id>/`. Der Build nimmt alle dort liegenden Dateien automatisch in die Spielanwendung auf (`go:embed web`, auch im Docker-Build). Beim Start entdeckt und validiert der Server die Pakete. Die Oberfläche lädt Karten und Regelmodi über `/api/content`. Es gibt keinen Upload, Download oder Installationsdienst. Ein neues Paket wird vor dem Build in diesen Ordner gelegt; danach wird das Spiel neu gebaut und gestartet.

Das Grundspiel enthält die klassische Weltkarte und klassische Regeln. Die mitgelieferten Erweiterungen sind:

| Paket | Inhalt |
| --- | --- |
| `aufbau-eroberung` | Eine Karte mit derselben Geometrie wie die klassische Welt sowie die bisherigen Regeln mit Einheimischen, Burgen, Hauptstädten und Einheitenerfahrung. |
| `mini-world` | Mini-Welt, bestehende halbierte Kartenboni und angepasste Startarmeen; Mehrfachplatzierung beim Aufstellen. Keine eigenen Spielregeln. |
| `world-1700` | Welt um 1700 samt Landschaftsdaten; Mehrfachplatzierung beim Aufstellen. Keine eigenen Spielregeln. |
| `europe-1871` | Europa um 1871 samt Landschaftsdaten. Keine eigenen Spielregeln; die Startaufstellung bleibt unverändert. |

Regelmodi bleiben mit anderen verfügbaren Karten kombinierbar. Wer die Aufbau-Karte auswählt, bekommt deren Regelmodus vorgeschlagen. Klassisch bleibt die Voreinstellung. Im Aufstellen erlauben Mini-Welt und Welt um 1700 Figuren mit 1, 5 oder 10 Einheiten. Im Duell erhält die neutrale Armee weiterhin eine Einheit je zwei platzierte menschliche Einheiten. Reserven werden um die tatsächliche Anzahl vermindert.

## Paketformat

Jedes Paket benötigt `dlc.json` und mindestens eine Kartendatei:

```json
{
  "format": 1,
  "id": "meine-karte",
  "name": "Meine Karte",
  "version": "1.0.0",
  "maps": [
    { "id": "meine-karte", "file": "board.json", "multiPlacement": true }
  ]
}
```

Ordnername und Paket-ID müssen übereinstimmen. IDs bestehen aus Kleinbuchstaben, Ziffern und Bindestrichen und dürfen vorhandene Karten oder Regeln nicht überschreiben. Kartendateien haben dasselbe Format wie `web/assets/board.json`, einschließlich Geometrie, Nachbarschaften, Kontinenten und Karten. IDs von Ländern und Kontinenten beginnen bei 1; Karten-IDs bei 0. Nachbarschaften müssen gegenseitig sein.

Optionale Kartenfelder:

- `terrain`: Landschaftsdatei relativ zum Paketordner.
- `multiPlacement`: Figuren mit 5 und 10 Einheiten auch in der klassischen Startaufstellung erlauben.
- `cardDivisor`: Kartenboni ganzzahlig durch diesen Wert teilen.
- `scaleFrontier`: Startländer und Startarmee an die Größe einer kleinen Karte anpassen.
- `defaultRule`: Einen im selben Paket definierten Regelmodus bei Kartenauswahl vorschlagen.

`rules` ist optional. Regeln werden deklarativ über die Fähigkeiten der Engine beschrieben: `setup`, `goals`, `buildings`, `experience`, `revealedAttack`, `connectedMovement`, Baustufen und Bauzeiten, Sternschwellen sowie Wachstums- und Angriffsparameter der Einheimischen. Das vollständige Beispiel liegt in `web/dlcs/aufbau-eroberung/dlc.json`. Neue Mechaniken außerhalb dieser Fähigkeiten brauchen zusätzlich eine Engine-Erweiterung; ein Paket führt keinen eigenen Servercode aus.

Ein optionales `helpModule` verweist auf ein mitgebautes `.mjs`-Modul. Es exportiert `createRuleHelp({tr, fixedCardValues, progressiveCardValue, buildingNames})` und liefert eine Funktion für die Regelerklärung. Namen und Hilfetexte verwenden die bestehenden Sprachkataloge. Ohne eigenes Hilfemodul wird eine Zusammenfassung der tatsächlichen Regelfähigkeiten angezeigt.

## Kompatibilität

Die bisherigen Kennungen `domination`, `world120`, `simple-world` und `europe1871` bleiben bestehen. Alte Spielstände lösen ihre Regeln über das installierte Paket auf; neue Spielstände speichern zusätzlich die verwendete Regeldefinition. Die bisherigen Kartendatei-URLs bleiben über die Paketdaten lesbar. Ein fehlendes Kartenpaket wird beim Laden eines Spielstands als unbekannte Karte gemeldet. Ohne DLC-Ordner lädt das Grundspiel weiterhin; ungültige oder doppelte Pakete verhindern den Start mit einer konkreten Fehlermeldung.

Prüfen: `go test -race ./...` und `node --test tools/*.test.mjs`.
