package main

import (
	"reflect"
	"testing"
)

// The reported Europe position: blue can sail from Scotland (17) to the
// yellow capital Iceland (3); yellow also has an army in Norway (15).
func icelandCapitalFixture() *Game {
	g := newGame("CAPTAL", "fixed", "Blue", "", "europe1871")
	g.Players = append(g.Players, Player{Name: "Yellow", Capital: 1}, Player{Name: "Natives", Neutral: true})
	g.Goal, g.Phase, g.Conquered = "capital", "attack", true
	g.Players[0].Capital = 2
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 2, Troops: 2}
	}
	for _, id := range []int{2, 3, 4, 5, 17, 18} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[2].Troops = 17
	g.Territories[4].Troops = 2
	g.Territories[0] = Territory{Owner: 1, Troops: 3}
	g.Territories[5] = Territory{Owner: 1, Troops: 15}
	return g
}

func TestCapitalPriorityScotlandCapturesIceland(t *testing.T) {
	for _, conquered := range []bool{false, true} {
		g := icelandCapitalFixture()
		g.Conquered = conquered
		before := clone(g)
		options := botOptions(g)
		if len(options) == 0 {
			t.Fatal("no capital attack")
		}
		for _, op := range options {
			if op.Action.Type != "attack" || op.Action.From != 3 || op.Action.To != 1 {
				t.Fatalf("a controller can ignore the exposed capital: %+v", op.Action)
			}
			plan := op.Facts["elimination_plan"].(eliminationPlan)
			if !plan.Feasible || plan.Capital != 1 || plan.Probability < .70 {
				t.Fatal("capital attack is not supported by combat odds", plan)
			}
		}
		if !reflect.DeepEqual(g, before) {
			t.Fatal("planning changed the live position")
		}
		withoutCards := options[0].Score
		g.Players[0].Cards, g.Players[1].Cards = []int{5, 6}, []int{8, 9, 10, 11}
		op := botOptions(g)[0]
		plan := op.Facts["elimination_plan"].(eliminationPlan)
		if op.Score <= withoutCards || plan.Cards != 4 || !plan.ImmediateTrade {
			t.Fatal("captured cards must increase the knockout's value", op)
		}
	}
}

func TestCapitalPriorityYellowDefendsIceland(t *testing.T) {
	for _, phase := range []string{"setup", "reinforce", "fortify"} {
		g := icelandCapitalFixture()
		g.Turn, g.Phase, g.Pool = 1, phase, 8
		options := botOptions(g)
		if len(options) == 0 {
			t.Fatal("no capital defense options", phase)
		}
		for _, op := range options {
			if phase == "fortify" {
				if op.Action.Type != "fortify" || op.Action.From != 6 || op.Action.To != 1 {
					t.Fatal("must bring Norway's available army to the threatened capital", op.Action)
				}
			} else if op.Action.Type != "place" || op.Action.Territory != 1 {
				t.Fatal("must reinforce the threatened capital before expansion", phase, op.Action)
			}
		}
	}
}

func TestCapitalPriorityTradesForSurvivalBeforePlacing(t *testing.T) {
	g := icelandCapitalFixture()
	g.Turn, g.Phase, g.Pool, g.TradeOpen = 1, "reinforce", 3, true
	g.Players[1].Cards = []int{0, 1, 2}
	op := botOptions(g)[0]
	if op.Action.Type != "trade" {
		t.Fatal("optional cards must rescue the capital before placement closes trading", op.Action)
	}
	for _, candidate := range botOptions(g) {
		if candidate.Action.Type != "trade" {
			t.Fatal("controller can close a necessary survival trade", candidate.Action)
		}
	}
}

func TestCapitalPriorityDefendsThroughWeakFriendlyBuffer(t *testing.T) {
	g := icelandCapitalFixture()
	// Iceland can fall through a one-troop Scotland even though its remaining
	// neighbors are friendly. Ordinary frontier placement misses this threat.
	g.Turn, g.Phase, g.Pool = 1, "reinforce", 8
	g.Territories[2] = Territory{Owner: 1, Troops: 1}
	g.Territories[4] = Territory{Owner: 0, Troops: 25}
	op := botOptions(g)[0]
	if op.Action.Type != "place" || op.Action.Territory != 1 {
		t.Fatal("capital behind a weak buffer must get survival reinforcements", op.Action)
	}
	g.Phase = "fortify"
	op = botOptions(g)[0]
	if op.Action.Type != "fortify" || op.Action.To != 1 {
		t.Fatal("must allow moving troops to a threatened interior capital", op.Action)
	}
}

func TestCapitalPriorityDoesNotForceHopelessAttacks(t *testing.T) {
	g := icelandCapitalFixture()
	g.Territories[0].Troops = 80
	options := botOptions(g)
	stop := false
	for _, op := range options {
		stop = stop || op.Action.Type == "next"
	}
	if !stop || options[0].Action.Type == "attack" && options[0].Action.To == 1 {
		t.Fatal("capital priority must still reject hopeless combat", options[0].Action)
	}
}
