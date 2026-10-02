package main

import (
	"fmt"
	"math/rand"
	"testing"
)

func claimGame(mapID string) *Game {
	g := frontierGame(3, mapID)
	g.Phase = "claim"
	return g
}

func TestBotAvoidsEnteringContestedStartingContinent(t *testing.T) {
	for _, mapID := range []string{"classic", "world120"} {
		g := claimGame(mapID)
		// Every possible opposing first claim, including all Australian lands.
		for _, occupied := range g.board().Countries {
			g.Territories[occupied.ID-1] = Territory{Owner: 1, Troops: 1}
			op := botOptions(g)[0]
			if g.board().Countries[op.Action.Territory-1].Continent == occupied.Continent {
				t.Fatalf("%s: entered occupied continent after rival claimed %s: %+v", mapID, occupied.Name, op)
			}
			g.Territories[occupied.ID-1] = Territory{Owner: -1}
		}
	}
}

func TestBotOpeningSpreadsPlayersAndBuildsConnectedFootholds(t *testing.T) {
	for _, mapID := range []string{"classic", "world120"} {
		for n := 2; n <= 6; n++ {
			t.Run(fmt.Sprintf("%s-%d", mapID, n), func(t *testing.T) {
				g := frontierGame(n, mapID)
				rng := rand.New(rand.NewSource(int64(n))).Intn
				do(t, g, 0, Action{Type: "start"}, rng)
				startingRegions := map[int]bool{}
				for turn := 0; g.Phase == "claim"; turn++ {
					p := g.actor()
					op := botOptions(g)[0]
					continent := g.board().Countries[op.Action.Territory-1].Continent
					if turn < n {
						if startingRegions[continent] {
							t.Fatal("players crowded into the same starting region", op)
						}
						startingRegions[continent] = true
					} else if turn < 4*n && op.Facts["own_neighbors"] == 0 {
						t.Fatal("scattered claims before building a connected foothold", op)
					}
					do(t, g, p, op.Action, rng)
				}
			})
		}
	}
}

func TestBotClaimCanCompeteWhenSpaceIsScarce(t *testing.T) {
	for _, mapID := range []string{"classic", "world120"} {
		g := claimGame(mapID)
		for i := range g.Territories {
			g.Territories[i] = Territory{Owner: 1 + i%2, Troops: 1}
		}
		// The last legal claim remains available even though every region is contested.
		last := len(g.Territories)
		g.Territories[last-1] = Territory{Owner: -1}
		op := botOptions(g)[0]
		if op.Action.Type != "claim" || op.Action.Territory != last {
			t.Fatal("refused the only available contested land", op)
		}
	}
}

func TestBotClaimKeepsUsefulFootholdDespiteCompetition(t *testing.T) {
	g := claimGame("classic")
	g.Territories[38] = Territory{Owner: 1, Troops: 1} // Rival in Indonesia.
	g.Territories[41] = Territory{Owner: 0, Troops: 1} // Own eastern Australia.
	op := botOptions(g)[0]
	if g.board().Countries[op.Action.Territory-1].Continent != 6 || op.Facts["own_neighbors"] != 1 {
		t.Fatal("abandoned a useful connected foothold", op)
	}
}

func TestBotClaimFactsAccountForBlockedRoutesAndDistinctRivals(t *testing.T) {
	g := claimGame("world120")
	g.Territories[114] = Territory{Owner: 1, Troops: 1} // New Guinea blocks the northern route.
	g.Territories[117] = Territory{Owner: 2, Troops: 1} // Eastern Australia blocks the southern route.
	_, facts := claimScore(g, 120, 0)                   // Fiji can only reach New Zealand.
	if facts["reachable_unclaimed_in_continent"] != 2 || facts["unclaimed_in_continent"] != 6 || facts["opponents_in_continent"] != 2 || facts["opponent_territories_in_continent"] != 2 || facts["opponent_neighbors"] != 1 {
		t.Fatal("incorrect public expansion facts", facts)
	}
	// Native defenders are not competing players and do not seal off expansion.
	g.Players[1].Neutral, g.Players[2].Neutral = true, true
	_, facts = claimScore(g, 120, 0)
	if facts["opponents_in_continent"] != 0 || facts["opponent_territories_in_continent"] != 0 || facts["reachable_unclaimed_in_continent"] != 6 {
		t.Fatal("natives treated as active rivals", facts)
	}
}

func TestBotPrefersComparableNeutralConquest(t *testing.T) {
	for _, conquered := range []bool{false, true} {
		for _, neutralTarget := range []int{2, 8} {
			g := playing()
			g.Players[2].Neutral = true
			g.Conquered = conquered
			for i := range g.Territories {
				g.Territories[i] = Territory{Owner: 2, Troops: 50}
			}
			g.Territories[6] = Territory{Owner: 0, Troops: 16} // Ontario borders both equal targets.
			for _, id := range []int{2, 8} {
				g.Territories[id-1] = Territory{Owner: 1, Troops: 2}
			}
			g.Territories[neutralTarget-1].Owner = 2
			g.Territories[36] = Territory{Owner: 1, Troops: 50} // No elimination reward for the comparable player target.
			g.Territories[4] = Territory{Owner: 1, Troops: 50}
			g.Territories[5] = Territory{Owner: 1, Troops: 50} // No regional foothold removal either.
			g.Territories[13] = Territory{Owner: 1, Troops: 50}
			op := botOptions(g)[0]
			if op.Action.Type != "attack" || op.Action.To != neutralTarget || op.Facts["target_is_neutral"] != true {
				t.Fatal("preferred player conflict to an equal neutral conquest", op)
			}
			// With no feasible neutral conquest, a favorable player attack remains useful.
			g.Territories[neutralTarget-1].Troops = 50
			op = botOptions(g)[0]
			if op.Action.Type != "attack" || op.Facts["target_is_neutral"] != false {
				t.Fatal("refused a favorable player conquest when alternatives were blocked", op)
			}
		}
	}
}

func TestBotPlacesForNeutralExpansion(t *testing.T) {
	for _, neutralTarget := range []int{2, 22} {
		g := playing()
		g.Players[2].Neutral = true
		g.Phase, g.Pool = "reinforce", 3
		for i := range g.Territories {
			g.Territories[i] = Territory{Owner: 2, Troops: 6}
		}
		g.Territories[6] = Territory{Owner: 0, Troops: 8}  // Ontario.
		g.Territories[20] = Territory{Owner: 0, Troops: 8} // North Africa.
		g.Territories[1] = Territory{Owner: 1, Troops: 2}
		g.Territories[21] = Territory{Owner: 1, Troops: 2}
		g.Territories[neutralTarget-1].Owner = 2
		g.Territories[36] = Territory{Owner: 1, Troops: 50} // Keep the player alive elsewhere.
		for _, id := range []int{5, 6, 14, 25, 26, 31, 32} {
			g.Territories[id-1] = Territory{Owner: 1, Troops: 50}
		}
		want := 7
		if neutralTarget == 22 {
			want = 21
		}
		op := botOptions(g)[0]
		if op.Action.Type != "place" || op.Action.Territory != want {
			t.Fatal("built up for an unnecessary player conflict", op)
		}
	}
}

func TestBotPlayerConflictCanBeWorthwhile(t *testing.T) {
	t.Run("break enemy continent", func(t *testing.T) {
		g := playing()
		g.Players[2].Neutral, g.Conquered = true, true
		for i, c := range g.board().Countries {
			g.Territories[i] = Territory{Owner: 2, Troops: 2}
			if c.Continent == 3 {
				g.Territories[i].Owner = 1
			}
		}
		g.Territories[20] = Territory{Owner: 0, Troops: 15}
		op := botOptions(g)[0]
		if op.Action.Type != "attack" || op.Action.To != 19 {
			t.Fatal("neutral preference displaced worthwhile continent denial", op)
		}
	})
	t.Run("complete own continent", func(t *testing.T) {
		g := playing()
		g.Players[2].Neutral, g.Conquered = true, true
		for i := range g.Territories {
			g.Territories[i] = Territory{Owner: 2, Troops: 2}
		}
		for _, id := range []int{39, 40, 41} {
			g.Territories[id-1] = Territory{Owner: 0, Troops: 15}
		}
		g.Territories[41] = Territory{Owner: 1, Troops: 2}
		op := botOptions(g)[0]
		if op.Action.Type != "attack" || op.Action.To != 42 {
			t.Fatal("neutral preference displaced continent completion", op)
		}
	})
}
