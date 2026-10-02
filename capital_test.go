package main

import (
	"encoding/json"
	"math"
	"math/rand"
	"testing"
)

func TestCapitalSelectionPersistenceAndValidation(t *testing.T) {
	for _, mapID := range []string{"classic", "world120", "europe1871"} {
		g := frontierGame(3, mapID)
		g.Goal = "capital"
		rng := rand.New(rand.NewSource(37)).Intn
		chooseFive(t, g, rng)
		if g.Phase != "capital" {
			t.Fatal(g.Phase)
		}
		first := g.First
		for i := 0; i < 3; i++ {
			actor := g.actor()
			if err := g.apply(actor, Action{Type: "capital", Territory: len(g.Territories)}, rng); err == nil {
				t.Fatal("accepted foreign capital")
			}
			options := botOptions(g)
			if len(options) != 5 {
				t.Fatal("every own start country must be available", len(options))
			}
			do(t, g, actor, options[0].Action, rng)
			g = clone(g)
			if !g.isCapital(g.Players[actor].Capital) {
				t.Fatal("capital lost on reload")
			}
		}
		if g.Phase != "setup" || g.Turn != first {
			t.Fatal("placement must follow capital choice", g.Phase, g.Turn)
		}
		if err := g.apply(g.actor(), Action{Type: "capital", Territory: g.Players[g.actor()].Capital}, rng); err == nil {
			t.Fatal("allowed reselecting capital")
		}
		if g.view(0)["goal"] != "capital" || g.view(0)["players"].([]PublicPlayer)[0].Capital == 0 {
			t.Fatal("public capital missing")
		}
	}
}

func TestCapitalDefenseAndConquest(t *testing.T) {
	for _, troops := range []int{1, 2, 3, 10} {
		g := playing()
		g.Goal = "capital"
		g.Players[1].Capital = 2
		g.Territories[0] = Territory{Owner: 0, Troops: 20}
		g.Territories[1] = Territory{Owner: 1, Troops: troops}
		if g.defenseDice(2) != min(4, troops+1) {
			t.Fatal("capital dice", troops, g.defenseDice(2))
		}
	}
	g := playing()
	g.Goal = "capital"
	g.Players[0].Capital = 1
	g.Players[1].Capital = 2
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 1, Troops: 7}
	}
	g.Territories[0] = Territory{Owner: 0, Troops: 20}
	g.Territories[1].Troops = 1
	g.Players[1].Cards = []int{5, 6, 7}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	if err := clone(g).apply(1, Action{Type: "defend", Dice: 3}, sequence(0)); err == nil {
		t.Fatal("accepted too many dice")
	}
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(0))
	if g.Battle.DefenderLoss != 1 || g.Territories[1].Troops != 0 || g.Phase != "occupy" {
		t.Fatal("bonus die must not create a phantom casualty", g.Battle, g.Phase)
	}
	if g.owned(1) != 0 || g.Territories[2].Owner != 3 || !g.Players[3].Neutral || g.Territories[2].Troops != 7 || g.owned(0) != 2 || len(g.Players[0].Cards) != 3 || len(g.Players[1].Cards) != 0 {
		t.Fatal("capital conquest must transfer only the capital/cards and release other armies as natives")
	}
	g = clone(g)
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	if g.Phase != "finished" || g.Winner != 0 || g.defenseDice(2) != 4 {
		t.Fatal("capital victory / lasting castle", g.Phase, g.Winner, g.defenseDice(2))
	}
}

func TestCapitalNormalLandDoesNotEliminate(t *testing.T) {
	g := playing()
	g.Goal = "capital"
	g.Players[1].Capital = 3
	g.Territories[0] = Territory{Owner: 0, Troops: 20}
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	g.Territories[2] = Territory{Owner: 1, Troops: 5}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Territories[2].Owner != 1 {
		t.Fatal("ordinary conquest eliminated player")
	}
}

func TestCapitalOddsAndNativeCapture(t *testing.T) {
	// One attacker versus one defender now faces two dice (55 of 216 wins).
	if math.Abs(combatChanceWithDefense(1, 1, 4)-55.0/216) > 1e-10 {
		t.Fatal("capital odds must include the extra die")
	}
	loss := expectedCombatLosses(3, 1, 4)
	if loss.defender < 0 || loss.defender > 1 || loss.attacker < 0 || loss.attacker > 3 {
		t.Fatal("invalid expected losses", loss)
	}
	g := nativeFixture()
	g.Goal = "capital"
	g.Players[0].Capital = 2
	g.Territories[0] = Territory{Owner: 3, Troops: 13}
	g.Territories[1] = Territory{Owner: 0, Troops: 1}
	g.Territories[2] = Territory{Owner: 0, Troops: 8}
	g.NativeRaid = &NativeRaid{ResumeTurn: 0}
	g.Turn = 3
	g.Phase = "defend"
	g.Pending = &Pending{From: 1, To: 2, Dice: 3, Defender: 0, Attack: []int{6, 6, 6}}
	g.resolveBattle(2, sequence(0))
	if g.owned(0) != 0 || g.Players[4].Capital != 1 || g.Territories[2].Owner != 3 || g.Territories[2].Troops != 8 || g.owned(4) != 2 || len(g.Players) != 5 || g.Phase != "finished" || g.Winner != 4 {
		t.Fatal("native capital capture must release other lands and establish a new capital", g.Phase, g.Winner)
	}
}

func TestCapitalAPIPersistence(t *testing.T) {
	dir := t.TempDir()
	s, err := newServer(dir, 128)
	if err != nil {
		t.Fatal(err)
	}
	w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Test", "mode": "fixed", "map": "europe1871", "goal": "capital", "bots": []string{"local"}}, nil)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var v struct{ Code, Goal, Map string }
	json.Unmarshal(w.Body.Bytes(), &v)
	if v.Goal != "capital" || v.Map != "europe1871" {
		t.Fatal(v)
	}
	s2, err := newServer(dir, 128)
	if err != nil {
		t.Fatal(err)
	}
	read := request(t, s2, "GET", "/api/rooms/"+v.Code, nil, w.Result().Cookies())
	if read.Code != 200 {
		t.Fatal(read.Code, read.Body.String())
	}
	json.Unmarshal(read.Body.Bytes(), &v)
	if v.Goal != "capital" {
		t.Fatal("mode disappeared after restart")
	}
	bad := request(t, s, "POST", "/api/rooms", map[string]string{"name": "Test", "mode": "fixed", "goal": "invalid"}, nil)
	if bad.Code != 400 {
		t.Fatal("invalid goal accepted")
	}
}

func TestCapitalBotsCompleteGame(t *testing.T) {
	g := frontierGame(3, "europe1871")
	g.Goal = "capital"
	g.Mode = "progressive"
	rng := rand.New(rand.NewSource(137)).Intn
	do(t, g, 0, Action{Type: "start"}, rng)
	for step := 0; step < 100000; step++ {
		if g.Phase == "finished" {
			t.Logf("capital winner %d after %d actions, round %d", g.Winner, step, g.Round)
			return
		}
		options := botOptions(g)
		if len(options) == 0 {
			t.Fatal("no options", g.Phase)
		}
		if step%47 == 0 {
			for _, o := range options {
				if err := clone(g).apply(g.actor(), o.Action, rng); err != nil {
					t.Fatal("illegal candidate", g.Phase, o.Action, err)
				}
			}
		}
		do(t, g, g.actor(), options[0].Action, rng)
		total := len(g.Deck) + len(g.Discard)
		for i, p := range g.Players {
			total += len(p.Cards)
			if !p.Neutral && p.Capital > 0 && !g.mine(p.Capital, i) && g.owned(i) > 0 {
				t.Fatal("eliminated player retains land")
			}
		}
		if total != len(g.board().Cards) {
			t.Fatal("lost cards", total)
		}
		for _, v := range g.Territories {
			if v.Troops < 0 {
				t.Fatal("negative troops")
			}
		}
	}
	t.Fatal("capital game failed to finish")
}

func TestCapitalConquestOccupationUsesSurvivingAttackers(t *testing.T) {
	g := playing()
	g.Goal = "capital"
	g.Players[1].Capital = 2
	g.Territories[0] = Territory{Owner: 0, Troops: 4}
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 0, 0))
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(4, 1))
	if g.Phase != "occupy" || g.Territories[0].Troops != 3 || g.Pending.Minimum != 2 {
		t.Fatal("impossible occupation after mixed fortress roll", g.Phase, g.Territories[0], g.Pending)
	}
	// Legacy save with the old minimum must also expose and accept a legal move.
	g.Pending.Minimum = 3
	g = clone(g)
	pending := g.view(0)["pending"].(*Pending)
	if pending.Minimum != 2 || g.Pending.Minimum != 3 {
		t.Fatal("public occupation cap mutated save or stayed impossible", pending, g.Pending)
	}
	for _, op := range botOptions(g) {
		if op.Action.Amount != 2 {
			t.Fatal("illegal bot occupation", op)
		}
	}
	do(t, g, 0, Action{Type: "occupy", Amount: 2}, sequence(0))
	if g.Territories[0].Troops != 1 || g.Territories[1].Troops != 2 {
		t.Fatal("lost survivors during occupation")
	}
}
