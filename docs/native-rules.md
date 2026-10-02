# Einheimische und aufstrebende Computergegner

Gilt nur für die Einheimischen-Startvariante (`frontier`), einschließlich laufender Partien.

- Jedes Land betrachtet alle direkt angrenzenden Länder, einschließlich anderer einheimischer Länder.
- Mindestens **2 Einheiten mehr** beim stärksten Nachbarn: nach je 3 vollständigen Runden zufällig +1, +2 oder +3 Einheiten, mit gleicher Wahrscheinlichkeit. Bei einem Abstand von höchstens 1 ist das Land nicht mehr bedroht. Der letzte Wachstumsschub wird nicht gekürzt; er kann auch Gleichstand oder einen kleinen eigenen Vorsprung erzeugen.
- Ohne diese Bedrohung: nach je 5 ruhigen Runden zufällig +0, +1 oder +2, mit gleicher Wahrscheinlichkeit. Jedes fällige Land erhält einen eigenen Zufallswert; auch bei +0 startet der nächste Fünf-Runden-Zyklus. Bei Wechsel zwischen bedroht/ruhig beginnt der jeweilige Zähler neu. Neue Zähler beginnen bei 0; alte Runden werden nicht nachträglich nachgezählt.
- Die Nachbarstärken stammen aus demselben Zustand vor der Verstärkung. Es gibt keine Verstärkungskaskade innerhalb eines Rundenschritts.
- Überlebt ein einheimisches Land einen gesamten Angriff, erhält es sofort und einmalig **zufällig +1, +2 oder +3 Einheiten** mit gleicher Wahrscheinlichkeit. Mehrere Würfe derselben Angriffsgrenze gehören zusammen. Der Angriff endet bei erschöpfter Angreiferarmee, Rückzug über „Zur Karte“, Wechsel der Angriffsgrenze oder Ende der Angriffsphase. Eine reine Pause, ein Neuladen oder das Anhalten der Würfelautomatik beendet den Angriff nicht. Eroberte Länder erhalten keinen Bonus. Das laufende Gefecht wird gespeichert; der Bonus verändert die normalen Wachstumszähler nicht und zählt nicht als Kampfverlust.
- Einheimische mit **mehr als 10 Einheiten** können ein angrenzendes Spielerland mit **höchstens 3 Einheiten und höchstens einem Viertel ihrer Stärke** angreifen.
- Am Beginn einer vollständigen Runde wird, falls es passende Grenzen gibt, mit Wahrscheinlichkeit 1/3 eine Grenze für einen Ausfall gewählt. Höchstens ein Ausfall pro Runde, ein Wurf mit 3 Angriffswürfeln. Die Verteidigung bleibt eine normale, sichtbare Spielerentscheidung (oder die gespeicherte Automatik).
- Bei Eroberung entsteht ein lokaler Strategie-Bot mit dem Namen des Herkunftslands. Er übernimmt Start- und Zielland. Er erhält die Karten eines dadurch ausgeschiedenen Spielers, aber keine zusätzlichen Einheiten. Die übrigen Einheimischen bleiben unabhängig.
- Ein erfolgloser Ausfall endet nach dem Wurf. Seine Verluste bleiben bestehen. Der unterbrochene Spielerzug wird anschließend fortgesetzt. Würfel, ausstehende Verteidigung und unterbrochener Zug bleiben über Neustarts erhalten.

## Statistik

Vollständige Kampfstatistik für neue Partien; laufende ältere Partien werden ab Aktivierung erfasst und entsprechend markiert. Pro Spieler/Runde: verlorene und getötete Einheiten, unterschiedliche angegriffene Zielländer. Die Gesamtsumme der Länder addiert die Rundenzahlen. Einheimischen-Ausfälle zählen bis zur Gründung des Computergegners zu den Einheimischen. Reine Verstärkungen und Bewegungen sind keine Verluste. Die volle Historie wird nur am Spielende an Browser übertragen.

## Verteidigungsautomatik

Die persönliche Einstellung wird serverseitig in der Partie gespeichert, auch bei geschlossenem Browser. Sie ist unabhängig von der lokalen, auf eine Grenze beschränkten Automatik im Schlachtfeld. Standard: 2 Verteidigungswürfel, bei zwei Angriffswürfeln >=5 nur 1; Berge 3, bei drei hohen Würfeln nur 2. Verfügbare Einheiten begrenzen die Würfelzahl, die Regel skaliert entsprechend.

## Spielpause

„Pause“ ist oben rechts und im Schlachtfeld sichtbar. Jeder menschliche Mitspieler kann die ganze Partie pausieren und fortsetzen. Spielzüge, Bots und ausstehende Verteidigungen warten; bereits gewürfelte Ergebnisse bleiben gespeichert. Die Pause übersteht auch einen Neustart. Das Schlachtfeld schließt sofort, die Karte bleibt frei zum Zoomen und Auswählen. Automatische Angriffe warten ebenfalls bis zum Fortsetzen.

## Angreifende Figuren

Die dargestellte Truppenstärke bleibt exakt: Infanterie zählt 1, Kavallerie 5 und eine Kanone 10. Mindestens ein Infanterist bleibt immer in der Formation. Ab 11 Einheiten wird mindestens eine Kanone gezeigt, ab 16 zusätzlich mindestens ein Reiter. Bei 6–10 Einheiten ist ein Reiter möglich. Weitere Figuren verteilen sich wie bisher proportional; große Armeen werden platzsparender dargestellt.
