package main

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestEurope1871BoardIntegrity(t *testing.T) {
	b := boards["europe1871"]
	if len(b.Countries) != 71 || len(b.Cards) != 73 || len(b.Continents) != 8 {
		t.Fatal("wrong board size")
	}
	seen := map[int]bool{1: true}
	queue := []int{1}
	for i := 0; i < len(queue); i++ {
		id := queue[i]
		for _, nb := range b.Countries[id-1].Neighbors {
			if nb < 1 || nb > 71 || nb == id || !slices.Contains(b.Countries[nb-1].Neighbors, id) {
				t.Fatal("invalid border", id, nb)
			}
			if !seen[nb] {
				seen[nb] = true
				queue = append(queue, nb)
			}
		}
	}
	if len(seen) != 71 {
		t.Fatal("disconnected Europe")
	}
	for i, c := range b.Countries {
		if c.ID != i+1 || len(c.Outline) == 0 || b.Cards[i].Territory != c.ID {
			t.Fatal("invalid country/card", c.ID)
		}
	}
	var raw struct {
		Countries []struct {
			ID     int
			Name   string
			X, Y   float64
			Polity string
			Era    int
		}
	}
	data, _ := assets.ReadFile("web/assets/europe1871.json")
	json.Unmarshal(data, &raw)
	if b.Countries[1].Continent == b.Countries[5].Continent {
		t.Fatal("British Isles and Nordic countries must have separate bonuses")
	}
	affiliations := map[string]string{"Elsass-Lothringen": "Deutsches Reich", "Finnland": "Russisches Reich", "Kongresspolen": "Russisches Reich", "Bosnien": "Osmanisches Reich", "Bulgarien": "Osmanisches Reich", "Bayern": "Deutsches Reich"}
	for _, c := range raw.Countries {
		if c.Era != 1871 || !b.Countries[c.ID-1].contains(Point{X: c.X, Y: c.Y}) {
			t.Fatal("invalid location/era", c.Name)
		}
		if want, ok := affiliations[c.Name]; ok && c.Polity != want {
			t.Fatal("wrong historical affiliation", c.Name, c.Polity)
		}
	}
}
