package main

import "math"

// Losing the capital ends the game for this player. Estimate a garrison with
// the actual fortress dice, including reinforcements and a one-country buffer
// that an enemy army could cross before we get another turn. Enemy card symbols
// are private: three or more cards only imply a possible exchange.
func capitalDefenseNeed(g *Game, p, captured int) int {
	capital := g.Players[p].Capital
	if g.Goal != "capital" || !g.mine(capital, p) {
		return 1
	}
	need := 3 // Legacy capitals unlock all four dice with three defenders.
	if g.Rules == "domination" {
		need = g.defenseLimit(capital)
	}
	consider := func(source, via int) {
		t := g.Territories[source-1]
		if source == captured || t.Owner < 0 || t.Owner == p || g.Players[t.Owner].Neutral {
			return
		}
		army := t.Troops - 1 + g.reinforcement(t.Owner)
		if len(g.Players[t.Owner].Cards) >= 3 {
			army += nextCardBonus(g)
		}
		probability := 1.0
		if via != 0 {
			buffer := g.Territories[via-1]
			probability = combatChanceWithDefense(army, buffer.Troops, g.defenseOddsLimit(via))
			if probability <= .20 {
				return
			}
			losses := expectedCombatLosses(army, buffer.Troops, g.defenseOddsLimit(via))
			army -= int(math.Ceil(losses.attacker)) + 1
		}
		if army < 1 {
			return
		}
		// Find the smallest garrison keeping this route's estimated capture
		// chance at or below 20%; large armies use the existing approximation.
		low, high := need, max(need, army*2+3)
		for low < high {
			mid := low + (high-low)/2
			if probability*combatChanceWithDefense(army, mid, g.defenseOddsLimit(capital)) > .20 {
				low = mid + 1
			} else {
				high = mid
			}
		}
		need = low
	}
	for _, nb := range g.board().Countries[capital-1].Neighbors {
		if nb == captured {
			continue
		}
		t := g.Territories[nb-1]
		consider(nb, 0)
		if t.Owner < 0 {
			continue
		}
		if g.Players[t.Owner].Neutral && t.Troops > 10 && g.Setup == "frontier" {
			need = max(need, 4) // Native sorties only target garrisons of at most three.
		}
		if t.Owner == p || g.Players[t.Owner].Neutral {
			for _, source := range g.board().Countries[nb-1].Neighbors {
				consider(source, nb)
			}
		}
	}
	return need
}

// Both local and remote controllers use this shortlist. Merely sorting an
// exposed capital first still lets the remote controller end the turn or waste
// its army elsewhere. Necessary survival trades precede placement; otherwise
// defend our capital, then pursue a feasible knockout with the reserved army.
func capitalPriorityOptions(g *Game, options []botOption) []botOption {
	if g.Goal != "capital" || len(options) == 0 {
		return options
	}
	p := g.actor()
	capital := g.Players[p].Capital
	threatened := g.mine(capital, p) && g.Territories[capital-1].Troops < capitalDefenseNeed(g, p, 0)
	priority := func(op botOption) int {
		if threatened {
			switch op.Action.Type {
			case "trade":
				if plan, ok := op.Facts["timing_plan"].(cardTimingPlan); ok && plan.Objective == "defend_capital" {
					return 3
				}
			case "place":
				if op.Action.Territory == capital {
					return 2
				}
			case "fortify":
				if op.Action.To == capital {
					return 2
				}
			}
		}
		if op.Action.Type == "attack" && op.Score > 0 {
			if plan, ok := op.Facts["elimination_plan"].(eliminationPlan); ok && plan.Feasible && plan.Capital > 0 {
				return 1
			}
		}
		return 0
	}
	best := 0
	for _, op := range options {
		best = max(best, priority(op))
	}
	if best == 0 {
		return options
	}
	kept := options[:0]
	for _, op := range options {
		if priority(op) == best {
			op.Facts["capital_priority"] = map[int]string{1: "capture_enemy_capital", 2: "defend_own_capital", 3: "trade_for_capital_defense"}[best]
			kept = append(kept, op)
		}
	}
	return kept
}

// Look ahead along one advancing army, including intervening native countries.
// Keep the search bounded; choose again after every real battle and occupation.
func planCapitalCampaign(g *Game, p, from, to, troops int) eliminationPlan {
	best := eliminationPlan{Opponent: -1, Approximate: true}
	const maxSteps = 4
	// Distance to any live rival capital cheaply excludes irrelevant fronts.
	distance := make([]int, len(g.Territories))
	queue := []int{}
	for i := range distance {
		distance[i] = maxSteps + 1
	}
	for opponent, player := range g.Players {
		if opponent != p && !player.Neutral && g.mine(player.Capital, opponent) {
			distance[player.Capital-1] = 0
			queue = append(queue, player.Capital)
		}
	}
	for head := 0; head < len(queue); head++ {
		id := queue[head]
		if distance[id-1] >= maxSteps-1 {
			continue
		}
		for _, nb := range g.board().Countries[id-1].Neighbors {
			if !g.mine(nb, p) && distance[nb-1] > distance[id-1]+1 {
				distance[nb-1] = distance[id-1] + 1
				queue = append(queue, nb)
			}
		}
	}
	if distance[to-1] >= maxSteps || g.mine(to, p) {
		return best
	}
	position := *g
	position.Territories = append([]Territory(nil), g.Territories...)
	var search func(source, target, army int, probability float64, route []int)
	search = func(source, target, army int, probability float64, route []int) {
		t := position.Territories[target-1]
		continent := planContinent(&position, p, position.board().Countries[target-1].Continent)
		reserve, targetReserve := conquestGarrisons(&position, source, target, p, continent)
		available := army - reserve - (targetReserve - 1)
		limit := position.defenseOddsLimit(target)
		probability *= combatChanceWithDefense(available, t.Troops, limit)
		if probability < .70 {
			return
		}
		route = append(route, target)
		if t.Owner >= 0 && !position.Players[t.Owner].Neutral && position.Players[t.Owner].Capital == target {
			cards, territories := len(g.Players[t.Owner].Cards), g.owned(t.Owner)
			captured := 0
			for _, id := range route {
				if g.Territories[id-1].Owner == t.Owner {
					captured++
				}
			}
			plan := eliminationPlan{Opponent: t.Owner, Capital: target, Released: territories - captured,
				Territories: territories, Cards: cards, Route: append([]int(nil), route...),
				Probability: probability, Approximate: true, Feasible: true,
				ImmediateTrade:    len(g.Players[p].Cards)+cards >= 6,
				CardBonusEstimate: float64(nextCardBonus(g)) * min(1.0, float64(cards)/3)}
			// Elimination denies a rival's whole income, but their remaining armies
			// become independent natives: never count them as captured reinforcements.
			plan.Value = probability * (2000 + float64(min(30, g.reinforcement(t.Owner)))*25 + float64(cards)*80 + plan.CardBonusEstimate*6)
			if plan.ImmediateTrade {
				plan.Value += probability * 100
			}
			plan.Value /= 1 + .15*float64(len(route)-1)
			if plan.Value > best.Value {
				best = plan
			}
			return
		}
		if len(route) >= maxSteps {
			return
		}
		// Use losses from the real dice table for the next leg, especially the
		// extra capital die. These are conservative estimates, not promised wins.
		losses := expectedCombatLosses(available, t.Troops, limit)
		survivors := army - reserve - int(math.Ceil(losses.attacker))
		if survivors < targetReserve {
			return
		}
		oldSource := position.Territories[source-1]
		position.Territories[source-1].Troops = reserve
		position.Territories[target-1] = Territory{Owner: p, Troops: survivors}
		for _, nb := range position.board().Countries[target-1].Neighbors {
			if !position.mine(nb, p) && distance[nb-1] < maxSteps-len(route) {
				search(target, nb, survivors, probability, route)
			}
		}
		position.Territories[source-1] = oldSource
		position.Territories[target-1] = t
	}
	search(from, to, troops, 1, nil)
	return best
}
