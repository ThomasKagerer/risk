package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"slices"
	"strings"
)

// DLCs are portable data packages. Rule capabilities are interpreted by the
// engine; packages never execute uploaded JavaScript or native code.
type NativeRules struct {
	ThreatGap     int `json:"threatGap"`
	ThreatRounds  int `json:"threatRounds"`
	QuietRounds   int `json:"quietRounds"`
	InitialMin    int `json:"initialMin"`
	InitialMax    int `json:"initialMax"`
	ThreatMin     int `json:"threatMin"`
	ThreatMax     int `json:"threatMax"`
	QuietMin      int `json:"quietMin"`
	QuietMax      int `json:"quietMax"`
	SurvivalMin   int `json:"survivalMin"`
	SurvivalMax   int `json:"survivalMax"`
	RaidMinTroops int `json:"raidMinTroops"`
	RaidTargetMax int `json:"raidTargetMax"`
	RaidRatio     int `json:"raidRatio"`
	RaidChance    int `json:"raidChance"`
}

func randomRange(low, high int, rng Random) int { return low + rng(high-low+1) }

type RuleSet struct {
	StartingCountries int          `json:"startingCountries,omitempty"`
	StartingArmy      int          `json:"startingArmy,omitempty"`
	Natives           *NativeRules `json:"natives,omitempty"`
	PreviewText       string       `json:"previewText,omitempty"`
	ID                string       `json:"id"`
	Name              string       `json:"name"`
	Description       string       `json:"description"`
	Setup             string       `json:"setup"`
	Goals             []string     `json:"goals"`
	Buildings         bool         `json:"buildings"`
	Experience        bool         `json:"experience"`
	RevealedAttack    bool         `json:"revealedAttack"`
	ConnectedMovement bool         `json:"connectedMovement"`
	BuildingNames     []string     `json:"buildingNames,omitempty"`
	BuildingTurns     []int        `json:"buildingTurns,omitempty"`
	HelpModule        string       `json:"helpModule,omitempty"`
	Preview           bool         `json:"preview,omitempty"`
	StarThresholds    []int        `json:"starThresholds,omitempty"`
}
type DLCMap struct {
	DefaultRule    string `json:"defaultRule,omitempty"`
	ID             string `json:"id"`
	File           string `json:"file"`
	Terrain        string `json:"terrain,omitempty"`
	MultiPlacement bool   `json:"multiPlacement,omitempty"`
	CardDivisor    int    `json:"cardDivisor,omitempty"`
	ScaleFrontier  bool   `json:"scaleFrontier,omitempty"`
}
type DLCManifest struct {
	Format  int       `json:"format"`
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Version string    `json:"version"`
	Maps    []DLCMap  `json:"maps"`
	Rules   []RuleSet `json:"rules,omitempty"`
}
type contentMap struct {
	DefaultRule    string `json:"defaultRule,omitempty"`
	ID             string `json:"id"`
	DLC            string `json:"dlc,omitempty"`
	URL            string `json:"url"`
	TerrainURL     string `json:"terrainUrl,omitempty"`
	MultiPlacement bool   `json:"multiPlacement"`
	CardDivisor    int    `json:"cardDivisor"`
	ScaleFrontier  bool   `json:"scaleFrontier"`
}
type contentCatalog struct {
	Packages []DLCManifest `json:"packages"`
	Maps     []contentMap  `json:"maps"`
	Rules    []RuleSet     `json:"rules"`
	files    map[string][]byte
	boards   map[string]*Board
	rules    map[string]RuleSet
}

var content *contentCatalog
var legacyRuleSet RuleSet
var contentID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
var classicRuleSet = RuleSet{ID: "classic", Name: "Klassisch", Description: "Klassische Eroberungsregeln auf der gewählten Karte. Ohne Einheimische, Burgausbau und Geländeboni.", Setup: "classic", Goals: []string{"domination", "mission"}}

func newContentCatalog() *contentCatalog {
	return &contentCatalog{Packages: []DLCManifest{}, Maps: []contentMap{}, Rules: []RuleSet{classicRuleSet}, files: map[string][]byte{}, boards: map[string]*Board{}, rules: map[string]RuleSet{"classic": classicRuleSet}}
}
func (c *contentCatalog) addMap(meta contentMap, data, terrain []byte) error {
	if !contentID.MatchString(meta.ID) || c.boards[meta.ID] != nil {
		return fmt.Errorf("invalid or duplicate map %q", meta.ID)
	}
	var b Board
	if err := json.Unmarshal(data, &b); err != nil {
		return err
	}
	if len(b.Countries) < 2 || len(b.Countries) > 1000 || len(b.Continents) == 0 || len(b.Cards) < len(b.Countries) {
		return errors.New("invalid map dimensions")
	}
	for i, cont := range b.Continents {
		if cont.ID != i+1 || cont.Bonus < 0 || cont.Bonus > 1000 {
			return errors.New("invalid continent")
		}
	}
	for i, country := range b.Countries {
		if country.ID != i+1 || country.Continent < 1 || country.Continent > len(b.Continents) || len(country.Neighbors) == 0 || country.Path == "" {
			return errors.New("invalid territory")
		}
		for _, nb := range country.Neighbors {
			if nb < 1 || nb > len(b.Countries) || nb == country.ID || !slices.Contains(b.Countries[nb-1].Neighbors, country.ID) {
				return errors.New("invalid map border")
			}
		}
	}
	for i, card := range b.Cards {
		if card.ID != i || card.Territory < 0 || card.Territory > len(b.Countries) || !slices.Contains([]string{"infantry", "cavalry", "artillery", "wild"}, card.Kind) {
			return errors.New("invalid card")
		}
	}
	if terrain != nil && !json.Valid(terrain) {
		return errors.New("invalid terrain JSON")
	}
	b.cardDivisor = meta.CardDivisor
	b.MultiPlacement = meta.MultiPlacement
	b.ScaleFrontier = meta.ScaleFrontier
	for i := range b.Countries {
		b.Countries[i].Outline = outline(b.Countries[i].Path)
		b.Countries[i].Path = ""
	}
	// Preserve all visual map properties while adding engine capabilities.
	var visual map[string]any
	json.Unmarshal(data, &visual)
	visual["id"] = meta.ID
	if meta.ID == "classic" && visual["name"] == nil {
		visual["name"] = "Klassische Welt"
	}
	visual["multiPlacement"] = meta.MultiPlacement
	visual["cardDivisor"] = max(1, meta.CardDivisor)
	visual["scaleFrontier"] = meta.ScaleFrontier
	data, _ = json.Marshal(visual)
	c.files[meta.URL] = data
	if terrain != nil {
		c.files[meta.TerrainURL] = terrain
	}
	c.Maps = append(c.Maps, meta)
	c.boards[meta.ID] = &b
	return nil
}
func validateRuleSet(r RuleSet) error {
	if !contentID.MatchString(r.ID) || r.ID == "classic" || r.Name == "" || (r.Setup != "classic" && r.Setup != "frontier") || len(r.Goals) == 0 {
		return errors.New("invalid custom rules")
	}
	for _, goal := range r.Goals {
		if !slices.Contains([]string{"domination", "capital", "mission"}, goal) || goal == "mission" && r.Setup != "classic" {
			return errors.New("unsupported goal")
		}
	}
	if r.Setup == "frontier" {
		if r.StartingCountries < 1 || r.StartingArmy < r.StartingCountries {
			return errors.New("invalid starting army")
		}
		n := r.Natives
		if n == nil || n.ThreatGap < 1 || n.ThreatRounds < 1 || n.QuietRounds < 1 || n.RaidMinTroops < 2 || n.RaidTargetMax < 1 || n.RaidRatio < 1 || n.RaidChance < 1 {
			return errors.New("invalid native rules")
		}
		for _, bounds := range [][2]int{{n.InitialMin, n.InitialMax}, {n.ThreatMin, n.ThreatMax}, {n.QuietMin, n.QuietMax}, {n.SurvivalMin, n.SurvivalMax}} {
			if bounds[0] < 0 || bounds[1] < bounds[0] || bounds[1] > 1000 {
				return errors.New("invalid native growth range")
			}
		}
	}
	if r.Buildings {
		if len(r.BuildingNames) < 2 || len(r.BuildingNames) > 6 || len(r.BuildingTurns) != len(r.BuildingNames) {
			return errors.New("invalid building stages")
		}
		for i, n := range r.BuildingTurns {
			if i > 0 && (n < 1 || n > 100) {
				return errors.New("invalid construction duration")
			}
		}
	}
	if r.Experience {
		if len(r.StarThresholds) != 3 || r.StarThresholds[0] < 1 || r.StarThresholds[1] <= r.StarThresholds[0] || r.StarThresholds[2] <= r.StarThresholds[1] {
			return errors.New("invalid experience thresholds")
		}
	}
	return nil
}
func (c *contentCatalog) addPackage(source fs.FS) error {
	data, err := fs.ReadFile(source, "dlc.json")
	if err != nil {
		return err
	}
	var m DLCManifest
	d := json.NewDecoder(strings.NewReader(string(data)))
	d.DisallowUnknownFields()
	if err = d.Decode(&m); err != nil {
		return err
	}
	if m.Format != 1 || !contentID.MatchString(m.ID) || m.Name == "" || m.Version == "" || len(m.Maps) == 0 || len(m.Maps) > 20 || len(m.Rules) > 20 {
		return errors.New("invalid DLC manifest (format 1 and at least one map required)")
	}
	for _, p := range c.Packages {
		if p.ID == m.ID {
			return fmt.Errorf("DLC %s already installed", m.ID)
		}
	}
	// Validate in isolation; reject the complete package before changing the catalog.
	next := newContentCatalog()
	for _, r := range m.Rules {
		if r.HelpModule != "" {
			if !fs.ValidPath(r.HelpModule) || !strings.HasSuffix(r.HelpModule, ".mjs") {
				return errors.New("invalid rule help module")
			}
			if _, err = fs.ReadFile(source, r.HelpModule); err != nil {
				return err
			}
		}
		if err = validateRuleSet(r); err != nil {
			return err
		}
		if _, ok := c.rules[r.ID]; ok {
			return fmt.Errorf("rule %s already installed", r.ID)
		}
		if _, ok := next.rules[r.ID]; ok {
			return errors.New("duplicate rule ID")
		}
		next.rules[r.ID] = r
	}
	for _, entry := range m.Maps {
		if !fs.ValidPath(entry.File) || entry.CardDivisor < 0 || entry.CardDivisor > 100 || c.boards[entry.ID] != nil {
			return errors.New("invalid or duplicate DLC map")
		}
		data, err = fs.ReadFile(source, entry.File)
		if err != nil {
			return err
		}
		var terrain []byte
		if entry.DefaultRule != "" {
			if _, ok := next.rules[entry.DefaultRule]; !ok {
				return errors.New("default rule must belong to its DLC")
			}
		}
		meta := contentMap{DefaultRule: entry.DefaultRule, ID: entry.ID, DLC: m.ID, URL: "/api/content/maps/" + entry.ID, MultiPlacement: entry.MultiPlacement, CardDivisor: entry.CardDivisor, ScaleFrontier: entry.ScaleFrontier}
		if entry.Terrain != "" {
			if !fs.ValidPath(entry.Terrain) {
				return errors.New("invalid terrain path")
			}
			terrain, err = fs.ReadFile(source, entry.Terrain)
			if err != nil {
				return err
			}
			meta.TerrainURL = meta.URL + "/terrain"
		}
		if err = next.addMap(meta, data, terrain); err != nil {
			return err
		}
	}
	c.Packages = append(c.Packages, m)
	c.Maps = append(c.Maps, next.Maps...)
	c.Rules = append(c.Rules, m.Rules...)
	for id, b := range next.boards {
		c.boards[id] = b
	}
	for url, data := range next.files {
		c.files[url] = data
	}
	for _, r := range m.Rules {
		c.rules[r.ID] = r
	}
	return nil
}
func loadContent() (*contentCatalog, error) { return loadContentFrom(assets) }
func loadContentFrom(source fs.FS) (*contentCatalog, error) {
	c := newContentCatalog()
	for _, entry := range []struct{ id, file, terrain string }{{"classic", "board.json", ""}, {"europe1871", "europe1871.json", "terrain-europe1871.json"}} {
		data, err := fs.ReadFile(source, "web/assets/"+entry.file)
		if err != nil {
			return nil, err
		}
		meta := contentMap{ID: entry.id, URL: "/api/content/maps/" + entry.id}
		var terrain []byte
		if entry.terrain != "" {
			terrain, err = fs.ReadFile(source, "web/assets/"+entry.terrain)
			if err != nil {
				return nil, err
			}
			meta.TerrainURL = meta.URL + "/terrain"
		}
		if err = c.addMap(meta, data, terrain); err != nil {
			return nil, err
		}
	}
	{
		entries, err := fs.ReadDir(source, "web/dlcs")
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return c, nil
			}
			return nil, err
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			packageSource, _ := fs.Sub(source, "web/dlcs/"+entry.Name())
			if err = c.addPackage(packageSource); err != nil {
				return nil, fmt.Errorf("DLC %s: %w", entry.Name(), err)
			}
			if c.Packages[len(c.Packages)-1].ID != entry.Name() {
				return nil, errors.New("DLC ID must match its directory name")
			}
		}
	}

	return c, nil
}
func (s *server) serveContent(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != "GET" {
		return false
	}
	if r.URL.Path == "/api/content" {
		respond(w, 200, content)
		return true
	}
	if data, ok := content.files[r.URL.Path]; ok {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(data)
		return true
	}
	// Old bookmarks/tests can still request map data at the previous asset URLs.
	id := map[string]string{"world120.json": "world120", "simple-world.json": "simple-world", "terrain.json": "world120/terrain"}[path.Base(r.URL.Path)]
	if strings.Contains(r.URL.Path, "/assets/") && id != "" {
		if data, ok := content.files["/api/content/maps/"+id]; ok {
			w.Header().Set("Content-Type", "application/json")
			w.Write(data)
			return true
		}
	}
	return false
}
func rulesFor(id string) RuleSet {
	initBoards()
	if r, ok := content.rules[id]; ok {
		return r
	}
	// Empty rules identifies the legacy capital/terrain save format.
	if id == "" {
		return legacyRuleSet
	}
	return classicRuleSet
}
func (g *Game) ruleSet() RuleSet {
	if g.RuleConfig != nil && g.RuleConfig.ID == g.Rules {
		return *g.RuleConfig
	}
	return rulesFor(g.Rules)
}
func (g *Game) hasBuildings() bool  { return g.ruleSet().Buildings }
func (g *Game) hasExperience() bool { return g.ruleSet().Experience }

func defaultBuildingRules() RuleSet {
	initBoards()
	for _, r := range content.Rules {
		if r.Buildings {
			return r
		}
	}
	return RuleSet{}
}
func defaultExperienceRules() RuleSet {
	initBoards()
	for _, r := range content.Rules {
		if r.Experience {
			return r
		}
	}
	return RuleSet{}
}

func (g *Game) nativeRules() NativeRules {
	if rules := g.ruleSet().Natives; rules != nil {
		return *rules
	}
	return NativeRules{}
}
