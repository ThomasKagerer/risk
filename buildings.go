package main

import (
	"errors"
	"slices"
)

type Construction struct {
	Level     int `json:"level"`
	Duration  int `json:"duration,omitempty"`
	Remaining int `json:"remaining"`
	LastRound int `json:"lastRound"`
}

// Construction time is summed for every crossed stage.
func buildingUpgradeDuration(from, to int) int {
	return defaultBuildingRules().upgradeDuration(from, to)
}
func (r RuleSet) upgradeDuration(from, to int) int {
	cost := 0
	for level := from + 1; level <= to; level++ {
		if level < len(r.BuildingTurns) {
			cost += r.BuildingTurns[level]
		}
	}
	return cost
}
func (g *Game) canModifyBuilding(id, player int) bool {
	return g.hasBuildings() && !g.Paused && player == g.Turn && g.mine(id, player) &&
		(g.Phase == "reinforce" || g.Phase == "attack" || g.Phase == "fortify") && g.Territories[id-1].Construction == nil
}
func (g *Game) canBuild(id, player int) bool {
	if !g.canModifyBuilding(id, player) {
		return false
	}
	t := g.Territories[id-1]
	return t.BuildingLevel < len(g.ruleSet().BuildingNames)-1 && len(g.Players[player].Cards) > 0
}
func (g *Game) startConstruction(id, player int, target *int, cards []int) error {
	if !g.canModifyBuilding(id, player) {
		return errors.New("Ausbauen ist nur im eigenen Zug, im eigenen Land und ohne laufende Baustelle möglich.")
	}
	t := &g.Territories[id-1]
	level := t.BuildingLevel + 1 // Old clients and local bots still request one stage.
	if target != nil {
		level = *target
	}
	if level <= t.BuildingLevel || level >= len(g.ruleSet().BuildingNames) {
		return errors.New("Wähle eine höhere Gebäudestufe bis zur Zitadelle.")
	}
	cost := level - t.BuildingLevel
	if len(cards) != cost {
		return errors.New("Wähle genau eine Karte pro Ausbaustufe.")
	}
	seen := map[int]bool{}
	for _, card := range cards {
		if seen[card] || !slices.Contains(g.Players[player].Cards, card) {
			return errors.New("Wähle unterschiedliche Karten aus deiner Hand.")
		}
		seen[card] = true
	}
	for _, card := range cards {
		g.Players[player].Cards = slices.DeleteFunc(g.Players[player].Cards, func(id int) bool { return id == card })
		g.Discard = append(g.Discard, card)
	}
	duration := g.ruleSet().upgradeDuration(t.BuildingLevel, level)
	t.Construction = &Construction{Level: level, Duration: duration, Remaining: duration, LastRound: g.Round}
	g.note("%s baut in %s eine %s: %d Karten, %d eigene Runden. Jede fertige Zwischenstufe verbessert den Schutz; aktuell %s.", g.Players[player].Name, g.board().Countries[id-1].Name, g.ruleSet().BuildingNames[level], cost, duration, g.ruleSet().BuildingNames[t.BuildingLevel])
	return nil
}
func (g *Game) advanceConstruction() {
	if !g.hasBuildings() {
		return
	}
	for i := range g.Territories {
		t := &g.Territories[i]
		c := t.Construction
		if t.Owner != g.Turn || c == nil || c.LastRound >= g.Round {
			continue
		}
		c.LastRound = g.Round
		c.Remaining--
		// Remaining time includes every unfinished stage. Each completed stage
		// immediately supplies its occupied defense slots while the project runs.
		for t.BuildingLevel < c.Level && c.Remaining <= g.ruleSet().upgradeDuration(t.BuildingLevel+1, c.Level) {
			t.BuildingLevel++
			g.note("%s: %s fertiggestellt.", g.board().Countries[i].Name, g.ruleSet().BuildingNames[t.BuildingLevel])
		}
		if c.Remaining <= 0 {
			t.Construction = nil
		}
	}
}

// Negative limits select ordinary occupied dice slots, including four slots.
// Positive four preserves the old saved-game capital rule (troops + one).
func (g *Game) defenseOddsLimit(id int) int {
	if g.Rules != "" {
		return -g.defenseLimit(id)
	}
	return g.defenseLimit(id)
}
