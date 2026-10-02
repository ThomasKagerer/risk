package main

import (
	"reflect"
	"slices"
	"testing"
)

func TestPersistentAutomaticDefense(t *testing.T) {
	for _, tc := range []struct {
		mountain bool
		troops   int
		attack   []int
		want     int
	}{
		{false, 8, []int{6, 4, 2}, 2}, {false, 8, []int{6, 5, 1}, 1}, {true, 8, []int{6, 5, 4}, 3}, {true, 8, []int{6, 5, 5}, 2}, {true, 2, []int{6, 5, 1}, 1}, {true, 1, []int{6, 6, 6}, 1},
	} {
		g := playing()
		if tc.mountain {
			g.Map = "world120"
			g.Territories = make([]Territory, 120)
			for i := range g.Territories {
				g.Territories[i] = Territory{Owner: 1, Troops: 8}
			}
		}
		to := 2
		for _, c := range g.board().Countries {
			if c.Mountainous == tc.mountain {
				to = c.ID
				break
			}
		}
		from := g.board().Countries[to-1].Neighbors[0]
		g.Territories[from-1] = Territory{Owner: 0, Troops: 30}
		g.Territories[to-1] = Territory{Owner: 1, Troops: tc.troops}
		enabled := true
		do(t, g, 1, Action{Type: "autodefense", Enabled: &enabled}, sequence(0))
		g = clone(g)
		attack := []int{}
		for _, v := range tc.attack {
			attack = append(attack, v-1)
		}
		do(t, g, 0, Action{Type: "attack", From: from, To: to, Dice: 3}, sequence(attack...))
		if g.Battle == nil || len(g.Battle.Defense) != tc.want || !g.Players[1].AutoDefense {
			t.Fatalf("wrong automatic defense: %+v, %+v", tc, g.Battle)
		}
		if !g.view(1)["autoDefense"].(bool) || g.view(0)["autoDefense"].(bool) {
			t.Fatal("preference leaked to another player")
		}
	}
}
func TestEnableAutomaticDefenseDuringPendingAttackAndDisable(t *testing.T) {
	g := playing()
	g.Territories[0].Troops = 15
	g.Territories[1].Troops = 10
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 4, 0))
	attack := slices.Clone(g.Pending.Attack)
	enabled := true
	calls := 0
	if err := g.apply(1, Action{Type: "autodefense", Enabled: &enabled, Revision: g.Revision - 1}, func(int) int { calls++; return 5 }); err != nil {
		t.Fatal(err)
	}
	if calls != 1 || !slices.Equal(g.Battle.Attack, attack) {
		t.Fatal("pending attack rerolled or wrong defense", g.Battle)
	}
	enabled = false
	do(t, g, 1, Action{Type: "autodefense", Enabled: &enabled}, sequence(0))
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(4))
	if g.Phase != "defend" {
		t.Fatal("disabled preference still defending")
	}
	before := clone(g)
	for _, a := range []Action{{Type: "defend", Dice: 2, Revision: g.Revision - 1}, {Type: "autodefense", Revision: g.Revision}, {Type: "autodefense", Enabled: &enabled, Revision: g.Revision + 1}} {
		if g.apply(1, a, sequence(0)) == nil {
			t.Fatal("accepted invalid action", a)
		}
	}
	if !reflect.DeepEqual(before, g) {
		t.Fatal("invalid action mutated game")
	}
	g.Players[1].Bot = "local"
	if g.apply(1, Action{Type: "autodefense", Enabled: &enabled, Revision: g.Revision}, sequence(0)) == nil {
		t.Fatal("bot preference accepted")
	}
}
func TestCombatStatisticsCountRealLossesDistinctTargetsAndSurviveReload(t *testing.T) {
	g := playing()
	g.Territories[0].Troops = 40
	g.Territories[1].Troops = 20
	for i := 0; i < 2; i++ {
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 0, 0))
		do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(3, 3))
	}
	g = clone(g)
	first := g.Statistics.Rounds[0].Players
	if first[0].Lost != 2 || first[0].Killed != 2 || len(first[0].Attacked) != 1 || first[1].Lost != 2 || first[1].Killed != 2 || len(first[1].Attacked) != 0 {
		t.Fatal(first)
	}
	g.Round = 2
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(0))
	if len(g.Statistics.Rounds) != 2 || len(g.Statistics.Rounds[1].Players[0].Attacked) != 1 {
		t.Fatal(g.Statistics)
	}
	if _, ok := g.view(0)["statistics"]; ok {
		t.Fatal("full history sent on every live update")
	}
	g.Phase = "finished"
	if g.view(0)["statistics"] == nil {
		t.Fatal("missing end statistics")
	}
	old := playing()
	old.Statistics = nil
	old.Round = 25
	old.recordCombat(&Battle{Attacker: 0, Defender: 1, To: 2, AttackerLoss: 2})
	if !old.Statistics.Partial || old.Statistics.SinceRound != 25 {
		t.Fatal("invented statistics for legacy game")
	}
	if g.Statistics.Partial || g.Statistics.SinceRound != 1 {
		t.Fatal("new game incorrectly partial")
	}
}
