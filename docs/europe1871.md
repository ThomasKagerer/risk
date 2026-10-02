# Europa um 1871

Eigenständige Spielkarte `europe1871`: 71 Gebiete, 73 Karten (inklusive zwei Joker), acht Bonusregionen und 15 gezeichnete Seeverbindungen. Kein Afrika, Amerika oder asiatisches Spielgebiet. Russland endet am östlichen Kartenrand. Der politische Bezug ist die zweite Hälfte von 1871, nach der deutschen Reichsgründung und dem Frieden von Frankfurt.

Die Karte ist historisch angenähert, kein wissenschaftlicher Grenzatlas. Große Staaten werden in benannte Spielregionen unterteilt. Deren innere Grenzen sind schematische Voronoi-Zellen an geographischen Ankern. Zum Beispiel ist „Baden und Württemberg“ eine gemeinsame Spielregion, kein damaliger Einzelstaat. Die acht Bonusregionen sind Spielgruppen und nicht immer souveräne Staaten: Großbritannien umfasst auch Irland entsprechend dem damaligen Vereinigten Königreich. Die acht Bonusregionen sind Nordeuropa, Großbritannien, Deutsches Reich, Balkan, Südeuropa (Iberien und Italien), Russisches Reich, Österreich-Ungarn und Westeuropa (Frankreich, Benelux und Schweiz).

## Geographische Grundlage

Die europäischen Staatsumrisse basieren auf André Ouredniks [Historical Basemaps](https://github.com/aourednik/historical-basemaps), Datei [world_1878.geojson](https://github.com/aourednik/historical-basemaps/blob/master/geojson/world_1878.geojson), GPL-3.0. Der Datensatz beschreibt sich selbst als annähernd und in Arbeit. Bezogene Originaldatei, SHA-256: `e792520cd24cfb77b117d41533a59b0a5b82fc53a291fff1549ddc73e7f9a8b2`. Der Generator dokumentiert die Anpassungen an 1871 ausdrücklich:

- Bosnien und die bulgarischen Gebiete gehören zum Osmanischen Reich.
- Serbien und Montenegro sind vor ihren Gebietszuwächsen von 1878 angenähert.
- Dobrudscha wird dem Osmanischen Reich, südliches Bessarabien Rumänien zugeordnet.
- Rumänien und Serbien sind als Fürstentümer unter osmanischer Oberhoheit bezeichnet.
- Nur der europäische Teil des Osmanischen Reichs mit Kreta bleibt erhalten.
- Elsass-Lothringen ist Teil des Deutschen Reichs; Finnland und Kongresspolen sind Teile des Russischen Reichs.

Die kleinräumigen Balkankorrekturen sind generalisiert; genaue Verwaltungsgrenzen, Enklaven und Kleinstinseln werden nicht rekonstruiert. Historische Referenzen: [Asher & Adams, Europakarte von 1871, Library of Congress](https://www.loc.gov/item/2012590219/) und [Deutsches Historisches Museum: Elsass-Lothringen](https://www.dhm.de/lemo/kapitel/kaiserreich/das-reich/elsass-lothringen).

Die abgeleitete, auf Europa begrenzte Quelldatei liegt unter `tools/data/europe1871-source.json.gz`. Sie enthält nur benötigte Staatsgeometrien, keine fremden Programmbestandteile. Keine Kartenserver oder externen Dienste werden zur Laufzeit benötigt. Neutrale Länder nutzen auf dieser Karte ein beschriftetes Banner; die Motive der Karte um 1700 werden nicht auf 1871 übertragen.

Flüsse, Gebirge und Waldzonen verwenden dieselben Natural-Earth-/RESOLVE-Quellen wie die Weltkarte, neu projiziert und auf Europa zugeschnitten. Ihre Quellen und Lizenzen stehen in `THIRD_PARTY.md`. Siedlungen sind Symbole an realen Ortskoordinaten.

## Reproduzieren

Mit Shapely ab 2.1:

```sh
python tools/build_europe1871.py
```

Das baut `web/assets/europe1871.json` und `web/assets/terrain-europe1871.json` aus der gespeicherten Quelle. Mit dem Pfad zur ursprünglichen `world_1878.geojson` als zusätzlichem Argument werden auch die Quelldaten und Balkankorrekturen erneut gebaut. Der Generator prüft, dass jedes Gebiet existiert und das Brett vollständig verbunden ist. Nachbarschaften sind symmetrisch. Punktkontakte bilden keine Landverbindung; Inseln erhalten ausdrückliche Seeverbindungen.

Neue Partien können zwischen dieser Karte, „Welt um 1700“ und „Klassische Welt“ wählen. Bestehende Spielstände behalten ihre Kartenkennung, Nachbarschaften und Kartenstapel.

Die Generatoren ergänzen über `tools/build_continents.py` vereinigte Kontinentumrisse und Beschriftungspositionen. Die Umrisse werden unabhängig von Spielerfarben und Einheimischenschraffuren dargestellt. Der gemeinsame Generator kann mit `python tools/build_continents.py` auch die vorhandenen drei Karten aktualisieren, ohne Spielgebiete oder Nachbarschaften zu verändern.
