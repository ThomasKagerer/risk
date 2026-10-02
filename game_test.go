package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"slices"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	initBoards()
	os.Exit(m.Run())
}

func TestCompleteGame(t *testing.T) {
	r := rand.New(rand.NewSource(42))
	rng := Random(r.Intn)
	g := newGame("ABCDEF", "progressive", "Ada", "a")
	g.Players = append(g.Players, Player{Name: "Ben"}, Player{Name: "Cleo"})
	do(t, g, 0, Action{Type: "start"}, rng)
	for step := 0; step < 12000; step++ {
		if g.Phase == "finished" {
			if g.owned(g.Winner) != 42 {
				t.Fatal("false victory")
			}
			t.Logf("Full game won in %d actions, round %d, %d card sets", step, g.Round, g.Trades)
			return
		}
		p := g.actor()
		a := Action{}
		own := []int{}
		for i, v := range g.Territories {
			if v.Owner == p {
				own = append(own, i+1)
			}
		}
		best := func() int {
			id := own[0]
			score := -1
			for _, n := range own {
				borders := 0
				for _, nb := range board.Countries[n-1].Neighbors {
					if !g.mine(nb, p) {
						borders++
					}
				}
				s := borders*100 + g.Territories[n-1].Troops
				if s > score {
					score = s
					id = n
				}
			}
			return id
		}
		switch g.Phase {
		case "claim":
			for i, v := range g.Territories {
				if v.Owner < 0 {
					a = Action{Type: "claim", Territory: i + 1}
					break
				}
			}
		case "setup":
			a = Action{Type: "place", Territory: best(), Amount: 1}
		case "reinforce":
			if g.mustTrade() {
				cards := g.Players[p].Cards
				found := false
				for i := 0; i < len(cards) && !found; i++ {
					for j := i + 1; j < len(cards) && !found; j++ {
						for k := j + 1; k < len(cards); k++ {
							ids := []int{cards[i], cards[j], cards[k]}
							if tradeValue(ids, g.Mode, g.Trades) > 0 {
								bonus := 0
								for _, id := range ids {
									n := board.Cards[id].Territory
									if g.mine(n, p) {
										bonus = n
										break
									}
								}
								a = Action{Type: "trade", Cards: ids, Bonus: bonus}
								found = true
								break
							}
						}
					}
				}
				if !found {
					t.Fatal("five cards without a trade")
				}
			} else if g.Pool > 0 {
				a = Action{Type: "place", Territory: best(), Amount: g.Pool}
			} else {
				a.Type = "next"
			}
		case "attack":
			a.Type = "next"
			score := 0
			for _, id := range own {
				for _, nb := range board.Countries[id-1].Neighbors {
					diff := g.Territories[id-1].Troops - g.Territories[nb-1].Troops
					if !g.mine(nb, p) && diff > score && g.Territories[id-1].Troops >= 3 {
						score = diff
						a = Action{Type: "attack", From: id, To: nb, Dice: min(3, g.Territories[id-1].Troops-1)}
					}
				}
			}
		case "defend":
			a = Action{Type: "defend", Dice: min(2, g.Territories[g.Pending.To-1].Troops)}
		case "occupy":
			a = Action{Type: "occupy", Amount: g.Territories[g.Pending.From-1].Troops - 1}
		case "fortify":
			a.Type = "next"
		default:
			t.Fatal("unexpected phase", g.Phase)
		}
		do(t, g, p, a, rng)
		for _, v := range g.Territories {
			if v.Troops < 0 {
				t.Fatal("negative troops")
			}
		}
		count := len(g.Deck) + len(g.Discard)
		for _, pl := range g.Players {
			count += len(pl.Cards)
		}
		if count != 44 {
			t.Fatal("lost/duplicated cards", count)
		}
	}
	t.Fatal("simulation did not finish")
}

func sequence(values ...int) Random {
	i := 0
	return func(n int) int { v := values[i%len(values)] % n; i++; return v }
}
func playing() *Game {
	g := newGame("ABCDEF", "fixed", "Ada", "hash-a")
	g.Players = append(g.Players, Player{Name: "Ben", TokenHash: "hash-b", Cards: []int{}}, Player{Name: "Cleo", TokenHash: "hash-c", Cards: []int{}})
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: i % 3, Troops: 3}
	}
	g.Phase = "attack"
	g.Round = 1
	g.Deck = make([]int, 44)
	for i := range g.Deck {
		g.Deck[i] = i
	}
	return g
}
func do(t *testing.T, g *Game, p int, a Action, rng Random) {
	t.Helper()
	a.Revision = g.Revision
	if err := g.apply(p, a, rng); err != nil {
		t.Fatal(a.Type, err)
	}
}
func TestImportedBoard(t *testing.T) {
	if len(board.Countries) != 42 || len(board.Cards) != 44 {
		t.Fatal("incorrect map or deck")
	}
	for _, c := range board.Countries {
		for _, n := range c.Neighbors {
			if !territory(n) || !slices.Contains(board.Countries[n-1].Neighbors, c.ID) {
				t.Fatalf("asymmetric edge %d -> %d", c.ID, n)
			}
		}
	}
	for _, edge := range [][2]int{{1, 38}, {14, 15}, {15, 17}, {12, 21}} {
		if !slices.Contains(board.Countries[edge[0]-1].Neighbors, edge[1]) {
			t.Fatal("missing official sea route", edge)
		}
	}
	if slices.Contains(board.Countries[23].Neighbors, 31) {
		t.Fatal("nonstandard East Africa–Middle East edge")
	}
}
func TestAtlasAttackConnections(t *testing.T) {
	for _, edge := range [][2]int{{7, 6}, {6, 7}} {
		g := playing()
		g.Territories[edge[0]-1] = Territory{Owner: 0, Troops: 8}
		g.Territories[edge[1]-1] = Territory{Owner: 1, Troops: 2}
		before, _ := json.Marshal(g)
		if g.apply(0, Action{Type: "attack", From: edge[0], To: edge[1], Dice: 3, Revision: g.Revision}, sequence(0)) == nil {
			t.Fatal("Ontario–Greenland must not be directly attackable", edge)
		}
		after, _ := json.Marshal(g)
		if string(before) != string(after) {
			t.Fatal("rejected attack changed the game")
		}
	}
	for _, edge := range [][2]int{{2, 6}, {8, 6}, {6, 8}, {19, 21}, {21, 19}, {21, 24}, {22, 31}} {
		g := playing()
		g.Territories[edge[0]-1] = Territory{Owner: 0, Troops: 8}
		g.Territories[edge[1]-1] = Territory{Owner: 1, Troops: 2}
		do(t, g, 0, Action{Type: "attack", From: edge[0], To: edge[1], Dice: 3}, sequence(0))
		if g.Phase != "defend" || g.Pending.To != edge[1] {
			t.Fatal("valid border or sea route failed", edge)
		}
	}
}

func TestMaximumTroopMovement(t *testing.T) {
	for _, phase := range []string{"occupy", "fortify"} {
		t.Run(phase, func(t *testing.T) {
			g := playing()
			g.Phase = phase
			g.Territories[0] = Territory{Owner: 0, Troops: 8}
			g.Territories[1] = Territory{Owner: 0, Troops: 0}
			if phase == "occupy" {
				g.Pending = &Pending{From: 1, To: 2, Minimum: 3}
			} else {
				g.Territories[1].Troops = 2
			}
			total := g.Territories[0].Troops + g.Territories[1].Troops
			if g.apply(0, Action{Type: phase, From: 1, To: 2, Amount: 8, Revision: g.Revision}, sequence(0)) == nil {
				t.Fatal("must leave a garrison behind")
			}
			do(t, g, 0, Action{Type: phase, From: 1, To: 2, Amount: 7}, sequence(0))
			if g.Territories[0].Troops != 1 || g.Territories[1].Troops != total-1 {
				t.Fatal("maximum movement lost troops or emptied the origin")
			}
		})
	}
}

func TestCardCombinations(t *testing.T) {
	for _, tc := range []struct {
		ids  []int
		want int
	}{{[]int{0, 2, 3}, 4}, {[]int{4, 5, 6}, 6}, {[]int{1, 7, 8}, 8}, {[]int{0, 1, 4}, 10}, {[]int{0, 2, 42}, 4}, {[]int{1, 7, 42}, 8}, {[]int{0, 4, 42}, 10}, {[]int{0, 42, 43}, 10}, {[]int{0, 0, 2}, 0}, {[]int{0, 2, 1}, 0}, {[]int{-1, 2, 3}, 0}} {
		if got := tradeValue(tc.ids, "fixed", 0); got != tc.want {
			t.Errorf("%v: %d != %d", tc.ids, got, tc.want)
		}
	}
	for i, want := range []int{4, 6, 8, 10, 12, 15, 20, 25, 30} {
		if got := tradeValue([]int{0, 2, 3}, "progressive", i); got != want {
			t.Errorf("trade %d: %d", i, got)
		}
	}
}
func TestDiceComparisonAndValidation(t *testing.T) {
	g := playing()
	g.Territories[0].Troops = 5
	g.Territories[1].Troops = 3
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 3, 1))
	if g.actor() != 1 {
		t.Fatal("defender does not choose dice")
	}
	a := Action{Type: "defend", Dice: 2, Revision: g.Revision}
	if g.apply(0, a, sequence(0)) == nil {
		t.Fatal("attacker chose defender's dice")
	}
	// 6,4,2 versus 6,3: tie loses, second wins.
	do(t, g, 1, Action{Type: "defend", Dice: 2}, sequence(5, 2))
	if g.Territories[0].Troops != 4 || g.Territories[1].Troops != 2 || g.Battle.AttackerLoss != 1 || g.Battle.DefenderLoss != 1 {
		t.Fatalf("wrong dice resolution: %+v", g.Battle)
	}
	for _, a := range []Action{{Type: "attack", From: 1, To: 42, Dice: 1}, {Type: "attack", From: 1, To: 2, Dice: 4}, {Type: "attack", From: 2, To: 1, Dice: 1}, {Type: "place", Territory: 1, Amount: 100}} {
		a.Revision = g.Revision
		if g.apply(0, a, sequence(0)) == nil {
			t.Fatal("accepted illegal action", a)
		}
	}
}
func TestConquestAndOneCardPerTurn(t *testing.T) {
	g := playing()
	g.Territories[0].Troops = 10
	g.Territories[1].Troops = 1
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 4, 3))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Phase != "occupy" || g.Pending.Minimum != 3 || len(g.Players[0].Cards) != 0 {
		t.Fatal("conquest flow")
	}
	if g.apply(0, Action{Type: "occupy", Amount: 2, Revision: g.Revision}, sequence(0)) == nil {
		t.Fatal("insufficient occupation allowed")
	}
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	g.Territories[2].Troops = 1
	do(t, g, 0, Action{Type: "attack", From: 1, To: 3, Dice: 3}, sequence(5, 4, 3))
	do(t, g, 2, Action{Type: "defend", Dice: 1}, sequence(0))
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	if len(g.Players[0].Cards) != 0 {
		t.Fatal("card before end of attack")
	}
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if len(g.Players[0].Cards) != 1 {
		t.Fatal("must draw exactly one card despite two conquests")
	}
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if len(g.Players[0].Cards) != 1 {
		t.Fatal("extra card on turn end")
	}
}
func TestForcedTradeAfterElimination(t *testing.T) {
	for _, count := range []int{5, 6, 8} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			g := playing()
			for i := range g.Territories {
				g.Territories[i].Owner = 0
			}
			g.Territories[41].Owner = 2
			g.Territories[1] = Territory{Owner: 1, Troops: 1}
			g.Territories[0].Troops = 12
			g.Players[0].Cards = []int{0, 2, 3}
			extra := []int{12, 13, 18, 20, 21}
			g.Players[1].Cards = extra[:count-3]
			do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 4, 3))
			do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
			do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
			if len(g.Players[1].Cards) != 0 || len(g.Players[0].Cards) != count {
				t.Fatal("cards not inherited")
			}
			if count == 5 {
				if g.Phase != "attack" {
					t.Fatal("five inherited cards should wait until next turn")
				}
				return
			}
			if g.Phase != "reinforce" || !g.mustTrade() {
				t.Fatal("missing forced trade")
			}
			do(t, g, 0, Action{Type: "trade", Cards: []int{0, 2, 3}, Bonus: 1}, sequence(0))
			if count == 8 {
				if !g.mustTrade() {
					t.Fatal("eight cards require two exchanges")
				}
				do(t, g, 0, Action{Type: "trade", Cards: []int{12, 13, 18}, Bonus: 13}, sequence(0))
			}
			if g.mustTrade() {
				t.Fatal("too many required trades")
			}
			do(t, g, 0, Action{Type: "place", Territory: 1, Amount: g.Pool}, sequence(0))
			if g.Phase != "attack" || g.Resume != "" || g.ForcedTrade || g.TradeOpen || g.Pool != 0 {
				t.Fatal("must resume attack without new turn reinforcement")
			}
		})
	}
}
func TestReinforcementsAndFortification(t *testing.T) {
	g := playing()
	for i := range g.Territories {
		g.Territories[i].Owner = 1
	}
	for i := 0; i < 9; i++ {
		g.Territories[i].Owner = 0
	}
	if g.reinforcement(0) != 8 {
		t.Fatal("North America bonus", g.reinforcement(0))
	}
	if g.reinforcement(2) != 3 {
		t.Fatal("minimum reinforcement")
	}
	g.Phase = "fortify"
	g.Territories[0].Troops = 7
	do(t, g, 0, Action{Type: "fortify", From: 1, To: 9, Amount: 6}, sequence(0))
	if g.Territories[0].Troops != 1 {
		t.Fatal("leave one behind")
	}
	if g.apply(0, Action{Type: "fortify", From: 9, To: 1, Amount: 1, Revision: g.Revision}, sequence(0)) == nil {
		t.Fatal("second fortification accepted")
	}
	g.Moved = false
	g.Territories[41].Owner = 0
	if g.connected(1, 42, 0) {
		t.Fatal("cannot cross hostile chain")
	}
}
func TestSetupAllPlayerCounts(t *testing.T) {
	for n := 2; n <= 6; n++ {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			g := newGame("ABCDEF", "fixed", "Player 0", "a")
			for i := 1; i < n; i++ {
				g.Players = append(g.Players, Player{Name: fmt.Sprint(i), Cards: []int{}})
			}
			rng := sequence(0, 1, 2, 3, 4, 5)
			do(t, g, 0, Action{Type: "start"}, rng)
			steps := 0
			for g.Phase == "claim" || g.Phase == "setup" {
				steps++
				if steps > 250 {
					t.Fatal("setup stuck")
				}
				id := 0
				p := g.Turn
				if g.Phase == "claim" {
					for i, v := range g.Territories {
						if v.Owner < 0 {
							id = i + 1
							break
						}
					}
					do(t, g, p, Action{Type: "claim", Territory: id}, rng)
				} else {
					for i, v := range g.Territories {
						if v.Owner == p {
							id = i + 1
							break
						}
					}
					do(t, g, p, Action{Type: "place", Territory: id, Amount: 1}, rng)
				}
			}
			totals := make([]int, len(g.Players))
			for _, v := range g.Territories {
				if v.Owner < 0 || v.Troops < 1 {
					t.Fatal("empty territory")
				}
				totals[v.Owner] += v.Troops
			}
			want := map[int]int{2: 40, 3: 35, 4: 30, 5: 25, 6: 20}[n]
			for _, v := range totals {
				if v != want {
					t.Fatal("wrong initial army", totals)
				}
			}
			if g.Phase != "reinforce" || g.Pool != g.reinforcement(g.Turn) {
				t.Fatal("first turn missing reinforcements")
			}
		})
	}
}
func TestPrivacyAndRevision(t *testing.T) {
	g := playing()
	g.Players[1].Cards = []int{10, 11, 12}
	data, _ := json.Marshal(g.view(0))
	s := string(data)
	for _, forbidden := range []string{"hash-a", "hash-b", "tokenHash", "discard", "\"deck\":", "[10,11,12]"} {
		if strings.Contains(s, forbidden) {
			t.Fatal("secret exposed", forbidden)
		}
	}
	if g.apply(0, Action{Type: "next", Revision: g.Revision - 1}, sequence(0)) == nil {
		t.Fatal("accepted stale command")
	}
}
func TestMandatoryStartTradeAndDeckRecycling(t *testing.T) {
	g := playing()
	g.Phase = "reinforce"
	g.Pool = 3
	g.TradeOpen = true
	g.Players[0].Cards = []int{0, 2, 3, 5, 6}
	if g.apply(0, Action{Type: "place", Territory: 1, Amount: 1, Revision: g.Revision}, sequence(0)) == nil {
		t.Fatal("placed before required trade")
	}
	do(t, g, 0, Action{Type: "trade", Cards: []int{0, 2, 3}, Bonus: 1}, sequence(0))
	if g.Pool != 7 || g.Territories[0].Troops != 5 {
		t.Fatal("trade reinforcement or territory bonus")
	}
	do(t, g, 0, Action{Type: "place", Territory: 1, Amount: 7}, sequence(0))
	if g.Phase != "attack" {
		t.Fatal("final reinforcement must automatically start attack")
	}
	g.Deck = []int{}
	g.Conquered = true
	before := len(g.Players[0].Cards)
	do(t, g, 0, Action{Type: "next"}, sequence(0))
	if len(g.Players[0].Cards) != before+1 || len(g.Deck) != 2 || len(g.Discard) != 0 {
		t.Fatal("discard pile recycling")
	}
}
func TestDuelVictoryBeforeNeutralElimination(t *testing.T) {
	g := playing()
	g.Players[2].Neutral = true
	for i := range g.Territories {
		g.Territories[i].Owner = 0
	}
	g.Territories[41].Owner = 2
	g.Territories[1] = Territory{Owner: 1, Troops: 1}
	g.Territories[0].Troops = 8
	do(t, g, 0, Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5, 4, 3))
	do(t, g, 1, Action{Type: "defend", Dice: 1}, sequence(0))
	do(t, g, 0, Action{Type: "occupy", Amount: 3}, sequence(0))
	if g.Phase != "finished" || g.Winner != 0 {
		t.Fatal("duel victory")
	}
}
