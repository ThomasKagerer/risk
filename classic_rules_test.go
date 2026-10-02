package main

import (
	"math/rand"
	"testing"
)

func TestClassicStartingArmiesAndNoFrontier(t *testing.T) {
	for count := 2; count <= 6; count++ {
		g := newGame("CLASSS", "fixed", "Host", "")
		g.Rules = "classic"
		g.Goal = "domination"
		g.Setup = "frontier"
		for i := 1; i < count; i++ {
			g.Players = append(g.Players, Player{Name: "Player"})
		}
		rng := rand.New(rand.NewSource(int64(count))).Intn
		do(t, g, 0, Action{Type: "start"}, rng)
		if g.Goal != "domination" || g.Setup != "classic" || g.Mode != "progressive" {
			t.Fatal("classic settings not enforced")
		}
		if count == 2 {
			if len(g.Players) != 3 || !g.Players[2].Neutral || g.owned(0) != 14 || g.owned(1) != 14 || g.owned(2) != 14 {
				t.Fatal("classic duel setup")
			}
		} else if len(g.Players) != count {
			t.Fatal("extra natives in classic")
		}
		for step := 0; g.Phase == "claim" || g.Phase == "setup"; step++ {
			if step > 350 {
				t.Fatal("setup stuck")
			}
			p := g.actor()
			id := 0
			for i, tr := range g.Territories {
				if g.Phase == "claim" && tr.Owner < 0 || g.Phase == "setup" && tr.Owner == p {
					id = i + 1
					break
				}
			}
			action := Action{Type: "place", Territory: id, Amount: 1}
			if g.Phase == "claim" {
				action.Type = "claim"
			}
			do(t, g, p, action, rng)
		}
		for p := range g.Players {
			troops := 0
			for _, tr := range g.Territories {
				if tr.Owner == p {
					troops += tr.Troops
				}
				if tr.Owner < 0 || tr.BuildingLevel != 0 {
					t.Fatal("unclaimed land or castle in classic")
				}
			}
			expected := map[int]int{2: 40, 3: 35, 4: 30, 5: 25, 6: 20}[count]
			if troops != expected {
				t.Fatalf("%d players: player %d has %d, want %d", count, p, troops, expected)
			}
		}
	}
}
func TestClassicDiceChoiceBeforeRollAndAutoDefense(t *testing.T) {
	for _, automatic := range []bool{false, true} {
		g := playing()
		g.Rules = "classic"
		g.Territories[0].Troops = 10
		g.Territories[1].BuildingLevel = 6
		rolls := 0
		countRolls := func(n int) int { rolls++; return 0 }
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, countRolls)
		if rolls != 0 || len(g.Pending.Attack) != 0 || g.defenseDice(2) != 2 {
			t.Fatal("classic exposed dice or used building bonus")
		}
		g = clone(g)
		if g.preparePendingAttack(countRolls) || rolls != 0 {
			t.Fatal("reload revealed classic dice")
		}
		if err := g.apply(1, Action{Type: "defend", Dice: 3, Revision: g.Revision}, countRolls); err == nil {
			t.Fatal("three defense dice accepted")
		}
		if automatic {
			enabled := true
			do(t, g, 1, Action{Type: "autodefense", Enabled: &enabled}, countRolls)
		} else {
			do(t, g, 1, Action{Type: "defend", Dice: 2}, countRolls)
		}
		if g.Battle == nil || rolls != 5 || len(g.Battle.Attack) != 3 || len(g.Battle.Defense) != 2 || g.Battle.AttackerLoss != 2 {
			t.Fatal("classic dice resolution", g.Battle, rolls)
		}
	}
}
func TestClassicMovementAndOncePerTurnTerritoryBonus(t *testing.T) {
	g := playing()
	g.Rules = "classic"
	for i := range g.Territories {
		g.Territories[i].Owner = 0
	}
	if !g.connected(1, 2, 0) || g.connected(1, 9, 0) {
		t.Fatal("classic permits only adjacent fortification")
	}
	g.Phase = "reinforce"
	g.TradeOpen = true
	g.Players[0].Cards = []int{0, 2, 3, 12, 13, 18}
	before := g.Territories[0].Troops
	do(t, g, 0, Action{Type: "trade", Cards: []int{0, 2, 3}, Bonus: 1}, sequence(0))
	if g.Territories[0].Troops != before+2 || !g.CardTerritoryBonusUsed {
		t.Fatal("first territory bonus missing")
	}
	g = clone(g)
	before = g.Territories[12].Troops
	do(t, g, 0, Action{Type: "trade", Cards: []int{12, 13, 18}}, sequence(0))
	if g.Territories[12].Troops != before {
		t.Fatal("second territory bonus awarded")
	}
	g.Round++
	g.beginTurn()
	if g.CardTerritoryBonusUsed {
		t.Fatal("next turn did not reset bonus")
	}
}
