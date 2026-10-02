package main

// Klaus Störtebeker focuses one random rival and attacks recklessly from every
// eligible stack. The focus survives saves and changes only on elimination.
func annoyingTarget(g *Game, p int, rng Random) int {
	available := func(q int) bool {
		return q >= 0 && q < len(g.Players) && q != p && !g.Players[q].Neutral &&
			(g.Phase == "claim" || g.Phase == "lobby" || g.owned(q) > 0)
	}
	target := g.Players[p].AnnoyingTarget - 1
	if available(target) {
		return target
	}
	var candidates []int
	for q := range g.Players {
		if available(q) {
			candidates = append(candidates, q)
		}
	}
	if len(candidates) == 0 {
		return -1
	}
	target = candidates[rng(len(candidates))]
	g.Players[p].AnnoyingTarget = target + 1
	return target
}

func annoyingOptions(g *Game, target int) []botOption {
	p := g.actor()
	one := func(a Action) []botOption {
		a.Revision = g.Revision
		return []botOption{{Action: a}}
	}
	// Never wait for favorable odds, ten troops, or a new card. Four troops
	// at the source are sufficient even against overwhelming defenders.
	if g.Phase == "attack" {
		from, to := 0, 0
		for i, territory := range g.Territories {
			if territory.Owner != p || territory.Troops <= 3 || g.attackDice(i+1) < 1 {
				continue
			}
			for _, neighbor := range enemyNeighbors(g, i+1, p) {
				focused := target >= 0 && g.Territories[neighbor-1].Owner == target
				bestFocused := to != 0 && target >= 0 && g.Territories[to-1].Owner == target
				if from == 0 || focused && !bestFocused || focused == bestFocused &&
					(territory.Troops > g.Territories[from-1].Troops || territory.Troops == g.Territories[from-1].Troops && g.Territories[neighbor-1].Troops < g.Territories[to-1].Troops) {
					from, to = i+1, neighbor
				}
			}
		}
		if from != 0 {
			return one(Action{Type: "attack", From: from, To: to, Dice: g.attackDice(from)})
		}
		return one(Action{Type: "next"})
	}
	if g.Phase == "occupy" {
		return one(Action{Type: "occupy", Amount: g.Territories[g.Pending.From-1].Troops - 1})
	}
	if target < 0 || target >= len(g.Players) {
		return botOptions(g)
	}
	// A continent with just one missing country takes priority, regardless of
	// its bonus or which other opponent would have been easier to bother.
	continent, best := 0, -1.0
	for _, c := range g.board().Continents {
		owned, total := continentProgress(g, target, c.ID)
		if owned == 0 {
			continue
		}
		score := float64(owned) / float64(total)
		if score > best {
			continent, best = c.ID, score
		}
	}
	if continent == 0 {
		return botOptions(g)
	}

	// Distances to the chosen continent guide entry if Klaus Störtebeker has no foothold.
	distance := make([]int, len(g.Territories))
	queue := []int{}
	for i, c := range g.board().Countries {
		distance[i] = -1
		if c.Continent == continent {
			distance[i] = 0
			queue = append(queue, c.ID)
		}
	}
	for head := 0; head < len(queue); head++ {
		id := queue[head]
		for _, nb := range g.board().Countries[id-1].Neighbors {
			if distance[nb-1] < 0 {
				distance[nb-1] = distance[id-1] + 1
				queue = append(queue, nb)
			}
		}
	}
	home := 0
	for i, t := range g.Territories {
		if t.Owner != p || distance[i] < 0 {
			continue
		}
		front := len(enemyNeighbors(g, i+1, p)) > 0
		homeFront := home != 0 && len(enemyNeighbors(g, home, p)) > 0
		// Reinforcements and fortification must reach an attackable border,
		// instead of accumulating indefinitely in an interior blocking stack.
		if home == 0 || front && !homeFront || front == homeFront &&
			(distance[i] < distance[home-1] || distance[i] == distance[home-1] && t.Troops > g.Territories[home-1].Troops) {
			home = i + 1
		}
	}
	switch g.Phase {
	case "claim":
		for _, c := range g.board().Countries {
			if c.Continent == continent && g.Territories[c.ID-1].Owner < 0 {
				return one(Action{Type: "claim", Territory: c.ID})
			}
		}
	case "setup":
		// The two-player rules sometimes require placing a neutral unit.
		neutralPlacement := g.activePlayerCount() == 2 && g.Setup != "frontier" && g.SetupPlaced == 2
		if home != 0 && !neutralPlacement {
			return one(Action{Type: "place", Territory: home, Amount: 1})
		}
	case "reinforce":
		options := botOptions(g)
		for _, o := range options {
			if o.Action.Type == "trade" {
				return []botOption{o}
			}
		}
		if home != 0 && g.Pool > 0 && !g.mustTrade() {
			return one(Action{Type: "place", Territory: home, Amount: g.Pool})
		}
		return options
	case "defend":
		return one(Action{Type: "defend", Dice: g.defenseDice(g.Pending.To)})
	case "fortify":
		if home != 0 && !g.Moved {
			from := 0
			for i, t := range g.Territories {
				if i+1 == home || t.Owner != p || t.Troops <= 1 || !g.connected(i+1, home, p) {
					continue
				}
				if from == 0 || t.Troops > g.Territories[from-1].Troops {
					from = i + 1
				}
			}
			if from != 0 {
				return one(Action{Type: "fortify", From: from, To: home, Amount: g.Territories[from-1].Troops - 1})
			}
		}
		return one(Action{Type: "next"})
	}
	return botOptions(g)
}
