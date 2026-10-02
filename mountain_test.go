package main

import (
	"math"
	"testing"
)

func mountainBattle(mapID string, to, troops int) *Game {
	g := newGame("MOUNTA", "fixed", "Host", "", mapID)
	g.Players = append(g.Players, Player{Name: "Defender"}, Player{Name: "Other"})
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 2, Troops: 1}
	}
	from := g.board().Countries[to-1].Neighbors[0]
	g.Territories[from-1] = Territory{Owner: 0, Troops: 8}
	g.Territories[to-1] = Territory{Owner: 1, Troops: troops}
	g.Phase, g.Turn = "attack", 0
	return g
}

func TestMountainDiceForBothMaps(t *testing.T) {
	for _, tc := range []struct {
		mapID string
		to    int
	}{{"classic", 1}, {"world120", 43}} {
		for troops := 1; troops <= 4; troops++ {
			g := mountainBattle(tc.mapID, tc.to, troops)
			from := g.board().Countries[tc.to-1].Neighbors[0]
			do(t, g, 0, Action{Type: "attack", From: from, To: tc.to, Dice: 3}, sequence(0))
			maxDice := min(3, troops)
			if g.defenseDice(tc.to) != maxDice {
				t.Fatal("missing terrain or troop limit")
			}
			if err := g.apply(1, Action{Type: "defend", Dice: maxDice + 1, Revision: g.Revision}, sequence(0)); err == nil {
				t.Fatal("accepted too many defense dice")
			}
			// Both human choice and every bot option must obey exactly the same cap.
			opts := botOptions(g)
			if len(opts) != maxDice || opts[0].Action.Dice != maxDice {
				t.Fatal("bot did not exploit known low attack roll", opts)
			}
			for _, o := range opts {
				if err := clone(g).apply(1, o.Action, sequence(0)); err != nil {
					t.Fatal(err)
				}
			}
			do(t, g, 1, Action{Type: "defend", Dice: maxDice}, sequence(0))
			if len(g.Battle.Defense) != maxDice || g.Battle.AttackerLoss != maxDice || g.Battle.DefenderLoss != 0 {
				t.Fatal("all dice pairs, including the third, must count; ties favor defense", g.Battle)
			}
			if g.Territories[from-1].Troops != 8-maxDice || g.Territories[tc.to-1].Troops != troops {
				t.Fatal("wrong troop losses")
			}
		}
	}
	flat := mountainBattle("classic", 2, 5)
	if flat.defenseDice(2) != 2 {
		t.Fatal("flat country got terrain bonus")
	}
}

func TestMountainNativeDefenseAndConquest(t *testing.T) {
	for _, neutral := range []bool{false, true} {
		g := mountainBattle("world120", 43, 3)
		from := g.board().Countries[42].Neighbors[0]
		g.Players[1].Neutral = neutral
		if neutral {
			g.Setup = "frontier"
		}
		do(t, g, 0, Action{Type: "attack", From: from, To: 43, Dice: 3}, sequence(3, 3, 3, 0, 0, 0))
		if !neutral {
			do(t, g, 1, Action{Type: "defend", Dice: 3}, sequence(0))
		}
		if len(g.Battle.Defense) != 3 || !g.Battle.Conquered || g.Battle.DefenderLoss != 3 || g.Phase != "occupy" {
			t.Fatal("bad mountain conquest", g.Battle)
		}
		do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
		if g.Territories[42].Troops != 3 || g.Territories[from-1].Troops != 5 {
			t.Fatal("bad occupation")
		}
	}
}

func TestMountainCombatOdds(t *testing.T) {
	if combatChanceWithDefense(8, 5, 3) >= combatChance(8, 5) {
		t.Fatal("mountains should reduce conquest odds")
	}
	if math.Abs(combatChanceWithDefense(8, 2, 3)-combatChance(8, 2)) > 1e-12 {
		t.Fatal("third die requires three units")
	}
	a, d, c := defenseOutcomes([]int{1, 1, 1}, 3, 3)
	if a != 3 || d != 0 || c != 0 {
		t.Fatal("wrong three-dice expectation", a, d, c)
	}
	for _, name := range []string{"Schweizer Eidgenossenschaft", "Kurfürstentum Bayern", "Tibet", "Neuguinea"} {
		found := false
		for _, country := range boards["world120"].Countries {
			if country.Name == name {
				found = country.Mountainous
			}
		}
		if !found {
			t.Fatal("expected geographic mountain region", name)
		}
	}
}
