package main

import "slices"

// Complete history is persisted, but sent to clients only in the end screen.
// Target IDs deduplicate repeated dice throws against one country in a round.
type CombatStatistics struct {
	SinceRound int                `json:"sinceRound"`
	Partial    bool               `json:"partial,omitempty"`
	Rounds     []CombatRoundStats `json:"rounds"`
}
type CombatRoundStats struct {
	Round   int                 `json:"round"`
	Players []PlayerCombatStats `json:"players"`
}
type PlayerCombatStats struct {
	Lost     int   `json:"lost"`
	Killed   int   `json:"killed"`
	Attacked []int `json:"attacked,omitempty"`
}

func (g *Game) ensureStatistics() {
	if g.Statistics == nil {
		g.Statistics = &CombatStatistics{SinceRound: max(1, g.Round), Partial: true}
	}
}
func (g *Game) recordCombat(b *Battle) {
	g.ensureStatistics()
	history := g.Statistics
	if len(history.Rounds) == 0 || history.Rounds[len(history.Rounds)-1].Round != g.Round {
		history.Rounds = append(history.Rounds, CombatRoundStats{Round: g.Round})
	}
	round := &history.Rounds[len(history.Rounds)-1]
	for len(round.Players) < len(g.Players) {
		round.Players = append(round.Players, PlayerCombatStats{})
	}
	attacker, defender := &round.Players[b.Attacker], &round.Players[b.Defender]
	attacker.Lost += b.AttackerLoss
	attacker.Killed += b.DefenderLoss
	defender.Lost += b.DefenderLoss
	defender.Killed += b.AttackerLoss
	if !slices.Contains(attacker.Attacked, b.To) {
		attacker.Attacked = append(attacker.Attacked, b.To)
	}
}
