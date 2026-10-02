package main

import (
	"math"
	"testing"
)

func TestExpectedCombatLossesFollowDiceAndTerrain(t *testing.T) {
	loss := expectedCombatLosses(1, 1, 2)
	if math.Abs(loss.attacker-21.0/36) > 1e-9 || math.Abs(loss.defender-15.0/36) > 1e-9 {
		t.Fatal("incorrect expected single-die losses", loss)
	}
	normal, mountain := expectedCombatLosses(20, 10, 2), expectedCombatLosses(20, 10, 3)
	if mountain.attacker <= normal.attacker || mountain.defender >= normal.defender {
		t.Fatal("ignored terrain in the sacrifice estimate", normal, mountain)
	}
	for _, sizes := range [][2]int{{0, 10}, {10, 0}, {300, 200}, {200, 300}} {
		loss := expectedCombatLosses(sizes[0], sizes[1], 3)
		if loss.attacker < 0 || loss.attacker > float64(sizes[0]) || loss.defender < 0 || loss.defender > float64(sizes[1]) {
			t.Fatal("casualty estimate exceeded either army", sizes, loss)
		}
	}
}

func TestBotGamblesMobileReserveToWeakenMainEnemyArmy(t *testing.T) {
	g := campaignGame()
	g.Conquered = true
	g.Territories[6].Troops = 11
	g.Territories[1].Troops = 10
	g.Territories[4].Troops, g.Territories[5].Troops, g.Territories[36].Troops = 1, 1, 3
	g.Territories[13].Owner = 2
	g.Territories[20] = Territory{Owner: 0, Troops: 25}
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 {
		t.Fatal("refused an advantageous blow to the opponent's main army", op)
	}
	plan := op.Facts["weakening_plan"].(weakeningPlan)
	if !plan.Worthwhile || plan.ConquestChance >= .90 || plan.EnemyArmyShare < .25 || op.Facts["target_garrison_estimate"] != 1 {
		t.Fatal("did not deliberately relax the mobile reserve for this gamble", op)
	}
	// The same fight is not worthwhile when it risks virtually our whole army.
	g.Territories[20] = Territory{Owner: 2, Troops: 50}
	if plan := planWeakening(g, 0, 7, 2, 11); plan.Worthwhile {
		t.Fatal("ignored the risk to our overall strength", plan)
	}
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("treated any damage to an enemy as justification for all-in", op)
	}
}

func TestBotClearsDistantFootholdBeforeOrdinaryExpansion(t *testing.T) {
	for _, count := range []int{1, 2} {
		g := eliminationGame()
		g.Territories[36] = Territory{Owner: 1, Troops: 50}
		if count == 1 {
			g.Territories[5].Owner = 2
		}
		op := botOptions(g)[0]
		if op.Action.Type != "attack" || op.Action.To != 2 {
			t.Fatal("ignored the opponent's remote reinforcement foothold", count, op)
		}
		plan := op.Facts["foothold_plan"].(footholdPlan)
		if !plan.Feasible || len(plan.Route) != count || op.Facts["elimination_plan"].(eliminationPlan).Feasible {
			t.Fatal("confused regional removal with full player elimination", plan)
		}
		for step := 0; step < 20; step++ {
			remaining := 0
			for i, land := range g.Territories {
				if land.Owner == 1 && g.board().Countries[i].Continent == 1 {
					remaining++
				}
			}
			if remaining == 0 {
				break
			}
			rng := sequence(5)
			if g.Phase == "defend" {
				rng = sequence(0)
			}
			do(t, g, g.actor(), botOptions(g)[0].Action, rng)
		}
		if g.owned(1) != 1 || len(g.Players[1].Cards) != 4 {
			t.Fatal("regional clearing should leave the distant empire and cards intact")
		}
		for i, land := range g.Territories {
			if land.Owner == 1 && g.board().Countries[i].Continent == 1 {
				t.Fatal("opponent can still place reinforcements in the cleared region")
			}
		}
	}
}

func TestFootholdCampaignRequiresCompleteReachableRemoval(t *testing.T) {
	g := eliminationGame()
	g.Territories[36] = Territory{Owner: 1, Troops: 50}
	g.Territories[5].Troops = 100
	if plan := planFoothold(g, 0, 7, 2, 15); plan.Feasible {
		t.Fatal("rewarded a foothold campaign that cannot finish", plan)
	}
	g.Territories[5].Troops = 1
	g.Territories[13] = Territory{Owner: 1, Troops: 30} // Greenland connects directly to the remaining empire.
	if plan := planFoothold(g, 0, 7, 2, 15); plan.Feasible {
		t.Fatal("treated an easily re-entered border as an isolated foothold", plan)
	}
}
