package main

import (
	"fmt"
	"math/rand"
	"reflect"
	"slices"
	"testing"
)

func frontierGame(n int, mapID string) *Game {
	g := newGame("TESTAA", "fixed", "Host", "", mapID)
	g.Setup = "frontier"
	for i := 1; i < n; i++ {
		g.Players = append(g.Players, Player{Name: fmt.Sprint("Bot ", i), Bot: "local"})
	}
	return g
}

func chooseFive(t *testing.T, g *Game, rng Random) {
	t.Helper()
	do(t, g, 0, Action{Type: "start"}, rng)
	claims := 0
	for g.Phase == "claim" {
		for i, v := range g.Territories {
			if v.Owner < 0 {
				do(t, g, g.actor(), Action{Type: "claim", Territory: i + 1}, rng)
				break
			}
		}
		claims++
		if claims > 30 {
			t.Fatal("claim phase did not stop after five per player")
		}
	}
	if claims != 5*g.activePlayerCount() {
		t.Fatal("wrong number of initial claims", claims)
	}
}

func TestFrontierSetup(t *testing.T) {
	for _, mapID := range []string{"classic", "world120", "europe1871"} {
		for n := 2; n <= 6; n++ {
			t.Run(fmt.Sprintf("%s-%d", mapID, n), func(t *testing.T) {
				g := frontierGame(n, mapID)
				rng := rand.New(rand.NewSource(int64(n))).Intn
				chooseFive(t, g, rng)
				if g.Phase != "setup" {
					t.Fatal(g.Phase)
				}
				for p := 0; p < n; p++ {
					if g.owned(p) != 5 || g.Players[p].Reserve != 15 {
						t.Fatal("five occupied + fifteen reserve required", p, g.owned(p), g.Players[p].Reserve)
					}
				}
				if len(g.Players) != n+1 || !g.Players[n].Neutral {
					t.Fatal("missing independent native faction")
				}
				before := make([]int, len(g.Territories))
				for i, v := range g.Territories {
					if v.Owner == n && (v.Troops < 1 || v.Troops > 3) {
						t.Fatal("native strength outside 1–3")
					}
					before[i] = v.Troops
				}
				for step := 0; g.Phase == "setup"; step++ {
					if step >= 15*n {
						t.Fatal("setup stuck")
					}
					p := g.actor()
					for i, v := range g.Territories {
						if v.Owner == p {
							do(t, g, p, Action{Type: "place", Territory: i + 1, Amount: 1}, rng)
							break
						}
					}
				}
				for p := 0; p < n; p++ {
					total := 0
					for _, v := range g.Territories {
						if v.Owner == p {
							total += v.Troops
						}
					}
					if total != 20 || g.Players[p].Reserve != 0 {
						t.Fatal("must start with twenty units", p, total)
					}
				}
				for i, v := range g.Territories {
					if v.Owner == n && v.Troops != before[i] {
						t.Fatal("players must not place for natives")
					}
				}
				if g.Phase != "reinforce" || g.Pool != g.reinforcement(g.Turn) {
					t.Fatal("regular reinforcement did not begin")
				}
				if len(g.Deck) != len(g.board().Cards) {
					t.Fatal("map-specific card deck missing")
				}
			})
		}
	}
}

func TestFrontierPlacesInfantryCavalryAndArtillery(t *testing.T) {
	for _, mapID := range []string{"classic", "world120", "europe1871"} {
		g := frontierGame(3, mapID)
		rng := rand.New(rand.NewSource(23)).Intn
		chooseFive(t, g, rng)
		for steps := 0; g.Phase == "setup"; steps++ {
			if steps > 9 {
				t.Fatal("setup did not finish")
			}
			p := g.Turn
			id := slices.IndexFunc(g.Territories, func(v Territory) bool { return v.Owner == p }) + 1
			amount := 10
			if g.Players[p].Reserve == 5 {
				amount = 1
			}
			if g.Players[p].Reserve < 5 {
				amount = 1
			}
			// Other players exercise the 5-unit shortcut as well.
			if p != g.First && g.Players[p].Reserve == 5 {
				amount = 5
			}
			before := g.Territories[id-1].Troops
			reserve := g.Players[p].Reserve
			do(t, g, p, Action{Type: "place", Territory: id, Amount: amount}, rng)
			if g.Territories[id-1].Troops != before+amount || g.Players[p].Reserve != reserve-amount {
				t.Fatal("wrong piece value deducted")
			}
		}
		for p := 0; p < 3; p++ {
			total := 0
			for _, territory := range g.Territories {
				if territory.Owner == p {
					total += territory.Troops
				}
			}
			if total != 20 || g.Players[p].Reserve != 0 {
				t.Fatal("starting troop total changed", p, total)
			}
		}
		if g.Phase != "reinforce" {
			t.Fatal(g.Phase)
		}
	}
}

func TestFrontierRejectsUnavailablePieces(t *testing.T) {
	g := frontierGame(2, "world120")
	rng := rand.New(rand.NewSource(24)).Intn
	chooseFive(t, g, rng)
	p := g.Turn
	id := slices.IndexFunc(g.Territories, func(v Territory) bool { return v.Owner == p }) + 1
	g.Players[p].Reserve = 4
	for _, amount := range []int{-1, 0, 2, 5, 10, 100} {
		before := clone(g)
		if g.apply(p, Action{Type: "place", Revision: g.Revision, Territory: id, Amount: amount}, rng) == nil {
			t.Fatal("unavailable piece accepted", amount)
		}
		if !reflect.DeepEqual(g, before) {
			t.Fatal("rejected piece changed state")
		}
	}
}

func TestNativeDefenceAndGrowth(t *testing.T) {
	g := frontierGame(3, "world120")
	rng := rand.New(rand.NewSource(51)).Intn
	chooseFive(t, g, rng)
	// Native defence is automatic even when the third player attacks.
	from, to := 1, g.board().Countries[0].Neighbors[0]
	g.Phase = "attack"
	g.Turn = 2
	g.Territories[from-1] = Territory{Owner: 2, Troops: 12}
	g.Territories[to-1] = Territory{Owner: 3, Troops: 3}
	do(t, g, 2, Action{Type: "attack", From: from, To: to, Dice: 3}, rng)
	if g.Phase == "defend" || g.Battle == nil || len(g.Battle.Defense) != 3 {
		t.Fatal("native defender should roll automatically")
	}

	// A surviving human defender must still choose their dice.
	g.Phase = "attack"
	g.Pending = nil
	g.Territories[to-1] = Territory{Owner: 1, Troops: 3}
	do(t, g, 2, Action{Type: "attack", From: from, To: to, Dice: 2}, rng)
	if g.Phase != "defend" || g.actor() != 1 {
		t.Fatal("human defence changed")
	}

	g.Pending = nil
	g.Battle = nil
	g.First = 0
	g.Round = 1
	g.Turn = 0
	before := append([]Territory(nil), g.Territories...)
	// Skip the already-tested placement phase to inspect nine turn boundaries.
	for step := 0; step < 9; step++ {
		g.Phase = "fortify"
		g.Moved = false
		do(t, g, g.Turn, Action{Type: "next"}, sequence(0))
		for i, v := range g.Territories {
			want := before[i].Troops
			if step == 8 && v.Owner == 3 && nativeThreatBefore(g, before, i+1) {
				want++
			}
			if v.Troops != want {
				t.Fatalf("native growth at wrong time: step %d, region %d", step, i)
			}
		}
	}
	if g.Round != 4 {
		t.Fatal(g.Round)
	}
	restored := clone(g)
	restored.Phase = "fortify"
	do(t, restored, restored.Turn, Action{Type: "next"}, sequence(0))
	if !reflect.DeepEqual(restored.Territories, g.Territories) {
		t.Fatal("reloading caused duplicate native growth")
	}
}

func TestWorld120DataAndIndependentBoards(t *testing.T) {
	b := boards["world120"]
	if len(b.Countries) != 120 || len(b.Cards) != 122 {
		t.Fatal("wrong expanded board size")
	}
	for _, name := range []string{"Schweizer Eidgenossenschaft", "Deutsche Reichslande", "Kosaken-Hetmanat", "Moskowien", "Singapura", "Kurfürstentum Bayern"} {
		if !slices.ContainsFunc(b.Countries, func(c Country) bool { return c.Name == name }) {
			t.Fatal("missing", name)
		}
	}
	visited := map[int]bool{1: true}
	queue := []int{1}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, nb := range b.Countries[id-1].Neighbors {
			if nb < 1 || nb > 120 || !slices.Contains(b.Countries[nb-1].Neighbors, id) {
				t.Fatal("invalid/asymmetric neighbor", id, nb)
			}
			if !visited[nb] {
				visited[nb] = true
				queue = append(queue, nb)
			}
		}
	}
	if len(visited) != 120 {
		t.Fatal("unreachable regions")
	}
	old := newGame("OLDMAP", "fixed", "Old", "")
	old.Map = "" // pre-map save
	expanded := newGame("NEWMAP", "fixed", "New", "", "world120")
	if len(old.board().Cards) != 44 || old.territory(120) || !expanded.territory(120) {
		t.Fatal("map isolation/migration failed")
	}
	if expanded.board().tradeValue([]int{120, 121, 0}, "fixed", 0) != 10 || old.board().tradeValue([]int{120, 121, 0}, "fixed", 0) != 0 {
		t.Fatal("cards leaked between maps")
	}
}

func TestFrontierHighSpeedGames(t *testing.T) {
	for _, mapID := range []string{"classic", "world120", "europe1871"} {
		for _, n := range []int{2, 3, 6} {
			t.Run(fmt.Sprintf("%s-%d", mapID, n), func(t *testing.T) {
				rng := rand.New(rand.NewSource(int64(n * 53))).Intn
				g := frontierGame(n, mapID)
				g.Mode = "progressive"
				do(t, g, 0, Action{Type: "start"}, rng)
				// Revealed attacks and the mountain bonus can prolong large battles.
				for step := 0; step < 400000; step++ {
					if g.Phase == "finished" {
						t.Logf("finished %s: %d actions, round %d", mapID, step, g.Round)
						return
					}
					options := botOptions(g)
					if len(options) == 0 {
						t.Fatal("no legal candidate", g.Phase)
					}
					if err := g.apply(g.actor(), options[0].Action, rng); err != nil {
						t.Fatal(err)
					}
					count := len(g.Deck) + len(g.Discard)
					for _, p := range g.Players {
						count += len(p.Cards)
					}
					if count != len(g.board().Cards) {
						t.Fatal("card conservation")
					}
				}
				t.Fatal("game did not finish", g.Round, g.view(0)["players"])
			})
		}
	}
}

func nativeThreatBefore(g *Game, troops []Territory, id int) bool {
	for _, nb := range g.board().Countries[id-1].Neighbors {
		if troops[nb-1].Troops > troops[id-1].Troops+1 {
			return true
		}
	}
	return false
}
