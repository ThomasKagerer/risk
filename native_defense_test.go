package main

import (
	"encoding/json"
	"testing"
)

func defendedNativeFixture(t *testing.T) *Game {
	t.Helper()
	g := nativeFixture()
	g.Territories[0] = Territory{Owner: 0, Troops: 20}
	g.Territories[1].NativeThreatRounds = 2
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 1}, sequence(0))
	return g
}

func TestNativeSurvivalGrowthOnceAfterEntireAttack(t *testing.T) {
	for _, growthRoll := range []int{0, 1, 2} {
		g := defendedNativeFixture(t)
		before := g.Territories[1].Troops
		for i := 0; i < 3; i++ {
			do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 1}, sequence(0))
			if g.Territories[1].Troops != before || g.NativeDefense == nil {
				t.Fatal("native growth must wait until all dice rolls on this border end")
			}
		}
		g = clone(g)
		enabled := true
		do(t, g, 0, Action{Type: "pause", Enabled: &enabled}, sequence(0))
		g = clone(g)
		enabled = false
		do(t, g, 0, Action{Type: "pause", Enabled: &enabled}, sequence(0))
		if g.Territories[1].Troops != before || g.NativeDefense == nil {
			t.Fatal("pause or restart must preserve the ongoing attack without growth")
		}
		calls := 0
		do(t, g, 0, Action{Type: "endattack", From: 1, To: 2}, func(n int) int {
			calls++
			if n != 3 {
				t.Fatal("growth must be uniform in 1–3")
			}
			return growthRoll
		})
		if calls != 1 || g.Territories[1].Troops != before+growthRoll+1 || g.NativeDefense != nil || g.Territories[1].NativeThreatRounds != 2 {
			t.Fatal("incorrect survival bonus or changed ordinary growth clock")
		}
		g = clone(g)
		if g.apply(0, Action{Type: "endattack", From: 1, To: 2, Revision: g.Revision}, sequence(0)) == nil {
			t.Fatal("duplicate retreat awarded another bonus")
		}
		do(t, g, 0, Action{Type: "next"}, sequence(0))
		if g.Territories[1].Troops != before+growthRoll+1 {
			t.Fatal("ending the phase awarded the same bonus twice")
		}
	}
}

func TestNativeSurvivalGrowthOnNewBorderOrAttackPhaseEnd(t *testing.T) {
	g := defendedNativeFixture(t)
	do(t, g, 0, Action{Type: "attack", From: 1, To: 3, Dice: 1}, sequence(2))
	if g.Territories[1].Troops != 6 || g.Territories[2].Troops != 3 || g.NativeDefense.To != 3 {
		t.Fatal("changing border must reinforce only the previous surviving defenders")
	}
	do(t, g, 0, Action{Type: "next"}, sequence(1))
	if g.Phase != "fortify" || g.Territories[2].Troops != 5 || g.NativeDefense != nil {
		t.Fatal("ending attack phase must award the remaining survival bonus")
	}
}

func TestExhaustedAttackerTriggersImmediateNativeGrowth(t *testing.T) {
	g := nativeFixture()
	g.Territories[0] = Territory{Owner: 0, Troops: 2}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 1}, sequence(0, 5, 5, 2))
	if g.Territories[0].Troops != 1 || g.Territories[1].Troops != 6 || g.Battle.DefenderGrowth != 3 || g.Battle.DefenderLoss != 0 || g.NativeDefense != nil {
		t.Fatal("exhausted attack did not award its immediate survival bonus", g.Battle)
	}
}

func TestCapturedCountriesAndLegacyNeutralArmiesGetNoSurvivalBonus(t *testing.T) {
	g := nativeFixture()
	g.Territories[0] = Territory{Owner: 0, Troops: 20}
	g.Territories[1].Troops = 1
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 1}, sequence(5, 0))
	if g.NativeDefense != nil || g.Territories[1].Troops != 0 || !g.Battle.Conquered {
		t.Fatal("captured native country received growth")
	}
	g = nativeFixture()
	g.Setup = ""
	g.Territories[0] = Territory{Owner: 0, Troops: 20}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 1}, sequence(0))
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if g.NativeDefense != nil || g.Territories[1].Troops != 3 {
		t.Fatal("old neutral armies must retain their own rules")
	}
}

func TestInvalidActionsCannotEndNativeDefense(t *testing.T) {
	for _, action := range []Action{{Type: "endattack", From: 1, To: 3}, {Type: "attack", From: 1, To: 3, Dice: 4}} {
		g := defendedNativeFixture(t)
		before, _ := json.Marshal(g)
		action.Revision = g.Revision
		if g.apply(0, action, sequence(0)) == nil {
			t.Fatal("invalid action accepted")
		}
		after, _ := json.Marshal(g)
		if string(before) != string(after) {
			t.Fatal("invalid action awarded growth or closed the attack")
		}
	}
}

func TestAllNeutralArmiesDefendAutomatically(t *testing.T) {
	for _, rules := range []string{"", "classic", "domination"} {
		for _, setup := range []string{"", "frontier"} {
			t.Run(rules+"/"+setup, func(t *testing.T) {
				g := nativeFixture()
				g.Rules = rules
				g.Setup = setup
				g.Territories[0] = Territory{Owner: 0, Troops: 20}
				g.Territories[1].Troops = 3
				maximum := g.defenseDice(2)
				do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 1}, sequence(0))
				if g.Phase == "defend" || g.Battle == nil || len(g.Battle.Defense) != maximum {
					t.Fatal("neutral army must resolve defense on the server with maximum dice", g.Phase, g.Battle)
				}
				if g.Players[0].AutoDefense || g.Players[3].AutoDefense {
					t.Fatal("neutral defense must not require player preferences")
				}
			})
		}
	}
}

func TestNeutralDefenseUsesAutomaticDiceChoice(t *testing.T) {
	for _, setup := range []string{"", "frontier"} {
		for _, roll := range []int{0, 4, 5} {
			g := nativeFixture()
			g.Setup = setup
			g.Rules = "domination"
			g.Territories[0] = Territory{Owner: 0, Troops: 20}
			g.Territories[1].Troops = 3
			maximum := g.defenseDice(2)
			expected := maximum
			if roll >= 4 {
				expected--
			}
			do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: maximum}, sequence(roll))
			if g.Phase == "defend" || g.Battle == nil || len(g.Battle.Defense) != expected {
				t.Fatalf("setup %q, attack roll %d: expected %d defense dice, got %+v", setup, roll+1, expected, g.Battle)
			}
		}
	}
}
