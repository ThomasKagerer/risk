package main

import "testing"

func TestContinentDenialMatchesBothBoardsAndRealOpponents(t *testing.T) {
	for _, mapID := range []string{"classic", "world120"} {
		g := playing()
		g.Map = mapID
		g.Territories = make([]Territory, len(g.board().Countries))
		for i := range g.Territories {
			g.Territories[i] = Territory{Owner: 1, Troops: 2}
		}
		for _, continent := range g.board().Continents {
			ids := []int{}
			for _, c := range g.board().Countries {
				if c.Continent == continent.ID {
					ids = append(ids, c.ID)
				}
			}
			id := ids[0]
			if removed, blocked := continentDenial(g, id, 0); removed != continent.Bonus || blocked != 0 {
				t.Fatal("wrong complete-continent bonus", mapID, continent, removed, blocked)
			}
			// The last missing land may belong to us or to another opponent.
			for _, owner := range []int{0, 2} {
				g.Territories[id-1].Owner = owner
				if removed, blocked := continentDenial(g, id, 0); removed != 0 || blocked != continent.Bonus {
					t.Fatal("last missing country not recognized", mapID, continent)
				}
			}
			g.Territories[ids[1]-1].Owner = 2
			if removed, blocked := continentDenial(g, id, 0); removed != 0 || blocked != 0 {
				t.Fatal("bonus denied despite fragmented continent")
			}
			g.Territories[ids[1]-1].Owner = 1
			g.Players[1].Neutral = true
			if removed, blocked := continentDenial(g, id, 0); removed != 0 || blocked != 0 {
				t.Fatal("neutral armies have no continent bonus")
			}
			g.Players[1].Neutral = false
			g.Territories[id-1].Owner = 1
		}
	}
}

func TestBotReinforcesLastCountryBlockingEnemyContinent(t *testing.T) {
	g := playing()
	g.Phase, g.Pool = "reinforce", 3
	for i, c := range g.board().Countries {
		g.Territories[i] = Territory{Owner: 1 + i%2, Troops: 2}
		if c.Continent == 6 {
			g.Territories[i].Owner = 1
		}
	}
	g.Territories[38].Owner = 0 // Indonesia denies the Australian bonus.
	g.Territories[20].Owner = 0 // Ordinary competing reinforcement target.
	op := botOptions(g)[0]
	if op.Action.Type != "place" || op.Action.Territory != 39 || op.Facts["opponent_bonus_blocked_by_holding"] != 2 {
		t.Fatal("did not support the blocking garrison", op)
	}
	// A vulnerable continent of our own still takes precedence.
	for i, c := range g.board().Countries {
		if c.Continent == 2 {
			g.Territories[i] = Territory{Owner: 0, Troops: 2}
		}
	}
	g.Territories[4].Troops = 12 // Threat at Venezuela's border.
	op = botOptions(g)[0]
	if op.Action.Type != "place" || op.Action.Territory != 10 {
		t.Fatal("denial displaced protection of our own continent", op)
	}
}

func TestContinentDenialDoesNotEncourageHopelessAttacks(t *testing.T) {
	g := playing()
	g.Conquered = true
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 1, Troops: 50}
	}
	g.Territories[20] = Territory{Owner: 0, Troops: 3}
	if op := botOptions(g)[0]; op.Action.Type != "next" {
		t.Fatal("bonus denial caused a hopeless attack", op)
	}
}
