package main

import (
	"encoding/json"
	"math/rand"
	"testing"
)

func assertBotActionsLegal(t *testing.T, g *Game, actions []Action) {
	t.Helper()
	encoded, err := json.Marshal(g)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, action := range actions {
		key, _ := json.Marshal(action)
		if seen[string(key)] {
			t.Fatalf("duplicate action: %s", key)
		}
		seen[string(key)] = true
		var copy Game
		if err := json.Unmarshal(encoded, &copy); err != nil {
			t.Fatal(err)
		}
		if err := copy.apply(copy.actor(), action, rand.New(rand.NewSource(3)).Intn); err != nil {
			t.Fatalf("illegal generated action %+v: %v", action, err)
		}
	}
}
