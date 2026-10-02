package main

import "testing"

func TestFirstCardIsHighPriorityButOnlyOncePerTurn(t *testing.T) {
	g := campaignGame()
	g.Territories[1] = Territory{Owner: 2, Troops: 1}
	before := botOptions(g)[0]
	if before.Action.Type != "attack" || before.Action.To != 2 || before.Facts["first_card_priority_value"].(float64) < 500 {
		t.Fatal("did not pursue the first affordable card", before)
	}
	do(t, g, 0, before.Action, sequence(5, 5, 5, 0))
	if g.Phase == "defend" {
		do(t, g, g.actor(), Action{Type: "defend", Dice: 1}, sequence(0))
	}
	do(t, g, 0, botOptions(g)[0].Action, sequence(0))
	if !g.Conquered {
		t.Fatal("conquest must secure the card")
	}
	for _, op := range botOptions(g) {
		if op.Action.Type == "attack" && op.Facts["first_card_priority_value"].(float64) != 0 {
			t.Fatal("rewarded a second card in the same turn", op)
		}
	}
}

func TestFirstCardPrefersReliableCheapCaptureOverExpensiveContinentCampaign(t *testing.T) {
	g := campaignGame()
	g.Territories[1] = Territory{Owner: 2, Troops: 1}
	for _, id := range []int{10, 11, 13} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[11] = Territory{Owner: 2, Troops: 10}
	g.Territories[20] = Territory{Owner: 0, Troops: 26}
	before := botOptions(g)[0]
	if before.Action.Type != "attack" || before.Action.To != 2 {
		t.Fatal("did not secure cheap first card", before)
	}
	g.Conquered = true
	after := botOptions(g)[0]
	if after.Action.Type != "attack" || after.Action.To != 12 {
		t.Fatal("did not return to continent objective after earning card", after)
	}
}

func TestFirstCardReinforcementsAndMovementPrepareAffordableTarget(t *testing.T) {
	for _, phase := range []string{"reinforce", "fortify"} {
		g := campaignGame()
		g.Phase = phase
		g.Pool = 4
		g.Territories[1].Troops = 100
		g.Territories[7] = Territory{Owner: 0, Troops: 3}
		g.Territories[5] = Territory{Owner: 2, Troops: 1}
		if phase == "fortify" {
			g.Conquered = true
			stallFront(g, 1)
		}
		op := botOptions(g)[0]
		if phase == "reinforce" && (op.Action.Type != "place" || op.Action.Territory != 8) {
			t.Fatal("did not reinforce the card front", op)
		}
		if phase == "fortify" && (op.Action.Type != "fortify" || op.Action.To != 8) {
			t.Fatal("did not prepare next turn's card", op)
		}
	}
}

func TestCardPriorityRejectsHopelessAttacksAndRespectsEarnedCardDuringLootExchange(t *testing.T) {
	g := campaignGame()
	g.Territories[6].Troops = 2
	g.Territories[1].Troops = 100
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("suicidal attack for a card", op)
	}
	if firstCardValue(g, 0, 2, .3, 0) != 0 || firstCardValue(g, 0, 2, .9, 50) != 0 {
		t.Fatal("card incentive bypassed feasibility or costly stalemate")
	}
	g.Conquered = true
	g.Phase = "reinforce"
	g.Resume = "attack"
	if firstCardValue(g, 0, 2, 1, 0) != 0 {
		t.Fatal("loot reinforcement claimed a second card")
	}
}

func TestFirstCardCanUseSmallArmyWithoutThrowingAwayItsLastUnits(t *testing.T) {
	g := campaignGame()
	g.Territories[6].Troops = 4
	g.Territories[1] = Territory{Owner: 2, Troops: 1}
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 || op.Facts["target_garrison_estimate"].(int) != 2 {
		t.Fatal("skipped affordable first card to preserve generic expansion reserve", op)
	}
	g.Conquered = true
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("small army pursued a nonexistent second card", op)
	}
	g.Conquered = false
	g.Territories[6].Troops = 3
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("spent its final viable reserves", op)
	}
}
