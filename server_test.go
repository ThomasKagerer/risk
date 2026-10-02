package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func request(t *testing.T, s *server, method, path string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	return w
}
func TestServerSessionsPersistenceAndValidation(t *testing.T) {
	dir := t.TempDir()
	s, err := newServer(dir, 128)
	if err != nil {
		t.Fatal(err)
	}
	w := request(t, s, "POST", "/api/rooms", map[string]string{"name": "Ada", "mode": "fixed"}, nil)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var view struct {
		Code     string `json:"code"`
		Revision int    `json:"revision"`
	}
	json.Unmarshal(w.Body.Bytes(), &view)
	cookies := w.Result().Cookies()
	code := view.Code
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatal("session cookie")
	}
	w = request(t, s, "GET", "/api/rooms/"+code, nil, nil)
	if w.Code != 401 {
		t.Fatal("unauthenticated state exposed")
	}
	w = request(t, s, "POST", "/api/rooms/"+code+"/join", map[string]string{"name": "Ben"}, nil)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	otherCookies := w.Result().Cookies()
	w = request(t, s, "POST", "/api/rooms/"+code+"/actions", Action{Type: "start", Revision: 2}, otherCookies)
	if w.Code != 409 {
		t.Fatal("nonhost started game")
	}
	w = request(t, s, "POST", "/api/rooms/"+code+"/actions", Action{Type: "start", Revision: 2}, cookies)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	s2, err := newServer(dir, 128)
	if err != nil {
		t.Fatal(err)
	}
	w2 := request(t, s2, "GET", "/api/rooms/"+code, nil, cookies)
	if w2.Code != 200 || w2.Body.String() != w.Body.String() {
		t.Fatal("restart recovery failed")
	}
	w = request(t, s2, "POST", "/api/rooms/"+code+"/join", map[string]string{"name": "Late"}, nil)
	if w.Code != 409 {
		t.Fatal("joined running game")
	}
	w = request(t, s2, "POST", "/api/rooms/"+code+"/actions", Action{Type: "place", Territory: 999, Amount: 100, Revision: 3}, cookies)
	if w.Code != 409 {
		t.Fatal("invalid territory accepted")
	}
	w = request(t, s2, "GET", "/api/rooms/"+code, nil, cookies)
	if w.Body.String() != w2.Body.String() {
		t.Fatal("invalid action mutated saved state")
	}
	req := httptest.NewRequest("POST", "/api/rooms", strings.NewReader(`{"name":"Eve","mode":"fixed"}`))
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("cross origin creation accepted")
	}
}
func TestRoomBoundsAndHiddenFiles(t *testing.T) {
	s, _ := newServer(t.TempDir(), 1)
	w := request(t, s, "POST", "/api/rooms", map[string]string{"name": "Ada", "mode": "fixed"}, nil)
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	w = request(t, s, "POST", "/api/rooms", map[string]string{"name": "Ben", "mode": "fixed"}, nil)
	if w.Code != 503 {
		t.Fatal("room memory bound missing")
	}
	for _, path := range []string{"/server.go", "/data", "/../go.mod"} {
		w = request(t, s, "GET", path, nil, nil)
		if w.Code == 200 {
			t.Fatal("private file served", path)
		}
	}
}
