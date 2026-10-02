package main

import (
	"reflect"
	"slices"
	"testing"
)

func TestCapitalReleasePreservesArmiesAndPreviouslyConqueredLand(t *testing.T) {
	g := nativeFixture()
	g.Goal = "capital"
	g.Players[0].Capital, g.Players[1].Capital, g.Players[2].Capital = 13, 2, 37
	g.Players[0].Cards, g.Players[1].Cards = []int{1, 2}, []int{3, 4, 5, 6}
	g.Deck = slices.DeleteFunc(g.Deck, func(id int) bool { return id >= 1 && id <= 6 })
	g.Players[1].Reserve = 4
	g.Territories[0] = Territory{Owner: 0, Troops: 20}
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	positions := []*Point{{X: 117, Y: 121}}
	g.Territories[2] = Territory{Owner: 1, Troops: 17, Positions: positions, NativeThreatRounds: 2, NativeQuietRounds: 4}
	g.Territories[12] = Territory{Owner: 0, Troops: 9} // Already conquered earlier.
	g.Territories[36] = Territory{Owner: 2, Troops: 8}
	before := append([]Territory(nil), g.Territories...)
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(0))
	if len(g.Players) != 4 || g.owned(1) != 0 || g.Players[1].Reserve != 0 {
		t.Fatal("must reuse native faction and eliminate the original owner")
	}
	for i, old := range before {
		if i == 1 {
			continue // The conquered capital itself lost its defending army.
		}
		current := g.Territories[i]
		owner := old.Owner
		if owner == 1 {
			owner = 3
		}
		if current.Owner != owner || current.Troops != old.Troops || !reflect.DeepEqual(current.Positions, old.Positions) {
			t.Fatalf("unexpected change to territory %d: %+v", i+1, current)
		}
	}
	if g.Territories[2].NativeThreatRounds != 0 || g.Territories[2].NativeQuietRounds != 0 {
		t.Fatal("new native growth must start with a fresh counter")
	}
	g = clone(g)
	if !reflect.DeepEqual(g.Territories[2].Positions, positions) || !g.Players[g.Territories[2].Owner].Neutral {
		t.Fatal("native ownership/army positions did not persist")
	}
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	if g.Phase != "reinforce" || g.Resume != "attack" || !g.ForcedTrade || len(g.Players[0].Cards) != 6 || len(g.Players[1].Cards) != 0 || g.Territories[1].Owner != 0 {
		t.Fatal("captured cards must still trigger the immediate mandatory trade", g.Phase)
	}
	if g.owned(0) != 3 || g.owned(2) != 1 || g.defenseDice(2) != 4 {
		t.Fatal("only the captured capital was gained; other players and the castle must survive")
	}
}

func capitalStrategyFixture() *Game {
	g := strategyGame()
	g.Goal, g.Conquered = "capital", true
	g.Players[0].Capital, g.Players[1].Capital = 41, 2
	for i := range g.Territories {
		g.Territories[i].Troops = 40
	}
	g.Territories[40] = Territory{Owner: 0, Troops: 10}
	g.Territories[6] = Territory{Owner: 0, Troops: 24}
	g.Territories[1] = Territory{Owner: 1, Troops: 2}
	g.Territories[36] = Territory{Owner: 1, Troops: 99} // This army must NOT be valued as ours.
	g.Territories[7] = Territory{Owner: 2, Troops: 1}
	g.Players[0].Cards, g.Players[1].Cards = []int{5, 6}, []int{1, 2, 3, 4}
	return g
}

func TestCapitalBotsPrioritizeCaptureOverOrdinaryExpansion(t *testing.T) {
	g := capitalStrategyFixture()
	stallFront(g, 1)
	op := botOptions(g)[0]
	plan := op.Facts["elimination_plan"].(eliminationPlan)
	if op.Action.Type != "attack" || op.Action.To != 2 || !plan.Feasible || plan.Capital != 2 || plan.Cards != 4 || !plan.ImmediateTrade || plan.Released != 1 || op.Facts["cards_if_eliminated"] != 4 {
		t.Fatal("bot failed to prioritize a live capital and its actual reward", op)
	}
	// Public card counts matter, never the unseen symbols in the enemy's hand.
	g.Players[1].Cards = []int{11, 12, 13, 14}
	if next := planElimination(g, 0, 7, 2, 24); next.Value != plan.Value || next.Probability != plan.Probability {
		t.Fatal("planning leaked enemy card identities")
	}
	g.Territories[1].Troops = 200
	if planElimination(g, 0, 7, 2, 24).Feasible || botOptions(g)[0].Action.To == 2 {
		t.Fatal("capital priority caused a hopeless attack")
	}
}

func TestCapitalBotsPlanThroughNativesAndReinforceTheCampaign(t *testing.T) {
	g := capitalStrategyFixture()
	g.Players[1].Capital = 6
	g.Territories[1] = Territory{Owner: 2, Troops: 2}
	g.Territories[5] = Territory{Owner: 1, Troops: 3}
	before := clone(g)
	plan := planElimination(g, 0, 7, 2, 24)
	if !plan.Feasible || !reflect.DeepEqual(plan.Route, []int{2, 6}) || plan.Capital != 6 || plan.Opponent != 1 || plan.Released != 1 {
		t.Fatal("missed the capital behind an independent native country", plan)
	}
	if !reflect.DeepEqual(g, before) {
		t.Fatal("lookahead mutated the live game")
	}
	g.Territories[6].Troops, g.Phase, g.Pool = 2, "reinforce", 24
	op := botOptions(g)[0]
	if op.Action.Type != "place" || op.Action.Territory != 7 {
		t.Fatal("reinforcements ignored the feasible capital campaign", op)
	}
	g.Phase, g.Pool = "fortify", 0
	g.Territories[2] = Territory{Owner: 0, Troops: 28}
	op = botOptions(g)[0]
	if op.Action.Type != "fortify" || op.Action.To != 7 {
		t.Fatal("movement ignored the capital campaign", op)
	}
}

func TestCapitalBotsDoNotEliminateTheOwnerOfAnAlreadyCapturedCastle(t *testing.T) {
	g := capitalStrategyFixture()
	g.Players[2].Neutral = false
	g.Players[2].Capital = 37
	g.Territories[1].Owner = 2 // Player one's former capital, held by player two.
	g.Territories[36].Owner = 2
	if planElimination(g, 0, 7, 2, 24).Feasible {
		t.Fatal("mistook an inherited fortress for its new owner's original capital")
	}
}
