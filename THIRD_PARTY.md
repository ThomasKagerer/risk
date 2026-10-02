# Herkunft der übernommenen Bestandteile

Das nebenliegende Domination-Projekt nennt in `swingUI/res/ReadMe.txt`:

> Copyright (c) 2003-2025 yura.net

Es verweist auf die GNU General Public License. Die mitgelieferte `gpl.txt` enthält GPL Version 3 und wurde unverändert als `LICENSE` übernommen. Diese neue Umsetzung wird ebenfalls unter GPL-3.0 bereitgestellt.

Übernommen bzw. daraus abgeleitet:

| Bestandteil | Quelldatei in `Domination/` | Verwendung |
|---|---|---|
| Klassische Weltkarte | `swingUI/game/Domination/maps/world.map` | Gebiete, Positionen, Kontinente, Nachbarschaften |
| Gebietsmaske | `swingUI/game/Domination/maps/world_map.gif` | Ursprüngliche Importreferenz; aktuelle klassische Atlaszeichnung neu gezeichnet |
| Spielkarten | `swingUI/game/Domination/maps/risk.cards` | 42 Gebietskarten mit Symbolen und 2 Joker; Missionskarten nicht übernommen |
| Deutsche Bezeichnungen | `src/net/yura/domination/engine/translation/DefaultMaps_de.properties` | Namen von Gebieten und Kontinenten |
| Kurze Sounds | `swingUI/game/Domination/sound/medieval/` | `select1.mp3`, `adding pieces.mp3`, `attack.mp3`, `receiving card.mp3`, `moving troops1.mp3` |

Die Weltkartendatei nennt **Christian Domsch, Sebastian Kirsch, Andreas Habel und Dirk Engberg**. Kartendatei und allgemeines Projekt nennen **Yura Mamyrin**. Credits sind auch in der Oberfläche zugänglich.

Der Java-Spielkern wurde als Referenz für Kartensatzwerte und Spielfluss gelesen; die Go-Engine, HTML/CSS/JavaScript-Oberfläche, Figuren und Würfel wurden neu geschrieben. Die alte Java-Oberfläche sowie Markenlogos wurden nicht kopiert.

Die Karte `risk.map` enthält gegenüber dem klassischen Brett abweichende Verbindungen. Stattdessen wird `world.map` verwendet: unter anderem Island–Skandinavien und Großbritannien–Skandinavien vorhanden, Ostafrika–Mittlerer Osten nicht verbunden. Für die angepasste Atlasvariante wurde Ontario–Grönland auf Nutzerwunsch entfernt; einzelne gezeichnete Grenzen wurden an die Nachbarschaften angepasst. Ägypten–Mittlerer Osten ist als Seeverbindung sichtbar. Die Nachbarschaften werden automatisiert auf Symmetrie und relevante Seestraßen geprüft.


## Historische Karte und geografische Details

- **Natural Earth 5.1.2**, Public Domain: Küsten aus der vereinigten 50m-Ländergeometrie (moderne Landesgrenzen entfernt), 50m-Flüsse und 10m-Gebirgsregionen. Quelle: https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson ; Bedingungen: https://www.naturalearthdata.com/about/terms-of-use/ . Geometrie projiziert, vereinfacht und in Spielregionen geteilt; moderne Suez-/Panamakanäle ausgeschlossen.
- **RESOLVE Ecoregions 2017**, Dinerstein et al. (2017), *An Ecoregion-Based Approach to Protecting Half the Terrestrial Realm*, BioScience, DOI https://doi.org/10.1093/biosci/bix014 . Datensatz: https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017 . **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/ . Über den öffentlichen Resolve_Ecoregions-Layer von ArcGIS bezogen. Änderungen: Auswahl der Wald-Biome 1–6, Vereinigung, Projektion und Vereinfachung. Diese abgeleiteten Daten in `tools/data/terrain-source.json.gz` und `web/assets/terrain.json` behalten CC BY 4.0; sie sind von der GPL-Angabe zum Programmcode zu unterscheiden.
- Waldzonen sind natürliche Biome, keine vermessenen Waldgrenzen von heute oder 1700. Flussläufe und Gebirge sind ebenfalls kartografisch generalisiert.
- Historische Gebietsbezeichnungen und Siedlungsanker sind eine neue, vereinfachte Spielgestaltung. Grenzen sind schematisch; die Karte bildet keinen exakten politischen Zustand ab. Hausgrafiken stehen an realen Siedlungsorten, sind aber keine Gebäudegrundrisse.
- Historische Namensreferenzen: [Schweizer Eidgenossenschaft](https://hls-dhs-dss.ch/de/articles/008602/2008-11-11/), [Kosaken-Hetmanat](https://www.encyclopediaofukraine.com/display.asp?linkpath=pages%5CH%5CE%5CHetmanstate.htm), [Muscovy-Karte 1704](https://www.loc.gov/resource/g7000.ct000625/), [Singapura](https://www.nhb.gov.sg/nationalmuseum/whats-on/exhibition/singapore-history-gallery).

- Kurfürstentum Bayern (1623–1806): [Haus der Bayerischen Geschichte](https://archiv.hdbg.de/geschichte-bayerns/de-02-die-geschichte-04.php).

## Europa um 1871

- André Ourednik, [Historical Basemaps](https://github.com/aourednik/historical-basemaps), `geojson/world_1878.geojson`, GPL-3.0. Änderungen: europäischer Ausschnitt, generalisierte Rückführung der Balkangrenzen auf 1871, Bereinigung überlappender Flächen, Projektion und Teilung in Spielregionen. Abgeleitete Daten: `tools/data/europe1871-source.json.gz` und `web/assets/europe1871.json`. Details und historische Referenzen: [Europa 1871](docs/europe1871.md).
- `web/assets/terrain-europe1871.json` enthält neu projizierte und zugeschnittene Natural-Earth- und RESOLVE-Daten aus den oben genannten Quellen. Die Waldgeometrien behalten CC BY 4.0.
