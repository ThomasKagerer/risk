package main

import (
	"testing"
	"time"
)

func TestBotsAllowMapIntroductionOnlyForNewAttackRoutes(t *testing.T) {
	r := &room{game: playing()}
	b := &botEngine{battleDelay: 3 * time.Second}
	for _, tc := range []struct {
		from, to, round int
		want            time.Duration
	}{{1, 2, 1, 5 * time.Second}, {1, 2, 1, 3 * time.Second}, {2, 3, 1, 5 * time.Second}, {2, 3, 2, 5 * time.Second}} {
		next := clone(r.game)
		next.Revision++
		next.Round = tc.round
		next.Battle = &Battle{ID: next.Revision, From: tc.from, To: tc.to, Attacker: 0}
		r.recordBattle(next)
		if b.presentationDelay(r) != tc.want || r.lastBattleAt.IsZero() {
			t.Fatal("incorrect delay for map introduction", b.presentationDelay(r), tc.want)
		}
		r.game = next
		before := r.lastBattleAt
		r.recordBattle(clone(next))
		if r.lastBattleAt != before {
			t.Fatal("noncombat updates must not restart the wait")
		}
	}
	b.battleDelay = 0
	if b.presentationDelay(r) != 0 {
		t.Fatal("disabled animation pacing must not slow simulations")
	}
}
