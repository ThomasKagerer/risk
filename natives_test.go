package main

import "testing"

func nativeFixture() *Game {
	g := playing()
	g.Setup = "frontier"
	g.Players = append(g.Players, Player{Name: "Einheimische", Neutral: true, Cards: []int{}})
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 3, Troops: 3}
	}
	return g
}
func TestNativeGrowthThreatThresholdAndRandomRange(t *testing.T) {
	for _, owner := range []int{0, 3} {
		for _, roll := range []int{0, 1, 2} {
			g := nativeFixture()
			for i := range g.Territories {
				g.Territories[i].Owner = 0
			}
			g.Territories[0] = Territory{Owner: 3, Troops: 3}
			g.Territories[1] = Territory{Owner: owner, Troops: 5}
			noRoll := func(int) int { t.Fatal("growth rolled before the third round"); return 0 }
			g.growNatives(noRoll)
			g.growNatives(noRoll)
			if g.Territories[0].Troops != 3 {
				t.Fatal("premature growth")
			}
			g = clone(g)
			calls := 0
			g.growNatives(func(n int) int {
				calls++
				if n != 3 {
					t.Fatal("incorrect random range", n)
				}
				return roll
			})
			if calls != 1 || g.Territories[0].Troops != 4+roll || g.Territories[0].NativeThreatRounds != 0 {
				t.Fatal("wrong threatened growth", owner, roll, g.Territories[0])
			}
			if g.nativeThreat(1) {
				t.Fatal("one-unit gap or better must stop the fast cycle")
			}
		}
	}
	g := nativeFixture()
	g.Territories[1].Troops = 4
	if g.nativeThreat(1) {
		t.Fatal("one-unit gap is not a threat")
	}
	g.Territories[1].Troops = 5
	if !g.nativeThreat(1) {
		t.Fatal("two-unit gap must be a threat")
	}
	g.Territories[1].Owner = -1
	if g.nativeThreat(1) {
		t.Fatal("unowned country is not a threat")
	}
}

func TestNativeQuietGrowthIndependentDrawsZeroAndPersistence(t *testing.T) {
	g := nativeFixture()
	for i := 0; i < 4; i++ {
		g.growNatives(func(int) int { t.Fatal("quiet growth before five rounds"); return 0 })
	}
	g = clone(g)
	calls := 0
	g.growNatives(func(n int) int {
		if n != 3 {
			t.Fatal("incorrect random range", n)
		}
		v := calls % 3
		calls++
		return v
	})
	if calls != len(g.Territories) {
		t.Fatal("countries did not receive independent draws", calls)
	}
	for i, v := range g.Territories {
		if v.Troops != 3+i%3 || v.NativeQuietRounds != 0 {
			t.Fatal("wrong quiet growth", i, v)
		}
	}
	g = clone(g)
	g.growNatives(func(int) int { t.Fatal("zero growth did not restart its interval"); return 0 })
	// A quiet due country rolling zero must not claim any reinforcement in the log.
	g = nativeFixture()
	for i := range g.Territories {
		g.Territories[i].NativeQuietRounds = 4
	}
	before := len(g.Log)
	g.growNatives(sequence(0))
	if len(g.Log) != before {
		t.Fatal("zero additions logged as reinforcement")
	}
}

func TestNativeGrowthRestartsOnThreatChangesAndUsesSnapshot(t *testing.T) {
	g := nativeFixture()
	for i := range g.Territories {
		g.Territories[i].Owner = 0
	}
	g.Territories[0] = Territory{Owner: 3, Troops: 3, NativeQuietRounds: 4}
	g.Territories[1].Troops = 5
	noRoll := func(int) int { t.Fatal("growth counter survived a regime change"); return 0 }
	g.growNatives(noRoll)
	if g.Territories[0].NativeQuietRounds != 0 || g.Territories[0].NativeThreatRounds != 1 {
		t.Fatal("quiet to threatened did not reset")
	}
	g.growNatives(noRoll)
	g.Territories[1].Troops = 4
	g.growNatives(noRoll)
	if g.Territories[0].NativeQuietRounds != 1 || g.Territories[0].NativeThreatRounds != 0 {
		t.Fatal("threatened to quiet did not reset")
	}
	for i := 0; i < 3; i++ {
		g.growNatives(noRoll)
	}
	g.growNatives(sequence(2))
	if g.Territories[0].Troops != 5 {
		t.Fatal("new quiet cycle missing")
	}
	// Country 1 grows 4 -> 6. Adjacent country 2 (3) must only detect
	// that new threat on the following round, not midway through this update.
	g = nativeFixture()
	g.Territories[0].Troops = 4
	g.Territories[0].NativeQuietRounds = 4
	g.growNatives(sequence(2))
	if g.Territories[1].NativeThreatRounds != 0 || g.Territories[1].NativeQuietRounds != 1 {
		t.Fatal("same-round growth cascade")
	}
	g = clone(g)
	g.growNatives(noRoll)
	if g.Territories[1].NativeThreatRounds != 1 || g.Territories[1].NativeQuietRounds != 0 {
		t.Fatal("next-round threat missing")
	}
	g.Setup = "classic"
	before := g.Territories[0]
	g.growNatives(noRoll)
	if g.Territories[0].Troops != before.Troops {
		t.Fatal("legacy neutral growth changed")
	}
}

func raidFixture() *Game {
	g := nativeFixture()
	g.Territories[0] = Territory{Owner: 3, Troops: 12}
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	g.Territories[15] = Territory{Owner: 0, Troops: 8}
	g.Territories[20] = Territory{Owner: 2, Troops: 8}
	g.Turn = 0
	g.Round = 4
	return g
}
func TestNativeRaidPromotionManualDefenseAndTurnOrder(t *testing.T) {
	g := raidFixture()
	if !g.startNativeRaid(sequence(0, 0, 5, 5, 5)) || g.Phase != "defend" || g.actor() != 1 {
		t.Fatal("human defense missing")
	}
	g = clone(g)
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	newcomer := len(g.Players) - 1
	if newcomer != 4 || g.Players[newcomer].Neutral || g.Players[newcomer].Bot != "local" || g.Players[newcomer].OriginCountry != 1 {
		t.Fatal("no independent bot", g.Players)
	}
	if g.Territories[0].Owner != newcomer || g.Territories[1].Owner != newcomer || g.Territories[0].Troops+g.Territories[1].Troops != 12 {
		t.Fatal("incorrect occupation")
	}
	if g.NativeRaid != nil || g.Turn != 0 || g.Phase != "reinforce" || !g.Battle.Conquered {
		t.Fatal("interrupted turn not resumed")
	}
	// Eliminated defender and the shared native owner are skipped; appended bot plays.
	g.Phase = "fortify"
	do(t, g, 0, Action{Type: "next"}, sequence(1))
	if g.Turn != 2 {
		t.Fatal("eliminated player not skipped", g.Turn)
	}
	g.Phase = "fortify"
	do(t, g, 2, Action{Type: "next"}, sequence(1))
	if g.Turn != newcomer || len(botOptions(g)) == 0 {
		t.Fatal("new bot cannot play", g.Turn)
	}
	g.Phase = "fortify"
	do(t, g, newcomer, Action{Type: "next"}, sequence(1))
	if g.Turn != 0 || g.Round != 5 {
		t.Fatal("round order broken", g.Turn, g.Round)
	}
}
func TestNativeRaidThresholdChanceFailureAndAutomaticDefense(t *testing.T) {
	for _, tc := range []struct{ source, target, roll int }{{10, 1, 0}, {11, 3, 0}, {20, 4, 0}, {12, 1, 1}} {
		g := raidFixture()
		g.Territories[0].Troops = tc.source
		g.Territories[1].Troops = tc.target
		if g.startNativeRaid(sequence(tc.roll)) {
			t.Fatal("raid outside thresholds", tc)
		}
	}
	g := raidFixture()
	g.Players[1].AutoDefense = true
	if !g.startNativeRaid(sequence(0)) {
		t.Fatal("raid missing")
	}
	if len(g.Players) != 4 || g.Territories[0].Troops != 11 || g.Territories[1].Troops != 1 || g.Turn != 0 || g.NativeRaid != nil {
		t.Fatal("failed raid must remain native and resume turn")
	}
	g = raidFixture()
	g.Turn = 2
	g.Phase = "fortify"
	g.Round = 3
	do(t, g, 2, Action{Type: "next"}, sequence(0, 0, 5, 5, 5))
	if g.Round != 4 || g.NativeRaid == nil || g.actor() != 1 {
		t.Fatal("raid not triggered at full-round boundary")
	}
}
