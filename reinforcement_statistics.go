package main

// Income is a snapshot at the time troops were awarded, not a reconstruction
// from territory ownership later in the turn. Card identities are never stored.
type ReinforcementIncome struct {
	Territories     int               `json:"territories"`
	TerritoryTroops int               `json:"territoryTroops"`
	Continents      []ContinentIncome `json:"continents"`
	Total           int               `json:"total"`
}

type ContinentIncome struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Bonus int    `json:"bonus"`
}

type ReinforcementTrade struct {
	Troops          int `json:"troops"`
	Territory       int `json:"territory,omitempty"`
	TerritoryTroops int `json:"territoryTroops,omitempty"`
}

type ReinforcementTurn struct {
	Round        int                  `json:"round"`
	Player       int                  `json:"player"`
	Income       *ReinforcementIncome `json:"income,omitempty"`
	Trades       []ReinforcementTrade `json:"trades,omitempty"`
	Total        int                  `json:"total"`
	NativeTroops int                  `json:"nativeTroops,omitempty"`
}

type ReinforcementStatistics struct {
	SinceRound int                 `json:"sinceRound"`
	Partial    bool                `json:"partial,omitempty"`
	Turns      []ReinforcementTurn `json:"turns"`
}

type PlayerReinforcementStats struct {
	Next          *ReinforcementIncome `json:"next,omitempty"`
	History       []ReinforcementTurn  `json:"history"`
	SinceRound    int                  `json:"sinceRound"`
	Partial       bool                 `json:"partial"`
	RecordedTurns int                  `json:"recordedTurns"`
	Total         int                  `json:"total"`
}

type PlayerCombatSummary struct {
	Lost       int  `json:"lost"`
	Killed     int  `json:"killed"`
	Attacked   int  `json:"attacked"`
	SinceRound int  `json:"sinceRound"`
	Partial    bool `json:"partial"`
}

func (g *Game) reinforcementIncome(p int) ReinforcementIncome {
	income := ReinforcementIncome{Territories: g.owned(p), Continents: []ContinentIncome{}}
	income.TerritoryTroops = max(3, income.Territories/3)
	income.Total = income.TerritoryTroops
	for _, c := range g.board().Continents {
		if g.holdsContinent(p, c.ID) {
			income.Continents = append(income.Continents, ContinentIncome{ID: c.ID, Name: c.Name, Bonus: c.Bonus})
			income.Total += c.Bonus
		}
	}
	return income
}

func (g *Game) reinforcementTurn(p int) *ReinforcementTurn {
	if g.ReinforcementStatistics == nil {
		g.ReinforcementStatistics = &ReinforcementStatistics{SinceRound: max(1, g.Round), Partial: true}
	}
	history := g.ReinforcementStatistics
	for i := len(history.Turns) - 1; i >= 0 && history.Turns[i].Round == g.Round; i-- {
		if history.Turns[i].Player == p {
			return &history.Turns[i]
		}
	}
	history.Turns = append(history.Turns, ReinforcementTurn{Round: g.Round, Player: p})
	return &history.Turns[len(history.Turns)-1]
}

func (g *Game) recordTurnReinforcements(income ReinforcementIncome) {
	turn := g.reinforcementTurn(g.Turn)
	turn.Income = &income
	turn.Total += income.Total
}

func (g *Game) recordTradeReinforcements(p, troops, territory int) {
	turn := g.reinforcementTurn(p)
	trade := ReinforcementTrade{Troops: troops, Territory: territory}
	if territory > 0 {
		trade.TerritoryTroops = 2
	}
	turn.Trades = append(turn.Trades, trade)
	turn.Total += trade.Troops + trade.TerritoryTroops
}

func (g *Game) playerReinforcementStats(p int) *PlayerReinforcementStats {
	if g.Players[p].Neutral {
		return nil
	}
	result := &PlayerReinforcementStats{History: []ReinforcementTurn{}, Partial: true}
	if g.owned(p) > 0 && g.Phase != "finished" && g.Phase != "lobby" && g.Phase != "claim" && g.Phase != "capital" && g.Phase != "setup" {
		income := g.reinforcementIncome(p)
		result.Next = &income
	}
	if history := g.ReinforcementStatistics; history != nil {
		result.SinceRound, result.Partial = history.SinceRound, history.Partial
		for _, turn := range history.Turns {
			if turn.Player == p {
				result.History = append(result.History, turn)
				result.Total += turn.Total
				result.RecordedTurns++
			}
		}
		// Bound live updates while retaining full history and totals on disk.
		if len(result.History) > 12 {
			result.History = result.History[len(result.History)-12:]
		}
	}
	return result
}

func (g *Game) playerCombatSummary(p int) *PlayerCombatSummary {
	if g.Statistics == nil {
		return nil
	}
	result := &PlayerCombatSummary{SinceRound: g.Statistics.SinceRound, Partial: g.Statistics.Partial}
	for _, round := range g.Statistics.Rounds {
		if p < len(round.Players) {
			stats := round.Players[p]
			result.Lost += stats.Lost
			result.Killed += stats.Killed
			result.Attacked += len(stats.Attacked)
		}
	}
	return result
}

// Growth is new income for the neutral army, unlike occupation or troop moves.
func (g *Game) recordNativeReinforcements(p, troops int) {
	if troops <= 0 {
		return
	}
	turn := g.reinforcementTurn(p)
	turn.NativeTroops += troops
	turn.Total += troops
}
