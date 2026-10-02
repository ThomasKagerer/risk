package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestReinforcementHistoryRecordsIncomeAndAllCardAwards(t *testing.T) {
	g := icelandCapitalFixture()
	g.Round = 4
	g.beginTurn()
	income := g.reinforcementIncome(0)
	if g.Pool != income.Total || income.TerritoryTroops != 3 || len(income.Continents) != 1 {
		t.Fatal("incorrect regular income", income, g.Pool)
	}
	g.Players[0].Cards = []int{0, 1, 2}
	value := g.board().tradeValue(g.Players[0].Cards, g.Mode, g.Trades)
	do(t, g, 0, Action{Type: "trade", Cards: []int{0, 1, 2}, Bonus: 2}, sequence(0))
	before := g.playerReinforcementStats(0)
	if before.Total != income.Total+value+2 || len(before.History) != 1 || before.History[0].Trades[0].Territory != 2 {
		t.Fatal("card award or direct territory bonus was lost", before)
	}
	// Losing a continent changes only the forecast; historical bonuses remain.
	g.Territories[4].Owner = 1
	g = clone(g)
	after := g.playerReinforcementStats(0)
	if !reflect.DeepEqual(before.History, after.History) || after.Next.Total != income.Total-income.Continents[0].Bonus {
		t.Fatal("history changed with ownership or persistence", after)
	}
	// A second exchange during the attack is part of this same turn.
	g.Phase, g.ForcedTrade, g.TradeOpen, g.Resume = "reinforce", true, true, "attack"
	g.Players[0].Cards = []int{3, 4, 5, 6, 7, 8}
	value = g.board().tradeValue([]int{3, 4, 5}, g.Mode, g.Trades)
	do(t, g, 0, Action{Type: "trade", Cards: []int{3, 4, 5}, Bonus: 4}, sequence(0))
	after = g.playerReinforcementStats(0)
	if len(after.History) != 1 || len(after.History[0].Trades) != 2 || after.Total != before.Total+value+2 {
		t.Fatal("loot exchange must count once in the original turn", after)
	}
}

func TestReinforcementHistoryDoesNotInventLegacyAwardsOrPrivateCards(t *testing.T) {
	g := icelandCapitalFixture()
	g.ReinforcementStatistics = nil
	g.Round, g.Phase, g.Pool, g.TradeOpen = 9, "reinforce", 3, true
	g.Players[0].Cards = []int{0, 1, 2}
	before := clone(g)
	if stats := g.playerReinforcementStats(0); !stats.Partial || len(stats.History) != 0 || !reflect.DeepEqual(g, before) {
		t.Fatal("reading legacy stats invented or mutated awards", stats)
	}
	do(t, g, 0, Action{Type: "trade", Cards: []int{0, 1, 2}, Bonus: 2}, sequence(0))
	stats := g.playerReinforcementStats(0)
	if !stats.Partial || stats.SinceRound != 9 || stats.History[0].Income != nil || stats.Total != stats.History[0].Trades[0].Troops+2 {
		t.Fatal("legacy turn must include only known trade income", stats)
	}
	public := g.view(1)["players"].([]PublicPlayer)[0]
	first, _ := json.Marshal(public)
	g.Players[0].Cards = []int{12, 13, 14}
	public = g.view(1)["players"].([]PublicPlayer)[0]
	public.Cards = 0 // Count is public; identities are not.
	second, _ := json.Marshal(public)
	if string(first) != string(second) {
		t.Fatal("opponent card identities leaked into player statistics")
	}
}

func TestReinforcementHistoryBoundsLivePayloadAndKeepsTotals(t *testing.T) {
	g := icelandCapitalFixture()
	for round := 1; round <= 18; round++ {
		g.Round = round
		g.beginTurn()
	}
	stats := g.playerReinforcementStats(0)
	if len(stats.History) != 12 || stats.History[0].Round != 7 || stats.RecordedTurns != 18 || stats.Total != 18*g.reinforcement(0) || len(g.ReinforcementStatistics.Turns) != 18 {
		t.Fatal("bounded public history lost actual totals", stats)
	}
	if g.playerReinforcementStats(2) != nil {
		t.Fatal("natives must not be given normal reinforcements")
	}
	for i := range g.Territories {
		if g.Territories[i].Owner == 1 {
			g.Territories[i].Owner = 2
		}
	}
	if g.playerReinforcementStats(1).Next != nil {
		t.Fatal("eliminated player has forecast income")
	}
	g.Phase = "finished"
	if g.playerReinforcementStats(0).Next != nil {
		t.Fatal("finished game has forecast income")
	}
}

func TestPlayerCombatSummaryIsPublicWithoutSendingRoundHistory(t *testing.T) {
	g := icelandCapitalFixture()
	g.Round = 2
	g.recordCombat(&Battle{Attacker: 0, Defender: 1, To: 1, AttackerLoss: 2, DefenderLoss: 1})
	g.recordCombat(&Battle{Attacker: 0, Defender: 1, To: 1, AttackerLoss: 1, DefenderLoss: 1})
	view := clone(g).view(1)
	stats := view["players"].([]PublicPlayer)[0].Combat
	if stats.Lost != 3 || stats.Killed != 2 || stats.Attacked != 1 || view["statistics"] != nil {
		t.Fatal("incorrect live combat summary", stats)
	}
}

func TestReinforcementHistoryRecordsNativeGrowthAndPublishesFullEndHistory(t *testing.T) {
	g := nativeFixture()
	for i := range g.Territories {
		g.Territories[i].Owner = 0
	}
	g.Territories[1] = Territory{Owner: 3, Troops: 3, NativeQuietRounds: 4}
	g.growNatives(sequence(2))
	g.NativeDefense = &NativeDefense{Attacker: 0, Defender: 3, From: 1, To: 2}
	g.finishNativeDefense(sequence(1))
	g.finishNativeDefense(sequence(1)) // No second award for the same attack.
	if g.Territories[1].Troops != 7 {
		t.Fatal("unexpected native growth")
	}
	history := g.ReinforcementStatistics
	if len(history.Turns) != 1 || history.Turns[0].Total != 4 || history.Turns[0].NativeTroops != 4 {
		t.Fatal("native regular and survival growth must be counted once", history)
	}
	for round := 2; round <= 18; round++ {
		g.Round = round
		g.beginTurn()
	}
	if _, ok := g.view(0)["reinforcementStatistics"]; ok {
		t.Fatal("full history in live update")
	}
	g = clone(g)
	g.Phase = "finished"
	g.Winner = 0
	public := g.view(0)["reinforcementStatistics"].(*ReinforcementStatistics)
	if len(public.Turns) != 18 {
		t.Fatal("finished chart lost older rounds", len(public.Turns))
	}
}
