package main

// The first affordable conquest buys access to future card reinforcements.
// Rate certainty and casualty cost, rather than awarding the same incentive
// to an easy native territory and a costly war. Required garrisons and combat
// thresholds are still calculated by the caller. Fortification prepares the
// following turn's card; a mid-attack loot exchange cannot earn a second one.
func firstCardValue(g *Game, p, target int, chance, conflictPenalty float64) float64 {
	if (g.Conquered && g.Phase != "fortify") || chance < .65 || conflictPenalty > 0 {
		return 0
	}
	return 100 + 1100*chance/(1+conquestCost(g, target, p)/12)
}
