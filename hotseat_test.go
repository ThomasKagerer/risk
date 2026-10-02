package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"
)

type hotseatView struct {
	Code                            string
	Revision, Me, Controller, Actor int
	Hotseat                         bool
	Phase                           string
	Hand, LocalPlayers              []int
	Players                         []PublicPlayer
}

func hotseatRead(t *testing.T, w *httptest.ResponseRecorder, status int) hotseatView {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var v hotseatView
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(w.Body.String(), "tokenHash") || strings.Contains(w.Body.String(), "identityHash") {
		t.Fatal("credentials leaked")
	}
	return v
}
func hotseatCreate(t *testing.T, s *server) (hotseatView, []*http.Cookie) {
	t.Helper()
	w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Ada", "mode": "fixed", "goal": "capital", "players": []map[string]string{{"kind": "human", "name": "Ben"}, {"kind": "human", "name": "Cleo"}}}, nil)
	return hotseatRead(t, w, 201), w.Result().Cookies()
}
func TestHotseatCreationSetupAndRecovery(t *testing.T) {
	s, _ := newServer(t.TempDir(), 10)
	v, cookies := hotseatCreate(t, s)
	path := "/api/rooms/" + v.Code
	if !v.Hotseat || !slices.Equal(v.LocalPlayers, []int{0, 1, 2}) || !v.Players[1].Local {
		t.Fatal(v)
	}
	r, _ := s.get(v.Code)
	send := func(a Action) {
		t.Helper()
		me := v.Me
		a.ActingAs = &me
		a.Revision = v.Revision
		v = hotseatRead(t, request(t, s, "POST", path+"/actions", a, cookies), 200)
	}
	send(Action{Type: "start"})
	seen := map[string]map[int]bool{}
	for steps := 0; v.Phase != "attack" && steps < 100; steps++ {
		if seen[v.Phase] == nil {
			seen[v.Phase] = map[int]bool{}
		}
		seen[v.Phase][v.Me] = true
		if v.Me != r.game.actor() || v.Controller != 0 {
			t.Fatal("wrong person at device", v)
		}
		g := r.game
		switch v.Phase {
		case "claim":
			for i, x := range g.Territories {
				if x.Owner < 0 {
					send(Action{Type: "claim", Territory: i + 1})
					break
				}
			}
		case "capital":
			for i, x := range g.Territories {
				if x.Owner == v.Me {
					send(Action{Type: "capital", Territory: i + 1})
					break
				}
			}
		case "setup":
			for i, x := range g.Territories {
				if x.Owner == v.Me {
					send(Action{Type: "place", Territory: i + 1, Amount: 5})
					break
				}
			}
		case "reinforce":
			for i, x := range g.Territories {
				if x.Owner == v.Me {
					send(Action{Type: "place", Territory: i + 1, Amount: g.Pool})
					break
				}
			}
		default:
			t.Fatal("unexpected phase", v.Phase)
		}
	}
	for _, phase := range []string{"claim", "capital", "setup"} {
		if len(seen[phase]) != 3 {
			t.Fatal("not all humans played", phase, seen)
		}
	}
	if v.Phase != "attack" {
		t.Fatal("setup stalled")
	}
	s2, _ := newServer(s.dir, 10)
	restored := hotseatRead(t, request(t, s2, "GET", path, nil, cookies), 200)
	if restored.Me != v.Me || !restored.Hotseat || restored.Controller != 0 {
		t.Fatal("lost local controller", restored)
	}
	// One account returns to all its local seats; a different account cannot inherit them.
	issuer := newTestIssuer(t)
	s2.access = issuer.v
	ada := issuer.token(t, "ada@example.com", nil)
	eve := issuer.token(t, "eve@example.com", nil)
	hotseatRead(t, authenticatedRequest(t, s2, ada, "GET", path, nil, cookies), 200)
	hotseatRead(t, authenticatedRequest(t, s2, ada, "GET", path, nil, nil), 200)
	if w := authenticatedRequest(t, s2, eve, "GET", path, nil, cookies); w.Code != 401 {
		t.Fatal("account switch took local seats")
	}
}
func TestHotseatCombatCardsAndTurnSwitch(t *testing.T) {
	g := playing()
	g.Players[1].Local = true
	g.Players[1].TokenHash = ""
	g.Players[2].Bot = "local"
	g.Players[0].Cards = []int{1, 4, 7}
	g.Players[1].Cards = []int{0, 2, 3}
	g.Players[2].Cards = []int{2, 5, 8}
	g.Territories[0].Troops = 10
	g.Territories[1].Troops = 1
	send := func(a Action, rng Random) {
		t.Helper()
		me := g.sessionPlayer(0)
		a.ActingAs = &me
		a.Revision = g.Revision
		if err := g.sessionAction(0, a, rng); err != nil {
			t.Fatal(a.Type, err)
		}
	}
	send(Action{Type: "attack", From: 1, To: 2, Dice: 3}, sequence(5))
	v := g.sessionView(0)
	if v["me"] != 1 || !slices.Equal(v["hand"].([]int), g.Players[1].Cards) {
		t.Fatal("defender did not take control", v)
	}
	wrong := 0
	enabled := true
	for _, a := range []Action{{Type: "defend", Dice: 1, ActingAs: &wrong}, {Type: "autodefense", Enabled: &enabled, ActingAs: &wrong}, {Type: "pause", Enabled: &enabled, ActingAs: &wrong}, {Type: "defend", Dice: 1}} {
		a.Revision = g.Revision
		if err := g.sessionAction(0, a, sequence(0)); err == nil {
			t.Fatal("stale or unbound seat acted", a.Type)
		}
	}
	send(Action{Type: "defend", Dice: 1}, sequence(0))
	if g.Phase != "occupy" || g.sessionPlayer(0) != 0 {
		t.Fatal("did not return to attacker")
	}
	send(Action{Type: "occupy", Amount: 3}, sequence(0))
	send(Action{Type: "next"}, sequence(0))
	send(Action{Type: "next"}, sequence(0))
	if g.Turn != 1 || g.sessionPlayer(0) != 1 || g.Phase != "reinforce" {
		t.Fatal("next human cannot reinforce", g.Phase, g.Turn)
	}
	// The next player's trade uses that player's hand, not the controller's.
	before := len(g.Players[0].Cards)
	send(Action{Type: "trade", Cards: []int{0, 2, 3}}, sequence(0))
	if len(g.Players[1].Cards) != 0 || len(g.Players[0].Cards) != before {
		t.Fatal("wrong hand traded")
	}
	// Bot turns never grant the host the bot's controls or hand.
	g.Turn = 2
	g.Phase = "attack"
	if g.sessionPlayer(0) != 0 || !slices.Equal(g.sessionView(0)["hand"].([]int), g.Players[0].Cards) {
		t.Fatal("bot hand exposed")
	}
	if err := g.sessionAction(0, Action{Type: "next", ActingAs: &wrong, Revision: g.Revision}, sequence(0)); err == nil {
		t.Fatal("host played bot turn")
	}
}
func TestHotseatOnlineIsolationAndManagement(t *testing.T) {
	s, _ := newServer(t.TempDir(), 10)
	v, cookies := hotseatCreate(t, s)
	path := "/api/rooms/" + v.Code
	if w := request(t, s, "POST", path+"/join", map[string]string{"name": "Ben"}, nil); w.Code != 409 {
		t.Fatal("local seat claimed by name")
	}
	w := request(t, s, "POST", path+"/join", map[string]string{"name": "Online"}, nil)
	remote := hotseatRead(t, w, 200)
	remoteCookies := w.Result().Cookies()
	r, _ := s.get(v.Code)
	r.game.Phase = "reinforce"
	r.game.Turn = 1
	r.game.Pool = 3
	r.game.Territories[0] = Territory{Owner: 1, Troops: 1}
	r.game.Players[1].Cards = []int{1, 2}
	r.game.Players[3].Cards = []int{8}
	remote = hotseatRead(t, request(t, s, "GET", path, nil, remoteCookies), 200)
	if remote.Me != 3 || remote.Hotseat || !slices.Equal(remote.Hand, []int{8}) {
		t.Fatal("remote view exposed local cards", remote)
	}
	seat := 1
	a := Action{Type: "place", Territory: 1, Amount: 3, Revision: r.game.Revision, ActingAs: &seat}
	if w := request(t, s, "POST", path+"/actions", a, remoteCookies); w.Code != 409 {
		t.Fatal("remote acted as local")
	}
	a.Type = "addlocal"
	a.Name = "Uninvited"
	if w := request(t, s, "POST", path+"/actions", a, remoteCookies); w.Code != 409 {
		t.Fatal("remote added local")
	}
	// Host management still works while controls belong to a different local player.
	a.Type = "renamelocal"
	a.Player = 1
	a.Name = "Benedikt"
	hotseatRead(t, request(t, s, "POST", path+"/actions", a, cookies), 200)
	a.Type = "kick"
	a.Revision = r.game.Revision
	hotseatRead(t, request(t, s, "POST", path+"/actions", a, cookies), 200)
	if r.game.Players[1].Local || r.game.Players[1].Bot != "local" || len(r.game.Blocked) > 0 {
		t.Fatal("local removal blocked host or retained control")
	}
	hotseatRead(t, request(t, s, "GET", path, nil, cookies), 200)
}
func TestHotseatDraftValidation(t *testing.T) {
	for _, players := range [][]map[string]string{
		{{"kind": "human", "name": " "}}, {{"kind": "human", "name": "ADA"}}, {{"kind": "alien", "name": "X"}},
		{{"kind": "human", "name": "Ben"}, {"kind": "local", "name": "Ben"}},
		{{"kind": "human", "name": "1"}, {"kind": "human", "name": "2"}, {"kind": "human", "name": "3"}, {"kind": "human", "name": "4"}, {"kind": "human", "name": "5"}, {"kind": "human", "name": "6"}},
	} {
		s, _ := newServer(t.TempDir(), 10)
		w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Ada", "mode": "fixed", "players": players}, nil)
		if w.Code != 400 || len(s.rooms) != 0 {
			t.Fatal("invalid draft accepted", w.Code, w.Body.String())
		}
	}
	s, _ := newServer(t.TempDir(), 10)
	w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Ada", "mode": "fixed", "players": []map[string]string{{"kind": "local", "name": "Bot"}, {"kind": "human", "name": "Ben"}}}, nil)
	v := hotseatRead(t, w, 201)
	if v.Players[1].Bot != "local" || !v.Players[2].Local || !slices.Equal(v.LocalPlayers, []int{0, 2}) {
		t.Fatal("mixed order lost", v)
	}
}
func TestHotseatEventStreamFollowsActiveSeat(t *testing.T) {
	s, _ := newServer(t.TempDir(), 10)
	v, cookies := hotseatCreate(t, s)
	path := "/api/rooms/" + v.Code
	r, _ := s.get(v.Code)
	r.game.Phase = "claim"
	r.game.Turn = 0
	r.game.Players[0].Cards = []int{0}
	r.game.Players[1].Cards = []int{1}
	h := httptest.NewServer(s)
	defer h.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", h.URL+path+"/events", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	res, err := h.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	scan := bufio.NewScanner(res.Body)
	read := func() hotseatView {
		t.Helper()
		for scan.Scan() {
			if data, ok := strings.CutPrefix(scan.Text(), "data: "); ok {
				var out hotseatView
				if err := json.Unmarshal([]byte(data), &out); err != nil {
					t.Fatal(err)
				}
				return out
			}
		}
		t.Fatal("no event", scan.Err())
		return hotseatView{}
	}
	first := read()
	if first.Me != 0 {
		t.Fatal(first)
	}
	zero := 0
	hotseatRead(t, request(t, s, "POST", path+"/actions", Action{Type: "claim", Territory: 1, Revision: first.Revision, ActingAs: &zero}, cookies), 200)
	second := read()
	if second.Me != 1 || second.Controller != 0 || !slices.Equal(second.Hand, []int{1}) {
		t.Fatal(fmt.Sprint("stream kept old hand: ", second))
	}
}
