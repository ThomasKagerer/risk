package main

import "testing"

func TestReloadCompletesOnlyFinishedReinforcement(t *testing.T) {
	for _, tc := range []struct {
		name      string
		pool      int
		paused    bool
		mustTrade bool
		wantPhase string
	}{
		{"completed", 0, false, false, "attack"},
		{"remaining units", 2, false, false, "reinforce"},
		{"mandatory exchange", 0, false, true, "reinforce"},
		{"paused", 0, true, false, "reinforce"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, err := newServer(t.TempDir(), 10)
			if err != nil {
				t.Fatal(err)
			}
			g := playing()
			g.Phase, g.Pool, g.Paused = "reinforce", tc.pool, tc.paused
			g.Resume, g.ForcedTrade, g.TradeOpen = "attack", true, tc.mustTrade
			g.Conquered, g.CardDrawn = true, true
			if tc.mustTrade {
				g.Players[0].Cards = []int{0, 2, 3, 5, 6, 7}
			}
			if err := s.save(g); err != nil {
				t.Fatal(err)
			}
			r, err := s.get(g.Code)
			if err != nil {
				t.Fatal(err)
			}
			loaded := r.game
			if loaded.Phase != tc.wantPhase || !loaded.Conquered || !loaded.CardDrawn || loaded.Turn != g.Turn {
				t.Fatal("reload changed the wrong state", loaded.Phase)
			}
			wantRevision := g.Revision
			if tc.wantPhase == "attack" {
				wantRevision++
				if loaded.ForcedTrade || loaded.TradeOpen || loaded.Resume != "" {
					t.Fatal("reinforcement flags survived the transition")
				}
			}
			if loaded.Revision != wantRevision {
				t.Fatal("revision must change only when the phase changes")
			}
			s2, err := newServer(s.dir, 10)
			if err != nil {
				t.Fatal(err)
			}
			reloaded, err := s2.get(g.Code)
			if err != nil || reloaded.game.Phase != tc.wantPhase || reloaded.game.Revision != wantRevision {
				t.Fatal("reload transition was not persisted", err)
			}
			if tc.paused {
				enabled := false
				do(t, loaded, 0, Action{Type: "pause", Enabled: &enabled}, sequence(0))
				if loaded.Phase != "attack" || loaded.Paused {
					t.Fatal("unpausing must finish an old completed reinforcement")
				}
			}
		})
	}
}
