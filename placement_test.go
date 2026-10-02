package main

import (
	"encoding/json"
	"math"
	"testing"
)

func TestMiniaturePositionsRespectOwnershipBordersAndPersist(t *testing.T) {
	for _, mapID := range []string{"classic", "world120"} {
		g := frontierGame(2, mapID)
		g.Phase = "attack"
		g.Turn = 1
		g.Round = 1
		g.Territories[0] = Territory{Owner: 0, Troops: 16}
		data, _ := assets.ReadFile(map[string]string{"classic": "web/assets/board.json", "world120": "web/assets/world120.json"}[mapID])
		var anchors struct {
			Countries []Point `json:"countries"`
		}
		json.Unmarshal(data, &anchors)
		p := anchors.Countries[0]
		if !g.board().Countries[0].contains(p) {
			t.Fatal("anchor outside country", mapID, p)
		}
		a := Action{Type: "arrange", Territory: 1, Piece: 1, Position: &p, Revision: g.Revision}
		if err := g.apply(0, a, secureRandom); err != nil {
			t.Fatal(err)
		} // Also between own turns.
		if g.Turn != 1 || g.Phase != "attack" || g.Territories[0].Troops != 16 {
			t.Fatal("arrangement changed gameplay")
		}
		restored := clone(g)
		if *restored.Territories[0].Positions[1] != p {
			t.Fatal("layout not persisted")
		}
		for _, bad := range []Action{
			{Type: "arrange", Territory: 2, Position: &p},
			{Type: "arrange", Territory: 1, Piece: 3, Position: &p},
			{Type: "arrange", Territory: 1, Piece: 6, Position: &p},
			{Type: "arrange", Territory: 1, Position: &Point{0, 0}},
			{Type: "arrange", Territory: 1, Position: &Point{math.NaN(), p.Y}},
			{Type: "arrange", Territory: 1},
		} {
			before, _ := json.Marshal(g)
			bad.Revision = g.Revision
			if err := g.apply(0, bad, secureRandom); err == nil {
				t.Fatalf("accepted invalid layout: %+v", bad)
			}
			after, _ := json.Marshal(g)
			if string(before) != string(after) {
				t.Fatal("invalid layout mutated game")
			}
		}
		a.Revision = g.Revision
		if g.apply(1, a, secureRandom) == nil {
			t.Fatal("opponent moved own piece")
		}
		g.Pending = &Pending{From: 1, To: 2}
		if g.apply(0, a, secureRandom) == nil {
			t.Fatal("moved during pending combat")
		}
	}
}

func TestPlacementGeometryHandlesIslandsAndHoles(t *testing.T) {
	c := Country{Outline: outline("M0,0L10,0L10,10L0,10ZM2,2L2,4L4,4L4,2ZM20,20L25,20L25,25L20,25Z")}
	for _, p := range []Point{{1, 1}, {22, 22}, {8, 8}} {
		if !c.contains(p) {
			t.Fatal("land rejected", p)
		}
	}
	for _, p := range []Point{{3, 3}, {15, 15}, {-1, 0}, {math.Inf(1), 0}} {
		if c.contains(p) {
			t.Fatal("water accepted", p)
		}
	}
	for _, b := range boards {
		for _, c := range b.Countries {
			if len(c.Outline) == 0 {
				t.Fatal("missing outline", c.Name)
			}
		}
	}
}

func TestConquestClearsPreviousMiniatureLayout(t *testing.T) {
	g := frontierGame(2, "classic")
	g.Phase = "defend"
	g.Turn = 0
	g.Territories[0] = Territory{Owner: 0, Troops: 4}
	g.Territories[1] = Territory{Owner: 1, Troops: 1, Positions: []*Point{{151, 80}}}
	g.Pending = &Pending{From: 1, To: 2, Dice: 3, Defender: 1, Attack: []int{6, 6, 6}}
	g.resolveBattle(1, sequence(0))
	if g.Territories[1].Owner != 0 || g.Territories[1].Positions != nil {
		t.Fatal("captured old formation")
	}
}
