package main

import "testing"

func campaignGame() *Game {
	g := strategyGame()
	for i := range g.Territories {
		g.Territories[i].Troops = 50
	}
	g.Territories[6] = Territory{Owner: 0, Troops: 15}
	g.Territories[1] = Territory{Owner: 1, Troops: 5}
	g.Territories[4] = Territory{Owner: 1, Troops: 50}
	g.Territories[5] = Territory{Owner: 1, Troops: 50}  // A substantial front, not an isolated foothold.
	g.Territories[13] = Territory{Owner: 1, Troops: 50} // Connected through Greenland to Iceland.
	g.Territories[36] = Territory{Owner: 1, Troops: 50}
	return g
}

func stallFront(g *Game, continent int) {
	g.Conflicts = []ConflictRound{{Round: g.Round, Player: 0, Opponent: 1, Continent: continent,
		Losses: 12, EnemyLosses: 4, Captured: 2, Lost: 2}}
}

func TestBotStopsCostlyStalemateAndReconsidersBreakthrough(t *testing.T) {
	g := campaignGame()
	if op := botOptions(g)[0]; op.Action.Type != "attack" || op.Action.To != 2 {
		t.Fatal("fixture must offer a viable first conquest", op)
	}
	stallFront(g, 1)
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("continued a costly conflict just for another territory/card", op)
	}
	// A stronger army changes the future prospects despite past sunk costs.
	g.Territories[6].Troops = 40
	if op := botOptions(g)[0]; op.Action.Type != "attack" || op.Action.To != 2 {
		t.Fatal("history permanently blacklisted a now favorable breakthrough", op)
	}
}

func TestBotRedirectsReinforcementsFromArmsRace(t *testing.T) {
	g := campaignGame()
	g.Phase, g.Pool = "reinforce", 4
	g.Territories[1].Troops = 100
	g.Territories[20] = Territory{Owner: 0, Troops: 6}
	g.Territories[21] = Territory{Owner: 2, Troops: 1}
	stallFront(g, 1)
	op := botOptions(g)[0]
	if op.Action.Type != "place" || op.Action.Territory != 21 {
		t.Fatal("fed the opponent's arms race instead of viable expansion", op)
	}
}

func TestBotWithdrawsToUsefulConnectedFront(t *testing.T) {
	g := campaignGame()
	g.Phase = "fortify"
	g.Territories[1].Troops = 100
	g.Territories[7] = Territory{Owner: 0, Troops: 1} // Quebec connects to Ontario.
	g.Territories[5] = Territory{Owner: 2, Troops: 1} // Useful expansion from Quebec.
	stallFront(g, 1)
	op := botOptions(g)[0]
	if op.Action.Type != "fortify" || op.Action.From != 7 || op.Action.To != 8 || op.Facts["withdraw_from_costly_front"] != true {
		t.Fatal("could not redirect a trapped army", op)
	}
	do(t, g, 0, op.Action, sequence(0))
	if g.Territories[7].Troops < 10 || g.Territories[6].Troops != 2 {
		t.Fatal("withdrawal fragmented the army", g.Territories[6:8])
	}
}

func TestBotProtectsOwnedContinentDespiteStalemate(t *testing.T) {
	g := campaignGame()
	g.Phase, g.Pool = "reinforce", 4
	for _, c := range g.board().Countries {
		if c.Continent == 6 {
			g.Territories[c.ID-1] = Territory{Owner: 0, Troops: 2}
		}
	}
	g.Territories[32] = Territory{Owner: 1, Troops: 30}
	stallFront(g, 5)
	op := botOptions(g)[0]
	if op.Action.Type != "place" || op.Action.Territory != 39 {
		t.Fatal("abandoned income-producing continent because its border is costly", op)
	}
	g.Phase = "fortify"
	g.Territories[38].Troops = 12
	for _, op := range botOptions(g) {
		if op.Action.Type == "fortify" && op.Action.From == 39 {
			t.Fatal("withdrew from an underdefended continent border", op)
		}
	}
}

func TestConflictMemoryTracksResolvedBattlesAndRecaptures(t *testing.T) {
	g := campaignGame()
	g.Territories[1].Troops = 2
	do(t, g, 0, Action{Type: "attack", From: 7, To: 2, Dice: 3}, sequence(0))
	if len(g.Conflicts) != 0 {
		t.Fatal("counted losses before defense resolved")
	}
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(5))
	g = clone(g)
	if len(g.Conflicts) != 2 || g.Conflicts[0].Losses != 2 || g.Conflicts[1].EnemyLosses != 2 {
		t.Fatal("public losses were not persisted for both sides", g.Conflicts)
	}
	do(t, g, 0, Action{Type: "attack", From: 7, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(0))
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	// A counterattack in the next round erases the territorial gain.
	g.Round++
	g.Turn, g.Phase = 1, "attack"
	g.Territories[5] = Territory{Owner: 1, Troops: 10}
	g.Territories[1].Troops = 1
	do(t, g, 1, Action{Type: "attack", From: 6, To: 2, Dice: 3}, sequence(5))
	do(t, g, 0, Action{Type: "defend", Dice: 1}, sequence(0))
	assessment := assessConflict(g, 0, 2, 6)
	if assessment.Losses != 3 || assessment.EnemyLosses != 2 || assessment.NetTerritories != 0 {
		t.Fatal("failed to net out a recaptured territory", assessment)
	}
	g.Round += conflictRounds
	if c := assessConflict(g, 0, 2, 6); c.Losses != 0 || c.Penalty != 0 {
		t.Fatal("stale history affected a decision", c)
	}
	g.pruneConflicts()
	if len(g.Conflicts) != 0 {
		t.Fatal("old conflict records accumulated")
	}
}

func TestConflictHistoryIsRegionalAndIgnoresNatives(t *testing.T) {
	g := campaignGame()
	stallFront(g, 4)
	if c := assessConflict(g, 0, 2, 6); c.Stalled || c.Penalty != 0 {
		t.Fatal("unrelated front inherited a feud", c)
	}
	g.Setup = "frontier"
	g.Territories[1].Owner = 2
	g.Conflicts = nil
	do(t, g, 0, Action{Type: "attack", From: 7, To: 2, Dice: 3}, sequence(0))
	if len(g.Conflicts) != 0 {
		t.Fatal("non-attacking natives created a player feud")
	}
}

func TestBotKeepsMobileArmyForOrdinaryConquests(t *testing.T) {
	g := campaignGame()
	g.Conquered = true // The first-card exception is covered separately.
	g.Territories[6].Troops = 4
	g.Territories[1] = Territory{Owner: 2, Troops: 1}
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("spent its last small army for ordinary territory", op)
	}
	g.Territories[6].Troops = 12
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 || op.Facts["target_garrison_estimate"].(int) < 4 {
		t.Fatal("did not retain a useful mobile force", op)
	}
	// Ordinary expansion after earning a card is judged more conservatively.
	g.Conquered = false
	g.Territories[6].Troops, g.Territories[1].Troops = 15, 5
	if op := botOptions(g)[0]; op.Action.Type != "attack" {
		t.Fatal("fixture should allow the first card", op)
	}
	g.Conquered = true
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("risked the same force for a redundant extra conquest", op)
	}
}

func TestBotAcceptsStrategicSacrificeForBonusDenial(t *testing.T) {
	g := strategyGame()
	for i, c := range g.board().Countries {
		g.Territories[i].Troops = 50
		if c.Continent == 3 {
			g.Territories[i].Owner = 1
		}
	}
	g.Conquered = true
	g.Territories[20] = Territory{Owner: 0, Troops: 4}
	g.Territories[18].Troops = 1
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 19 || op.Facts["strategic_objective"] != true {
		t.Fatal("generic troop reserve prevented a valuable bonus interruption", op)
	}
}

func eliminationGame() *Game {
	g := campaignGame()
	g.Conquered = true
	g.Territories[36].Owner = 2
	g.Territories[4].Owner = 2
	g.Territories[13].Owner = 2
	g.Territories[1].Troops = 2
	g.Territories[5] = Territory{Owner: 1, Troops: 2} // Route Ontario -> Northwest -> Greenland.
	g.Territories[7] = Territory{Owner: 2, Troops: 1} // Easy ordinary alternative.
	g.Players[1].Cards = []int{1, 2, 3, 4}
	g.Players[0].Cards = []int{5, 6}
	return g
}

func TestBotPrioritizesCompleteEliminationCampaignAndLoot(t *testing.T) {
	g := eliminationGame()
	stallFront(g, 1) // Finishing the opponent still justifies this campaign.
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 {
		t.Fatal("preferred ordinary expansion to taking the opponent's cards", op)
	}
	plan := op.Facts["elimination_plan"].(eliminationPlan)
	if !plan.Feasible || len(plan.Route) != 2 || plan.Route[1] != 6 || plan.Cards != 4 || !plan.ImmediateTrade {
		t.Fatal("did not account for the complete route and immediate trade", plan)
	}
	// Follow the real actions through both conquests and the loot transfer.
	for step := 0; step < 20 && g.owned(1) > 0; step++ {
		a := botOptions(g)[0].Action
		rng := sequence(5)
		if g.Phase == "defend" {
			rng = sequence(0)
		}
		do(t, g, g.actor(), a, rng)
	}
	if g.owned(1) != 0 || len(g.Players[0].Cards) != 6 || len(g.Players[1].Cards) != 0 || !g.ForcedTrade {
		t.Fatal("failed to finish campaign and collect cards")
	}
}

func TestEliminationPlanRejectsUnreachableOrUnaffordableFinalTerritory(t *testing.T) {
	for _, remote := range []bool{false, true} {
		g := eliminationGame()
		if remote {
			g.Territories[5].Owner = 2
			g.Territories[36] = Territory{Owner: 1, Troops: 1}
		} else {
			g.Territories[5].Troops = 100
		}
		plan := planElimination(g, 0, 7, 2, 15)
		if plan.Feasible || plan.Value != 0 {
			t.Fatal("rewarded the first target without a viable finishing route", plan)
		}
		op := botOptions(g)[0]
		if remote {
			if op.Action.Type != "attack" || op.Action.To != 2 || !op.Facts["foothold_plan"].(footholdPlan).Feasible {
				t.Fatal("missed the separate benefit of removing the isolated foothold", op)
			}
		} else if op.Action.Type != "attack" || op.Action.To != 8 {
			t.Fatal("chased unreachable cards instead of the ordinary alternative", op)
		}
	}
}

func TestEliminationPlanProtectsIncomeAndUsesOnlyPublicCards(t *testing.T) {
	g := eliminationGame()
	before := planElimination(g, 0, 7, 2, 15)
	g.Players[1].Cards = []int{11, 12, 13, 14}
	after := planElimination(g, 0, 7, 2, 15)
	if before.Value != after.Value || before.Probability != after.Probability {
		t.Fatal("enemy card identities affected the campaign")
	}
	g = strategyGame()
	for _, c := range g.board().Countries {
		if c.Continent == 4 {
			g.Territories[c.ID-1] = Territory{Owner: 0, Troops: 1}
		}
	}
	g.Players[2].Neutral = false
	g.Territories[11] = Territory{Owner: 2, Troops: 30}
	g.Territories[18] = Territory{Owner: 1, Troops: 1}
	g.Players[1].Cards = []int{1, 2, 3, 4, 5}
	g.Territories[20].Troops = 10
	if plan := planElimination(g, 0, 21, 19, 10); plan.Feasible {
		t.Fatal("loot justified spending an existing continent's garrison", plan)
	}
}
