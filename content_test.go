package main

import (
	"encoding/json"
	"io/fs"
	"net/http/httptest"
	"slices"
	"testing"
	"testing/fstest"
)

func TestCoreLoadsWithoutAnyDLC(t *testing.T) {
	source := fstest.MapFS{}
	for _, file := range []string{"board.json", "europe1871.json", "terrain-europe1871.json"} {
		path := "web/assets/" + file
		data, err := assets.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		source[path] = &fstest.MapFile{Data: data}
	}
	c, err := loadContentFrom(source)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Packages) != 0 || len(c.Maps) != 2 || len(c.Rules) != 1 || c.rules["classic"].Buildings || c.boards["world120"] != nil {
		t.Fatal("DLC content leaked into the core", c)
	}
}
func TestBundledDLCPackagesAreIndependent(t *testing.T) {
	c, err := loadContent()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Packages) != 3 || len(c.Maps) != 5 || len(c.Rules) != 2 {
		t.Fatal("unexpected installed catalog")
	}
	for _, id := range []string{"mini-world", "world-1700"} {
		source, err := fs.Sub(assets, "web/dlcs/"+id)
		if err != nil {
			t.Fatal(err)
		}
		only := newContentCatalog()
		if err = only.addPackage(source); err != nil {
			t.Fatal(err)
		}
		if len(only.Rules) != 1 || len(only.Maps) != 1 || !only.Maps[0].MultiPlacement {
			t.Fatal("map DLC changed base rules or lost multi-placement")
		}
	}
	r := c.rules["domination"]
	if !r.Buildings || !r.Experience || !r.RevealedAttack || r.upgradeDuration(0, 5) != 20 || r.Natives.ThreatRounds != 3 || r.Natives.QuietRounds != 5 {
		t.Fatal("expansion rules changed")
	}
}
func TestNewDLCNeedsNoCoreRegistrationAndRejectsPartialPackages(t *testing.T) {
	raw, err := assets.ReadFile("web/assets/board.json")
	if err != nil {
		t.Fatal(err)
	}
	m := DLCManifest{Format: 1, ID: "example", Name: "Example", Version: "1", Maps: []DLCMap{{ID: "example-map", File: "map.json", MultiPlacement: true}}}
	manifest, _ := json.Marshal(m)
	source := fstest.MapFS{"dlc.json": {Data: manifest}, "map.json": {Data: raw}}
	c := newContentCatalog()
	if err = c.addPackage(source); err != nil {
		t.Fatal(err)
	}
	if c.boards["example-map"] == nil || !c.boards["example-map"].MultiPlacement {
		t.Fatal("new map was not discovered")
	}
	if err = c.addPackage(source); err == nil {
		t.Fatal("accepted duplicate package")
	}
	m.ID = "broken"
	m.Maps = []DLCMap{{ID: "first-map", File: "map.json"}, {ID: "missing-map", File: "missing.json"}}
	manifest, _ = json.Marshal(m)
	source["dlc.json"] = &fstest.MapFile{Data: manifest}
	if err = c.addPackage(source); err == nil {
		t.Fatal("accepted incomplete DLC")
	}
	if c.boards["first-map"] != nil || len(c.Packages) != 1 {
		t.Fatal("failed package partially installed")
	}
}
func TestRuleCapabilitiesAndSnapshotDoNotDependOnDLCID(t *testing.T) {
	initBoards()
	config := rulesFor("domination")
	config.ID = "another-rule-set"
	config.BuildingTurns = append([]int(nil), config.BuildingTurns...)
	config.BuildingTurns[1] = 7
	config.StarThresholds = []int{2, 4, 6}
	g := newGame("ABCDEF", "fixed", "Ada", "token", "classic")
	g.Rules = config.ID
	g.RuleConfig = &config
	g.Phase = "attack"
	g.Turn = 0
	g.Territories[0] = Territory{Owner: 0, Troops: 4, BuildingLevel: 2, Experience: []int{6, 6, 6, 6}}
	g.Players[0].Cards = []int{0}
	if g.defenseLimit(1) != 7 || !g.canBuild(1, 0) || g.ruleSet().upgradeDuration(0, 1) != 7 {
		t.Fatal("engine still relies on the builtin rule ID")
	}
	saved := clone(g)
	if saved.RuleConfig == nil || saved.ruleSet().unitStars(1) != 0 || saved.defenseLimit(1) != 7 {
		t.Fatal("rule snapshot lost during persistence")
	}
}
func TestContentAPIIncludesAllInstalledMapAssets(t *testing.T) {
	s, err := newServer(t.TempDir(), 128)
	if err != nil {
		t.Fatal(err)
	}
	w := request(t, s, "GET", "/api/content", nil, nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var catalog contentCatalog
	if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil {
		t.Fatal(err)
	}
	for _, m := range catalog.Maps {
		paths := []string{m.URL}
		if m.TerrainURL != "" {
			paths = append(paths, m.TerrainURL)
		}
		for _, path := range paths {
			r := httptest.NewRecorder()
			s.ServeHTTP(r, httptest.NewRequest("GET", path, nil))
			if r.Code != 200 || !json.Valid(r.Body.Bytes()) {
				t.Fatal("unavailable DLC asset", path, r.Code)
			}
		}
	}
	for _, p := range catalog.Packages {
		for _, r := range p.Rules {
			if r.HelpModule != "" {
				w := frontendGet(s.files, "/dlcs/"+p.ID+"/"+r.HelpModule)
				if w.Code != 200 {
					t.Fatal("DLC help missing from frontend build")
				}
			}
		}
	}
}
func TestMapDLCMultiPlacementPreservesReservesAndNeutralRatio(t *testing.T) {
	for _, id := range []string{"classic", "europe1871", "simple-world", "world120"} {
		for _, players := range []int{2, 3} {
			for _, amount := range []int{1, 5, 10} {
				g := newGame("ABCDEF", "progressive", "Ada", "token", id)
				g.Rules = "classic"
				g.Setup = "classic"
				g.Phase = "setup"
				g.Round = 1
				for i := 1; i < players; i++ {
					g.Players = append(g.Players, Player{Name: "Other"})
				}
				for i := range g.Players {
					g.Players[i].Reserve = 20
				}
				if players == 2 {
					g.Players = append(g.Players, Player{Name: "Neutral", Neutral: true, Reserve: 20})
				}
				for i := range g.Territories {
					g.Territories[i] = Territory{Owner: i % len(g.Players), Troops: 1}
				}
				before := clone(g)
				beforeJSON, _ := json.Marshal(g)
				err := g.apply(0, Action{Type: "place", Territory: 1, Amount: amount, Revision: g.Revision}, sequence(0))
				allowed := amount == 1 || slices.Contains([]string{"simple-world", "world120"}, id)
				if !allowed {
					if err == nil {
						t.Fatal("base map allowed bulk placement", id)
					}
					after, _ := json.Marshal(g)
					if string(after) != string(beforeJSON) {
						t.Fatal("rejected placement mutated state")
					}
					continue
				}
				if err != nil {
					t.Fatal(id, players, amount, err)
				}
				if g.Territories[0].Troops != before.Territories[0].Troops+amount || g.Players[0].Reserve != 20-amount {
					t.Fatal("bulk placement changed troop accounting")
				}
				if players == 2 && g.Players[2].Reserve != 20-amount/2 {
					t.Fatal("neutral placement ratio changed")
				}
			}
		}
	}
}
