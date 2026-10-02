package main

// A passive training opponent: random placement, no attacks or fortification.
func neutralOptions(g *Game, random func(int) int) []botOption {
	p := g.actor()
	one := func(a Action) []botOption { a.Revision = g.Revision; return []botOption{{Action: a}} }
	switch g.Phase {
	case "attack", "fortify":
		return one(Action{Type: "next"})
	case "reinforce":
		if g.Pool > 0 && !g.mustTrade() {
			own := []int{}
			for i, t := range g.Territories {
				if t.Owner == p {
					own = append(own, i+1)
				}
			}
			if len(own) > 0 {
				return one(Action{Type: "place", Territory: own[random(len(own))], Amount: 1})
			}
		}
	case "claim", "setup", "capital":
		options := botOptions(g)
		if len(options) > 0 {
			return []botOption{options[random(len(options))]}
		}
	}
	return botOptions(g)
}
