package main

import (
	"reflect"
	"testing"
)

func TestReturnToAttackPreservesTurnAndOnlyOneCard(t *testing.T) {
	g := playing()
	g.Conquered = true
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	before := clone(g)
	for i := 0; i < 3; i++ {
		do(t, g, 0, Action{Type: "back"}, sequence(0))
		if g.Phase != "attack" || g.Turn != before.Turn || g.Round != before.Round || !g.Conquered || !g.CardDrawn || !reflect.DeepEqual(g.Territories, before.Territories) {
			t.Fatal("return changed the game position")
		}
		g = clone(g) // The drawn-card guard must survive saving and reloading.
		do(t, g, 0, Action{Type: "next"}, sequence(0))
		if !reflect.DeepEqual(g.Players[0].Cards, before.Players[0].Cards) || !reflect.DeepEqual(g.Deck, before.Deck) {
			t.Fatal("phase switching awarded another card")
		}
	}
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if g.Phase != "reinforce" || g.Turn != 1 || g.CardDrawn || g.Conquered {
		t.Fatal("next turn did not reset card eligibility")
	}
}

func TestReturnBeforeFirstConquestStillAwardsCard(t *testing.T) {
	g := playing()
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	do(t, g, 0, Action{Type: "back"}, sequence(0))
	if g.CardDrawn || len(g.Players[0].Cards) != 0 {
		t.Fatal("card awarded without conquest")
	}
	g.Territories[0].Troops, g.Territories[1].Troops = 8, 1
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if !g.CardDrawn || len(g.Players[0].Cards) != 1 {
		t.Fatal("missing conquest card")
	}
}

func TestReturnToAttackFromLegacyFortifyDoesNotDuplicateCard(t *testing.T) {
	g := playing()
	g.Phase, g.Conquered = "fortify", true
	g.Players[0].Cards = []int{43}
	g.Deck = g.Deck[:43]
	do(t, g, 0, Action{Type: "back"}, sequence(0))
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if len(g.Players[0].Cards) != 1 || len(g.Deck) != 43 {
		t.Fatal("legacy save received a second card")
	}
}

func TestReturnToAttackRequiresOwnTurnBeforeMovement(t *testing.T) {
	for _, tc := range []struct {
		phase  string
		moved  bool
		player int
	}{
		{"fortify", true, 0}, {"fortify", false, 1}, {"attack", false, 0}, {"reinforce", false, 0},
	} {
		g := playing()
		g.Phase, g.Moved = tc.phase, tc.moved
		before := clone(g)
		if g.apply(tc.player, Action{Type: "back", Revision: g.Revision}, sequence(0)) == nil {
			t.Fatal("illegal return accepted", tc)
		}
		if !reflect.DeepEqual(g, before) {
			t.Fatal("rejected return mutated game")
		}
	}
}
