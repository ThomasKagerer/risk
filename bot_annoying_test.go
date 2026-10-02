package main

import (
	"encoding/json"
	"testing"
)

func annoyingFixture() *Game {
	g := playing()
	g.Rules, g.Goal = "classic", "domination"
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 2, Troops: 20}
	}
	// Ben is one country short of South America. Klaus blocks him in Brazil.
	for _, id := range []int{10, 11, 13} {
		g.Territories[id-1] = Territory{Owner: 1, Troops: 3}
	}
	g.Territories[11] = Territory{Owner: 0, Troops: 9}
	g.Players[0].Bot = "annoying"
	return g
}

func TestAnnoyingRivalIsRandomStableAndReplacedOnlyAfterElimination(t *testing.T) {
	g := annoyingFixture()
	g.Players = append(g.Players, Player{Name: "Neutral", Neutral: true})
	calls := 0
	rng := func(n int) int { calls++; return n - 1 }
	if annoyingTarget(g, 0, rng) != 2 || calls != 1 {
		t.Fatal("must choose among opponents, excluding self and neutrals")
	}
	if annoyingTarget(g, 0, rng) != 2 || calls != 1 {
		t.Fatal("must retain rival without another random draw")
	}
	for i := range g.Territories {
		if g.Territories[i].Owner == 2 {
			g.Territories[i].Owner = 1
		}
	}
	if annoyingTarget(g, 0, rng) != 1 || calls != 2 {
		t.Fatal("must replace eliminated rival")
	}
	g.Players[0].AnnoyingTarget = 0
	if annoyingTarget(annoyingFixture(), 0, func(int) int { return 0 }) != 1 {
		t.Fatal("different random draw should select the other rival")
	}
}

func TestAnnoyingConcentratesOnChosenRivalsContinent(t *testing.T) {
	g := annoyingFixture()
	g.Territories[40] = Territory{Owner: 0, Troops: 40}
	g.Phase, g.Pool = "reinforce", 17
	a := annoyingOptions(g, 1)[0].Action
	if a.Type != "place" || a.Territory != 12 || a.Amount != 17 {
		t.Fatal("must block Ben despite Cleo owning more continents", a)
	}
	assertBotActionsLegal(t, g, []Action{a})
	g.Phase = "setup"
	for i := range g.Players {
		g.Players[i].Reserve = 1
	}
	a = annoyingOptions(g, 1)[0].Action
	if a.Type != "place" || a.Territory != 12 || a.Amount != 1 {
		t.Fatal(a)
	}
	assertBotActionsLegal(t, g, []Action{a})
	g.Phase = "claim"
	g.Territories[11] = Territory{Owner: -1}
	a = annoyingOptions(g, 1)[0].Action
	if a.Type != "claim" || a.Territory != 12 {
		t.Fatal(a)
	}
	assertBotActionsLegal(t, g, []Action{a})
}

func TestAnnoyingAttacksAboveThreeRegardlessOfOddsOrCard(t *testing.T) {
	for _, troops := range []int{1, 2, 3, 4, 9, 10} {
		for _, conquered := range []bool{false, true} {
			g := annoyingFixture()
			g.Territories[11] = Territory{Owner: 1, Troops: 100}
			g.Territories[20] = Territory{Owner: 0, Troops: troops}
			g.Conquered = conquered
			a := annoyingOptions(g, 1)[0].Action
			if troops <= 3 {
				if a.Type != "next" {
					t.Fatal("must stop this stack at three", troops, a)
				}
			} else {
				if a.Type != "attack" || a.From != 21 || a.To != 12 || a.Dice != 3 {
					t.Fatal("must attack overwhelming target even after earning a card", troops, conquered, a)
				}
			}
			assertBotActionsLegal(t, g, []Action{a})
		}
	}
}

func TestAnnoyingKeepsAttackingFromBlockingFoothold(t *testing.T) {
	g := annoyingFixture()
	g.Conquered = true
	a := annoyingOptions(g, 1)[0].Action
	if a.Type != "attack" || a.From != 12 {
		t.Fatal("must not camp or stop after one conquest", a)
	}
	assertBotActionsLegal(t, g, []Action{a})
	// Missing rival must not fall back to cautious attacks.
	a = annoyingOptions(g, -1)[0].Action
	if a.Type != "attack" {
		t.Fatal("must keep attacking without a rival", a)
	}
	g.Phase, g.Pending = "occupy", &Pending{From: 12, To: 11, Minimum: 3, Dice: 3}
	g.Territories[10] = Territory{Owner: 0, Troops: 0}
	a = annoyingOptions(g, 1)[0].Action
	if a.Amount != 8 {
		t.Fatal("move whole available army forward", a)
	}
	assertBotActionsLegal(t, g, []Action{a})
}

func TestAnnoyingMovesMainArmyIntoTargetContinent(t *testing.T) {
	g := annoyingFixture()
	g.Phase, g.Pending = "occupy", &Pending{From: 21, To: 12, Minimum: 3, Dice: 3}
	g.Territories[20] = Territory{Owner: 0, Troops: 10}
	g.Territories[11].Troops = 0
	a := annoyingOptions(g, 1)[0].Action
	if a.Amount != 9 {
		t.Fatal(a)
	}
	assertBotActionsLegal(t, g, []Action{a})
}

func TestAnnoyingCanBeCreatedAddedAndRestored(t *testing.T) {
	s, _ := newServer(t.TempDir(), 8)
	w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Host", "mode": "fixed", "players": []map[string]string{{"kind": "annoying"}}}, nil)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var created struct{ Code string }
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	r, _ := s.get(created.Code)
	if r.game.Players[1].Bot != "annoying" || r.game.Players[1].Name != "Klaus Störtebeker" {
		t.Fatal(r.game.Players)
	}
	w = request(t, s, "POST", "/api/rooms/"+created.Code+"/actions", Action{Type: "addbot", Bot: "annoying", Revision: r.game.Revision}, w.Result().Cookies())
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	restored, _ := newServer(s.dir, 8)
	saved, err := restored.get(created.Code)
	if err != nil || saved.game.Players[2].Bot != "annoying" || saved.game.Players[2].Name != "Klaus Störtebeker 2" {
		t.Fatal("bot not persisted", err)
	}
}

func TestAnnoyingReinforcesBordersInsteadOfHoardingInside(t *testing.T) {
	g := annoyingFixture()
	for _, nb := range g.board().Countries[11].Neighbors {
		g.Territories[nb-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[11].Troops = 100
	// Keep a live focus outside the now-owned South America.
	g.Territories[0] = Territory{Owner: 1, Troops: 3}
	g.Phase, g.Pool = "reinforce", 7
	a := annoyingOptions(g, 1)[0].Action
	if a.Type != "place" || len(enemyNeighbors(g, a.Territory, 0)) == 0 {
		t.Fatal("must reinforce a border", a)
	}
	assertBotActionsLegal(t, g, []Action{a})
}
