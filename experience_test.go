package main

import (
	"slices"
	"testing"
)

func TestExperienceStarsAndStrictDiceThresholds(t *testing.T) {
	for survived, want := range []int{0, 1, 1, 2, 2, 3, 3, 3} {
		if got := unitStars(survived); got != want {
			t.Fatalf("%d survived: %d stars, want %d", survived, got, want)
		}
	}
	for _, tc := range []struct {
		units []int
		bonus int
	}{
		{nil, 0}, {[]int{1, 1, 1, 1}, 0}, {[]int{1, 1, 1, 1, 1}, 1},
		{[]int{3, 3, 3, 3, 1, 1, 1, 1}, 1}, {[]int{3, 3, 3, 3, 3, 1, 1, 1}, 2},
		{[]int{5, 5, 5, 5, 3, 3, 3, 3}, 2}, {[]int{5, 5, 5, 5, 5, 3, 3, 3}, 3},
	} {
		for _, rules := range []string{"domination", "classic", ""} {
			g := playing()
			g.Rules = rules
			g.Territories[0] = Territory{Owner: 0, Troops: 8, Experience: tc.units}
			want := tc.bonus
			if rules != "domination" {
				want = 0
			}
			if g.experienceBonus(1) != want || g.attackDice(1) != 3+want {
				t.Fatalf("%s %v: bonus %d, dice %d", rules, tc.units, g.experienceBonus(1), g.attackDice(1))
			}
			if rules == "domination" {
				for level := 0; level <= 5; level++ {
					g.Territories[0].BuildingLevel = level
					if g.defenseLimit(1) != 2+level+want || g.defenseDice(1) != min(8, 2+level+want) {
						t.Fatalf("defense threshold %v, building %d: limit %d, dice %d", tc.units, level, g.defenseLimit(1), g.defenseDice(1))
					}
				}
			}
		}
	}
	g := playing()
	g.Rules = "domination"
	g.Territories[0] = Territory{Owner: 0, Troops: 3, Experience: []int{5, 5, 5}}
	if g.attackDice(1) != 2 {
		t.Fatal("bonus must still leave one garrison troop")
	}
}

func TestVeteranDefenseManualAutomaticAndBot(t *testing.T) {
	for _, mode := range []string{"manual", "automatic", "bot"} {
		g := playing()
		g.Rules = "domination"
		g.Territories[0] = Territory{Owner: 0, Troops: 12, Experience: slices.Repeat([]int{5}, 12)}
		g.Territories[1] = Territory{Owner: 1, Troops: 12, BuildingLevel: 5, Experience: slices.Repeat([]int{5}, 12)}
		if mode == "automatic" {
			g.Players[1].AutoDefense = true
		}
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 6}, sequence(0))
		if mode == "bot" {
			options := botOptions(g)
			if len(options) != 10 || !slices.ContainsFunc(options, func(o botOption) bool { return o.Action.Dice == 10 }) {
				t.Fatalf("bot is missing veteran defense choices: %+v", options)
			}
		}
		if mode != "automatic" {
			if err := g.apply(1, Action{Type: "defend", Dice: 11}, sequence(5)); err == nil {
				t.Fatal("allowed more than building plus experience dice")
			}
			do(t, g, 1, Action{Type: "defend", Dice: 10}, sequence(5))
		}
		if g.Battle == nil || len(g.Battle.Defense) != 10 || g.Battle.AttackerLoss != 6 {
			t.Fatalf("%s defense failed: %+v", mode, g.Battle)
		}
		g.Territories[1].Troops = 4
		if g.defenseDice(2) != 4 || g.automaticDefenseDice(2, []int{6, 6, 6, 6}) != 3 {
			t.Fatal("veteran defense must respect remaining troops and automatic high-roll choice")
		}
	}
}

func TestExperienceCasualtyWeightsAndGarrison(t *testing.T) {
	hits := make([]int, 5)
	for pick := 0; pick < 15; pick++ {
		territory := Territory{Troops: 5, Experience: []int{0, 0, 1, 3, 5}}
		before, dead := resolveUnitExperience(&territory, 1, 1, 1, func(n int) int {
			if n != 15 {
				t.Fatalf("wrong total weight %d", n)
			}
			return pick
		})
		hits[dead[0]]++
		if !slices.Equal(before, []int{0, 0, 1, 3, 5}) || territory.Experience[0] != 0 {
			t.Fatal("snapshot or garrison changed")
		}
	}
	if !slices.Equal(hits, []int{0, 8, 4, 2, 1}) {
		t.Fatalf("wrong casualty weights %v", hits)
	}
	territory := Territory{Troops: 5, Experience: []int{0, 0, 1, 3, 5}}
	_, dead := resolveUnitExperience(&territory, 4, 1, 1, sequence(0))
	if !slices.Equal(dead, []int{1, 2, 3, 4}) || !slices.Equal(territory.Experience, []int{0}) {
		t.Fatal("losses must be distinct and cannot kill garrison", dead, territory)
	}
}

func TestExperiencePromotionAtOwnersNextTurn(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Territories[0] = Territory{Owner: 0, Troops: 12}
	g.Territories[1] = Territory{Owner: 1, Troops: 12}
	for i := 0; i < 2; i++ {
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
		do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
		g = clone(g)
	}
	for _, id := range []int{1, 2} {
		for _, experience := range g.Territories[id-1].Experience {
			if experience != 0 {
				t.Fatal("combat promoted immediately")
			}
		}
	}
	g.Turn = 2
	g.beginTurn()
	if g.Territories[0].Experience[1] != 0 || g.Territories[1].Experience[0] != 0 {
		t.Fatal("another player's turn promoted units")
	}
	g.Turn = 0
	g.beginTurn()
	if g.Territories[0].Experience[0] != 0 || g.Territories[0].Experience[1] != 1 || g.Territories[1].Experience[0] != 0 {
		t.Fatal("owner turn must promote participants once and leave garrison alone")
	}
	g.beginTurn()
	if g.Territories[0].Experience[1] != 1 {
		t.Fatal("idle units promoted again")
	}
	g.Turn = 1
	g.beginTurn()
	if g.Territories[1].Experience[0] != 1 {
		t.Fatal("defenders not promoted on their turn")
	}
}

func TestPendingPromotionDiesWithCasualty(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Territories[0] = Territory{Owner: 0, Troops: 2}
	g.ensureUnitHistory(false)
	resolveUnitExperience(&g.Territories[0], 0, 1, 1, sequence(0))
	resolveUnitExperience(&g.Territories[0], 1, 1, 2, sequence(0))
	g.Territories[0].Troops = 1
	g.beginTurn()
	if !slices.Equal(g.Territories[0].Experience, []int{0}) {
		t.Fatal("dead participant or idle garrison promoted")
	}
}

func TestExperienceOccupationFortifyAndFreshRecruits(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Territories[0] = Territory{Owner: 0, Troops: 8, Experience: []int{0, 1, 1, 2, 3, 4, 5, 0}}
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	do(t, g, 0, Action{Type: "occupy", Amount: 4}, sequence(0))
	g = clone(g)
	if !slices.Equal(g.Territories[0].Experience, []int{0, 1, 1, 2}) || !slices.Equal(g.Territories[1].Experience, []int{3, 4, 5, 0}) {
		t.Fatal("occupation lost individual experience", g.Territories[:2])
	}
	// Combat after moving must preserve pending promotion without awarding immediately.
	g.Territories[2] = Territory{Owner: 2, Troops: 4}
	do(t, g, 0, Action{Type: "attack", From: 2, To: 3, Dice: 3}, sequence(5))
	do(t, g, 2, Action{Type: "defend", Dice: 1}, sequence(0))
	if !slices.Equal(g.Territories[1].Experience, []int{3, 4, 5, 0}) {
		t.Fatal("moving reset turn award")
	}
	g.Phase = "fortify"
	do(t, g, 0, Action{Type: "fortify", From: 2, To: 1, Amount: 2}, sequence(0))
	if !slices.Equal(g.Territories[0].Experience, []int{0, 1, 1, 2, 5, 0}) || !slices.Equal(g.Territories[1].Experience, []int{3, 4}) {
		t.Fatal("fortify reset experience")
	}
	g.Territories[0].Troops += 2
	_, _ = resolveUnitExperience(&g.Territories[0], 0, 1, g.ExperienceTurn, sequence(0))
	if !slices.Equal(g.Territories[0].Experience, []int{0, 1, 1, 2, 5, 0, 0, 0}) {
		t.Fatal("new recruits inherit experience or old troops get twice", g.Territories[0].Experience)
	}
	g.beginTurn()
	if !slices.Equal(g.Territories[0].Experience, []int{0, 2, 2, 3, 6, 1, 1, 1}) || !slices.Equal(g.Territories[1].Experience, []int{4, 5}) {
		t.Fatal("moved participants or fresh participants not promoted on next owner turn")
	}
}

func TestExperienceSixDiceConquestAndClassicIsolation(t *testing.T) {
	for _, rules := range []string{"domination", "classic", ""} {
		g := playing()
		g.Rules = rules
		g.Territories[0] = Territory{Owner: 0, Troops: 8, Experience: []int{5, 5, 5, 5, 5, 5, 5, 5}}
		g.Territories[1] = Territory{Owner: 1, Troops: 6, BuildingLevel: 5}
		a := Action{Type: "attack", From: 1, To: 2, Dice: 6, Revision: g.Revision}
		err := g.apply(0, a, sequence(5))
		if rules != "domination" {
			if err == nil {
				t.Fatal("veteran dice leaked to other rules")
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		g = clone(g)
		do(t, g, 1, Action{Type: "defend", Dice: 6}, sequence(0))
		if g.Battle.DefenderLoss != 6 || g.minimumOccupation() != 6 || g.Phase != "occupy" {
			t.Fatal("six dice not resolved", g.Battle)
		}
		do(t, g, 0, Action{Type: "occupy", Amount: 6}, sequence(0))
		if len(g.Territories[1].Experience) != 6 || g.Territories[1].Experience[0] != 5 {
			t.Fatal("veterans lost at conquest")
		}
	}
	g := playing()
	g.Rules = "classic"
	g.Territories[0].Troops = 8
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(0))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.ExperienceTurn != 0 || len(g.Territories[0].Experience) != 0 || len(g.Territories[1].Experience) != 0 {
		t.Fatal("classic combat awards experience")
	}
}

func TestUnitHistoryCountsBattlesTracksRecruitmentAndMoves(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Round = 4
	g.Territories[0] = Territory{Owner: 0, Troops: 8}
	g.Territories[1] = Territory{Owner: 1, Troops: 4}
	g.ensureUnitHistory(false)
	veteranID := g.Territories[0].UnitHistory[7].ID
	for i := 0; i < 2; i++ {
		do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
		do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(0))
	}
	if g.Territories[0].UnitHistory[7].Battles != 2 || g.Territories[0].Experience[7] != 0 || g.Territories[0].UnitHistory[0].Battles != 0 {
		t.Fatal("battles and experience use different counters")
	}
	do(t, g, 0, Action{Type: "occupy", Amount: 4}, sequence(0))
	g = clone(g)
	unit := g.Territories[1].UnitHistory[3]
	if unit.ID != veteranID || unit.BornRound != 4 || unit.Battles != 2 || unit.Partial {
		t.Fatal("moved unit history lost", unit)
	}
	g.Round = 6
	g.Phase = "reinforce"
	g.Pool = 2
	do(t, g, 0, Action{Type: "place", Territory: 2, Amount: 2}, sequence(0))
	for _, recruit := range g.Territories[1].UnitHistory[4:] {
		if recruit.ID <= veteranID || recruit.BornRound != 6 || recruit.Battles != 0 || recruit.Partial {
			t.Fatal("recruit inherited veteran history", recruit)
		}
	}
	if g.Territories[1].UnitHistory[3] != unit {
		t.Fatal("reinforcement changed veteran age")
	}
	ids := map[int]bool{}
	for _, territory := range g.Territories {
		for _, u := range territory.UnitHistory {
			if u.ID == 0 || ids[u.ID] {
				t.Fatal("missing or duplicated unit identity")
			}
			ids[u.ID] = true
		}
	}
}

func TestUnitHistoryOldSaveMigrationPersistsWithoutInventingAge(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Round = 17
	s, err := newServer(t.TempDir(), 4)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.save(g); err != nil {
		t.Fatal(err)
	}
	first, err := s.get(g.Code)
	if err != nil {
		t.Fatal(err)
	}
	unit := first.game.Territories[0].UnitHistory[0]
	if unit.ID == 0 || unit.BornRound != 0 || !unit.Partial || unit.SinceRound != 17 {
		t.Fatal("legacy age fabricated", unit)
	}
	restarted, err := newServer(s.dir, 4)
	if err != nil {
		t.Fatal(err)
	}
	second, err := restarted.get(g.Code)
	if err != nil {
		t.Fatal(err)
	}
	if second.game.Territories[0].UnitHistory[0] != unit || second.game.NextUnitID != first.game.NextUnitID {
		t.Fatal("restart changed troop identity")
	}
}
