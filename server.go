package main

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode"
	"unicode/utf8"
)

//go:embed web
var assets embed.FS

type subscriber struct {
	player int
	wake   chan struct{}
	done   chan struct{}
	reason string
}
type room struct {
	mu              sync.Mutex
	game            *Game
	clients         []*subscriber
	used            time.Time
	botRunning      bool
	closed          bool
	lastBattleAt    time.Time
	lastBattleRoute string
	lastBattleNew   bool
}

func (r *room) recordBattle(next *Game) {
	if next.Battle == nil || r.game.Battle != nil && next.Battle.ID == r.game.Battle.ID {
		return
	}
	b := next.Battle
	route := fmt.Sprintf("%d:%d:%d:%d", next.Round, b.Attacker, b.From, b.To)
	r.lastBattleNew = route != r.lastBattleRoute
	r.lastBattleRoute = route
	r.lastBattleAt = time.Now()
}

type server struct {
	mu           sync.Mutex
	rooms        map[string]*room
	dir          string
	maxRooms     int
	lastCreate   time.Time
	createTokens float64
	files        http.Handler
	bots         *botEngine
	access       *accessVerifier
}

var codePattern = regexp.MustCompile(`^[A-HJ-NP-Z2-9]{6}$`)
var errNotFound = errors.New("Partie nicht gefunden. Prüfe den Raumcode.")

func newServer(dir string, maxRooms int) (*server, error) {
	initBoards()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	return &server{rooms: map[string]*room{}, dir: dir, maxRooms: maxRooms, createTokens: 20, lastCreate: time.Now(), files: frontendFiles()}, nil
}
func randomString(n int, alphabet string) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = alphabet[secureRandom(len(alphabet))]
	}
	return string(b)
}
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func (s *server) filename(code string) string { return filepath.Join(s.dir, code+".json") }
func (s *server) save(g *Game) error {
	b, err := json.Marshal(g)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(s.dir, ".state-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(b); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, s.filename(g.Code))
}
func (s *server) get(code string) (*room, error) {
	if !codePattern.MatchString(code) {
		return nil, errNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if r := s.rooms[code]; r != nil {
		r.mu.Lock()
		r.used = time.Now()
		r.mu.Unlock()
		return r, nil
	}
	if len(s.rooms) >= s.maxRooms {
		return nil, errors.New("Der Server hat gerade seine Partiengrenze erreicht.")
	}
	b, err := os.ReadFile(s.filename(code))
	if err != nil {
		if _, archived := os.Stat(s.archivedFilename(code)); archived == nil {
			return nil, errRoomClosed
		}
		return nil, errNotFound
	}
	var g Game
	if err = json.Unmarshal(b, &g); err != nil {
		return nil, errors.New("Der gespeicherte Spielstand konnte nicht geladen werden.")
	}
	if g.board() == nil || len(g.Territories) != len(g.board().Countries) {
		return nil, errors.New("Der gespeicherte Spielstand enthält eine unbekannte Karte.")
	}
	if g.ensureUnitHistory(true) {
		if err := s.save(&g); err != nil {
			return nil, errors.New("Die Einheitenhistorie konnte nicht gespeichert werden.")
		}
	}
	if g.preparePendingAttack(secureRandom) {
		if err := s.save(&g); err != nil {
			return nil, errors.New("Der Angriffswurf konnte nicht gespeichert werden.")
		}
	}
	// Older saves may still await the now redundant reinforcement confirmation.
	if g.finishReinforcement() {
		g.Revision++
		if err := s.save(&g); err != nil {
			return nil, errors.New("Der Phasenwechsel konnte nicht gespeichert werden.")
		}
	}
	r := &room{game: &g, used: time.Now()}
	s.rooms[code] = r
	return r, nil
}
func clone(g *Game) *Game {
	b, _ := json.Marshal(g)
	var result Game
	_ = json.Unmarshal(b, &result)
	return &result
}
func setSession(w http.ResponseWriter, r *http.Request, code, token string) {
	http.SetCookie(w, &http.Cookie{Name: "dom_" + code, Value: token, Path: "/api/rooms/" + code, HttpOnly: true, Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteStrictMode, MaxAge: 60 * 60 * 24 * 30})
}
func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func problem(w http.ResponseWriter, status int, err error) {
	respond(w, status, map[string]string{"error": err.Error()})
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errors.New("JSON-Anfrage erwartet.")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return errors.New("Die Anfrage ist ungültig oder zu groß.")
	}
	return nil
}
func validName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 24 {
		return "", errors.New("Der Name muss 1 bis 24 Zeichen lang sein.")
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return "", errors.New("Der Name enthält ungültige Zeichen.")
		}
	}
	return name, nil
}
func (g *Game) availableName(name string, except int) (string, error) {
	name, err := validName(name)
	if err != nil {
		return "", err
	}
	for i, p := range g.Players {
		if i != except && strings.EqualFold(p.Name, name) {
			return "", errors.New("Dieser Name ist schon vergeben.")
		}
	}
	return name, nil
}
func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
	if r.Method == "POST" {
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Host != r.Host {
				problem(w, 403, errors.New("Diese Anfrage stammt von einer anderen Webseite."))
				return
			}
		}
	}
	if r.URL.Path == "/api/health" && r.Method == "GET" {
		respond(w, 200, map[string]string{"status": "ok"})
		return
	}
	if s.access != nil {
		user, err := s.access.verify(r.Context(), r.Header.Get("Cf-Access-Jwt-Assertion"))
		if err != nil {
			respond(w, 401, map[string]any{"error": err.Error(), "authRequired": true})
			return
		}
		r = r.WithContext(context.WithValue(r.Context(), accessContextKey{}, user))
	}
	if r.URL.Path == "/api/rooms" && r.Method == "GET" {
		s.myRooms(w, r)
		return
	}
	if r.URL.Path == "/api/config" && r.Method == "GET" {
		respond(w, 200, map[string]any{"email": currentUser(r).Email})
		return
	}
	if r.URL.Path == "/api/rooms" && r.Method == "POST" {
		s.create(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/rooms/") {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/rooms/"), "/")
		if len(parts) > 2 {
			http.NotFound(w, r)
			return
		}
		if len(parts) == 2 && parts[1] == "close" && r.Method == "POST" {
			s.closeRoom(w, r, parts[0])
			return
		}
		room, err := s.get(parts[0])
		if err != nil {
			status := 404
			if errors.Is(err, errRoomClosed) {
				status = 410
			}
			problem(w, status, err)
			return
		}
		if len(parts) == 2 && parts[1] == "join" && r.Method == "POST" {
			s.join(w, r, room)
			return
		}
		if len(parts) == 2 && parts[1] == "events" && r.Method == "GET" {
			s.events(w, r, room)
			return
		}
		room.mu.Lock()
		defer room.mu.Unlock()
		me, err := s.resolvePlayer(r, room)
		if err != nil {
			sessionProblem(w, err)
			return
		}
		if me < 0 {
			problem(w, 401, errors.New("Tritt dieser Partie mit deinem Namen bei."))
			return
		}
		if len(parts) == 1 && r.Method == "GET" {
			respond(w, 200, room.game.sessionView(me))
			return
		}
		if len(parts) == 2 && parts[1] == "actions" && r.Method == "POST" {
			var a Action
			if err := decode(w, r, &a); err != nil {
				problem(w, 400, err)
				return
			}
			next := clone(room.game)
			if err := next.sessionAction(me, a, secureRandom); err != nil {
				problem(w, 409, err)
				return
			}
			if err := s.save(next); err != nil {
				log.Printf("save: %v", err)
				problem(w, 500, errors.New("Speichern fehlgeschlagen. Der Spielzug wurde nicht übernommen."))
				return
			}
			if a.Type == "removebot" || a.Type == "kick" {
				room.removePlayerStreams(a.Player, room.game.Phase == "lobby")
			}
			room.recordBattle(next)
			room.game = next
			room.used = time.Now()
			room.notify()
			s.kickBotsLocked(room)
			respond(w, 200, next.sessionView(me))
			return
		}
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		w.WriteHeader(405)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	s.files.ServeHTTP(w, r)
}
func (s *server) create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Map      string   `json:"map"`
		Rules    string   `json:"rules"`
		Goal     string   `json:"goal"`
		Name     string   `json:"name"`
		Mode     string   `json:"mode"`
		Bots     []string `json:"bots"`
		BotNames []string `json:"botNames"`
		Players  []struct {
			Kind string `json:"kind"`
			Name string `json:"name"`
		} `json:"players"`
	}
	if err := decode(w, r, &input); err != nil {
		problem(w, 400, err)
		return
	}
	if len(input.BotNames) != 0 && len(input.BotNames) != len(input.Bots) {
		problem(w, 400, errors.New("Jeder Bot braucht ein zugehöriges Namensfeld."))
		return
	}
	if len(input.Players) > 5 || len(input.Bots) > 5 || (len(input.Players) > 0 && (len(input.Bots) > 0 || len(input.BotNames) > 0)) {
		problem(w, 400, errors.New("Wähle bis zu fünf weitere Spieler in einer Spielerliste."))
		return
	}
	name, err := validName(input.Name)
	if err != nil {
		problem(w, 400, err)
		return
	}
	if input.Rules == "" {
		input.Rules = "domination"
	}
	if input.Rules != "classic" && input.Rules != "domination" {
		problem(w, 400, errors.New("Wähle Klassisch oder Domination."))
		return
	}
	if input.Rules == "classic" {
		input.Mode = "progressive"
	}
	if input.Mode != "fixed" && input.Mode != "progressive" {
		problem(w, 400, errors.New("Wähle feste oder steigende Kartenboni."))
		return
	}
	if err := validGoal(input.Rules, input.Goal); err != nil {
		problem(w, 400, err)
		return
	}
	if input.Map == "" {
		input.Map = "classic"
	}
	if boards[input.Map] == nil {
		problem(w, 400, errors.New("Wähle eine verfügbare Weltkarte."))
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	s.createTokens = min(20, s.createTokens+now.Sub(s.lastCreate).Seconds()/3)
	s.lastCreate = now
	if s.createTokens < 1 {
		problem(w, 429, errors.New("Gerade wurden viele Partien erstellt. Bitte kurz warten."))
		return
	}
	files, _ := filepath.Glob(filepath.Join(s.dir, "*.json"))
	if len(s.rooms) >= s.maxRooms || len(files) >= 500 {
		problem(w, 503, errors.New("Der Server hat seine Partiengrenze erreicht."))
		return
	}
	code := ""
	for {
		code = randomString(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
		if _, err = os.Stat(s.filename(code)); os.IsNotExist(err) {
			if _, archived := os.Stat(s.archivedFilename(code)); os.IsNotExist(archived) {
				break
			}
		}
	}
	token := randomString(48, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
	g := newGame(code, input.Mode, name, hashToken(token), input.Map)
	g.Rules = input.Rules
	g.Setup = "frontier"
	if input.Rules == "classic" {
		g.Setup = "classic"
	}
	g.Goal = input.Goal
	g.Players[0].IdentityHash = currentUser(r).Hash
	for _, p := range input.Players {
		typ := "addbot"
		if p.Kind == "human" {
			typ = "addlocal"
		}
		if err = g.apply(0, Action{Type: typ, Bot: p.Kind, Name: p.Name, Revision: g.Revision}, secureRandom); err != nil {
			problem(w, 400, err)
			return
		}
	}
	for i, kind := range input.Bots {
		botName := ""
		if len(input.BotNames) != 0 {
			botName = input.BotNames[i]
		}
		if err = g.apply(0, Action{Type: "addbot", Bot: kind, Name: botName, Revision: g.Revision}, secureRandom); err != nil {
			problem(w, 400, err)
			return
		}
	}
	if err = s.save(g); err != nil {
		problem(w, 500, errors.New("Die Partie konnte nicht gespeichert werden."))
		return
	}
	s.createTokens--
	s.rooms[code] = &room{game: g, used: now}
	setSession(w, r, code, token)
	respond(w, 201, g.sessionView(0))
}
func (s *server) join(w http.ResponseWriter, r *http.Request, room *room) {
	var input struct {
		Name string `json:"name"`
	}
	if err := decode(w, r, &input); err != nil {
		problem(w, 400, err)
		return
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	me, err := s.resolvePlayer(r, room)
	if err != nil {
		sessionProblem(w, err)
		return
	}
	if me >= 0 {
		respond(w, 200, room.game.sessionView(me))
		return
	}
	name, err := validName(input.Name)
	if err != nil {
		problem(w, 400, err)
		return
	}
	if room.game.Phase != "lobby" {
		problem(w, 409, errors.New("Diese Partie läuft schon. Kehre mit derselben Cloudflare-E-Mail oder deinem bisherigen Browser zurück."))
		return
	}
	if len(room.game.Players) >= 6 {
		problem(w, 409, errors.New("Die Partie ist mit sechs Spielern voll."))
		return
	}
	for _, p := range room.game.Players {
		if strings.EqualFold(p.Name, name) {
			problem(w, 409, errors.New("Dieser Name ist schon vergeben."))
			return
		}
	}
	token := randomString(48, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
	next := clone(room.game)
	next.Players = append(next.Players, Player{Name: name, TokenHash: hashToken(token), IdentityHash: currentUser(r).Hash, Cards: []int{}})
	next.Revision++
	if err = s.save(next); err != nil {
		problem(w, 500, errors.New("Beitritt konnte nicht gespeichert werden."))
		return
	}
	room.game = next
	room.notify()
	setSession(w, r, next.Code, token)
	respond(w, 200, next.sessionView(len(next.Players)-1))
}
func (r *room) notify() {
	for _, c := range r.clients {
		select {
		case c.wake <- struct{}{}:
		default:
		}
	}
}
func (s *server) events(w http.ResponseWriter, r *http.Request, room *room) {
	room.mu.Lock()
	me, err := s.resolvePlayer(r, room)
	if err != nil {
		room.mu.Unlock()
		sessionProblem(w, err)
		return
	}
	if me < 0 {
		room.mu.Unlock()
		problem(w, 401, errors.New("Keine Spielersitzung gefunden."))
		return
	}
	// Bound connections per player. A third tab displaces the oldest stream.
	count := 0
	oldest := -1
	for i, c := range room.clients {
		if c.player == me {
			count++
			if oldest < 0 {
				oldest = i
			}
		}
	}
	if count >= 2 {
		room.clients[oldest].reason = "replaced"
		close(room.clients[oldest].done)
		room.clients = append(room.clients[:oldest], room.clients[oldest+1:]...)
	}
	c := &subscriber{player: me, wake: make(chan struct{}, 1), done: make(chan struct{})}
	room.clients = append(room.clients, c)
	s.kickBotsLocked(room)
	room.mu.Unlock()
	defer func() {
		room.mu.Lock()
		defer room.mu.Unlock()
		for i, sub := range room.clients {
			if sub == c {
				room.clients = append(room.clients[:i], room.clients[i+1:]...)
				break
			}
		}
		room.used = time.Now()
	}()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	controller := http.NewResponseController(w)
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	event := func(name string) {
		_ = controller.SetWriteDeadline(time.Now().Add(5 * time.Second))
		_, _ = fmt.Fprintf(w, "event: %s\ndata: {}\n\n", name)
		_ = controller.Flush()
	}
	send := func() bool {
		room.mu.Lock()
		if c.reason != "" {
			reason := c.reason
			room.mu.Unlock()
			event(reason)
			return false
		}
		data, err := json.Marshal(room.game.sessionView(c.player))
		revision := room.game.Revision
		room.mu.Unlock()
		if err != nil {
			return false
		}
		_ = controller.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if _, err = fmt.Fprintf(w, "id: %d\ndata: %s\n\n", revision, data); err != nil {
			return false
		}
		return controller.Flush() == nil
	}
	if !send() {
		return
	}
	var expiry <-chan time.Time
	if expires := currentUser(r).Expires; !expires.IsZero() {
		timer := time.NewTimer(max(0, time.Until(expires)))
		defer timer.Stop()
		expiry = timer.C
	}
	for {
		select {
		case <-expiry:
			event("auth-expired")
			return
		case <-r.Context().Done():
			return
		case <-c.done:
			room.mu.Lock()
			reason := c.reason
			room.mu.Unlock()
			event(reason)
			return
		case <-c.wake:
			if !send() {
				return
			}
		case <-ticker.C:
			_ = controller.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			if controller.Flush() != nil {
				return
			}
		}
	}
}
func (s *server) maintain(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.mu.Lock()
			for code, r := range s.rooms {
				r.mu.Lock()
				if len(r.clients) == 0 && !r.botRunning && time.Since(r.used) > 10*time.Minute {
					delete(s.rooms, code)
				}
				r.mu.Unlock()
			}
			files, _ := filepath.Glob(filepath.Join(s.dir, "*.json"))
			for _, file := range files {
				code := strings.TrimSuffix(filepath.Base(file), ".json")
				if s.rooms[code] != nil {
					continue
				}
				info, err := os.Stat(file)
				if err == nil && time.Since(info.ModTime()) > 30*24*time.Hour {
					_ = os.Remove(file)
				}
			}
			s.mu.Unlock()
		}
	}
}
func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "Listen address (use 0.0.0.0:8080 for LAN access)")
	dir := flag.String("data", "data", "Private save directory")
	limit := flag.Int("max-rooms", 128, "Maximum rooms held in RAM")
	health := flag.Bool("healthcheck", false, "Check localhost:8080 health and exit")
	flag.Parse()
	if *health {
		c := http.Client{Timeout: 3 * time.Second}
		r, err := c.Get("http://127.0.0.1:8080/api/health")
		if err != nil {
			os.Exit(1)
		}
		r.Body.Close()
		if r.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	if *limit < 1 {
		log.Fatal("max-rooms must be positive")
	}
	app, err := newServer(*dir, *limit)
	if err != nil {
		log.Fatal(err)
	}
	app.access, err = newAccessVerifier(os.Getenv("CLOUDFLARE_ACCESS_TEAM_DOMAIN"), os.Getenv("CLOUDFLARE_ACCESS_AUD"))
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	app.enableBots(ctx, "")
	go app.maintain(ctx)
	h := &http.Server{Addr: *addr, Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, IdleTimeout: 45 * time.Second, MaxHeaderBytes: 8192}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = h.Shutdown(shutdown)
	}()
	log.Printf("Domination läuft auf http://%s", *addr)
	if err = h.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
