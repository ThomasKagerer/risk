package main

import (
	"encoding/json"
	"math"
	"math/rand"
	"strings"
	"testing"
)

func TestBuildingCostsDurationAndOccupation(t *testing.T) {
	for level := 0; level < 5; level++ {
		g := playing()
		g.Rules = "domination"
		g.Players[0].Cards = []int{0, 1, 2, 3, 4}
		g.Round = 5
		cost := level + 2
		g.Territories[0] = Territory{Owner: 0, Troops: 1, BuildingLevel: level}
		do(t, g, 0, Action{Type: "build", Territory: 1, Cards: []int{0}}, sequence(0))
		if g.Territories[0].Troops != 1 || g.Territories[0].Construction.Remaining != cost || g.defenseDice(1) != 1 {
			t.Fatal("cost, duration or occupied dice", g.Territories[0])
		}
		g = clone(g)
		if err := g.apply(0, Action{Type: "build", Territory: 1, Revision: g.Revision}, sequence(0)); err == nil {
			t.Fatal("two simultaneous constructions")
		}
		g.advanceConstruction()
		if g.Territories[0].Construction.Remaining != cost {
			t.Fatal("construction advanced in starting turn")
		}
		g.Territories[0].Troops = 100
		for turn := 1; turn <= cost; turn++ {
			g.Round++
			g.Turn = 1
			g.advanceConstruction()
			if g.Territories[0].Construction.Remaining != cost-turn+1 {
				t.Fatal("other player's turn advanced construction")
			}
			g.Turn = 0
			g.beginTurn()
			g.advanceConstruction()
			if turn < cost {
				if g.Territories[0].BuildingLevel != level || g.Territories[0].Construction.Remaining != cost-turn || g.defenseDice(1) != 2+level {
					t.Fatal("unfinished building awarded dice")
				}
			}
		}
		if g.Territories[0].Construction != nil || g.Territories[0].BuildingLevel != level+1 || g.defenseDice(1) != 3+level {
			t.Fatal("completed building", g.Territories[0])
		}
	}
}
func TestBuildingValidationAndNoAutomaticUpgrade(t *testing.T) {
	for _, rules := range []string{"", "classic", "domination"} {
		g := playing()
		g.Rules = rules
		g.Players[0].Cards = []int{0}
		g.Territories[0].Troops = 100
		if (g.canBuild(1, 0)) != (rules == "domination") {
			t.Fatal("wrong ruleset")
		}
		if rules == "domination" && (g.defenseDice(1) != 2 || g.Territories[0].BuildingLevel != 0) {
			t.Fatal("troops or mountains upgraded hut")
		}
	}
	g := playing()
	g.Rules = "domination"
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	for _, tc := range []struct {
		phase                string
		owner, troops, level int
	}{{"attack", 1, 100, 0}, {"setup", 0, 100, 0}, {"defend", 0, 100, 0}, {"attack", 0, 100, 6}} {
		g.Phase = tc.phase
		g.Territories[0] = Territory{Owner: tc.owner, Troops: tc.troops, BuildingLevel: tc.level}
		if g.canBuild(1, 0) {
			t.Fatal("invalid build accepted", tc)
		}
	}
	for _, id := range []int{-1, 0, 999} {
		if g.canBuild(id, 0) {
			t.Fatal("invalid territory")
		}
	}
	g.Phase = "attack"
	g.Territories[0] = Territory{Owner: 0, Troops: 100, BuildingLevel: 5}
	for troops := 1; troops <= 12; troops++ {
		g.Territories[0].Troops = troops
		if g.defenseDice(1) != min(7, troops) {
			t.Fatal("citadel dice")
		}
	}
}
func TestBuildingCaptureAndCapitalStart(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	g.Territories[0].Troops = 10
	g.Territories[1] = Territory{Owner: 1, Troops: 1, BuildingLevel: 4, Construction: &Construction{Level: 5, Remaining: 4, LastRound: 1}}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Territories[1].Owner != 0 || g.Territories[1].Construction != nil || g.Territories[1].BuildingLevel != 4 {
		t.Fatal("capture must preserve only completed construction")
	}
	g = frontierGame(3, "classic")
	g.Rules = "domination"
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	g.Goal = "capital"
	rng := rand.New(rand.NewSource(37)).Intn
	chooseFive(t, g, rng)
	p := g.actor()
	id := 0
	for i, tr := range g.Territories {
		if tr.Owner == p {
			id = i + 1
			break
		}
	}
	do(t, g, p, Action{Type: "capital", Territory: id}, rng)
	if g.Territories[id-1].BuildingLevel != 1 || g.defenseDice(id) != 1 {
		t.Fatal("capital needs palisade and real defenders")
	}
	g.Territories[id-1].Troops = 100
	if g.defenseDice(id) != 3 {
		t.Fatal("capital not a citadel")
	}
}
func TestBuildingCombatProbabilities(t *testing.T) {
	// Eight dice have 6^8 ordered results; histogram weights preserve all of them.
	total := 0
	for _, roll := range sortedDiceRolls(8) {
		total += roll.ways
	}
	if total != 1679616 {
		t.Fatal(total)
	}
	previous := 1.0
	for level := 0; level <= 5; level++ {
		chance := combatChanceWithDefense(15, 12, -(level + 2))
		if chance < 0 || chance > previous || math.IsNaN(chance) {
			t.Fatal("more defense slots increased conquest odds", level, chance, previous)
		}
		previous = chance
		if math.Abs(combatChanceWithDefense(5, 1, -(level+2))-combatChance(5, 1)) > 1e-10 {
			t.Fatal("empty slots supplied phantom dice")
		}
	}
	g := playing()
	g.Rules = "domination"
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	g.Territories[0].Troops = 100
	g.Territories[1].BuildingLevel = 5
	g.Territories[1].Troops = 10
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(0))
	options := botOptions(g)
	if len(options) != 7 {
		t.Fatal("defender cannot choose all seven dice", len(options))
	}
	for _, o := range options {
		if err := clone(g).apply(1, o.Action, sequence(0)); err != nil {
			t.Fatal(err)
		}
	}
	do(t, g, 1, Action{Type: "defend", Dice: 7}, sequence(0))
	if len(g.Battle.Defense) != 7 || g.Battle.AttackerLoss != 3 {
		t.Fatal("citadel roll", g.Battle)
	}
}
func TestRulesetCreationAndPersistence(t *testing.T) {
	s, err := newServer(t.TempDir(), 128)
	if err != nil {
		t.Fatal(err)
	}
	for _, rules := range []string{"classic", "domination"} {
		w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Host", "rules": rules, "map": "world120", "goal": "domination", "mode": "fixed"}, nil)
		if w.Code != 201 {
			t.Fatal(w.Code, w.Body.String())
		}
		var view map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
			t.Fatal(err)
		}
		if view["rules"] != rules {
			t.Fatal("rules missing", view)
		}
		if rules == "classic" && (view["map"] != "world120" || view["goal"] != "domination" || view["mode"] != "progressive" || view["setup"] != "classic") {
			t.Fatal("house rules leaked into classic", view)
		}
		if rules == "domination" && (view["map"] != "world120" || view["setup"] != "frontier") {
			t.Fatal("domination settings lost")
		}
		loaded, err := newServer(s.dir, 128)
		if err != nil {
			t.Fatal(err)
		}
		response := request(t, loaded, "GET", "/api/rooms/"+view["code"].(string), nil, w.Result().Cookies())
		if response.Code != 200 || !strings.Contains(response.Body.String(), `"rules":"`+rules+`"`) {
			t.Fatal("rules lost on reload", response.Body.String())
		}
	}
}

func TestRulesetBotGames(t *testing.T) {
	for _, rules := range []string{"classic", "domination"} {
		t.Run(rules, func(t *testing.T) {
			g := newGame("BOTNEW", "progressive", "Host", "")
			g.Rules = rules
			g.Players[0].Cards = []int{0}
			g.Players = append(g.Players, Player{Name: "B"}, Player{Name: "C"})
			rng := rand.New(rand.NewSource(71)).Intn
			do(t, g, 0, Action{Type: "start"}, rng)
			for step := 0; step < 16000; step++ {
				if g.Phase == "finished" {
					t.Logf("%s: %d actions, round %d", rules, step, g.Round)
					return
				}
				options := botOptions(g)
				if len(options) == 0 {
					t.Fatal("no legal options", g.Phase)
				}
				if step%97 == 0 {
					for _, o := range options {
						if err := clone(g).apply(g.actor(), o.Action, rng); err != nil {
							t.Fatal("illegal offered action", o.Action, err)
						}
					}
				}
				do(t, g, g.actor(), options[0].Action, rng)
			}
			t.Fatalf("game stalled at round %d", g.Round)
		})
	}
}

func TestDirectBuildingTargets(t *testing.T) {
	for from := 0; from < 5; from++ {
		for target := from + 1; target <= 5; target++ {
			g := playing()
			g.Rules, g.Round = "domination", 4
			g.Players[0].Cards = []int{0, 1, 2, 3, 4}
			g.Territories[0] = Territory{Owner: 0, Troops: 100, BuildingLevel: from}
			cost := 0
			for stage := from + 1; stage <= target; stage++ {
				cost += stage + 1
			}
			do(t, g, 0, Action{Type: "build", Territory: 1, Level: &target, Cards: append([]int{}, g.Players[0].Cards[:target-g.Territories[0].BuildingLevel]...)}, sequence(0))
			tr := g.Territories[0]
			if tr.Troops != 100 || tr.Construction.Duration != cost || tr.Construction.Remaining != cost || tr.Construction.Level != target {
				t.Fatalf("%d -> %d wrong quote/payment: %+v %+v", from, target, tr, tr.Construction)
			}
			g = clone(g) // JSON persistence must preserve the target, duration and completed tier.
			if g.Territories[0].Construction.Duration != cost {
				t.Fatal("duration lost on reload")
			}
			g.advanceConstruction()
			if g.Territories[0].Construction.Remaining != cost {
				t.Fatal("advanced before next own turn")
			}
			for turn := 1; turn <= cost; turn++ {
				g.Round++
				g.Turn = 1
				g.advanceConstruction()
				if g.Territories[0].Construction.Remaining != cost-turn+1 {
					t.Fatal("enemy turn advanced construction")
				}
				g.Turn = 0
				g.advanceConstruction()
				g.advanceConstruction()
				if turn < cost {
					tr = g.Territories[0]
					completed, elapsed := from, 0
					for completed < target && elapsed+completed+2 <= turn {
						elapsed += completed + 2
						completed++
					}
					if tr.BuildingLevel != completed || g.defenseDice(1) != completed+2 || tr.Construction.Remaining != cost-turn {
						t.Fatalf("wrong intermediate protection %d -> %d, turn %d: %+v", from, target, turn, tr)
					}
				}
			}
			if g.Territories[0].Construction != nil || g.Territories[0].BuildingLevel != target || g.defenseDice(1) != target+2 {
				t.Fatal("incorrect finished tier")
			}
		}
	}
	if buildingUpgradeDuration(0, 5) != 20 {
		t.Fatal("hut to citadel must be 20")
	}
}

func TestDirectBuildingTargetValidation(t *testing.T) {
	makeGame := func() *Game {
		g := playing()
		g.Rules = "domination"
		g.Players[0].Cards = []int{0, 1, 2, 3, 4}
		g.Territories[0] = Territory{Owner: 0, Troops: 100, BuildingLevel: 2}
		return g
	}
	for _, target := range []int{-1, 0, 1, 2, 7, 100000} {
		g := makeGame()
		before, _ := json.Marshal(g)
		err := g.apply(0, Action{Type: "build", Territory: 1, Level: &target, Cards: []int{0, 1, 2}, Revision: g.Revision}, sequence(0))
		after, _ := json.Marshal(g)
		if err == nil || string(before) != string(after) {
			t.Fatalf("invalid target %d changed state: %v", target, err)
		}
	}
	target := 5
	for _, change := range []func(*Game){
		func(g *Game) { g.Players[0].Cards = nil },
		func(g *Game) { g.Paused = true },
		func(g *Game) { g.Turn = 1 },
		func(g *Game) { g.Territories[0].Owner = 1 },
		func(g *Game) { g.Phase = "setup" },
		func(g *Game) { g.Rules = "classic" },
		func(g *Game) { g.Territories[0].Construction = &Construction{Level: 3, Remaining: 4} },
	} {
		g := makeGame()
		change(g)
		if g.apply(0, Action{Type: "build", Territory: 1, Level: &target, Cards: []int{0, 1, 2}, Revision: g.Revision}, sequence(0)) == nil {
			t.Fatal("invalid construction accepted")
		}
	}
	g := makeGame()
	g.Territories[0].Troops = 1
	do(t, g, 0, Action{Type: "build", Territory: 1, Level: &target, Cards: append([]int{}, g.Players[0].Cards[:target-g.Territories[0].BuildingLevel]...)}, sequence(0))
	if g.Territories[0].Troops != 1 || g.Territories[0].Construction.Remaining != 15 {
		t.Fatal("exact budget rejected")
	}
}

func TestCaptureDuringDirectUpgradeKeepsCompletedStages(t *testing.T) {
	g := playing()
	g.Rules = "domination"
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	g.Turn = 1
	g.Players[1].Cards = []int{0, 1, 2, 3, 4}
	g.Round = 4
	g.Territories[1] = Territory{Owner: 1, Troops: 40}
	target := 5
	if err := g.startConstruction(2, 1, &target, []int{0, 1, 2, 3, 4}); err != nil {
		t.Fatal(err)
	}
	for turn := 0; turn < 5; turn++ {
		g.Round++
		g.advanceConstruction()
	}
	g = clone(g)
	if g.Territories[1].BuildingLevel != 2 || g.Territories[1].Construction.Remaining != 15 || g.Territories[1].Construction.Duration != 20 {
		t.Fatal("intermediate level or persistence")
	}
	g.Turn = 0
	g.Phase = "attack"
	g.Territories[0].Troops = 10
	g.Territories[1].Troops = 1
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Territories[1].Owner != 0 || g.Territories[1].BuildingLevel != 2 || g.Territories[1].Construction != nil {
		t.Fatal("conquest lost finished stages or kept unfinished construction")
	}
	g = clone(g)
	if g.Battle.Construction == nil || g.Battle.Construction.Level != 5 || g.Battle.Construction.Remaining != 15 {
		t.Fatal("battle replay lost the defender's construction after conquest")
	}
}

func TestBuildingCardPaymentIsExactAndAtomic(t *testing.T) {
	makeGame := func() *Game {
		g := playing()
		g.Rules = "domination"
		g.Territories[0] = Territory{Owner: 0, Troops: 1}
		g.Players[0].Cards = []int{0, 3, 7}
		return g
	}
	target := 2
	for _, cards := range [][]int{nil, {0}, {0, 0}, {0, 99}, {0, 3, 7}} {
		g := makeGame()
		before, _ := json.Marshal(g)
		if g.startConstruction(1, 0, &target, cards) == nil {
			t.Fatalf("accepted invalid cards %v", cards)
		}
		after, _ := json.Marshal(g)
		if string(before) != string(after) {
			t.Fatal("invalid payment mutated game")
		}
	}
	g := makeGame()
	if err := g.startConstruction(1, 0, &target, []int{7, 0}); err != nil {
		t.Fatal(err)
	}
	if len(g.Players[0].Cards) != 1 || g.Players[0].Cards[0] != 3 || len(g.Discard) != 2 || g.Discard[0] != 7 || g.Discard[1] != 0 || g.Territories[0].Troops != 1 || g.Territories[0].Construction.Remaining != 5 {
		t.Fatal("wrong card payment or build time")
	}
	g = makeGame()
	g.Phase = "reinforce"
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	if g.startConstruction(1, 0, &target, []int{0, 1}) == nil {
		t.Fatal("building bypassed required trade")
	}
}
