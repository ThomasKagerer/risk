package main

import "slices"

func (g *Game) ownMission(p int) *Mission {
	if g.Goal != "mission" || p < 0 || p >= len(g.Players) {
		return nil
	}
	return g.Players[p].Mission
}
func missionTarget(g *Game, p, id int) bool {
	m := g.ownMission(p)
	if m == nil {
		return false
	}
	switch m.Kind {
	case "territories":
		return true
	case "eliminate":
		return m.Target == p || g.Territories[id-1].Owner == m.Target
	case "continents":
		c := g.board().Countries[id-1].Continent
		if slices.Contains(m.Continents, c) {
			return true
		}
		// Choose the most advanced eligible additional region, rather than
		// treating every unrelated continent as an equally useful objective.
		if m.ExtraContinents > 0 {
			best := -1
			progress := -1.0
			for _, region := range g.board().Continents {
				if !slices.Contains(m.Continents, region.ID) {
					owned, total := 0, 0
					for i, country := range g.board().Countries {
						if country.Continent == region.ID {
							total++
							if g.Territories[i].Owner == p {
								owned++
							}
						}
					}
					value := float64(owned) / float64(total)
					if value > progress {
						progress = value
						best = region.ID
					}
				}
			}
			return c == best
		}
	}
	return false
}
func missionActionScore(g *Game, p int, a Action) float64 {
	m := g.ownMission(p)
	if m == nil {
		return 0
	}
	score := 0.0
	simulated := *g
	simulated.Territories = slices.Clone(g.Territories)
	switch a.Type {
	case "place":
		t := &simulated.Territories[a.Territory-1]
		if t.Owner != p {
			return 0
		}
		t.Troops += a.Amount
		if m.Kind == "territories" && m.MinTroops > 1 && g.Territories[a.Territory-1].Troops < m.MinTroops && t.Troops >= m.MinTroops {
			score += 40000 - float64(a.Amount)*10
		}
		for _, nb := range enemyNeighbors(g, a.Territory, p) {
			if missionTarget(g, p, nb) {
				score += 120
				break
			}
		}
	case "fortify":
		simulated.Territories[a.From-1].Troops -= a.Amount
		simulated.Territories[a.To-1].Troops += a.Amount
	case "occupy":
		simulated.Territories[g.Pending.From-1].Troops -= a.Amount
		simulated.Territories[g.Pending.To-1].Troops += a.Amount
	case "attack":
		if !missionTarget(g, p, a.To) {
			return 0
		}
		chance := combatChanceWithDefense(g.Territories[a.From-1].Troops-1, g.Territories[a.To-1].Troops, g.defenseOddsLimit(a.To))
		if chance < .65 {
			return 0
		}
		simulated.Territories[a.To-1].Owner = p
		simulated.Territories[a.To-1].Troops = 1
		if v := simulated.missionView(p); v != nil && v.Complete {
			return 100000 * chance
		}
		return 600 * chance
	default:
		return 0
	}
	if m.Kind == "territories" && m.MinTroops > 1 {
		before, after := 0, 0
		for i, t := range g.Territories {
			if t.Owner == p && t.Troops >= m.MinTroops {
				before++
			}
			u := simulated.Territories[i]
			if u.Owner == p && u.Troops >= m.MinTroops {
				after++
			}
		}
		if a.Type != "place" {
			score += 40000 * float64(after-before)
		}
	}
	if v := simulated.missionView(p); v != nil && v.Complete {
		score += 1000000
	}
	return score
}

// Include small, precise garrison moves that general front-line planning may
// omit. These obey the same mandatory trades and adjacency as human actions.
func missionOptions(g *Game, p int, add func(Action, float64, map[string]any)) {
	m := g.ownMission(p)
	if m == nil || m.Kind != "territories" || m.MinTroops < 2 {
		return
	}
	if g.Phase == "reinforce" && g.Pool > 0 && !g.mustTrade() {
		for i, t := range g.Territories {
			if t.Owner == p && t.Troops < m.MinTroops {
				amount := min(g.Pool, m.MinTroops-t.Troops)
				add(Action{Type: "place", Territory: i + 1, Amount: amount}, 0, nil)
			}
		}
	}
	if g.Phase == "occupy" {
		for _, amount := range []int{max(g.minimumOccupation(), m.MinTroops), g.Territories[g.Pending.From-1].Troops - m.MinTroops} {
			if amount >= g.minimumOccupation() && amount < g.Territories[g.Pending.From-1].Troops {
				add(Action{Type: "occupy", Amount: amount}, 0, nil)
			}
		}
	}
	if g.Phase == "fortify" && !g.Moved {
		for i, t := range g.Territories {
			if t.Owner == p && t.Troops > m.MinTroops {
				for j, u := range g.Territories {
					if i != j && u.Owner == p && u.Troops < m.MinTroops && g.connected(i+1, j+1, p) {
						amount := min(t.Troops-m.MinTroops, m.MinTroops-u.Troops)
						add(Action{Type: "fortify", From: i + 1, To: j + 1, Amount: amount}, 0, nil)
					}
				}
			}
		}
	}
}
