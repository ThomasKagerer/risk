package main

import "testing"

func TestTerritoryIncomeUsesActualReinforcementThresholds(t *testing.T) {
	for _, tc := range []struct{ owned, income, next, gain int }{
		{8, 3, 12, 0}, {9, 3, 12, 0}, {11, 3, 12, 1}, {12, 4, 15, 0}, {14, 4, 15, 1},
	} {
		g := strategyGame()
		for i := 0; i < tc.owned; i++ {
			g.Territories[i].Owner = 0
		}
		p := planTerritoryIncome(g, 42, 0)
		if p.Owned != tc.owned || p.CurrentIncome != tc.income || p.NextIncomeAt != tc.next || p.IncomeGain != tc.gain {
			t.Fatal("incorrect income threshold", tc, p)
		}
	}
}

func TestBotGrowsTerritoryIncomeWithoutContinent(t *testing.T) {
	g := campaignGame()
	for _, id := range []int{7, 8, 10, 11, 14, 15, 21, 23, 27, 28, 39} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[6].Troops = 14
	g.Territories[1] = Territory{Owner: 2, Troops: 1}
	g.Conquered = true
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 {
		t.Fatal("did not take affordable land for recurring territory income", op)
	}
	p := op.Facts["territory_income_plan"].(territoryIncomePlan)
	if p.IncomeGain != 1 || p.NextIncomeAt != 12 || op.Facts["completes_continent"] != false {
		t.Fatal("mistook territory income for a continent bonus", op)
	}
	before := g.reinforcement(0)
	do(t, g, 0, op.Action, sequence(5, 5, 5, 0))
	if g.reinforcement(0) != before+1 {
		t.Fatal("projected income did not match the game rules")
	}
}

func TestTerritoryIncomePrefersQuietExpansionCorridor(t *testing.T) {
	g := campaignGame()
	g.Territories[1] = Territory{Owner: 2, Troops: 1}
	g.Territories[7] = Territory{Owner: 2, Troops: 1}
	g.Territories[5] = Territory{Owner: 2, Troops: 1}
	g.Territories[13] = Territory{Owner: 2, Troops: 1}
	quiet := planTerritoryIncome(g, 8, 0)
	g.Territories[5] = Territory{Owner: 1, Troops: 30}
	exposed := planTerritoryIncome(g, 8, 0)
	if quiet.Value <= exposed.Value || quiet.CheapNeutralSpace <= exposed.CheapNeutralSpace || exposed.PlayerExposure == 0 {
		t.Fatal("ignored expansion space and renewed player conflict", quiet, exposed)
	}
}

func TestBotHoldsOptionalSetsForDecisiveTurn(t *testing.T) {
	for _, mode := range []string{"fixed", "progressive"} {
		g := campaignGame()
		g.Mode, g.Phase, g.TradeOpen, g.Pool = mode, "reinforce", true, 3
		g.Trades = 24                       // Even a large progressive value needs a purpose now.
		g.Players[0].Cards = []int{0, 1, 4} // A valid fixed ten-troop set.
		op := botOptions(g)[0]
		if op.Action.Type != "place" {
			t.Fatal("spent an optional set without a concrete strategic gain", mode, op)
		}
		do(t, g, 0, op.Action, sequence(0))
		if len(g.Players[0].Cards) != 3 || g.TradeOpen {
			t.Fatal("did not retain the cards and close trading on placement")
		}
	}
}

func TestBotTimesExchangeForEliminationAndImmediateLootTrade(t *testing.T) {
	g := eliminationGame()
	g.Players[2].Neutral = false // The game continues after eliminating player one.
	g.Territories[6].Troops = 4
	g.Phase, g.TradeOpen, g.Pool = "reinforce", true, 3
	g.Players[0].Cards = []int{0, 1, 4, 12}
	g.Players[1].Cards = []int{2, 3, 5, 7, 8}
	op := botOptions(g)[0]
	if op.Action.Type != "trade" {
		t.Fatal("missed an optional exchange that enables elimination", op)
	}
	timing := op.Facts["timing_plan"].(cardTimingPlan)
	if !timing.Decisive || timing.Objective != "eliminate_player" {
		t.Fatal("exchange was not tied to the planned knockout", op)
	}
	do(t, g, 0, op.Action, sequence(0))
	trades := g.Trades
	for step := 0; step < 30; step++ {
		if g.owned(1) == 0 && g.Phase == "reinforce" && g.ForcedTrade {
			break
		}
		rng := sequence(5)
		if g.Phase == "defend" {
			rng = sequence(0)
		}
		options := botOptions(g)
		if len(options) == 0 {
			t.Fatal("campaign unexpectedly stopped", g.Phase)
		}
		do(t, g, g.actor(), options[0].Action, rng)
	}
	if g.owned(1) != 0 || len(g.Players[0].Cards) != 6 || !g.mustTrade() {
		t.Fatal("planned exchange/kill/loot chain failed", g.Phase)
	}
	op = botOptions(g)[0]
	if op.Action.Type != "trade" {
		t.Fatal("failed to cash in captured cards immediately", op)
	}
	do(t, g, 0, op.Action, sequence(0))
	if g.Trades != trades+1 || len(g.Players[0].Cards) != 3 || g.Pool == 0 {
		t.Fatal("loot did not produce the second reinforcement burst")
	}
	for _, op := range botOptions(g) {
		if op.Action.Type == "trade" {
			t.Fatal("offered an illegal optional exchange after the forced loot trade", op)
		}
	}
}

func TestBotUsesSavedProgressiveSetForSafeBreakthrough(t *testing.T) {
	g := campaignGame()
	g.Mode, g.Phase, g.TradeOpen, g.Pool, g.Trades = "progressive", "reinforce", true, 3, 24
	g.Territories[1].Troops = 15
	g.Players[0].Cards = []int{0, 1, 4}
	op := botOptions(g)[0]
	if op.Action.Type != "trade" || op.Facts["timing_plan"].(cardTimingPlan).Objective != "safe_breakthrough" {
		t.Fatal("hoarded a large set despite a reserve-preserving breakthrough", op)
	}
	for step := 0; step < 150 && g.Phase == "reinforce"; step++ {
		do(t, g, 0, botOptions(g)[0].Action, sequence(0))
	}
	op = botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 || op.Facts["target_garrison_estimate"].(int) < 40 {
		t.Fatal("planned breakthrough did not retain its mobile reserve", op)
	}
}

func TestBotTradesRequiredSetsBeforePlacing(t *testing.T) {
	g := campaignGame()
	g.Phase, g.TradeOpen, g.Pool = "reinforce", true, 3
	g.Players[0].Cards = []int{0, 1, 2, 3, 4, 5, 6, 7}
	for n := 0; n < 2; n++ {
		op := botOptions(g)[0]
		if op.Action.Type != "trade" {
			t.Fatal("hoarded beyond the mandatory limit or placed before all sets", op)
		}
		do(t, g, 0, op.Action, sequence(0))
	}
	if len(g.Players[0].Cards) != 2 || g.Trades != 2 || g.Pool <= 3 {
		t.Fatal("did not accumulate multiple exchanges before placement")
	}
}

func TestBotDoesNotHoardCardsWhileContinentIsInDanger(t *testing.T) {
	g := strategyGame()
	g.Phase, g.TradeOpen, g.Pool = "reinforce", true, 3
	g.Players[0].Cards = []int{0, 1, 4}
	for _, c := range g.board().Countries {
		if c.Continent == 6 {
			g.Territories[c.ID-1] = Territory{Owner: 0, Troops: 1}
		}
	}
	g.Territories[32] = Territory{Owner: 1, Troops: 15}
	op := botOptions(g)[0]
	if op.Action.Type != "trade" || op.Facts["protect_continent_now"] != true {
		t.Fatal("saved a surprise while neglecting immediate defense", op)
	}
}
