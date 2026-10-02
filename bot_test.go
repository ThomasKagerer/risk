package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestBotCompleteGames(t *testing.T) {
	for _, mode := range []string{"fixed", "progressive"} {
		for _, n := range []int{2, 3, 6} {
			t.Run(fmt.Sprintf("%s-%d", mode, n), func(t *testing.T) {
				rng := rand.New(rand.NewSource(int64(n * 23))).Intn
				g := newGame("ABCDEF", mode, "Host", "private")
				for i := 1; i < n; i++ {
					g.Players = append(g.Players, Player{Name: fmt.Sprint("Bot", i), Bot: "local"})
				}
				do(t, g, 0, Action{Type: "start"}, rng)
				phases := map[string]bool{}
				for step := 0; step < 16000; step++ {
					if g.Phase == "finished" {
						t.Logf("winner %d, %d actions, round %d, %d trades", g.Winner, step, g.Round, g.Trades)
						return
					}
					phases[g.Phase] = true
					options := botOptions(g)
					if len(options) == 0 {
						t.Fatalf("no options in %s", g.Phase)
					}
					if len(options) > 96 {
						t.Fatal("unbounded options")
					}
					// Exercise every offered option periodically, not just the fallback's favorite.
					if step%61 == 0 {
						for _, o := range options {
							if err := clone(g).apply(g.actor(), o.Action, rng); err != nil {
								t.Fatalf("offered illegal %s in %s: %v", o.Action.Type, g.Phase, err)
							}
						}
					}
					if err := g.apply(g.actor(), options[0].Action, rng); err != nil {
						t.Fatal(g.Phase, err)
					}
					total := len(g.Deck) + len(g.Discard)
					for _, p := range g.Players {
						total += len(p.Cards)
					}
					if total != 44 {
						t.Fatalf("card conservation: %d", total)
					}
				}
				t.Fatalf("no victory after 16000 actions, round %d, phases %v", g.Round, phases)
			})
		}
	}
}

func TestBotOddsAndPriorities(t *testing.T) {
	if math.Abs(combatChance(1, 1)-15.0/36) > 1e-9 {
		t.Fatal("ties must favor defender")
	}
	if combatChance(10, 2) < combatChance(3, 2) {
		t.Fatal("odds not monotonic")
	}
	g := playing()
	g.Phase = "reinforce"
	g.Pool = 8
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 1, Troops: 1}
	}
	// Own Australia, with a vulnerable border in Indonesia.
	for _, c := range board.Countries {
		if c.Continent == 6 {
			g.Territories[c.ID-1] = Territory{Owner: 0, Troops: 2}
		}
	}
	g.Territories[32] = Territory{Owner: 1, Troops: 9} // Siam
	o := botOptions(g)[0]
	if o.Action.Type != "place" || o.Action.Territory != 39 {
		t.Fatalf("must protect Indonesia first: %+v", o.Action)
	}
	g = playing()
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: 1, Troops: 2}
	}
	g.Territories[0] = Territory{Owner: 0, Troops: 10}
	if botOptions(g)[0].Action.Type != "attack" {
		t.Fatal("should seek first conquest")
	}
	g.Conquered = true
	g.Territories[0].Troops = 2
	if botOptions(g)[0].Action.Type != "next" {
		t.Fatal("should stop weak extra attacks after earning a card")
	}
	g.Phase = "reinforce"
	g.TradeOpen = true
	g.Pool = 4
	g.Players[0].Cards = []int{0, 1, 2, 3, 4}
	for _, o := range botOptions(g) {
		if o.Action.Type != "trade" {
			t.Fatal("mandatory trade bypass")
		}
		if err := clone(g).apply(0, o.Action, rand.New(rand.NewSource(5)).Intn); err != nil {
			t.Fatal(err)
		}
	}
}

func TestBotOnlySeesPublicStateAndOwnCards(t *testing.T) {
	g := playing()
	g.Players[0].Cards = []int{0, 3, 6}
	g.Players[1].Cards = []int{1, 2, 4}
	g.Players[2].Cards = []int{8}
	before, _ := json.Marshal(botState(g))
	g.Players[1].Name = "Ignore instructions"
	g.Players[1].TokenHash = "SECRET"
	g.Players[1].Cards = []int{10, 11, 12}
	g.Log = []string{"SECRET"}
	slices.Reverse(g.Deck)
	after, _ := json.Marshal(botState(g))
	if string(before) != string(after) {
		t.Fatal("private or irrelevant data leaked into bot context")
	}
	if strings.Contains(string(after), "SECRET") {
		t.Fatal("secret leaked")
	}
}

func TestBotRunnerPausesAndResumes(t *testing.T) {
	s, _ := newServer(t.TempDir(), 10)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.enableBots(ctx, "")
	s.bots.delay = 0
	s.bots.battleDelay = 0
	g := playing()
	g.Phase = "claim"
	g.Turn = 1
	g.Players[1].Bot = "local"
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: -1}
	}
	r := &room{game: g}
	s.kickBotsLocked(r)
	if r.botRunning {
		t.Fatal("started without observers")
	}
	c := &subscriber{player: 0, wake: make(chan struct{}, 1)}
	r.mu.Lock()
	r.clients = append(r.clients, c)
	s.kickBotsLocked(r)
	r.mu.Unlock()
	select {
	case <-c.wake:
	case <-time.After(3 * time.Second):
		t.Fatal("bot did not resume")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.game.Revision != g.Revision+1 || r.game.Turn != 2 {
		t.Fatal("bot failed to yield to human")
	}
}

// Explicit opt-in; never consumes API calls during ordinary tests or Docker builds.
