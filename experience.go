package main

type UnitHistory struct {
	ID               int  `json:"id"`
	PendingPromotion bool `json:"pendingPromotion,omitempty"`
	Battles          int  `json:"battles"`
	BornRound        int  `json:"bornRound,omitempty"`
	SinceRound       int  `json:"sinceRound"`
	Partial          bool `json:"partial,omitempty"`
}

// Existing saves cannot tell us when their troops were recruited. Mark that
// history as partial instead of inventing an age or past battle count.
func (g *Game) ensureUnitHistory(partial bool) bool {
	if !g.hasExperience() {
		return false
	}
	changed := false
	for i := range g.Territories {
		t := &g.Territories[i]
		if len(t.UnitHistory) > t.Troops {
			t.UnitHistory = t.UnitHistory[:t.Troops]
			changed = true
		}
		for len(t.UnitHistory) < t.Troops {
			g.NextUnitID++
			unit := UnitHistory{ID: g.NextUnitID, SinceRound: max(1, g.Round), Partial: partial}
			if !partial {
				unit.BornRound = max(1, g.Round)
			}
			t.UnitHistory = append(t.UnitHistory, unit)
			changed = true
		}
	}
	return changed
}

// Each entry belongs to one troop and counts owner turn starts after survived combat. Missing
// entries are recruits (zero experience), including troops in older saves.
func unitStars(survived int) int {
	return defaultExperienceRules().unitStars(survived)
}
func (r RuleSet) unitStars(survived int) int {
	stars := 0
	for _, threshold := range r.StarThresholds {
		if survived >= threshold {
			stars++
		}
	}
	return stars
}

func (t Territory) unitExperience() []int {
	units := make([]int, t.Troops)
	copy(units, t.Experience)
	return units
}

func (g *Game) experienceBonus(id int) int {
	if !g.hasExperience() {
		return 0
	}
	t := g.Territories[id-1]
	stars := 0
	for _, survived := range t.Experience[:min(t.Troops, len(t.Experience))] {
		stars += g.ruleSet().unitStars(survived)
	}
	// Integer comparisons preserve the strictly-greater-than half-star edges.
	for bonus := 3; bonus > 0; bonus-- {
		if 2*stars > (2*bonus-1)*t.Troops {
			return bonus
		}
	}
	return 0
}

func (g *Game) attackDice(id int) int {
	return max(0, min(3+g.experienceBonus(id), g.Territories[id-1].Troops-1))
}

// Keep one garrison troop at index zero when attacking. Every other troop in
// the fighting army participates, even if there are fewer dice than soldiers.
// Select losses without replacement using weights 8, 4, 2, 1, then mark only
// survivors for promotion at their owner's next turn. The returned indices
// refer to the immutable pre-battle snapshot.
func resolveUnitExperience(t *Territory, losses, garrison, turn int, rng Random, configs ...RuleSet) (before, casualties []int) {
	config := defaultExperienceRules()
	if len(configs) > 0 {
		config = configs[0]
	}
	before = t.unitExperience()
	awarded := make([]int, len(before))
	copy(awarded, t.ExperienceTurns)
	history := make([]UnitHistory, len(before))
	copy(history, t.UnitHistory)
	dead := make([]bool, len(before))
	for n := 0; n < losses; n++ {
		total := 0
		for i := garrison; i < len(before); i++ {
			if !dead[i] {
				total += 8 >> config.unitStars(before[i])
			}
		}
		pick := rng(total)
		for i := garrison; i < len(before); i++ {
			if dead[i] {
				continue
			}
			pick -= 8 >> config.unitStars(before[i])
			if pick < 0 {
				dead[i] = true
				casualties = append(casualties, i)
				break
			}
		}
	}
	t.Experience = make([]int, 0, len(before)-losses)
	t.ExperienceTurns = make([]int, 0, len(before)-losses)
	t.UnitHistory = make([]UnitHistory, 0, len(before)-losses)
	for i, survived := range before {
		if !dead[i] {
			if i >= garrison {
				history[i].Battles++
			}
			if i >= garrison {
				history[i].PendingPromotion = true
			}
			t.Experience = append(t.Experience, survived)
			t.ExperienceTurns = append(t.ExperienceTurns, awarded[i])
			t.UnitHistory = append(t.UnitHistory, history[i])
		}
	}
	return before, casualties
}

// Moving the last troops leaves the garrison in place and preserves every
// soldier's experience. Copies prevent source and destination sharing storage.
func (g *Game) moveTroops(from, to, amount int) {
	source, target := &g.Territories[from-1], &g.Territories[to-1]
	if g.hasExperience() {
		g.ensureUnitHistory(true)
		units := source.unitExperience()
		cut := len(units) - amount
		target.Experience = append(target.unitExperience(), units[cut:]...)
		source.Experience = units[:cut:cut]
		sourceTurns := make([]int, source.Troops)
		copy(sourceTurns, source.ExperienceTurns)
		targetTurns := make([]int, target.Troops)
		copy(targetTurns, target.ExperienceTurns)
		target.ExperienceTurns = append(targetTurns, sourceTurns[cut:]...)
		source.ExperienceTurns = sourceTurns[:cut:cut]
		target.UnitHistory = append(append([]UnitHistory{}, target.UnitHistory...), source.UnitHistory[cut:]...)
		source.UnitHistory = append([]UnitHistory{}, source.UnitHistory[:cut]...)
	}
	source.Troops -= amount
	target.Troops += amount
}

// Combat participation follows each soldier through movement and save/load.
// Only living soldiers belonging to the player starting a turn are promoted.
func (g *Game) promoteSurvivingUnits() {
	g.ensureUnitHistory(true)
	for i := range g.Territories {
		t := &g.Territories[i]
		if t.Owner != g.Turn {
			continue
		}
		t.Experience = t.unitExperience()
		for j := range t.UnitHistory {
			if t.UnitHistory[j].PendingPromotion {
				t.Experience[j]++
				t.UnitHistory[j].PendingPromotion = false
			}
		}
	}
}
