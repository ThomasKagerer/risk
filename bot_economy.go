package main

type territoryIncomePlan struct {
	Target            int     `json:"target"`
	Owned             int     `json:"owned_territories"`
	CurrentIncome     int     `json:"current_territory_income"`
	NextIncomeAt      int     `json:"next_income_at_territories"`
	Needed            int     `json:"territories_until_next_income"`
	IncomeGain        int     `json:"income_gain_if_captured_and_held"`
	CheapNeutralSpace int     `json:"nearby_cheap_neutral_territories"`
	PlayerExposure    int     `json:"adjacent_player_threats"`
	Value             float64 `json:"expansion_value"`
}

// Territory income is independent of continent ownership. Prefer affordable
// corridors away from player armies, while the combat scorer retains reserves.
func planTerritoryIncome(g *Game, target, p int) territoryIncomePlan {
	plan := territoryIncomePlan{Target: target, Owned: g.owned(p)}
	plan.CurrentIncome = max(3, plan.Owned/3)
	plan.NextIncomeAt = (plan.CurrentIncome + 1) * 3
	plan.Needed = plan.NextIncomeAt - plan.Owned
	plan.IncomeGain = max(3, (plan.Owned+1)/3) - plan.CurrentIncome
	for _, nb := range g.board().Countries[target-1].Neighbors {
		if playerConflictCost(g, nb, p) > 0 && g.Territories[nb-1].Troops > 1 {
			plan.PlayerExposure++
		}
	}
	seen := make([]bool, len(g.Territories))
	seen[target-1] = true
	queue := []int{target}
	for len(queue) > 0 && plan.CheapNeutralSpace < plan.Needed {
		next := queue[0]
		queue = queue[1:]
		t := g.Territories[next-1]
		if t.Owner >= 0 && g.Players[t.Owner].Neutral && t.Troops <= 3 {
			plan.CheapNeutralSpace++
		} else {
			continue
		}
		for _, nb := range g.board().Countries[next-1].Neighbors {
			if !seen[nb-1] {
				seen[nb-1] = true
				queue = append(queue, nb)
			}
		}
	}
	// Exposure discounts income that is unlikely to survive until our turn.
	plan.Value = (float64(plan.IncomeGain)*70 + float64(plan.CheapNeutralSpace)*24/float64(plan.Needed*plan.Needed)) /
		(1 + float64(plan.PlayerExposure))
	return plan
}

func incomeInvestmentFacts(g *Game, id, p int) []territoryIncomePlan {
	plans := []territoryIncomePlan{}
	for _, nb := range enemyNeighbors(g, id, p) {
		plans = append(plans, planTerritoryIncome(g, nb, p))
	}
	return plans
}

type cardTimingPlan struct {
	Target    int     `json:"target,omitempty"`
	Objective string  `json:"objective,omitempty"`
	Value     float64 `json:"opportunity_value"`
	Decisive  bool    `json:"enables_decisive_turn"`
}

// Spend an optional set when it opens a concrete opportunity now. Otherwise
// preserve flexibility (and potentially a larger progressive exchange later).
// The hypothetical trade uses only our cards and the real placement rules.
func planCardTiming(g *Game, p int, cards []int, bonus, value int) cardTimingPlan {
	after := *g
	after.Territories = append([]Territory(nil), g.Territories...)
	after.Players = append([]Player(nil), g.Players...)
	after.Players[p].Cards = nil
	for _, id := range g.Players[p].Cards {
		spent := false
		for _, used := range cards {
			spent = spent || used == id
		}
		if !spent {
			after.Players[p].Cards = append(after.Players[p].Cards, id)
		}
	}
	after.Pool += value
	after.Trades++
	if bonus > 0 {
		after.Territories[bonus-1].Troops += 2
	}
	best := cardTimingPlan{}
	consider := func(target int, objective string, value float64) {
		if value > best.Value {
			best = cardTimingPlan{Target: target, Objective: objective, Value: value, Decisive: true}
		}
	}
	capital := g.Players[p].Capital
	if g.Goal == "capital" && g.mine(capital, p) {
		need := capitalDefenseNeed(g, p, 0)
		before := g.Territories[capital-1].Troops + g.Pool
		afterDefense := after.Territories[capital-1].Troops + after.Pool
		if before < need && afterDefense > before {
			// Even a partial rescue is urgent: placing first would close the
			// exchange and leave usable defensive reinforcements in our hand.
			return cardTimingPlan{Target: capital, Objective: "defend_capital", Value: 30000 + float64(min(need, afterDefense)-before)*120, Decisive: true}
		}
	}
	for i, t := range g.Territories {
		if t.Owner != p {
			continue
		}
		for _, nb := range enemyNeighbors(g, i+1, p) {
			beforeArmy := t.Troops + g.Pool
			afterArmy := after.Territories[i].Troops + after.Pool
			beforeKill := planElimination(g, p, i+1, nb, beforeArmy)
			afterKill := planElimination(&after, p, i+1, nb, afterArmy)
			if afterKill.Feasible && (!beforeKill.Feasible || afterKill.Probability-beforeKill.Probability >= .15) {
				consider(nb, "eliminate_player", afterKill.Value)
			}
			beforeFoothold := planFoothold(g, p, i+1, nb, beforeArmy)
			afterFoothold := planFoothold(&after, p, i+1, nb, afterArmy)
			if afterFoothold.Feasible && !beforeFoothold.Feasible {
				consider(nb, "remove_remote_foothold", afterFoothold.Value)
			}
			beforeWeakening := planWeakening(g, p, i+1, nb, beforeArmy)
			afterWeakening := planWeakening(&after, p, i+1, nb, afterArmy)
			if afterWeakening.Worthwhile && !beforeWeakening.Worthwhile {
				consider(nb, "weaken_main_army", afterWeakening.Value)
			}
			continent := planContinent(g, p, g.board().Countries[nb-1].Continent)
			reserve, target := conquestReserves(g, i+1, nb, p, beforeArmy, continent)
			beforeChance := combatChanceWithDefense(beforeArmy-reserve-(target-1), g.Territories[nb-1].Troops, g.defenseOddsLimit(nb))
			reserve, target = conquestReserves(&after, i+1, nb, p, afterArmy, continent)
			afterChance := combatChanceWithDefense(afterArmy-reserve-(target-1), g.Territories[nb-1].Troops, g.defenseOddsLimit(nb))
			penalty := assessConflict(&after, p, nb, afterArmy-reserve-(target-1)).Penalty
			if beforeChance < .65 && afterChance >= .90 {
				// A large saved set may unlock a safe breakthrough even when the
				// opponent still owns too many countries for a complete knockout.
				consider(nb, "safe_breakthrough", afterChance*80-penalty-conquestCost(g, nb, p))
			}
			if afterChance < .80 || beforeChance >= .80 {
				continue
			}
			if continent.Owned == continent.Total-1 {
				consider(nb, "complete_continent", afterChance*continent.Value-penalty)
			}
			removed, blocked := continentDenial(g, nb, p)
			if removed > 0 || blocked > 0 {
				consider(nb, "deny_continent_bonus", afterChance*denialScore(removed, blocked)-penalty)
			}
			income := planTerritoryIncome(g, nb, p)
			if income.IncomeGain > 0 && afterChance >= .90 {
				consider(nb, "increase_territory_income", afterChance*income.Value-penalty)
			}
		}
	}
	return best
}
