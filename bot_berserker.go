package main

// Ragnar is deliberately reckless: unlike the standard heuristic, he never
// rejects an attack because of odds, but needs at least three units at its
// source. Below that threshold it stops using that territory.
// Local berserker controller.
func berserkerOptions(g *Game) []botOption {
	p := g.actor()
	one := func(a Action) []botOption {
		a.Revision = g.Revision
		return []botOption{{Action: a}}
	}
	front := 0
	for i, territory := range g.Territories {
		if territory.Owner == p && len(enemyNeighbors(g, i+1, p)) > 0 &&
			(front == 0 || territory.Troops > g.Territories[front-1].Troops) {
			front = i + 1
		}
	}
	switch g.Phase {
	case "attack":
		from, to := 0, 0
		for i, territory := range g.Territories {
			if territory.Owner != p || territory.Troops < 3 || g.attackDice(i+1) < 1 {
				continue
			}
			for _, neighbor := range enemyNeighbors(g, i+1, p) {
				if from == 0 || territory.Troops > g.Territories[from-1].Troops ||
					(territory.Troops == g.Territories[from-1].Troops && g.Territories[neighbor-1].Troops < g.Territories[to-1].Troops) {
					from, to = i+1, neighbor
				}
			}
		}
		if from != 0 {
			return one(Action{Type: "attack", From: from, To: to, Dice: g.attackDice(from)})
		}
		return one(Action{Type: "next"})
	case "defend":
		return one(Action{Type: "defend", Dice: g.defenseDice(g.Pending.To)})
	case "occupy":
		return one(Action{Type: "occupy", Amount: g.Territories[g.Pending.From-1].Troops - 1})
	case "reinforce":
		// Trade available sets before committing the whole reinforcement pool.
		options := botOptions(g)
		for _, option := range options {
			if option.Action.Type == "trade" {
				return []botOption{option}
			}
		}
		if g.Pool > 0 && !g.mustTrade() && front != 0 {
			return one(Action{Type: "place", Territory: front, Amount: g.Pool})
		}
		return options
	case "fortify":
		if !g.Moved && front != 0 {
			from, to := 0, 0
			for i, territory := range g.Territories {
				if territory.Owner != p || territory.Troops <= 1 {
					continue
				}
				for j, target := range g.Territories {
					if i == j || target.Owner != p || len(enemyNeighbors(g, j+1, p)) == 0 || !g.connected(i+1, j+1, p) {
						continue
					}
					if from == 0 || territory.Troops > g.Territories[from-1].Troops ||
						(territory.Troops == g.Territories[from-1].Troops && target.Troops > g.Territories[to-1].Troops) {
						from, to = i+1, j+1
					}
				}
			}
			if from != 0 {
				return one(Action{Type: "fortify", From: from, To: to, Amount: g.Territories[from-1].Troops - 1})
			}
		}
		return one(Action{Type: "next"})
	}
	return botOptions(g)
}
