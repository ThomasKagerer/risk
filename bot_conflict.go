package main

import "math"

// Keep a bounded, rolling record of public combat, grouped by opponent and
// theater. Losses are evidence of resistance, never a reason to spend more.
// Old saves have no records and begin learning from the next resolved battle.
const conflictRounds = 3

type ConflictRound struct {
	Round       int `json:"round"`
	Player      int `json:"player"`
	Opponent    int `json:"opponent"`
	Continent   int `json:"continent"`
	Losses      int `json:"losses"`
	EnemyLosses int `json:"enemyLosses"`
	Captured    int `json:"captured"`
	Lost        int `json:"lost"`
}

func (g *Game) pruneConflicts() {
	kept := g.Conflicts[:0]
	for _, c := range g.Conflicts {
		if c.Round <= g.Round && g.Round-c.Round < conflictRounds {
			kept = append(kept, c)
		}
	}
	g.Conflicts = kept
}

func (g *Game) recordConflict(b *Battle) {
	g.pruneConflicts()
	if g.Players[b.Attacker].Neutral || g.Players[b.Defender].Neutral {
		return
	}
	continent := g.board().Countries[b.To-1].Continent
	for _, p := range []int{b.Attacker, b.Defender} {
		entry := ConflictRound{Round: g.Round, Player: p, Opponent: b.Defender, Continent: continent,
			Losses: b.AttackerLoss, EnemyLosses: b.DefenderLoss}
		if b.Conquered {
			entry.Captured = 1
		}
		if p == b.Defender {
			entry.Opponent = b.Attacker
			entry.Losses, entry.EnemyLosses = entry.EnemyLosses, entry.Losses
			entry.Lost, entry.Captured = entry.Captured, 0
		}
		index := -1
		for i, c := range g.Conflicts {
			if c.Round == entry.Round && c.Player == p && c.Opponent == entry.Opponent && c.Continent == continent {
				index = i
				break
			}
		}
		if index < 0 {
			g.Conflicts = append(g.Conflicts, entry)
		} else {
			c := &g.Conflicts[index]
			c.Losses += entry.Losses
			c.EnemyLosses += entry.EnemyLosses
			c.Captured += entry.Captured
			c.Lost += entry.Lost
		}
	}
}

type conflictAssessment struct {
	Target              int     `json:"target"`
	Opponent            int     `json:"opponent"`
	Continent           int     `json:"continent"`
	Losses              int     `json:"recent_losses"`
	EnemyLosses         int     `json:"recent_enemy_losses"`
	NetTerritories      int     `json:"recent_net_territories"`
	EnemyReinforcements int     `json:"enemy_regional_reinforcements_estimate"`
	Stalled             bool    `json:"costly_stalemate"`
	Penalty             float64 `json:"further_investment_penalty"`
}

func assessConflict(g *Game, p, target, available int) conflictAssessment {
	c := conflictAssessment{Target: target, Opponent: g.Territories[target-1].Owner, Continent: g.board().Countries[target-1].Continent}
	if c.Opponent < 0 || c.Opponent == p || g.Players[c.Opponent].Neutral {
		return c
	}
	for _, record := range g.Conflicts {
		if record.Player == p && record.Opponent == c.Opponent && record.Continent == c.Continent &&
			record.Round <= g.Round && g.Round-record.Round < conflictRounds {
			c.Losses += record.Losses
			c.EnemyLosses += record.EnemyLosses
			c.NetTerritories += record.Captured - record.Lost
		}
	}
	regional, total := 0, 0
	for i, t := range g.Territories {
		if t.Owner == c.Opponent {
			total++
			if g.board().Countries[i].Continent == c.Continent {
				regional++
			}
		}
	}
	income := g.reinforcement(c.Opponent)
	if len(g.Players[c.Opponent].Cards) >= 5 {
		income += nextCardBonus(g)
	}
	// Allocation is unknown: use the opponent's public regional presence as a
	// rough share of their income, including a publicly visible mandatory trade.
	c.EnemyReinforcements = (income*regional + max(1, total) - 1) / max(1, total)
	ownIncome := max(3, g.reinforcement(p))
	c.Stalled = c.Losses >= max(4, ownIncome) && c.NetTerritories <= 0
	if c.Stalled {
		chance := combatChanceWithDefense(available, g.Territories[target-1].Troops, g.defenseOddsLimit(target))
		// Re-evaluate the position on every decision. A newly overwhelming army
		// or weakened opponent can justify returning to this front immediately.
		resistance := min(1.0, max(0.0, (.97-chance)/.17))
		c.Penalty = resistance * (120 + min(60.0, float64(c.Losses)*15/float64(ownIncome)) +
			min(40.0, float64(c.EnemyReinforcements)*10/float64(ownIncome)))
	}
	return c
}

// Only discount generic defense if every adjacent player front is costly.
// Useful neutral expansion is evaluated independently by the placement scorer.
func frontInvestmentPenalty(g *Game, id, p, extra int) float64 {
	penalty := math.Inf(1)
	for _, nb := range enemyNeighbors(g, id, p) {
		if playerConflictCost(g, nb, p) == 0 {
			continue
		}
		plan := planContinent(g, p, g.board().Countries[nb-1].Continent)
		source, target := conquestReserves(g, id, nb, p, g.Territories[id-1].Troops+extra, plan)
		assessment := assessConflict(g, p, nb, g.Territories[id-1].Troops+extra-source-(target-1))
		penalty = min(penalty, assessment.Penalty)
	}
	if math.IsInf(penalty, 1) {
		return 0
	}
	return penalty
}

func investmentFacts(g *Game, id, p, extra int) []conflictAssessment {
	facts := []conflictAssessment{}
	for _, nb := range enemyNeighbors(g, id, p) {
		if playerConflictCost(g, nb, p) > 0 {
			plan := planContinent(g, p, g.board().Countries[nb-1].Continent)
			source, target := conquestReserves(g, id, nb, p, g.Territories[id-1].Troops+extra, plan)
			facts = append(facts, assessConflict(g, p, nb, g.Territories[id-1].Troops+extra-source-(target-1)))
		}
	}
	return facts
}
