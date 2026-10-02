package main

// An uprising is one ordinary, visible dice battle between turns. A human
// defender keeps their normal dice choice. Persist the interrupted next turn.
type NativeRaid struct {
	ResumeTurn int `json:"resumeTurn"`
}

// Several dice rolls on the same border form one attack. Keep it across
// reloads and pauses; award growth only when that attack actually ends.
type NativeDefense struct {
	Attacker int `json:"attacker"`
	Defender int `json:"defender"`
	From     int `json:"from"`
	To       int `json:"to"`
}

func (g *Game) finishNativeDefense(rng Random) int {
	attack := g.NativeDefense
	g.NativeDefense = nil
	if attack == nil || g.Setup != "frontier" || !g.territory(attack.To) {
		return 0
	}
	t := &g.Territories[attack.To-1]
	if t.Troops < 1 || t.Owner != attack.Defender || !g.Players[t.Owner].Neutral {
		return 0
	}
	growth := randomRange(g.nativeRules().SurvivalMin, g.nativeRules().SurvivalMax, rng)
	t.Troops += growth
	g.ensureUnitHistory(false)
	g.recordNativeReinforcements(t.Owner, growth)
	g.note("Die Einheimischen in %s haben den Angriff überlebt. Sofortiger Wachstumsbonus: +%d.", g.board().Countries[attack.To-1].Name, growth)
	return growth
}

func (g *Game) nativeThreat(id int) bool {
	t := g.Territories[id-1]
	for _, nb := range g.board().Countries[id-1].Neighbors {
		other := g.Territories[nb-1]
		// Native countries are independent: sharing the neutral owner is irrelevant.
		if other.Owner >= 0 && other.Troops-t.Troops >= g.nativeRules().ThreatGap {
			return true
		}
	}
	return false
}
func (g *Game) growNatives(rng Random) {
	if g.Setup != "frontier" {
		return
	}
	threatened := make([]bool, len(g.Territories))
	for i := range g.Territories {
		threatened[i] = g.nativeThreat(i + 1)
	}
	reinforced, added := 0, 0
	for i := range g.Territories {
		t := &g.Territories[i]
		if t.Owner < 0 || !g.Players[t.Owner].Neutral {
			t.NativeThreatRounds = 0
			t.NativeQuietRounds = 0
			continue
		}
		// Snapshot the whole map before applying any growth, avoiding same-round
		// cascades and country-order bias. Counters survive saves and restarts.
		growth := 0
		if threatened[i] {
			t.NativeQuietRounds = 0
			t.NativeThreatRounds++
			if t.NativeThreatRounds >= g.nativeRules().ThreatRounds {
				growth = randomRange(g.nativeRules().ThreatMin, g.nativeRules().ThreatMax, rng)
				t.NativeThreatRounds = 0
			}
		} else {
			t.NativeThreatRounds = 0
			t.NativeQuietRounds++
			if t.NativeQuietRounds >= g.nativeRules().QuietRounds {
				growth = randomRange(g.nativeRules().QuietMin, g.nativeRules().QuietMax, rng)
				t.NativeQuietRounds = 0
			}
		}
		// Roll independently per due country. A zero still completes a quiet
		// growth cycle; a threatened growth burst uses the full 1–3 range.
		t.Troops += growth
		if growth > 0 {
			g.recordNativeReinforcements(t.Owner, growth)
			reinforced++
			added += growth
		}
	}
	g.ensureUnitHistory(false)
	if reinforced > 0 {
		g.note("Die Einheimischen erhalten %d Einheiten in %d Ländern.", added, reinforced)
	}
}
func (g *Game) startNativeRaid(rng Random) bool {
	if g.Setup != "frontier" {
		return false
	}
	type border struct{ from, to int }
	candidates := []border{}
	for i, t := range g.Territories {
		if t.Owner < 0 || !g.Players[t.Owner].Neutral || t.Troops < g.nativeRules().RaidMinTroops {
			continue
		}
		for _, nb := range g.board().Countries[i].Neighbors {
			target := g.Territories[nb-1]
			if target.Owner >= 0 && !g.Players[target.Owner].Neutral && target.Troops > 0 && target.Troops <= g.nativeRules().RaidTargetMax && target.Troops*g.nativeRules().RaidRatio <= t.Troops {
				candidates = append(candidates, border{i + 1, nb})
			}
		}
	}
	// At most one native sortie per full round, with a one-in-three chance.
	if len(candidates) == 0 || rng(g.nativeRules().RaidChance) != 0 {
		return false
	}
	chosen := candidates[rng(len(candidates))]
	g.NativeRaid = &NativeRaid{ResumeTurn: g.Turn}
	if g.hasExperience() {
		g.ExperienceTurn++
	}
	g.Turn = g.Territories[chosen.from-1].Owner
	g.Phase = "defend"
	dice := g.attackDice(chosen.from)
	g.Pending = &Pending{ID: g.Revision + 1, From: chosen.from, To: chosen.to, Dice: dice, Defender: g.Territories[chosen.to-1].Owner, Attack: rollDice(dice, rng)}
	g.rememberFortification(chosen.to)
	g.note("Einheimische aus %s greifen %s an.", g.board().Countries[chosen.from-1].Name, g.board().Countries[chosen.to-1].Name)
	defender := g.Players[g.Pending.Defender]
	if defender.AutoDefense && defender.Bot == "" {
		g.resolveBattle(g.automaticDefenseDice(chosen.to, g.Pending.Attack), rng)
	}
	return true
}
func (g *Game) finishNativeRaid(b *Battle) {
	resume := g.NativeRaid.ResumeTurn
	if g.Territories[b.To-1].Troops == 0 {
		b.Conquered = true
		name := g.board().Countries[b.From-1].Name
		newcomer := len(g.Players)
		g.Players = append(g.Players, Player{Name: name, Bot: "local", OriginCountry: b.From, Cards: []int{}})
		source, target := &g.Territories[b.From-1], &g.Territories[b.To-1]
		if g.Goal == "capital" {
			g.Players[newcomer].Capital = b.From
			if g.hasBuildings() {
				g.Territories[b.From-1].BuildingLevel = max(1, g.Territories[b.From-1].BuildingLevel)
			}
		}
		source.Owner = newcomer
		source.Construction = nil
		target.Construction = nil
		target.Owner = newcomer
		source.NativeThreatRounds = 0
		source.NativeQuietRounds = 0
		moved := min(source.Troops-1, max(len(b.Attack), (source.Troops-1)/2))
		g.moveTroops(b.From, b.To, moved)
		target.Positions = nil
		g.captureCapital(b.To, b.Defender, newcomer)
		if g.owned(b.Defender) == 0 {
			g.Players[newcomer].Cards = append(g.Players[newcomer].Cards, g.Players[b.Defender].Cards...)
			g.Players[b.Defender].Cards = []int{}
			g.note("%s ist ausgeschieden.", g.Players[b.Defender].Name)
		}
		g.note("%s erobert %s und wird ein eigenständiger Computergegner.", name, g.board().Countries[b.To-1].Name)
	}
	g.NativeRaid = nil
	g.Pending = nil
	g.Turn = resume
	for g.Players[g.Turn].Neutral || g.owned(g.Turn) == 0 {
		g.Turn = (g.Turn + 1) % len(g.Players)
	}
	if g.Goal == "capital" {
		alive, winner := 0, -1
		for i, p := range g.Players {
			if !p.Neutral && g.owned(i) > 0 {
				alive++
				winner = i
			}
		}
		if alive == 1 {
			g.Winner = winner
			g.Phase = "finished"
			g.note("%s gewinnt die Partie!", g.Players[winner].Name)
			return
		}
	}
	g.beginTurn()
}
