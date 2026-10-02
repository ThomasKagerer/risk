package main

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

// Missions are persisted with their owner, never in PublicPlayer. Only the
// authenticated seat receives its own mission; the winner reveals it at the end.
type Mission struct {
	Kind            string `json:"kind"`
	Territories     int    `json:"territories,omitempty"`
	MinTroops       int    `json:"minTroops,omitempty"`
	Continents      []int  `json:"continents,omitempty"`
	ExtraContinents int    `json:"extraContinents,omitempty"`
	Target          int    `json:"target"`
}
type MissionView struct {
	Description string `json:"description"`
	Progress    string `json:"progress"`
	Complete    bool   `json:"complete"`
}

func validGoal(rules, goal string) error {
	if goal == "" || slices.Contains(rulesFor(rules).Goals, goal) {
		return nil
	}
	return errors.New("Dieses Spielziel ist mit dem gewählten Regelpaket nicht verfügbar.")
}
func (g *Game) missionCountryGoal(original int) int { return (original*len(g.Territories) + 41) / 42 }
func (g *Game) missionDeck() []Mission {
	deck := []Mission{{Kind: "territories", Territories: g.missionCountryGoal(18), MinTroops: 2}, {Kind: "territories", Territories: g.missionCountryGoal(24), MinTroops: 1}}
	if g.mapID() == "europe1871" {
		// Comparable region objectives on the Europe board (24–28 of 71 lands).
		for _, ids := range [][]int{{3, 8, 2}, {6, 4, 1}, {5, 7, 8}, {3, 7, 1}, {6, 5, 2}, {4, 8, 1}} {
			deck = append(deck, Mission{Kind: "continents", Continents: ids})
		}
	} else {
		for _, ids := range [][]int{{5, 2}, {3, 6}, {5, 4}, {3, 2}, {1, 6}, {1, 4}} {
			extra := 0
			if ids[0] == 3 {
				extra = 1
			}
			deck = append(deck, Mission{Kind: "continents", Continents: ids, ExtraContinents: extra})
		}
	}
	for i, p := range g.Players {
		if !p.Neutral {
			deck = append(deck, Mission{Kind: "eliminate", Target: i, Territories: g.missionCountryGoal(24)})
		}
	}
	return deck
}
func (g *Game) dealMissions(rng Random) {
	deck := g.missionDeck()
	order := make([]int, len(deck))
	for i := range order {
		order[i] = i
	}
	shuffle(order, rng)
	for i := range g.Players {
		m := deck[order[i]]
		g.Players[i].Mission = &m
	}
	ids := make([]int, len(g.Territories))
	for i := range ids {
		ids[i] = i
	}
	shuffle(ids, rng)
	for i, id := range ids {
		p := (g.First + i) % len(g.Players)
		g.Territories[id] = Territory{Owner: p, Troops: 1}
		g.Players[p].Reserve--
	}
	g.beginSetup()
}
func (g *Game) missionView(p int) *MissionView {
	if g.Goal != "mission" || p < 0 || p >= len(g.Players) || g.Players[p].Mission == nil {
		return nil
	}
	m := g.Players[p].Mission
	v := &MissionView{}
	switch m.Kind {
	case "territories":
		count := 0
		for _, t := range g.Territories {
			if t.Owner == p && t.Troops >= m.MinTroops {
				count++
			}
		}
		v.Description = fmt.Sprintf("Besetze %d Länder deiner Wahl", m.Territories)
		if m.MinTroops > 1 {
			v.Description += fmt.Sprintf(" mit jeweils mindestens %d Einheiten", m.MinTroops)
		}
		v.Description += "."
		v.Progress = fmt.Sprintf("%d / %d Länder", count, m.Territories)
		v.Complete = count >= m.Territories
	case "continents":
		names := []string{}
		held, extra := 0, 0
		for _, c := range g.board().Continents {
			required := slices.Contains(m.Continents, c.ID)
			if required {
				names = append(names, c.Name)
			}
			if g.holdsContinent(p, c.ID) {
				if required {
					held++
				} else {
					extra++
				}
			}
		}
		v.Description = "Besetze vollständig: " + strings.Join(names, ", ")
		if m.ExtraContinents > 0 {
			v.Description += " sowie eine weitere Region deiner Wahl"
		}
		v.Description += "."
		v.Progress = fmt.Sprintf("%d / %d vorgegebene Regionen", held, len(m.Continents))
		if m.ExtraContinents > 0 {
			v.Progress += fmt.Sprintf(" · %d / %d weitere", min(extra, m.ExtraContinents), m.ExtraContinents)
		}
		v.Complete = held == len(m.Continents) && extra >= m.ExtraContinents
	case "eliminate":
		if m.Target == p {
			v.Description = fmt.Sprintf("Besetze %d Länder deiner Wahl. Dein Auftrag nennt deine eigene Armee; deshalb gilt dieses Ersatzziel.", m.Territories)
			v.Progress = fmt.Sprintf("%d / %d Länder", g.owned(p), m.Territories)
			v.Complete = g.owned(p) >= m.Territories
		} else if m.Target >= 0 && m.Target < len(g.Players) {
			left := g.owned(m.Target)
			v.Description = fmt.Sprintf("Besiege die Armee von %s. Der Auftrag ist auch erfüllt, wenn ein anderer Spieler sie ausschaltet.", g.Players[m.Target].Name)
			v.Progress = fmt.Sprintf("%d gegnerische Länder übrig", left)
			v.Complete = left == 0
		}
	}
	return v
}
func (g *Game) checkMissionVictory() {
	if g.Goal != "mission" || g.Phase == "lobby" || g.Phase == "claim" || g.Phase == "setup" || g.Phase == "defend" || g.Phase == "occupy" || g.Phase == "finished" {
		return
	}
	// Check every living player: an elimination can fulfil somebody else's secret
	// mission too (Hasbro German rules, 2015). The acting turn breaks simultaneous ties.
	for offset := range len(g.Players) {
		p := (g.Turn + offset) % len(g.Players)
		if g.Players[p].Neutral || g.owned(p) == 0 {
			continue
		}
		if m := g.missionView(p); m != nil && m.Complete {
			g.Winner = p
			g.Phase = "finished"
			g.note("%s erfüllt seine Mission und gewinnt: %s", g.Players[p].Name, m.Description)
			return
		}
	}
}
