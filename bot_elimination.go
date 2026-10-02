package main

import "math"

type eliminationPlan struct {
	Opponent          int     `json:"opponent"`
	Capital           int     `json:"capital_target,omitempty"`
	Released          int     `json:"remaining_territories_become_native,omitempty"`
	Territories       int     `json:"remaining_territories"`
	Cards             int     `json:"cards_gained"`
	Route             []int   `json:"attack_route,omitempty"`
	Probability       float64 `json:"success_estimate"`
	Approximate       bool    `json:"estimate_is_heuristic"`
	ImmediateTrade    bool    `json:"mandatory_trade_after_elimination"`
	CardBonusEstimate float64 `json:"card_bonus_estimate"`
	Feasible          bool    `json:"feasible"`
	Value             float64 `json:"strategic_value"`
}

// A bounded lookahead for finishing a weakened player with one advancing army.
// Routes must follow enemy-to-enemy borders: troops cannot teleport through
// friendly land or spend the same army twice on disconnected targets.
func planElimination(g *Game, p, from, to, troops int) eliminationPlan {
	if g.Goal == "capital" {
		return planCapitalCampaign(g, p, from, to, troops)
	}
	opponent := g.Territories[to-1].Owner
	plan := eliminationPlan{Opponent: opponent, Approximate: true}
	if opponent < 0 || opponent == p || g.Players[opponent].Neutral {
		return plan
	}
	plan.Territories = g.owned(opponent)
	plan.Cards = len(g.Players[opponent].Cards)
	plan.ImmediateTrade = len(g.Players[p].Cards)+plan.Cards >= 6
	// Only card counts are public. A future set's symbols/value are unknown.
	plan.CardBonusEstimate = float64(nextCardBonus(g)) * min(1.0, float64(plan.Cards)/3)
	if plan.Territories > 6 {
		return plan
	}
	plan.Route, plan.Probability = campaignRoute(g, p, from, to, troops, plan.Territories, 0)
	plan.Feasible = len(plan.Route) == plan.Territories && plan.Probability >= .70
	if plan.Feasible {
		plan.Value = plan.Probability * (260 + float64(plan.Cards)*70 + plan.CardBonusEstimate*6)
		if plan.ImmediateTrade {
			plan.Value += plan.Probability * 100
		}
	}
	return plan
}

// Search a complete single-army route. A nonzero continent limits a regional campaign.
func campaignRoute(g *Game, p, from, to, troops, targetCount, continent int) (bestRoute []int, bestChance float64) {
	opponent := g.Territories[to-1].Owner
	visited := make([]bool, len(g.Territories))
	visited[to-1] = true
	var search func([]int)
	search = func(route []int) {
		if len(route) == targetCount {
			// Evaluate terrain, remaining army and any continent garrisons at
			// every step. Expected survivors are a conservative cost heuristic;
			// the product of combat odds is not an exact campaign probability.
			position := *g
			position.Territories = append([]Territory(nil), g.Territories...)
			probability, army, source := 1.0, troops, from
			for _, target := range route {
				continent := planContinent(&position, p, g.board().Countries[target-1].Continent)
				reserve, targetReserve := conquestGarrisons(&position, source, target, p, continent)
				defenders := position.Territories[target-1].Troops
				available := army - reserve - (targetReserve - 1)
				probability *= combatChanceWithDefense(available, defenders, g.defenseOddsLimit(target))
				if probability < .70 {
					return
				}
				cost := float64(defenders)
				if g.defenseLimit(target) >= 3 {
					cost *= 1.5
				}
				army -= reserve + int(math.Ceil(cost))
				if army < targetReserve {
					return
				}
				position.Territories[source-1].Troops = reserve
				position.Territories[target-1] = Territory{Owner: p, Troops: army}
				source = target
			}
			if probability > bestChance {
				bestChance = probability
				bestRoute = append([]int(nil), route...)
			}
			return
		}
		for _, nb := range g.board().Countries[route[len(route)-1]-1].Neighbors {
			if !visited[nb-1] && g.Territories[nb-1].Owner == opponent && (continent == 0 || g.board().Countries[nb-1].Continent == continent) {
				visited[nb-1] = true
				search(append(route, nb))
				visited[nb-1] = false
			}
		}
	}
	search([]int{to})
	return
}

func eliminationInvestmentFacts(g *Game, id, p, extra int) []eliminationPlan {
	plans := []eliminationPlan{}
	for _, nb := range enemyNeighbors(g, id, p) {
		plan := planElimination(g, p, id, nb, g.Territories[id-1].Troops+extra)
		if plan.Feasible {
			plans = append(plans, plan)
		}
	}
	return plans
}
