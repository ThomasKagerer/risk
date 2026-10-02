package main

type footholdPlan struct {
	Opponent    int     `json:"opponent"`
	Continent   int     `json:"continent"`
	Territories int     `json:"regional_territories"`
	Route       []int   `json:"attack_route,omitempty"`
	Probability float64 `json:"success_estimate"`
	Feasible    bool    `json:"removes_isolated_foothold"`
	Value       float64 `json:"strategic_value"`
}

// Clearing a distant foothold denies local placement even if its owner has a
// large empire elsewhere. Its remaining territory income and cards still apply.
func planFoothold(g *Game, p, from, to, troops int) footholdPlan {
	plan := footholdPlan{Opponent: g.Territories[to-1].Owner, Continent: g.board().Countries[to-1].Continent}
	if plan.Opponent < 0 || plan.Opponent == p || g.Players[plan.Opponent].Neutral {
		return plan
	}
	// Follow the actual connected foothold, even inside a large continent or
	// across a continent boundary. A peninsula attached to an empire is not isolated.
	seen := map[int]bool{to: true}
	queue := []int{to}
	for len(queue) > 0 {
		next := queue[0]
		queue = queue[1:]
		plan.Territories++
		if plan.Territories > 2 {
			return plan
		}
		for _, nb := range g.board().Countries[next-1].Neighbors {
			if !seen[nb] && g.Territories[nb-1].Owner == plan.Opponent {
				seen[nb] = true
				queue = append(queue, nb)
			}
		}
	}
	if plan.Territories == g.owned(plan.Opponent) {
		return plan
	}
	plan.Route, plan.Probability = campaignRoute(g, p, from, to, troops, plan.Territories, 0)
	plan.Feasible = len(plan.Route) == plan.Territories && plan.Probability >= .70
	if plan.Feasible {
		plan.Value = plan.Probability * (130 + float64(min(20, g.reinforcement(plan.Opponent)))*5)
	}
	return plan
}

func strategicInvestmentFacts(g *Game, id, p, extra int) []map[string]any {
	facts := []map[string]any{}
	for _, nb := range enemyNeighbors(g, id, p) {
		troops := g.Territories[id-1].Troops + extra
		foothold := planFoothold(g, p, id, nb, troops)
		weakening := planWeakening(g, p, id, nb, troops)
		if foothold.Feasible || weakening.Worthwhile {
			facts = append(facts, map[string]any{"target": nb, "regional_foothold": foothold, "weakening": weakening})
		}
	}
	return facts
}
