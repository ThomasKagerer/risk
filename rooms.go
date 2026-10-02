package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
)

var errRoomClosed = errors.New("Diese Partie wurde vom Gastgeber beendet.")

func (s *server) archivedFilename(code string) string {
	return filepath.Join(s.dir, "closed", code+".json")
}

// Lock the index before the room, as get/myRooms/maintain do. An uncached game
// can also be closed when all live-room slots are occupied.
func (s *server) closeRoom(w http.ResponseWriter, req *http.Request, code string) {
	if !codePattern.MatchString(code) {
		problem(w, 404, errNotFound)
		return
	}
	var input struct{}
	if err := decode(w, req, &input); err != nil {
		problem(w, 400, err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.rooms[code]
	if r == nil {
		data, err := os.ReadFile(s.filename(code))
		if err != nil {
			problem(w, 404, errNotFound)
			return
		}
		var g Game
		if json.Unmarshal(data, &g) != nil {
			problem(w, 500, errors.New("Der Spielstand konnte nicht geladen werden."))
			return
		}
		r = &room{game: &g}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	me, err := s.resolvePlayer(req, r)
	if err != nil {
		sessionProblem(w, err)
		return
	}
	if me != 0 {
		problem(w, 403, errors.New("Nur der Gastgeber kann diese Partie beenden."))
		return
	}
	// Retain a private recovery copy outside the live-room list and its limits.
	// Rename first: a failed disk operation must leave the running game intact.
	archive := s.archivedFilename(code)
	if err := os.MkdirAll(filepath.Dir(archive), 0700); err != nil {
		problem(w, 500, errors.New("Die Partie konnte nicht beendet werden."))
		return
	}
	if err := os.Rename(s.filename(code), archive); err != nil {
		problem(w, 500, errors.New("Die Partie konnte nicht beendet werden."))
		return
	}
	r.closed = true
	for _, c := range r.clients {
		c.reason = "closed"
		close(c.done)
	}
	r.clients = nil
	delete(s.rooms, code)
	respond(w, 200, map[string]any{"closed": true, "code": code})
}
