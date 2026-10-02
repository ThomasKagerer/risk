package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"time"
)

var errRemoved = errors.New("Der Gastgeber hat dich aus dieser Partie entfernt.")

func sessionHash(r *http.Request, code string) string {
	c, err := r.Cookie("dom_" + code)
	if err != nil || len(c.Value) != 48 {
		return ""
	}
	return hashToken(c.Value)
}

// Caller holds room.mu. Legacy cookie seats are linked once, then the verified
// email is authoritative, even on a different device or with an old cookie.
func (s *server) resolvePlayer(r *http.Request, room *room) (int, error) {
	if room.closed {
		return -1, errRoomClosed
	}
	g := room.game
	u := currentUser(r)
	token := sessionHash(r, g.Code)
	key := u.Hash
	if key == "" {
		key = token
	}
	if key != "" && slices.Contains(g.Blocked, key) {
		return -1, errRemoved
	}
	for i, p := range g.Players {
		if u.Hash != "" && p.IdentityHash == u.Hash && !p.Neutral && p.Bot == "" {
			return i, nil
		}
	}
	for i, p := range g.Players {
		if token == "" || p.TokenHash != token || p.Neutral || p.Bot != "" {
			continue
		}
		// Never let an account switch inherit another email's seat.
		if p.IdentityHash != "" {
			return -1, nil
		}
		if u.Hash != "" {
			next := clone(g)
			next.Players[i].IdentityHash = u.Hash
			if err := s.save(next); err != nil {
				return -1, errors.New("Die Verknüpfung mit deiner Anmeldung konnte nicht gespeichert werden.")
			}
			room.game = next
		}
		return i, nil
	}
	return -1, nil
}

func sessionProblem(w http.ResponseWriter, err error) {
	status := 500
	if errors.Is(err, errRemoved) {
		status = 403
	}
	if errors.Is(err, errRoomClosed) {
		status = 410
	}
	problem(w, status, err)
}

type savedRoom struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	Map      string `json:"map"`
	Phase    string `json:"phase"`
	Round    int    `json:"round"`
	CanClose bool   `json:"canClose"`
	updated  time.Time
}

// Explicit home-page lookup only; saved games are scanned one at a time without
// loading them into the room cache. No always-resident identity index/database.
func (s *server) myRooms(w http.ResponseWriter, r *http.Request) {
	result := []savedRoom{}
	hash := currentUser(r).Hash
	if hash == "" {
		respond(w, 200, result)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	files, err := filepath.Glob(filepath.Join(s.dir, "*.json"))
	if err != nil {
		problem(w, 500, err)
		return
	}
	for _, path := range files {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		code := info.Name()[:len(info.Name())-5]
		if !codePattern.MatchString(code) {
			continue
		}
		var g *Game
		room := s.rooms[code]
		if room != nil {
			room.mu.Lock()
			g = room.game
		} else {
			b, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			g = &Game{}
			if json.Unmarshal(b, g) != nil {
				continue
			}
		}
		for i, p := range g.Players {
			if p.IdentityHash == hash && !p.Neutral && p.Bot == "" {
				result = append(result, savedRoom{Code: code, Name: p.Name, Map: g.mapID(), Phase: g.Phase, Round: g.Round, CanClose: i == 0, updated: info.ModTime()})
				break
			}
		}
		if room != nil {
			room.mu.Unlock()
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].updated.After(result[j].updated) })
	respond(w, 200, result[:min(20, len(result))])
}

// Caller holds room.mu. Remove affected streams before indexes can shift; they
// must never receive the next occupant's private hand.
func (r *room) removePlayerStreams(player int, shift bool) {
	kept := r.clients[:0]
	for _, c := range r.clients {
		if c.player == player {
			c.reason = "removed"
			close(c.done)
			continue
		}
		if shift && c.player > player {
			c.player--
		}
		kept = append(kept, c)
	}
	r.clients = kept
}
