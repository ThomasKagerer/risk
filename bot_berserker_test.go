package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestBerserkerCanBeCreatedAddedAndRestored(t *testing.T) {
	s, _ := newServer(t.TempDir(), 8)
	w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Host", "mode": "fixed", "players": []map[string]string{{"kind": "berserker", "name": ""}}}, nil)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var created struct{ Code string }
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	r, _ := s.get(created.Code)
	if len(r.game.Players) != 2 || r.game.Players[1].Bot != "berserker" || r.game.Players[1].Name != "Ragnar" {
		t.Fatal(r.game.Players)
	}
	w = request(t, s, "POST", "/api/rooms/"+created.Code+"/actions", Action{Type: "addbot", Bot: "berserker", Revision: r.game.Revision}, w.Result().Cookies())
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	restored, _ := newServer(s.dir, 8)
	saved, err := restored.get(created.Code)
	if err != nil || saved.game.Players[2].Bot != "berserker" || saved.game.Players[2].Name != "Ragnar 2" {
		t.Fatal("Ragnar not persisted", err)
	}
}

func TestBerserkerGameRunnerUsesAllOutController(t *testing.T) {
	s, _ := newServer(t.TempDir(), 8)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.enableBots(ctx, "")
	s.bots.delay, s.bots.battleDelay = 0, 0
	g := playing()
	g.Rules, g.Goal, g.Turn = "classic", "domination", 1
	for i := range g.Territories {
		g.Territories[i].Owner, g.Territories[i].Troops = 0, 100
	}
	g.Territories[0].Owner, g.Territories[0].Troops = 1, 3
	g.Players[1].Bot = "berserker"
	c := &subscriber{player: 0, wake: make(chan struct{}, 1)}
	r := &room{game: g, clients: []*subscriber{c}}
	r.mu.Lock()
	s.kickBotsLocked(r)
	r.mu.Unlock()
	select {
	case <-c.wake:
	case <-time.After(3 * time.Second):
		t.Fatal("Ragnar did not act")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.game.Phase != "defend" || r.game.Pending.From != 1 || r.game.Pending.Dice != 2 || r.game.Players[1].BotDecision.Engine != "berserker" {
		t.Fatal("Ragnar used the cautious strategy instead of attacking")
	}
}
