package main

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestNamedBotsCreateRenameAndPersist(t *testing.T) {
	s, _ := newServer(t.TempDir(), 10)
	w := request(t, s, "POST", "/api/rooms", map[string]any{"name": "Host", "mode": "fixed", "bots": []string{"local", "local"}, "botNames": []string{"  Helvetia  ", "Bär 🐻"}}, nil)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var created struct{ Code string }
	json.Unmarshal(w.Body.Bytes(), &created)
	cookies := w.Result().Cookies()
	r, _ := s.get(created.Code)
	if r.game.Players[1].Name != "Helvetia" || r.game.Players[2].Name != "Bär 🐻" {
		t.Fatal("custom names not used")
	}
	path := "/api/rooms/" + created.Code
	w = request(t, s, "POST", path+"/join", map[string]string{"name": "Guest"}, nil)
	guest := w.Result().Cookies()
	a := Action{Type: "renamebot", Player: 1, Name: "Napoleon", Revision: r.game.Revision}
	if w := request(t, s, "POST", path+"/actions", a, guest); w.Code != 409 {
		t.Fatal("guest renamed bot")
	}
	for _, name := range []string{"", "host", "BÄR 🐻", strings.Repeat("ü", 25), "bad\nname"} {
		a.Name = name
		before := clone(r.game)
		if w := request(t, s, "POST", path+"/actions", a, cookies); w.Code != 409 || !reflect.DeepEqual(before, r.game) {
			t.Fatal("invalid name accepted or changed state", name)
		}
	}
	a.Name, a.Player = "Human renamed", 3
	if w := request(t, s, "POST", path+"/actions", a, cookies); w.Code != 409 {
		t.Fatal("renamed a human player")
	}
	if w := request(t, s, "POST", path+"/actions", Action{Type: "addbot", Bot: "local", Name: "Athena", Revision: r.game.Revision}, cookies); w.Code != 200 || r.game.Players[4].Name != "Athena" {
		t.Fatal("named lobby addition failed", w.Body.String())
	}
	if w := request(t, s, "POST", path+"/actions", Action{Type: "renamebot", Player: 1, Name: "Napoleon", Revision: r.game.Revision}, cookies); w.Code != 200 {
		t.Fatal("lobby rename failed", w.Body.String())
	}
	if w := request(t, s, "POST", path+"/actions", Action{Type: "start", Revision: r.game.Revision}, cookies); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	before := clone(r.game)
	if w := request(t, s, "POST", path+"/actions", Action{Type: "renamebot", Player: 1, Name: "Cäsar", Revision: r.game.Revision}, cookies); w.Code != 200 {
		t.Fatal("running rename failed", w.Body.String())
	}
	if !reflect.DeepEqual(before.Territories, r.game.Territories) || before.Phase != r.game.Phase || before.Turn != r.game.Turn || r.game.Players[1].Bot != before.Players[1].Bot || !reflect.DeepEqual(before.Players[1].Cards, r.game.Players[1].Cards) {
		t.Fatal("rename changed the game or bot engine")
	}
	restarted, _ := newServer(s.dir, 10)
	loaded, err := restarted.get(created.Code)
	if err != nil || loaded.game.Players[1].Name != "Cäsar" {
		t.Fatal("bot name lost after restart", err)
	}
	if w := request(t, restarted, "GET", path, nil, cookies); w.Code != 200 || !strings.Contains(w.Body.String(), "Cäsar") {
		t.Fatal("reconnected player does not see saved name")
	}
}
