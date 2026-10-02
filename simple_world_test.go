package main

import (
	"math/rand"
	"slices"
	"testing"
)

func TestSimpleWorldContinentEntrances(t *testing.T) {
	initBoards()
	b := boards["simple-world"]
	for _, tc := range []struct {
		continent int
		entrances [][2]int
	}{
		{6, [][2]int{{19, 18}}},          // West Australia to Southeast Asia only.
		{4, [][2]int{{12, 6}, {12, 11}}}, // North Africa to Brazil and Central Europe.
	} {
		var entrances [][2]int
		for _, c := range b.Countries {
			if c.Continent != tc.continent {
				continue
			}
			for _, n := range c.Neighbors {
				if b.Countries[n-1].Continent != tc.continent {
					entrances = append(entrances, [2]int{c.ID, n})
				}
			}
		}
		if !slices.Equal(entrances, tc.entrances) {
			t.Fatalf("continent %d entrances: got %v, want %v", tc.continent, entrances, tc.entrances)
		}
	}
	if !slices.Contains(b.Countries[18].Neighbors, 20) || !slices.Contains(b.Countries[19].Neighbors, 19) {
		t.Fatal("West and East Australia must remain connected")
	}
}

func TestSimpleWorldTopology(t *testing.T) {
	initBoards()
	b := boards["simple-world"]
	if len(b.Countries) != 20 || len(b.Continents) != 6 || len(b.Cards) != 22 {
		t.Fatal("wrong small map dimensions")
	}
	seen := map[int]bool{1: true}
	queue := []int{1}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, n := range b.Countries[id-1].Neighbors {
			if n < 1 || n > 20 || n == id {
				t.Fatal("invalid neighbor", id, n)
			}
			reverse := false
			for _, m := range b.Countries[n-1].Neighbors {
				if m == id {
					reverse = true
				}
			}
			if !reverse {
				t.Fatal("one-way edge", id, n)
			}
			if !seen[n] {
				seen[n] = true
				queue = append(queue, n)
			}
		}
	}
	if len(seen) != 20 {
		t.Fatal("disconnected map")
	}
	for i, c := range b.Continents {
		if c.Name != board.Continents[i].Name || c.Bonus != board.Continents[i].Bonus {
			t.Fatal("continent changed")
		}
	}
}
func TestSimpleWorldProportionalStart(t *testing.T) {
	initBoards()
	for _, rules := range []string{"classic", "domination"} {
		for n := 2; n <= 6; n++ {
			g := newGame("SMALL", "progressive", "A", "", "simple-world")
			g.Rules = rules
			g.Goal = "domination"
			for len(g.Players) < n {
				g.Players = append(g.Players, Player{Name: "Bot"})
			}
			rng := rand.New(rand.NewSource(int64(n)))
			if err := g.start(rng.Intn); err != nil {
				t.Fatal(err)
			}
			for count := 0; g.Phase == "claim"; count++ {
				if count >= 20 {
					t.Fatal("claim phase never ends", rules, n)
				}
				id := 0
				for i, land := range g.Territories {
					if land.Owner < 0 {
						id = i + 1
						break
					}
				}
				if id == 0 {
					t.Fatal("exhausted territories", rules, n)
				}
				if err := g.apply(g.Turn, Action{Type: "claim", Territory: id, Revision: g.Revision}, rng.Intn); err != nil {
					t.Fatal(err)
				}
			}
			for i := 0; i < n; i++ {
				if rules == "domination" {
					if g.owned(i) != 2 || g.Players[i].Reserve != 8 {
						t.Fatal("expected two countries and ten total units", n, i, g.owned(i), g.Players[i].Reserve)
					}
				} else if n == 2 {
					if g.owned(i) != 7 || g.Players[i].Reserve != 14 {
						t.Fatal("wrong duel allocation")
					}
				} else if g.owned(i) < 20/n || g.owned(i) > (20+n-1)/n {
					t.Fatal("uneven classic allocation", n)
				}
			}
			if rules == "domination" && g.owned(n) != 20-2*n {
				t.Fatal("wrong native remainder")
			}
		}
	}
}
func TestMiniWorldCardValues(t *testing.T) {
	initBoards()
	mini := boards["simple-world"]
	want := []int{2, 3, 4, 5, 6, 7, 10, 12, 15, 17}
	// The first three cards have different symbols and form a valid set.
	ids := []int{0, 1, 2}
	for trades, expected := range want {
		if got := mini.tradeValue(ids, "progressive", trades); got != expected {
			t.Fatalf("trade %d: got %d, want %d", trades, got, expected)
		}
	}
	for _, mapID := range []string{"classic", "world120", "europe1871"} {
		otherIDs := []int{}
		for _, kind := range []string{"infantry", "cavalry", "artillery"} {
			for id, card := range boards[mapID].Cards {
				if card.Kind == kind {
					otherIDs = append(otherIDs, id)
					break
				}
			}
		}
		if got := boards[mapID].tradeValue(otherIDs, "progressive", 5); got != 15 {
			t.Fatalf("%s changed: got %d", mapID, got)
		}
	}
	for _, kind := range []string{"infantry", "cavalry", "artillery", "mixed"} {
		set := []int{}
		for id, card := range mini.Cards {
			if card.Kind == kind || (kind == "mixed" && id < 3) {
				set = append(set, id)
			}
			if len(set) == 3 {
				break
			}
		}
		expected := map[string]int{"infantry": 2, "cavalry": 3, "artillery": 4, "mixed": 5}[kind]
		if got := mini.tradeValue(set, "fixed", 0); got != expected {
			t.Fatalf("%s: got %d, want %d", kind, got, expected)
		}
	}
	if got := mini.tradeValue([]int{0, 0, 1}, "progressive", 0); got != 0 {
		t.Fatalf("invalid cards returned %d", got)
	}
}
