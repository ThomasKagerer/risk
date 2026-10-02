package main

import (
	"reflect"
	"slices"
	"testing"
)

func TestPauseFreezesPendingCombatAndPersists(t *testing.T) {
	g := playing()
	g.Territories[0].Troops = 15
	g.Territories[1].Troops = 10
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 4, 0))
	attack := slices.Clone(g.Pending.Attack)
	paused := true
	noRoll := func(int) int { t.Fatal("randomness used during pause"); return 0 }
	// A spectator can pause with the older revision shown during an animation.
	if err := g.apply(2, Action{Type: "pause", Enabled: &paused, Revision: g.Revision - 1}, noRoll); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	s, _ := newServer(dir, 8)
	if err := s.save(g); err != nil {
		t.Fatal(err)
	}
	restored, _ := newServer(dir, 8)
	r, err := restored.get(g.Code)
	if err != nil {
		t.Fatal(err)
	}
	g = r.game
	if !g.Paused || g.PausedBy != 2 || !g.view(0)["paused"].(bool) || !slices.Equal(g.Pending.Attack, attack) {
		t.Fatal("pause or pending roll lost on restart")
	}
	before := clone(g)
	for _, action := range []Action{{Type: "defend", Dice: 2}, {Type: "attack", From: 1, To: 2, Dice: 3}, {Type: "endattack"}, {Type: "endturn"}} {
		action.Revision = g.Revision
		if g.apply(g.actor(), action, noRoll) == nil {
			t.Fatal("move accepted during pause", action)
		}
	}
	if !reflect.DeepEqual(before, g) || len(botOptions(g)) != 0 {
		t.Fatal("paused game changed")
	}
	do(t, g, 1, Action{Type: "autodefense", Enabled: &paused}, noRoll)
	if g.Battle != nil || !reflect.DeepEqual(before.Pending, g.Pending) {
		t.Fatal("preference resolved paused combat")
	}
	paused = false
	rolls := 0
	do(t, g, 0, Action{Type: "pause", Enabled: &paused}, func(int) int { rolls++; return 5 })
	if g.Paused || rolls != 1 || g.Battle == nil || !slices.Equal(g.Battle.Attack, attack) || len(g.Battle.Defense) != 1 {
		t.Fatal("resume rerolled attack or failed to use automatic defense", g.Battle)
	}
}
