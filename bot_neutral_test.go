package main

import "testing"

func TestNeutralOpponentNeverAttacksOrFortifies(t *testing.T) {
	g := annoyingFixture()
	for _, phase := range []string{"attack", "fortify"} {
		g.Phase = phase
		options := neutralOptions(g, func(int) int { return 0 })
		if len(options) != 1 || options[0].Action.Type != "next" {
			t.Fatalf("%s: %+v", phase, options)
		}
		if err := g.apply(g.actor(), options[0].Action, func(int) int { return 0 }); err != nil {
			t.Fatal(err)
		}
	}
}

func TestNeutralReinforcesRandomOwnedCountryOneUnitAtATime(t *testing.T) {
	g := annoyingFixture()
	g.Phase = "reinforce"
	g.Pool = 5
	g.TradeOpen = false
	g.ForcedTrade = false
	g.Territories[0] = Territory{Owner: g.actor(), Troops: 2}
	var choices []int
	for _, last := range []bool{false, true} {
		options := neutralOptions(g, func(n int) int {
			if last {
				return n - 1
			}
			return 0
		})
		a := options[0].Action
		if a.Type != "place" || a.Amount != 1 || g.Territories[a.Territory-1].Owner != g.actor() {
			t.Fatalf("invalid placement: %+v", a)
		}
		choices = append(choices, a.Territory)
		if err := g.apply(g.actor(), a, func(int) int { return 0 }); err != nil {
			t.Fatal(err)
		}
	}
	if choices[0] == choices[1] {
		t.Fatal("random draw must change destination")
	}
}
