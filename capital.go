package main

// A captured capital remains a fortified place. Only its original owner's
// loss condition is tied to it; the special building and dice survive capture.
func (g *Game) isCapital(id int) bool {
	if g.Goal != "capital" || !g.territory(id) {
		return false
	}
	for _, p := range g.Players {
		if p.Capital == id {
			return true
		}
	}
	return false
}

func diceForDefense(troops, limit int) int {
	if troops < 1 {
		return 0
	}
	if limit < 0 {
		return min(-limit, troops)
	}
	if limit == 4 {
		return min(4, troops+1)
	}
	return min(limit, troops)
}

func (g *Game) beginSetup() {
	g.Phase = "setup"
	if g.Goal == "capital" {
		g.Phase = "capital"
	}
}

func (g *Game) captureCapital(id, defeated, conqueror int) bool {
	if g.Goal != "capital" || g.Players[defeated].Capital != id {
		return false
	}
	neutral, released := -1, 0
	for i, player := range g.Players {
		if player.Neutral {
			neutral = i
			break
		}
	}
	for i := range g.Territories {
		territory := &g.Territories[i]
		if territory.Owner == defeated {
			if neutral < 0 {
				neutral = len(g.Players)
				g.Players = append(g.Players, Player{Name: "Einheimische", Neutral: true, Cards: []int{}})
			}
			// Only ownership changes: stationed armies and their positions stay.
			territory.Owner = neutral
			territory.Construction = nil
			territory.NativeThreatRounds = 0
			territory.NativeQuietRounds = 0
			released++
		}
	}
	g.Players[defeated].Reserve = 0
	g.note("Die Hauptstadt %s fällt. %s scheidet aus; %s erhält die Hauptstadt und die Karten. %d übrige Länder werden mit ihren Armeen einheimisch.", g.board().Countries[id-1].Name, g.Players[defeated].Name, g.Players[conqueror].Name, released)
	return true
}
