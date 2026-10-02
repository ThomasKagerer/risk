package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestHostClosesRoomForAllPlayersAndSurvivesRestart(t *testing.T) {
	i := newTestIssuer(t)
	s, _ := newServer(t.TempDir(), 1)
	s.access = i.v
	host, guest := i.token(t, "host@example.test", nil), i.token(t, "guest@example.test", nil)
	w := authenticatedRequest(t, s, host, "POST", "/api/rooms", map[string]string{"name": "Host", "mode": "fixed"}, nil)
	var created struct{ Code string }
	json.Unmarshal(w.Body.Bytes(), &created)
	path := "/api/rooms/" + created.Code
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	if w := authenticatedRequest(t, s, guest, "POST", path+"/join", map[string]string{"name": "Guest"}, nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	for _, tc := range []struct {
		token   string
		allowed bool
	}{{host, true}, {guest, false}} {
		w := authenticatedRequest(t, s, tc.token, "GET", "/api/rooms", nil, nil)
		var list []savedRoom
		json.Unmarshal(w.Body.Bytes(), &list)
		if len(list) != 1 || list[0].CanClose != tc.allowed {
			t.Fatal("wrong close permission in list", w.Body.String())
		}
	}
	if w := authenticatedRequest(t, s, guest, "POST", path+"/close", struct{}{}, nil); w.Code != 403 {
		t.Fatal("guest closed room", w.Code)
	}
	if w := request(t, s, "POST", path+"/close", struct{}{}, nil); w.Code != 401 {
		t.Fatal("unauthenticated closure allowed", w.Code)
	}
	r, _ := s.get(created.Code)
	c := &subscriber{player: 1, wake: make(chan struct{}, 1), done: make(chan struct{})}
	r.clients = append(r.clients, c)
	if w := authenticatedRequest(t, s, host, "POST", path+"/close", struct{}{}, nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	select {
	case <-c.done:
	default:
		t.Fatal("guest was not disconnected")
	}
	if c.reason != "closed" || !r.closed || len(r.clients) != 0 || len(s.rooms) != 0 {
		t.Fatal("live room not released")
	}
	if _, err := os.Stat(s.filename(created.Code)); !os.IsNotExist(err) {
		t.Fatal("room still live on disk", err)
	}
	if _, err := os.Stat(s.archivedFilename(created.Code)); err != nil {
		t.Fatal("missing private recovery copy", err)
	}
	// Requests holding an old room pointer must not re-create the live save.
	staleReq := httptest.NewRequest("POST", path+"/join", strings.NewReader(`{"name":"Late"}`))
	staleReq.Header.Set("Content-Type", "application/json")
	staleResult := httptest.NewRecorder()
	s.join(staleResult, staleReq, r)
	if staleResult.Code != 410 {
		t.Fatal("stale join revived room", staleResult.Code)
	}
	for restart := 0; restart < 2; restart++ {
		for _, route := range []string{path, path + "/events", path + "/actions", path + "/join"} {
			method := "GET"
			if strings.HasSuffix(route, "actions") || strings.HasSuffix(route, "join") {
				method = "POST"
			}
			if w := authenticatedRequest(t, s, host, method, route, struct{}{}, nil); w.Code != 410 {
				t.Fatal("closed room reachable", route, w.Code)
			}
		}
		if w := authenticatedRequest(t, s, host, "GET", "/api/rooms", nil, nil); w.Body.String() != "[]\n" {
			t.Fatal("closed room still listed", w.Body.String())
		}
		s, _ = newServer(s.dir, 1)
		s.access = i.v
	}
	if w := authenticatedRequest(t, s, host, "POST", "/api/rooms", map[string]string{"name": "Host", "mode": "fixed"}, nil); w.Code != 201 {
		t.Fatal("closed room consumed room slot", w.Body.String())
	}
}

func TestCloseUncachedRoomAtCapacityAndDiskFailure(t *testing.T) {
	s, _ := newServer(t.TempDir(), 1)
	g := playing()
	g.Players[0].TokenHash = hashToken(strings.Repeat("a", 48))
	if err := s.save(g); err != nil {
		t.Fatal(err)
	}
	other := playing()
	other.Code = "KEEPAA"
	s.rooms[other.Code] = &room{game: other}
	cookies := []*http.Cookie{{Name: "dom_" + g.Code, Value: strings.Repeat("a", 48)}}
	path := "/api/rooms/" + g.Code + "/close"
	// Simulate a filesystem failure without permission-dependent tests.
	archiveDir := s.dir + "/closed"
	if err := os.WriteFile(archiveDir, []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	if w := request(t, s, "POST", path, struct{}{}, cookies); w.Code != 500 {
		t.Fatal("disk failure not surfaced", w.Code)
	}
	if _, err := os.Stat(s.filename(g.Code)); err != nil {
		t.Fatal("failed closure lost game", err)
	}
	if err := os.Remove(archiveDir); err != nil {
		t.Fatal(err)
	}
	if w := request(t, s, "POST", path, struct{}{}, cookies); w.Code != 200 {
		t.Fatal("uncached closure blocked by capacity", w.Body.String())
	}
	if len(s.rooms) != 1 || s.rooms[other.Code] == nil {
		t.Fatal("unrelated room removed")
	}
}

func TestClosingRoomNotifiesRealEventStream(t *testing.T) {
	s, _ := newServer(t.TempDir(), 2)
	w := request(t, s, "POST", "/api/rooms", map[string]string{"name": "Host", "mode": "fixed"}, nil)
	var v struct{ Code string }
	json.Unmarshal(w.Body.Bytes(), &v)
	cookies := w.Result().Cookies()
	path := "/api/rooms/" + v.Code
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
	if w := request(t, s, "POST", path+"/close", struct{}{}, cookies); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "event: closed") {
		t.Fatal("closure not delivered to browser", string(data))
	}
}

func TestClosingRoomStopsPendingBotAndCannotRecreateSave(t *testing.T) {
	s, _ := newServer(t.TempDir(), 2)
	g := playing()
	g.Turn = 1
	g.Players[1].Bot = "local"
	g.Players[0].TokenHash = hashToken(strings.Repeat("a", 48))
	if err := s.save(g); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.enableBots(ctx, "")
	s.bots.delay = 30 * time.Millisecond
	s.bots.battleDelay = 0
	r, _ := s.get(g.Code)
	r.mu.Lock()
	r.clients = []*subscriber{{player: 0, wake: make(chan struct{}, 1), done: make(chan struct{})}}
	s.kickBotsLocked(r)
	r.mu.Unlock()
	cookies := []*http.Cookie{{Name: "dom_" + g.Code, Value: strings.Repeat("a", 48)}}
	if w := request(t, s, "POST", "/api/rooms/"+g.Code+"/close", struct{}{}, cookies); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	deadline := time.Now().Add(time.Second)
	for {
		r.mu.Lock()
		running := r.botRunning
		rev := r.game.Revision
		r.mu.Unlock()
		if !running {
			if rev != g.Revision {
				t.Fatal("bot applied a move after closure")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("bot did not stop")
		}
		time.Sleep(time.Millisecond)
	}
	if _, err := os.Stat(s.filename(g.Code)); !os.IsNotExist(err) {
		t.Fatal("bot recreated closed save", err)
	}
}
