package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
	"testing"
)

func missionGame() *Game {
	g := newGame("SECRET", "progressive", "Alice", "")
	g.Rules = "classic"
	g.Goal = "mission"
	g.Setup = "classic"
	g.Phase = "attack"
	g.Round = 1
	g.Turn = 0
	g.Players = append(g.Players, Player{Name: "Bob"}, Player{Name: "Clara"})
	for i := range g.Territories {
		g.Territories[i] = Territory{Owner: i % 3, Troops: 1}
	}
	return g
}
func TestMapRulesAndGoalAreIndependent(t *testing.T) {
	s, err := newServer(t.TempDir(), 128)
	if err != nil {
		t.Fatal(err)
	}
	for _, mapID := range []string{"classic", "world120", "europe1871", "simple-world"} {
		for _, rules := range []string{"classic", "domination"} {
			goals := []string{"domination", "capital"}
			if rules == "classic" {
				goals[1] = "mission"
			}
			for _, goal := range goals {
				w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Host", "rules": rules, "map": mapID, "goal": goal, "mode": "fixed"}, nil)
				if w.Code != 201 {
					t.Fatal(w.Code, w.Body.String())
				}
				var v map[string]any
				json.Unmarshal(w.Body.Bytes(), &v)
				if v["map"] != mapID || v["rules"] != rules || v["goal"] != goal {
					t.Fatal(v)
				}
			}
		}
	}
	for _, pair := range [][2]string{{"classic", "capital"}, {"domination", "mission"}, {"classic", "invalid"}} {
		w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Host", "rules": pair[0], "goal": pair[1], "mode": "fixed"}, nil)
		if w.Code != 400 {
			t.Fatal("invalid goal accepted", pair, w.Code)
		}
	}
}
func TestMissionDealOnEveryMapAndPlayerCount(t *testing.T) {
	for _, mapID := range []string{"classic", "world120", "europe1871", "simple-world"} {
		for count := 3; count <= 6; count++ {
			g := newGame("SECRET", "progressive", "Alice", "", mapID)
			g.Rules = "classic"
			g.Goal = "mission"
			for i := 1; i < count; i++ {
				g.Players = append(g.Players, Player{Name: fmt.Sprint(i)})
			}
			if err := g.start(rand.New(rand.NewSource(int64(count))).Intn); err != nil {
				t.Fatal(err)
			}
			if g.Phase != "setup" || len(g.Players) != count {
				t.Fatal("wrong mission setup")
			}
			seen := map[string]bool{}
			for p, player := range g.Players {
				b, _ := json.Marshal(player.Mission)
				if player.Mission == nil || seen[string(b)] {
					t.Fatal("missing or duplicate mission")
				}
				seen[string(b)] = true
				initial := (map[int]int{3: 35, 4: 30, 5: 25, 6: 20}[count]*len(g.Territories) + 41) / 42
				if g.owned(p)+player.Reserve != initial || g.owned(p) < len(g.Territories)/count || g.owned(p) > (len(g.Territories)+count-1)/count {
					t.Fatal("unbalanced setup")
				}
			}
			for _, tr := range g.Territories {
				if tr.Owner < 0 || tr.Troops != 1 {
					t.Fatal("unallocated territory")
				}
			}
			deck := g.missionDeck()
			if deck[0].Territories != (18*len(g.Territories)+41)/42 || deck[1].Territories != (24*len(g.Territories)+41)/42 {
				t.Fatal("wrong scaling")
			}
		}
	}
	g := newGame("SECRET", "progressive", "Alice", "")
	g.Rules = "classic"
	g.Goal = "mission"
	g.Players = append(g.Players, Player{Name: "Bob"})
	if err := g.start(sequence(1, 0)); err == nil || len(g.Deck) > 0 {
		t.Fatal("two-player mission must reject before mutation")
	}
}
func TestMissionPrivacyPersistenceAndHotseat(t *testing.T) {
	g := missionGame()
	g.Players[0].Mission = &Mission{Kind: "territories", Territories: 24, MinTroops: 1}
	g.Players[1].Mission = &Mission{Kind: "continents", Continents: []int{5, 4}}
	g.Players[2].Mission = &Mission{Kind: "eliminate", Target: 0}
	b, _ := json.Marshal(g)
	var restored Game
	if err := json.Unmarshal(b, &restored); err != nil {
		t.Fatal(err)
	}
	if restored.missionView(1).Description != g.missionView(1).Description {
		t.Fatal("mission lost")
	}
	for p := range g.Players {
		v := g.view(p)
		if v["mission"].(*MissionView).Description != g.missionView(p).Description {
			t.Fatal("wrong private mission")
		}
		b, _ := json.Marshal(v)
		for other := range g.Players {
			if other != p && strings.Contains(string(b), g.missionView(other).Description) {
				t.Fatal("mission leaked")
			}
		}
		if strings.Contains(string(b), `"minTroops"`) || v["winningMission"] != nil {
			t.Fatal("private deck leaked")
		}
	}
	g.Players[1].Local = true
	g.Turn = 1
	if g.sessionView(0)["mission"].(*MissionView).Description != g.missionView(1).Description {
		t.Fatal("wrong hotseat mission")
	}
	botJSON, _ := json.Marshal(botState(g))
	if strings.Contains(string(botJSON), g.missionView(0).Description) || strings.Contains(string(botJSON), g.missionView(2).Description) {
		t.Fatal("bot sees rival missions")
	}
}
func TestMissionVictoryByGarrisonAndBotFinishingMove(t *testing.T) {
	g := missionGame()
	g.Phase = "reinforce"
	g.Pool = 4
	g.Players[0].Mission = &Mission{Kind: "territories", Territories: 18, MinTroops: 2}
	for i := 0; i < 18; i++ {
		g.Territories[i] = Territory{Owner: 0, Troops: 2}
	}
	g.Territories[17].Troops = 1
	g.checkMissionVictory()
	if g.Phase == "finished" {
		t.Fatal("weak garrison counted")
	}
	options := botOptions(g)
	a := options[0].Action
	if a.Type != "place" || a.Territory != 18 {
		t.Fatal("bot ignored immediate mission victory", a)
	}
	do(t, g, 0, a, sequence(0))
	if g.Phase != "finished" || g.Winner != 0 {
		t.Fatal("placement did not win")
	}
	if g.view(2)["winningMission"] == nil {
		t.Fatal("winning mission not revealed")
	}
}
func TestMissionContinentAndEliminationConditions(t *testing.T) {
	g := missionGame()
	g.Players[0].Mission = &Mission{Kind: "continents", Continents: []int{3, 6}, ExtraContinents: 1}
	for i, c := range g.board().Countries {
		if c.Continent == 3 || c.Continent == 6 {
			g.Territories[i] = Territory{Owner: 0, Troops: 1}
		}
	}
	if g.missionView(0).Complete {
		t.Fatal("extra region ignored")
	}
	for i, c := range g.board().Countries {
		if c.Continent == 2 {
			g.Territories[i] = Territory{Owner: 0, Troops: 1}
		}
	}
	g.checkMissionVictory()
	if g.Phase != "finished" {
		t.Fatal("continent mission not won")
	}
	g = missionGame()
	g.Players[2].Mission = &Mission{Kind: "eliminate", Target: 1, Territories: 24}
	for i, tr := range g.Territories {
		if tr.Owner == 1 {
			g.Territories[i].Owner = 0
		}
	}
	g.Phase = "occupy"
	g.checkMissionVictory()
	if g.Phase == "finished" {
		t.Fatal("must occupy before victory")
	}
	g.Phase = "attack"
	g.checkMissionVictory()
	if g.Phase != "finished" || g.Winner != 2 {
		t.Fatal("third-party elimination did not fulfil mission")
	}
	g = missionGame()
	g.Players[0].Mission = &Mission{Kind: "eliminate", Target: 0, Territories: 24}
	for i := 0; i < 24; i++ {
		g.Territories[i].Owner = 0
	}
	g.checkMissionVictory()
	if g.Phase != "finished" {
		t.Fatal("self-target fallback")
	}
	g = missionGame()
	g.Players[1].Mission = &Mission{Kind: "eliminate", Target: 2}
	for i := range g.Territories {
		g.Territories[i].Owner = 0
	}
	g.checkMissionVictory()
	if g.Phase == "finished" {
		t.Fatal("eliminated player cannot win")
	}
}
func TestMissionBotGamesComplete(t *testing.T) {
	for _, mapID := range []string{"classic", "europe1871", "world120"} {
		t.Run(mapID, func(t *testing.T) {
			g := newGame("BOTMIS", "progressive", "Alice", "", mapID)
			g.Rules = "classic"
			g.Goal = "mission"
			g.Players = append(g.Players, Player{Name: "Bob"}, Player{Name: "Clara"})
			rng := rand.New(rand.NewSource(20260929)).Intn
			do(t, g, 0, Action{Type: "start"}, rng)
			for step := 0; step < 16000; step++ {
				if g.Phase == "finished" {
					if !g.missionView(g.Winner).Complete {
						t.Fatal("wrong winner")
					}
					t.Logf("won after %d actions in round %d", step, g.Round)
					return
				}
				options := botOptions(g)
				if len(options) == 0 {
					t.Fatal("no legal moves", g.Phase)
				}
				do(t, g, g.actor(), options[0].Action, rng)
			}
			t.Fatal("mission game did not complete")
		})
	}
}

func TestClassicSetupOnExpandedMaps(t *testing.T) {
	for _, mapID := range []string{"world120", "europe1871"} {
		for _, count := range []int{2, 6} {
			g := newGame("EXPAND", "progressive", "A", "", mapID)
			g.Rules = "classic"
			g.Goal = "domination"
			for i := 1; i < count; i++ {
				g.Players = append(g.Players, Player{Name: fmt.Sprint(i)})
			}
			rng := rand.New(rand.NewSource(51)).Intn
			do(t, g, 0, Action{Type: "start"}, rng)
			for step := 0; g.Phase == "claim" || g.Phase == "setup"; step++ {
				if step > 3000 {
					t.Fatal("expanded setup stuck", mapID, count)
				}
				p := g.actor()
				for i, tr := range g.Territories {
					if g.Phase == "claim" && tr.Owner < 0 {
						do(t, g, p, Action{Type: "claim", Territory: i + 1}, rng)
						break
					}
					if g.Phase == "setup" && tr.Owner == p {
						do(t, g, p, Action{Type: "place", Territory: i + 1, Amount: 1}, rng)
						break
					}
				}
			}
			if g.Phase != "reinforce" {
				t.Fatal("wrong phase")
			}
			for _, p := range g.Players {
				if p.Reserve != 0 {
					t.Fatal("reserve not fully placed")
				}
			}
			for _, tr := range g.Territories {
				if tr.Owner < 0 || tr.Troops < 1 || tr.BuildingLevel != 0 {
					t.Fatal("invalid classic territory")
				}
			}
		}
	}
}
