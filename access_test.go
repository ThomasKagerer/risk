package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type testIssuer struct {
	key     *rsa.PrivateKey
	v       *accessVerifier
	fetches atomic.Int32
}

func newTestIssuer(t *testing.T) *testIssuer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	i := &testIssuer{key: key}
	h := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i.fetches.Add(1)
		if r.URL.Path != "/cdn-cgi/access/certs" {
			t.Error("wrong JWKS path")
		}
		respond(w, 200, map[string]any{"keys": []any{map[string]string{"kid": "test-key", "kty": "RSA", "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
	}))
	t.Cleanup(h.Close)
	i.v = &accessVerifier{issuer: h.URL, audience: "domination", client: h.Client()}
	return i
}
func (i *testIssuer) token(t *testing.T, email string, change func(map[string]any)) string {
	t.Helper()
	claims := map[string]any{"iss": i.v.issuer, "aud": []string{i.v.audience}, "email": email, "type": "app", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()}
	if change != nil {
		change(claims)
	}
	head, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "test-key"})
	body, _ := json.Marshal(claims)
	unsigned := base64.RawURLEncoding.EncodeToString(head) + "." + base64.RawURLEncoding.EncodeToString(body)
	sum := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, i.key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(sig)
}
func authenticatedRequest(t *testing.T, s *server, token, method, path string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Cf-Access-Jwt-Assertion", token)
	for _, c := range cookies {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestAccessSignaturesClaimsAndKeyCache(t *testing.T) {
	i := newTestIssuer(t)
	good := i.token(t, " Ada@Example.com ", nil)
	for range 3 {
		u, err := i.v.verify(context.Background(), good)
		if err != nil || u.Email != "ada@example.com" || u.Hash == "" {
			t.Fatal("valid identity rejected", err)
		}
	}
	if i.fetches.Load() != 1 {
		t.Fatal("keys not cached")
	}
	for _, field := range []string{"iss", "aud", "exp", "nbf", "type", "email"} {
		t.Run(field, func(t *testing.T) {
			token := i.token(t, "ada@example.com", func(c map[string]any) {
				switch field {
				case "aud":
					c[field] = []string{"other-app"}
				case "exp":
					c[field] = time.Now().Add(-time.Second).Unix()
				case "nbf":
					c[field] = time.Now().Add(time.Hour).Unix()
				case "email":
					delete(c, field)
				default:
					c[field] = "wrong"
				}
			})
			if _, err := i.v.verify(context.Background(), token); err == nil {
				t.Fatal("invalid claim accepted")
			}
		})
	}
	parts := strings.Split(good, ".")
	parts[1] = base64.RawURLEncoding.EncodeToString([]byte(`{"iss":"` + i.v.issuer + `","aud":["domination"],"email":"eve@example.com","type":"app","exp":9999999999}`))
	if _, err := i.v.verify(context.Background(), strings.Join(parts, ".")); err == nil {
		t.Fatal("forged signature accepted")
	}
	parts = strings.Split(good, ".")
	parts[0] = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","kid":"test-key"}`))
	if _, err := i.v.verify(context.Background(), strings.Join(parts, ".")); err == nil {
		t.Fatal("unsigned JWT accepted")
	}
	s, _ := newServer(t.TempDir(), 10)
	s.access = i.v
	r := httptest.NewRequest("GET", "/api/config", nil)
	r.Header.Set("Cf-Access-Authenticated-User-Email", "ada@example.com")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("email header trusted without JWT")
	}
	if w := request(t, s, "GET", "/api/health", nil, nil); w.Code != 200 {
		t.Fatal("health check requires login")
	}
	for _, conf := range [][2]string{{"", "aud"}, {"https://evil.example", "aud"}, {"https://weletapi.cloudflareaccess.com", ""}, {"http://weletapi.cloudflareaccess.com", "aud"}} {
		if _, err := newAccessVerifier(conf[0], conf[1]); err == nil {
			t.Fatal("unsafe/incomplete configuration accepted")
		}
	}
}

func TestEmailReconnectMigrationKickAndPersistence(t *testing.T) {
	i := newTestIssuer(t)
	s, _ := newServer(t.TempDir(), 10)
	// Create an old cookie-only seat before enabling Access.
	w := request(t, s, "POST", "/api/rooms", map[string]string{"name": "Ada", "mode": "fixed"}, nil)
	var created struct{ Code string }
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	path := "/api/rooms/" + created.Code
	cookies := w.Result().Cookies()
	s.access = i.v
	ada := i.token(t, "ada@example.com", nil)
	ben := i.token(t, "ben@example.com", nil)
	cleo := i.token(t, "cleo@example.com", nil)
	call := func(token, method, url string, body any, cookies []*http.Cookie) *httptest.ResponseRecorder {
		return authenticatedRequest(t, s, token, method, url, body, cookies)
	}
	if w := call(ada, "GET", path, nil, nil); w.Code != 401 {
		t.Fatal("unbound seat taken without cookie")
	}
	if w := call(ada, "GET", path, nil, cookies); w.Code != 200 {
		t.Fatal("legacy migration failed", w.Body.String())
	}
	if w := call(ada, "GET", path, nil, nil); w.Code != 200 {
		t.Fatal("new-device reconnect failed")
	}
	if w := call(ben, "GET", path, nil, cookies); w.Code != 401 {
		t.Fatal("account switch inherited seat")
	}
	if w := call(ada, "POST", path+"/join", map[string]string{"name": "Different"}, nil); w.Code != 200 {
		t.Fatal("same identity could not reconnect")
	}
	w = call(ben, "POST", path+"/join", map[string]string{"name": "Ben"}, nil)
	benCookies := w.Result().Cookies()
	if w.Code != 200 {
		t.Fatal("join failed", w.Body.String())
	}
	if w := call(cleo, "POST", path+"/join", map[string]string{"name": "Cleo"}, nil); w.Code != 200 {
		t.Fatal("join failed")
	}
	r, _ := s.get(created.Code)
	if len(r.game.Players) != 3 {
		t.Fatal("duplicate identity created a seat")
	}
	if w := call(ben, "POST", path+"/actions", Action{Type: "kick", Player: 2, Revision: r.game.Revision}, nil); w.Code != 409 {
		t.Fatal("guest removed player")
	}
	if w := call(ada, "POST", path+"/actions", Action{Type: "kick", Player: 0, Revision: r.game.Revision}, nil); w.Code != 409 {
		t.Fatal("host removed self")
	}
	removed := &subscriber{player: 1, wake: make(chan struct{}, 1), done: make(chan struct{})}
	remaining := &subscriber{player: 2, wake: make(chan struct{}, 1), done: make(chan struct{})}
	r.clients = []*subscriber{removed, remaining}
	w = call(ada, "POST", path+"/actions", Action{Type: "kick", Player: 1, Revision: r.game.Revision}, nil)
	if w.Code != 200 || len(r.game.Players) != 2 || r.game.Players[1].Name != "Cleo" || remaining.player != 1 {
		t.Fatal("lobby removal/index update failed", w.Body.String())
	}
	select {
	case <-removed.done:
	default:
		t.Fatal("removed stream not disconnected")
	}
	if removed.reason != "removed" || len(r.clients) != 1 {
		t.Fatal("stream revocation failed")
	}
	for _, route := range []string{path, path + "/events", path + "/join"} {
		method := "GET"
		if strings.HasSuffix(route, "join") {
			method = "POST"
		}
		if w := call(ben, method, route, map[string]string{"name": "New name"}, benCookies); w.Code != 403 {
			t.Fatal("removed player regained access", route, w.Code)
		}
	}
	if w := call(ben, "GET", "/api/rooms", nil, nil); w.Body.String() != "[]\n" {
		t.Fatal("removed room still listed")
	}
	if w := call(ada, "GET", "/api/rooms", nil, nil); !strings.Contains(w.Body.String(), created.Code) {
		t.Fatal("own room missing")
	}
	if strings.Contains(w.Body.String(), "identityHash") || strings.Contains(w.Body.String(), "tokenHash") || strings.Contains(w.Body.String(), "@example.com") || strings.Contains(w.Body.String(), "blocked") {
		t.Fatal("private identity leaked into game view")
	}
	if w := call(ada, "POST", path+"/actions", Action{Type: "start", Revision: r.game.Revision}, nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = call(ada, "POST", path+"/actions", Action{Type: "kick", Player: 1, Revision: r.game.Revision}, nil)
	if w.Code != 200 || r.game.Players[1].Bot != "local" || r.game.Players[1].TokenHash != "" || r.game.Players[1].IdentityHash != "" {
		t.Fatal("running takeover failed")
	}
	restarted, _ := newServer(s.dir, 10)
	restarted.access = i.v
	s = restarted
	if w := call(ada, "GET", path, nil, nil); w.Code != 200 {
		t.Fatal("identity lost after restart")
	}
	if w := call(cleo, "GET", path, nil, nil); w.Code != 403 {
		t.Fatal("kick lost after restart")
	}
	if w := call(ada, "GET", "/api/rooms", nil, nil); !strings.Contains(w.Body.String(), created.Code) {
		t.Fatal("saved room missing after restart")
	}
}

func TestKickedLiveStreamNeverReceivesNextSeat(t *testing.T) {
	s, _ := newServer(t.TempDir(), 10)
	w := request(t, s, "POST", "/api/rooms", map[string]string{"name": "Host", "mode": "fixed"}, nil)
	var created struct{ Code string }
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	hostCookies := w.Result().Cookies()
	path := "/api/rooms/" + created.Code
	w = request(t, s, "POST", path+"/join", map[string]string{"name": "Guest"}, nil)
	guestCookies := w.Result().Cookies()
	request(t, s, "POST", path+"/join", map[string]string{"name": "Other"}, nil)
	h := httptest.NewServer(s)
	defer h.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", h.URL+path+"/events", nil)
	for _, cookie := range guestCookies {
		req.AddCookie(cookie)
	}
	res, err := h.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	// Headers/initial event are flushed before the kick.
	r, _ := s.get(created.Code)
	w = request(t, s, "POST", path+"/actions", Action{Type: "kick", Player: 1, Revision: r.game.Revision}, hostCookies)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	b, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "event: removed") || strings.Count(string(b), "\ndata: {") != 2 {
		t.Fatal("unexpected post-removal state/events", string(b))
	}
}

func TestKickKeepsEveryActivePhasePlayable(t *testing.T) {
	for _, phase := range []string{"claim", "setup", "reinforce", "attack", "defend", "occupy", "fortify"} {
		t.Run(phase, func(t *testing.T) {
			g := playing()
			g.Phase, g.Turn = phase, 1
			switch phase {
			case "claim", "setup":
				g = frontierGame(2, "classic")
				if phase == "claim" {
					do(t, g, 0, Action{Type: "start"}, sequence(0, 1))
				} else {
					chooseFive(t, g, sequence(0, 1))
				}
				g.Turn = 1
			case "reinforce":
				g.Pool = 3
			case "defend":
				g.Turn = 0
				g.Pending = &Pending{From: 1, To: 2, Dice: 2, Defender: 1, Attack: []int{4, 2}}
			case "occupy":
				g.Pending = &Pending{From: 2, To: 1, Minimum: 2, Defender: 0}
				g.Territories[0] = Territory{Owner: 1, Troops: 0}
			}
			g.Players[1].Bot = ""
			g.Players[1].TokenHash, g.Players[1].IdentityHash = "session", "account"
			before := clone(g)
			do(t, g, 0, Action{Type: "kick", Player: 1}, sequence(0))
			if g.Turn != before.Turn || g.Phase != before.Phase || !reflect.DeepEqual(g.Pending, before.Pending) || !reflect.DeepEqual(g.Territories, before.Territories) || !reflect.DeepEqual(g.Players[1].Cards, before.Players[1].Cards) || g.Players[1].Reserve != before.Players[1].Reserve {
				t.Fatal("kick changed game position")
			}
			options := botOptions(g)
			if len(options) == 0 {
				t.Fatal("replacement has no legal moves")
			}
			if err := g.apply(g.actor(), options[0].Action, sequence(0)); err != nil {
				t.Fatal("replacement cannot continue", err)
			}
		})
	}
}
