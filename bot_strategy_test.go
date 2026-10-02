package main

import "testing"

func strategyGame() *Game {
	g := playing()
	g.Players[2].Neutral = true
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 2, Troops: 2}
	}
	return g
}

func TestBotBuildsIncomeBeforeDenialOrRevenge(t *testing.T) {
	for _, phase := range []string{"attack", "reinforce"} {
		g := strategyGame()
		g.Phase, g.Pool, g.Conquered = phase, 5, true
		g.Players[0].LastAttack = &AttackMemory{Player: 1, Round: g.Round}
		for _, c := range g.board().Countries {
			if c.Continent == 3 {
				g.Territories[c.ID-1].Owner = 1 // Enemy holds Europe.
			}
		}
		for _, id := range []int{10, 11, 13} {
			g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
		}
		g.Territories[20] = Territory{Owner: 0, Troops: 15} // Can finish South America or raid Europe.
		op := botOptions(g)[0]
		if phase == "attack" && (op.Action.Type != "attack" || op.Action.To != 12 || op.Facts["continent_bonus"] != 2) {
			t.Fatal("did not prioritize completing own income base", op)
		}
		if phase == "reinforce" && (op.Action.Type != "place" || op.Action.Territory != 21) {
			t.Fatal("did not reinforce the army that can complete a continent", op)
		}
	}
}

func TestBotBuildsConnectedContinentBeforeScatteredConquests(t *testing.T) {
	g := strategyGame()
	g.Conquered = true
	for _, id := range []int{39, 41} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 15}
	}
	g.Territories[32].Troops = 1 // Cheaper generic conquest into Asia.
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || g.board().Countries[op.Action.To-1].Continent != 6 {
		t.Fatal("scattered into Asia instead of consolidating Australia", op)
	}
}

func TestBotAttackAndOccupationPreserveContinentBorder(t *testing.T) {
	g := strategyGame()
	for _, c := range g.board().Countries {
		if c.Continent == 4 {
			g.Territories[c.ID-1] = Territory{Owner: 0, Troops: 1}
		}
	}
	g.Territories[11] = Territory{Owner: 1, Troops: 7} // Brazil threatens North Africa.
	g.Territories[18] = Territory{Owner: 1, Troops: 1} // Weak Western Europe is a possible raid.
	reserve := borderNeedExcept(g, 21, 0, 19)
	g.Territories[20].Troops = reserve + 2
	var attack Action
	for _, op := range botOptions(g) {
		if op.Action.Type == "attack" && op.Action.From == 21 && op.Action.To == 19 {
			attack = op.Action
		}
	}
	if attack.Type == "" || attack.Dice != 2 {
		t.Fatal("attack dice can consume troops reserved for the other border", attack)
	}
	// A bad roll uses the surplus; the same raid is no longer offered.
	unlucky := clone(g)
	do(t, unlucky, 0, attack, sequence(0))
	do(t, unlucky, 1, Action{Type: "defend", Dice: 1}, sequence(5))
	if unlucky.Territories[20].Troops < reserve {
		t.Fatal("combat spent the defensive reserve")
	}
	for _, op := range botOptions(unlucky) {
		if op.Action.Type == "attack" && op.Action.From == 21 && op.Action.To == 19 && op.Action.Dice > unlucky.Territories[20].Troops-reserve {
			t.Fatal("follow-up roll can spend the reserve", op)
		}
	}
	// A successful raid may move only the surplus out of the continent.
	do(t, g, 0, attack, sequence(5))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Phase != "occupy" {
		t.Fatal("fixture did not conquer the target")
	}
	for _, op := range botOptions(g) {
		if g.Territories[20].Troops-op.Action.Amount < reserve {
			t.Fatal("offered occupation strips the continent border", op)
		}
	}
	do(t, g, 0, botOptions(g)[0].Action, sequence(0))
	if !g.holdsContinent(0, 4) || g.Territories[20].Troops < reserve {
		t.Fatal("raid exposed our income base")
	}
}

func TestBotGarrisonsBothBordersOfNewlyCompletedContinent(t *testing.T) {
	g := strategyGame()
	for _, id := range []int{10, 11, 12, 13} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[4] = Territory{Owner: 1, Troops: 6}  // Outside Venezuela.
	g.Territories[20] = Territory{Owner: 1, Troops: 4} // Outside Brazil.
	g.Territories[11].Troops = 30
	g.Territories[9].Troops = 0
	g.Phase = "occupy"
	g.Pending = &Pending{From: 12, To: 10, Minimum: 3}
	sourceNeed, targetNeed := borderNeed(g, 12, 0), borderNeed(g, 10, 0)
	for _, op := range botOptions(g) {
		if 30-op.Action.Amount < sourceNeed || op.Action.Amount < targetNeed {
			t.Fatal("occupation failed to protect both continent entrances", op)
		}
	}
	do(t, g, 0, botOptions(g)[0].Action, sequence(0))
	if g.Territories[11].Troops < sourceNeed || g.Territories[9].Troops < targetNeed {
		t.Fatal("new continent has an avoidably weak entrance")
	}
}

func TestBotPlansNewBorderGarrisonBeforeCompletingContinent(t *testing.T) {
	g := strategyGame()
	for _, id := range []int{40, 41, 42} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[40].Troops = 4
	g.Territories[38] = Territory{Owner: 2, Troops: 1} // Last missing Australian territory.
	g.Territories[32] = Territory{Owner: 1, Troops: 12}
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("completed a continent without troops to hold its entrance", op)
	}
	g.Territories[40].Troops = 30
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 39 || op.Facts["target_garrison_estimate"].(int) <= 2 {
		t.Fatal("did not plan a garrison for the new continent border", op)
	}
}

func TestBotFortifiesBordersWithoutEmptyingAnotherEntrance(t *testing.T) {
	g := strategyGame()
	g.Phase = "fortify"
	for _, id := range []int{10, 11, 12, 13} {
		g.Territories[id-1] = Territory{Owner: 0, Troops: 1}
	}
	g.Territories[4] = Territory{Owner: 1, Troops: 6}
	g.Territories[20] = Territory{Owner: 1, Troops: 4}
	g.Territories[11].Troops = 30
	sourceNeed := borderNeed(g, 12, 0)
	op := botOptions(g)[0]
	if op.Action.Type != "fortify" || op.Action.From != 12 || op.Action.To != 10 || 30-op.Action.Amount < sourceNeed {
		t.Fatal("fortification did not protect both entrances", op)
	}
	// Even a currently buffered external border retains a small garrison.
	g.Territories[20].Owner = 0
	for _, op := range botOptions(g) {
		if op.Action.Type == "fortify" && op.Action.From == 12 && 30-op.Action.Amount < 2 {
			t.Fatal("removed the entire external-border garrison", op)
		}
	}
}

func TestNativeArmiesDoNotCauseDefensiveTroopHoarding(t *testing.T) {
	g := strategyGame()
	for _, c := range g.board().Countries {
		g.Territories[c.ID-1].Troops = 100
		if c.Continent == 6 {
			g.Territories[c.ID-1] = Territory{Owner: 0, Troops: 3}
		}
	}
	if borderNeed(g, 39, 0) != 2 {
		t.Fatal("non-attacking natives inflated the border garrison")
	}
}

func TestBotRetaliatesOnlyAmongComparableSafeMoves(t *testing.T) {
	g := playing()
	g.Conquered = true
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 2, Troops: 50}
	}
	g.Territories[6] = Territory{Owner: 0, Troops: 15}
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	g.Territories[7] = Territory{Owner: 2, Troops: 1}
	g.Players[0].LastAttack = &AttackMemory{Player: 2, Round: g.Round}
	g.Territories[36] = Territory{Owner: 1, Troops: 50} // Neither comparable target eliminates a player.
	g.Territories[4] = Territory{Owner: 1, Troops: 50}
	g.Territories[5] = Territory{Owner: 1, Troops: 50} // Neither target clears a regional foothold.
	g.Territories[13] = Territory{Owner: 1, Troops: 50}
	op := botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 8 || op.Facts["target_is_recent_attacker"] != true {
		t.Fatal("did not favor a safe reply to the recent attacker", op)
	}
	g.Territories[7].Troops = 50
	op = botOptions(g)[0]
	if op.Action.Type != "attack" || op.Action.To != 2 {
		t.Fatal("revenge displaced a much safer conquest", op)
	}
	g.Territories[1].Troops = 50
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("revenge encouraged a hopeless attack", op)
	}
}

func TestAttackMemorySurvivesSaveAndExpiresAfterReplyTurn(t *testing.T) {
	g := playing()
	g.Territories[6] = Territory{Owner: 0, Troops: 5}
	g.Territories[1] = Territory{Owner: 1, Troops: 3}
	do(t, g, 0, Action{Type: "attack", From: 7, To: 2, Dice: 3}, sequence(0))
	g = clone(g)
	if recentAttacker(g, 1) != 0 || botState(g)["recent_attacker"] != 0 {
		t.Fatal("public attack memory did not survive serialization")
	}
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(5))
	// Finishing the attacker's turn must not erase the defender's memory.
	g.Phase = "fortify"
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if recentAttacker(g, 1) != 0 {
		t.Fatal("forgot the attacker before a reply was possible")
	}
	g.Phase = "fortify"
	do(t, g, 1, Action{Type: "next"}, sequence(0))
	if recentAttacker(g, 1) != -1 || g.Players[1].LastAttack != nil {
		t.Fatal("revenge persisted after the reply turn")
	}
	// Old games need no migration and must not assume player zero attacked.
	if recentAttacker(playing(), 1) != -1 {
		t.Fatal("missing legacy memory interpreted as a player-zero attack")
	}
}
