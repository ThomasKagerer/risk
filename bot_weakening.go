package main

// The estimates use maximum dice and stop when one army is exhausted. Large
// armies use the same bounded scaling as the conquest-odds approximation.
func expectedCombatLosses(available, defenders, defenseLimit int) combatLosses {
	if available <= 0 || defenders <= 0 {
		return combatLosses{}
	}
	originalAttack, originalDefense := available, defenders
	scale := 1.0
	if max(available, defenders) > 128 {
		scale = float64(max(available, defenders)) / 128
		available = max(1, int(float64(available)/scale))
		defenders = max(1, int(float64(defenders)/scale))
	}
	initCombatTable()
	loss := combatLossTable[available][defenders]
	if defenseLimit == 3 {
		initMountainCombatTable()
		loss = mountainLossTable[available][defenders]
	}
	if defenseLimit == 4 {
		initCapitalCombatTable()
		loss = capitalLossTable[available][defenders]
	}
	if defenseLimit < 0 {
		loss = buildingCombatModel(defenseLimit).loss[available][defenders]
	}
	return combatLosses{min(float64(originalAttack), loss.attacker*scale), min(float64(originalDefense), loss.defender*scale)}
}

type weakeningPlan struct {
	Target              int     `json:"target"`
	ExpectedOwnLosses   float64 `json:"expected_own_losses_all_out"`
	ExpectedEnemyLosses float64 `json:"expected_enemy_losses_all_out"`
	EnemyArmyShare      float64 `json:"expected_share_of_enemy_army_destroyed"`
	RelativeSwing       float64 `json:"relative_army_advantage_gain"`
	ConquestChance      float64 `json:"conquest_probability"`
	Approximate         bool    `json:"large_army_approximation"`
	Worthwhile          bool    `json:"worthwhile_gamble"`
	Value               float64 `json:"strategic_value"`
}

func planWeakening(g *Game, p, from, to, troops int) weakeningPlan {
	plan := weakeningPlan{Target: to}
	opponent := g.Territories[to-1].Owner
	if opponent < 0 || opponent == p || g.Players[opponent].Neutral || g.Territories[to-1].Troops < 4 {
		return plan
	}
	ownArmy, enemyArmy := troops-g.Territories[from-1].Troops, 0
	for _, t := range g.Territories {
		if t.Owner == p {
			ownArmy += t.Troops
		} else if t.Owner == opponent {
			enemyArmy += t.Troops
		}
	}
	continent := planContinent(g, p, g.board().Countries[to-1].Continent)
	source, target := conquestGarrisons(g, from, to, p, continent)
	available := max(0, troops-source-(target-1))
	defenders := g.Territories[to-1].Troops
	loss := expectedCombatLosses(available, defenders, g.defenseOddsLimit(to))
	plan.ExpectedOwnLosses, plan.ExpectedEnemyLosses = loss.attacker, loss.defender
	plan.EnemyArmyShare = loss.defender / float64(max(1, enemyArmy))
	plan.RelativeSwing = plan.EnemyArmyShare - loss.attacker/float64(max(1, ownArmy))
	plan.ConquestChance = combatChanceWithDefense(available, defenders, g.defenseOddsLimit(to))
	plan.Approximate = max(available, defenders) > 128
	// A small raid is not an all-in objective. Risk the mobile reserve only
	// when it substantially reduces the opponent's strength relative to ours.
	plan.Worthwhile = plan.ConquestChance >= .40 && plan.EnemyArmyShare >= .25 &&
		plan.RelativeSwing >= .08 && loss.defender >= 4 && loss.defender >= loss.attacker*.9
	if plan.Worthwhile {
		plan.Value = 100 + 240*plan.RelativeSwing + 80*plan.EnemyArmyShare
	}
	return plan
}
