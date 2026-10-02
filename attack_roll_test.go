package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"slices"
	"testing"
)

func TestAttackRevealedBeforeDefenseAndNeverRerolled(t *testing.T) {
	for _, defense := range []int{1, 2} {
		g := playing()
		g.Territories[0].Troops, g.Territories[1].Troops = 8, 3
		calls := 0
		roll := sequence(1, 5, 3)
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, func(n int) int {
			calls++
			return roll(n)
		})
		if calls != 3 || g.Phase != "defend" || g.actor() != 1 || !slices.Equal(g.Pending.Attack, []int{6, 4, 2}) {
			t.Fatalf("attack must be rolled before defense: %+v, %d calls", g.Pending, calls)
		}
		if g.Territories[0].Troops != 8 || g.Territories[1].Troops != 3 || g.Battle != nil {
			t.Fatal("troops changed before the defender rolled")
		}
		attackID := g.Pending.ID
		if attackID != g.Revision {
			t.Fatal("attack roll is missing a stable identifier")
		}
		for _, viewer := range []int{0, 1, 2} {
			if q := g.view(viewer)["pending"].(*Pending); !slices.Equal(q.Attack, []int{6, 4, 2}) {
				t.Fatal("attack roll not visible to all players")
			}
		}
		neverRoll := func(int) int { t.Fatal("unexpected reroll"); return 0 }
		before := clone(g)
		for _, action := range []Action{
			{Type: "attack", From: 1, To: 2, Dice: 3},
			{Type: "defend", Dice: 0},
			{Type: "defend", Dice: 3},
		} {
			action.Revision = g.Revision
			if g.apply(1, action, neverRoll) == nil {
				t.Fatal("accepted invalid action during defense", action)
			}
		}
		if !reflect.DeepEqual(g, before) || g.preparePendingAttack(neverRoll) {
			t.Fatal("pending attack was changed")
		}
		calls = 0
		roll = sequence(5, 2)
		do(t, g, 1, Action{Type: "defend", Dice: defense}, func(n int) int {
			calls++
			return roll(n)
		})
		if calls != defense || g.Battle.AttackID != attackID || !slices.Equal(g.Battle.Attack, []int{6, 4, 2}) {
			t.Fatal("resolution rerolled the stored attack", g.Battle, calls)
		}
		if g.Battle.AttackerLoss != 1 || g.Battle.DefenderLoss != defense-1 {
			t.Fatal("wrong losses or ties", g.Battle)
		}
		if g.Battle.AttackerTroops != 8 || g.Battle.DefenderTroops != 3 {
			t.Fatal("battle must preserve actual pre-combat strengths, independent of dice", g.Battle)
		}
		if g.apply(1, Action{Type: "defend", Dice: defense, Revision: g.Revision}, neverRoll) == nil {
			t.Fatal("defender could repeat a finished roll")
		}
	}
}

func TestBattleStrengthSurvivesOccupationAndPersistence(t *testing.T) {
	g := playing()
	g.Territories[0].Troops, g.Territories[1].Troops = 16, 1
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 5, 5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Phase != "occupy" {
		t.Fatal("expected conquest")
	}
	do(t, g, 0, Action{Type: "occupy", Amount: 10}, sequence(0))
	saved := clone(g)
	if saved.Battle.AttackerTroops != 16 || saved.Battle.DefenderTroops != 1 {
		t.Fatal("later troop movement must not change the army shown for the battle", saved.Battle)
	}
}

func TestFortificationSurvivesLossesReloadAndPausesUntilNextPlayer(t *testing.T) {
	g := playing()
	g.Territories[0].Troops, g.Territories[1].Troops = 80, 51
	for round := 0; round < 25; round++ {
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
		g = clone(g) // Reconnecting while choosing defense keeps the same building.
		do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(0))
		if g.Battle.FortificationTroops != 51 || g.Battle.DefenderTroops != 51-round*2 {
			t.Fatal("the building must stay fixed while actual troops decline", g.Battle)
		}
		if round == 1 {
			do(t, g, 0, Action{Type: "next"}, sequence(0))
			do(t, g, 0, Action{Type: "back"}, sequence(0))
		}
	}
	if g.Territories[1].Troops != 1 || g.Territories[1].FortificationTroops != 51 {
		t.Fatal("one survivor should still occupy the original stronghold")
	}
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if g.Turn != 1 || g.Territories[1].FortificationTroops != 0 {
		t.Fatal("the next player's turn must release the old fortification")
	}
	// A different player attacks that survivor during the following turn.
	do(t, g, 1, Action{Type: "place", Territory: 2, Amount: g.Pool}, sequence(0))
	do(t, g, 1, Action{Type: "next"}, sequence(0))
	do(t, g, 1, Action{Type: "next"}, sequence(0))
	g.Territories[2].Troops = 10
	do(t, g, 2, Action{Type: "place", Territory: 3, Amount: g.Pool}, sequence(0))
	want := g.Territories[1].Troops
	do(t, g, 2, Action{Type: "attack", From: 3, To: 2, Dice: 3}, sequence(0))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(5))
	if g.Battle.FortificationTroops != want || g.Battle.FortificationTroops == 51 {
		t.Fatal("a new turn must build from the current garrison", g.Battle)
	}
}

func TestPendingAttackPersistsAcrossReloadAndLegacyMigration(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		s, err := newServer(t.TempDir(), 4)
		if err != nil {
			t.Fatal(err)
		}
		g := playing()
		g.Players[1].TokenHash = hashToken("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
		g.Territories[0].Troops, g.Territories[1].Troops = 8, 3
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 3, 1))
		if legacy {
			g.Pending.Attack = nil
			g.Pending.ID = 0
		}
		if err := s.save(g); err != nil {
			t.Fatal(err)
		}
		cookies := []*http.Cookie{{Name: "dom_" + g.Code, Value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
		var saved Pending
		var revision int
		for restart := 0; restart < 3; restart++ {
			reloaded, err := newServer(s.dir, 4)
			if err != nil {
				t.Fatal(err)
			}
			w := request(t, reloaded, "GET", "/api/rooms/"+g.Code, nil, cookies)
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			var view struct {
				Pending  Pending
				Revision int
			}
			if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
				t.Fatal(err)
			}
			if len(view.Pending.Attack) != 3 || view.Pending.ID == 0 {
				t.Fatal("missing persisted roll", view)
			}
			for _, value := range view.Pending.Attack {
				if value < 1 || value > 6 {
					t.Fatal("invalid die")
				}
			}
			if restart == 0 {
				saved, revision = view.Pending, view.Revision
				if !legacy && !reflect.DeepEqual(saved, *g.Pending) {
					t.Fatal("saved roll changed")
				}
				if legacy && revision != g.Revision+1 {
					t.Fatal("legacy roll not migrated exactly once")
				}
			} else if !reflect.DeepEqual(saved, view.Pending) || revision != view.Revision {
				t.Fatal("reload rerolled attack dice")
			}
		}
	}
}
