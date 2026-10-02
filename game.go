package main

import (
	cryptorand "crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"slices"
	"strings"
	"sync"
)

type Country struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Continent   int       `json:"continent"`
	Neighbors   []int     `json:"neighbors"`
	Path        string    `json:"path,omitempty"`
	Mountainous bool      `json:"mountainous,omitempty"`
	Outline     [][]Point `json:"-"`
}
type Continent struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Bonus int    `json:"bonus"`
}
type Card struct {
	ID        int    `json:"id"`
	Kind      string `json:"kind"`
	Territory int    `json:"territory"`
}
type Board struct {
	Countries   []Country   `json:"countries"`
	Continents  []Continent `json:"continents"`
	Cards       []Card      `json:"cards"`
	cardDivisor int
}

var board Board
var boards map[string]*Board

var initBoards = sync.OnceFunc(loadBoards)

func loadBoards() {
	data, err := assets.ReadFile("web/assets/board.json")
	if err != nil {
		panic(err)
	}
	if err = json.Unmarshal(data, &board); err != nil {
		panic(err)
	}
	boards = map[string]*Board{"classic": &board}
	for _, id := range []string{"world120", "europe1871", "simple-world"} {
		data, err := assets.ReadFile("web/assets/" + id + ".json")
		if err != nil {
			panic(err)
		}
		var expanded Board
		if err := json.Unmarshal(data, &expanded); err != nil {
			panic(err)
		}
		if id == "simple-world" {
			expanded.cardDivisor = 2
		}
		boards[id] = &expanded
	}
	for _, b := range boards {
		for i := range b.Countries {
			c := &b.Countries[i]
			c.Outline = outline(c.Path)
			c.Path = ""
		}
	}
}

type Player struct {
	AnnoyingTarget int           `json:"annoyingTarget,omitempty"` // One-based private bot focus; zero means unchosen.
	Mission        *Mission      `json:"mission,omitempty"`
	Local          bool          `json:"local,omitempty"`
	Capital        int           `json:"capital,omitempty"`
	Name           string        `json:"name"`
	TokenHash      string        `json:"tokenHash,omitempty"`
	IdentityHash   string        `json:"identityHash,omitempty"`
	Cards          []int         `json:"cards"`
	Reserve        int           `json:"reserve"`
	Neutral        bool          `json:"neutral,omitempty"`
	Bot            string        `json:"bot,omitempty"`
	BotDecision    *BotDecision  `json:"botDecision,omitempty"`
	LastAttack     *AttackMemory `json:"lastAttack,omitempty"`
	OriginCountry  int           `json:"originCountry,omitempty"`
	AutoDefense    bool          `json:"autoDefense,omitempty"`
}

// A short-lived memory of a public attack, retained across saves until the
// defender finishes its next turn. Older saves simply have no such memory.
type AttackMemory struct {
	Player int `json:"player"`
	Round  int `json:"round"`
}

// The configured player type and the provider of its last applied action are
// recorded separately for display.
type BotDecision struct {
	Engine   string `json:"engine"`
	Detail   string `json:"detail"`
	Revision int    `json:"revision"`
}

func (g *Game) defenseLimit(id int) int {
	if g.Rules == "classic" {
		return 2
	}
	if g.Rules == "domination" {
		return 2 + g.Territories[id-1].BuildingLevel + g.experienceBonus(id)
	}
	if g.isCapital(id) {
		return 4
	}
	if g.board().Countries[id-1].Mountainous {
		return 3
	}
	return 2
}

func (g *Game) defenseDice(id int) int {
	return diceForDefense(g.Territories[id-1].Troops, g.defenseOddsLimit(id))
}

func (g *Game) automaticDefenseDice(id int, attack []int) int {
	dice, high := g.defenseDice(id), 0
	for _, value := range attack {
		if value >= 5 {
			high++
		}
	}
	if dice > 1 && high >= dice {
		dice--
	}
	return dice
}

type Territory struct {
	UnitHistory     []UnitHistory `json:"unitHistory,omitempty"`
	BuildingLevel   int           `json:"buildingLevel"`
	Construction    *Construction `json:"construction,omitempty"`
	Owner           int           `json:"owner"`
	Troops          int           `json:"troops"`
	Experience      []int         `json:"experience,omitempty"`
	ExperienceTurns []int         `json:"experienceTurns,omitempty"`
	Positions       []*Point      `json:"positions,omitempty"`
	// Visual strength stays fixed from the first attack until the next player turn.
	FortificationTroops int `json:"fortificationTroops,omitempty"`
	NativeThreatRounds  int `json:"nativeThreatRounds,omitempty"`
	NativeQuietRounds   int `json:"nativeQuietRounds,omitempty"`
}
type Pending struct {
	ID       int   `json:"id,omitempty"`
	Attack   []int `json:"attack,omitempty"`
	From     int   `json:"from"`
	To       int   `json:"to"`
	Dice     int   `json:"dice"`
	Defender int   `json:"defender"`
	Minimum  int   `json:"minimum"`
}
type Battle struct {
	Construction        *Construction `json:"construction,omitempty"`
	BuildingLevel       int           `json:"buildingLevel"`
	ID                  int           `json:"id"`
	AttackID            int           `json:"attackId,omitempty"`
	From                int           `json:"from"`
	To                  int           `json:"to"`
	Attacker            int           `json:"attacker"`
	Defender            int           `json:"defender"`
	AttackerTroops      int           `json:"attackerTroops,omitempty"`
	DefenderTroops      int           `json:"defenderTroops,omitempty"`
	AttackerExperience  []int         `json:"attackerExperience,omitempty"`
	DefenderExperience  []int         `json:"defenderExperience,omitempty"`
	AttackerCasualties  []int         `json:"attackerCasualties,omitempty"`
	DefenderCasualties  []int         `json:"defenderCasualties,omitempty"`
	FortificationTroops int           `json:"fortificationTroops,omitempty"`
	Attack              []int         `json:"attack"`
	Defense             []int         `json:"defense"`
	AttackerLoss        int           `json:"attackerLoss"`
	DefenderLoss        int           `json:"defenderLoss"`
	DefenderGrowth      int           `json:"defenderGrowth,omitempty"`
	Conquered           bool          `json:"conquered"`
}
type Game struct {
	quickModelTest          bool                     // Enables the explicit 120-country input projection in short tests only.
	NextUnitID              int                      `json:"nextUnitId,omitempty"`
	Rules                   string                   `json:"rules,omitempty"`
	ExperienceTurn          int                      `json:"experienceTurn,omitempty"`
	CardTerritoryBonusUsed  bool                     `json:"cardTerritoryBonusUsed,omitempty"`
	Goal                    string                   `json:"goal,omitempty"`
	Map                     string                   `json:"map,omitempty"`
	Setup                   string                   `json:"setup,omitempty"`
	Code                    string                   `json:"code"`
	Mode                    string                   `json:"mode"`
	Phase                   string                   `json:"phase"`
	Paused                  bool                     `json:"paused,omitempty"`
	PausedBy                int                      `json:"pausedBy,omitempty"`
	Players                 []Player                 `json:"players"`
	Territories             []Territory              `json:"territories"`
	Turn                    int                      `json:"turn"`
	First                   int                      `json:"first"`
	Round                   int                      `json:"round"`
	Revision                int                      `json:"revision"`
	Pool                    int                      `json:"pool"`
	Trades                  int                      `json:"trades"`
	TradeOpen               bool                     `json:"tradeOpen"`
	ForcedTrade             bool                     `json:"forcedTrade"`
	Resume                  string                   `json:"resume"`
	Conquered               bool                     `json:"conquered"`
	CardDrawn               bool                     `json:"cardDrawn,omitempty"`
	Moved                   bool                     `json:"moved"`
	SetupPlaced             int                      `json:"setupPlaced"`
	Deck                    []int                    `json:"deck"`
	Discard                 []int                    `json:"discard"`
	Pending                 *Pending                 `json:"pending,omitempty"`
	Battle                  *Battle                  `json:"battle,omitempty"`
	Statistics              *CombatStatistics        `json:"statistics,omitempty"`
	ReinforcementStatistics *ReinforcementStatistics `json:"reinforcementStatistics,omitempty"`
	NativeRaid              *NativeRaid              `json:"nativeRaid,omitempty"`
	NativeDefense           *NativeDefense           `json:"nativeDefense,omitempty"`
	Conflicts               []ConflictRound          `json:"conflicts,omitempty"`
	Winner                  int                      `json:"winner"`
	Log                     []string                 `json:"log"`
	BotStatus               string                   `json:"botStatus,omitempty"`
	Blocked                 []string                 `json:"blocked,omitempty"`
}
type Action struct {
	Level     *int   `json:"level,omitempty"`
	ActingAs  *int   `json:"actingAs,omitempty"`
	Type      string `json:"type"`
	Revision  int    `json:"revision"`
	Territory int    `json:"territory"`
	From      int    `json:"from"`
	To        int    `json:"to"`
	Amount    int    `json:"amount"`
	Dice      int    `json:"dice"`
	Cards     []int  `json:"cards"`
	Bonus     int    `json:"bonus"`
	Bot       string `json:"bot,omitempty"`
	Name      string `json:"name,omitempty"`
	Player    int    `json:"player,omitempty"`
	Piece     int    `json:"piece,omitempty"`
	Position  *Point `json:"position,omitempty"`
	Enabled   *bool  `json:"enabled,omitempty"`
}
type Random func(int) int

func secureRandom(n int) int {
	value, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(n)))
	if err != nil {
		panic(err)
	}
	return int(value.Int64())
}
func (g *Game) mapID() string {
	if g.Map == "" {
		return "classic"
	}
	return g.Map
}
func (g *Game) board() *Board { return boards[g.mapID()] }
func newGame(code, mode, name, hash string, mapChoice ...string) *Game {
	mapID := "classic"
	if len(mapChoice) > 0 && mapChoice[0] != "" {
		mapID = mapChoice[0]
	}
	g := &Game{Statistics: &CombatStatistics{SinceRound: 1}, Map: mapID, Code: code, Mode: mode, Phase: "lobby", Winner: -1, Revision: 1, Players: []Player{{Name: name, TokenHash: hash, Cards: []int{}}}, Territories: make([]Territory, len(boards[mapID].Countries)), Deck: []int{}, Discard: []int{}, Log: []string{}}
	for i := range g.Territories {
		g.Territories[i].Owner = -1
	}
	g.ReinforcementStatistics = &ReinforcementStatistics{SinceRound: 1}
	return g
}
func (g *Game) note(format string, a ...any) {
	g.Log = append(g.Log, fmt.Sprintf(format, a...))
	if len(g.Log) > 40 {
		g.Log = append([]string(nil), g.Log[len(g.Log)-40:]...)
	}
}
func (g *Game) owned(p int) int {
	n := 0
	for _, t := range g.Territories {
		if t.Owner == p {
			n++
		}
	}
	return n
}
func (g *Game) activePlayerCount() int {
	n := 0
	for _, p := range g.Players {
		if !p.Neutral {
			n++
		}
	}
	return n
}
func (g *Game) actor() int {
	if g.Phase == "defend" {
		p := g.Pending.Defender
		if g.Players[p].Neutral {
			return 1 - g.Turn
		}
		return p
	}
	return g.Turn
}
func (g *Game) mustTrade() bool {
	return g.ForcedTrade && len(g.Players[g.Turn].Cards) >= 5 || g.Resume != "attack" && len(g.Players[g.Turn].Cards) >= 5
}
func territory(id int) bool           { return id >= 1 && id <= len(board.Countries) }
func (g *Game) territory(id int) bool { return id >= 1 && id <= len(g.Territories) }
func (g *Game) mine(id, p int) bool   { return g.territory(id) && g.Territories[id-1].Owner == p }
func (g *Game) placeRandomNeutral(rng Random) {
	neutral := len(g.Players) - 1
	if neutral < 0 || !g.Players[neutral].Neutral || g.Players[neutral].Reserve < 1 {
		return
	}
	choices := make([]int, 0, g.owned(neutral))
	for i, territory := range g.Territories {
		if territory.Owner == neutral {
			choices = append(choices, i)
		}
	}
	if len(choices) == 0 {
		return
	}
	chosen := choices[rng(len(choices))]
	g.Territories[chosen].Troops++
	g.Players[neutral].Reserve--
}
func shuffle(list []int, rng Random) {
	for i := len(list) - 1; i > 0; i-- {
		j := rng(i + 1)
		list[i], list[j] = list[j], list[i]
	}
}

// Small boards preserve roughly the classic board's opening density.
// Existing boards retain their established frontier setup.
func (g *Game) frontierStartingCountries() int {
	if g.mapID() == "simple-world" {
		return max(1, (5*len(g.Territories)+21)/42)
	}
	return 5
}
func (g *Game) frontierStartingArmy() int {
	if g.mapID() == "simple-world" {
		return max(g.frontierStartingCountries(), (20*len(g.Territories)+41)/42)
	}
	return 20
}
func (g *Game) start(rng Random) error {
	if err := validGoal(g.Rules, g.Goal); err != nil {
		return err
	}
	if g.Rules == "classic" {
		g.Setup = "classic"
		g.Mode = "progressive"
	} else if g.Rules == "domination" {
		g.Setup = "frontier"
	}
	n := len(g.Players)
	if g.Goal == "mission" && (g.Rules != "classic" || n < 3) {
		return errors.New("Missionen brauchen Klassisch und mindestens drei Spieler.")
	}
	if n < 2 || n > 6 {
		return errors.New("Eine Partie braucht 2 bis 6 Spieler.")
	}
	for _, c := range g.board().Cards {
		g.Deck = append(g.Deck, c.ID)
	}
	shuffle(g.Deck, rng)
	// Roll for the opening player; repeat tied high rolls.
	candidates := make([]int, n)
	for i := range candidates {
		candidates[i] = i
	}
	for len(candidates) > 1 {
		best := 0
		next := []int{}
		for _, i := range candidates {
			r := rng(6) + 1
			if r > best {
				best = r
				next = []int{i}
			} else if r == best {
				next = append(next, i)
			}
		}
		candidates = next
	}
	g.First = candidates[0]
	g.Turn = g.First
	g.Round = 1
	if g.Setup == "frontier" {
		g.Players = append(g.Players, Player{Name: "Einheimische", Neutral: true, Cards: []int{}})
		for i := 0; i < n; i++ {
			g.Players[i].Reserve = g.frontierStartingArmy()
		}
		g.Phase = "claim"
	} else if n == 2 {
		g.Players = append(g.Players, Player{Name: "Neutrale Armee", Neutral: true, Cards: []int{}, Reserve: 0})
		ids := make([]int, len(g.Territories))
		for i := range ids {
			ids[i] = i
		}
		shuffle(ids, rng)
		for i, id := range ids {
			g.Territories[id] = Territory{Owner: i % 3, Troops: 1}
		}
		// Two placements per human turn require an even reserve; the neutral
		// army receives one placement for every two human placements.
		reserve := 2 * ((26*len(g.Territories) + 83) / 84)
		for i := range g.Players {
			g.Players[i].Reserve = reserve
		}
		g.beginSetup()
	} else {
		initial := (map[int]int{3: 35, 4: 30, 5: 25, 6: 20}[n]*len(g.Territories) + 41) / 42
		for i := range g.Players {
			g.Players[i].Reserve = initial
		}
		g.Phase = "claim"
		if g.Goal == "mission" {
			g.dealMissions(rng)
		}
	}
	g.note("%s beginnt. Die Startreihenfolge wurde ausgewürfelt.", g.Players[g.First].Name)
	return nil
}
func (g *Game) reinforcement(p int) int {
	return g.reinforcementIncome(p).Total
}
func (g *Game) beginTurn() {
	if g.Rules == "domination" {
		g.ExperienceTurn++
		g.promoteSurvivingUnits()
	}
	g.advanceConstruction()
	g.CardTerritoryBonusUsed = false
	for i := range g.Territories {
		g.Territories[i].FortificationTroops = 0
	}
	g.Phase = "reinforce"
	income := g.reinforcementIncome(g.Turn)
	g.Pool = income.Total
	g.recordTurnReinforcements(income)
	g.TradeOpen = true
	g.ForcedTrade = false
	g.Resume = ""
	g.Conquered = false
	g.CardDrawn = false
	g.Moved = false
	g.Pending = nil
	g.note("%s erhält %d Verstärkungen.", g.Players[g.Turn].Name, g.Pool)
}
func (g *Game) finishReinforcement() bool {
	if g.Paused || g.Phase != "reinforce" || g.Pool != 0 || g.mustTrade() {
		return false
	}
	g.Phase = "attack"
	g.Resume = ""
	g.ForcedTrade = false
	g.TradeOpen = false
	return true
}
func (g *Game) nextSetup() {
	for k := 1; k <= g.activePlayerCount(); k++ {
		i := (g.Turn + k) % g.activePlayerCount()
		if g.Players[i].Reserve > 0 {
			g.Turn = i
			return
		}
	}
	g.Turn = g.First
	g.beginTurn()
}

// Card ids and symbols come directly from the supplied risk.cards file.
func tradeValue(ids []int, mode string, trades int) int { return board.tradeValue(ids, mode, trades) }
func (b *Board) tradeValue(ids []int, mode string, trades int) int {
	if len(ids) != 3 {
		return 0
	}
	seen := map[int]bool{}
	kinds := []string{}
	for _, id := range ids {
		if id < 0 || id >= len(b.Cards) || seen[id] {
			return 0
		}
		seen[id] = true
		kinds = append(kinds, b.Cards[id].Kind)
	}
	best := 0
	types := []string{"infantry", "cavalry", "artillery"}
	for _, a := range types {
		for _, b := range types {
			for _, c := range types {
				if kinds[0] != "wild" && kinds[0] != a || kinds[1] != "wild" && kinds[1] != b || kinds[2] != "wild" && kinds[2] != c {
					continue
				}
				v := 0
				if a == b && b == c {
					v = map[string]int{"infantry": 4, "cavalry": 6, "artillery": 8}[a]
				} else if a != b && a != c && b != c {
					v = 10
				}
				best = max(best, v)
			}
		}
	}
	if best > 0 && mode == "progressive" {
		if trades < 6 {
			best = []int{4, 6, 8, 10, 12, 15}[trades]
		} else {
			best = 20 + (trades-6)*5
		}
	}
	if b.cardDivisor > 1 {
		best /= b.cardDivisor
	}
	return best
}
func (g *Game) connected(from, to, p int) bool {
	if g.Rules == "classic" {
		return g.mine(from, p) && g.mine(to, p) && slices.Contains(g.board().Countries[from-1].Neighbors, to)
	}
	if !g.mine(from, p) || !g.mine(to, p) {
		return false
	}
	seen := map[int]bool{from: true}
	queue := []int{from}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		if id == to {
			return true
		}
		for _, nb := range g.board().Countries[id-1].Neighbors {
			if !seen[nb] && g.mine(nb, p) {
				seen[nb] = true
				queue = append(queue, nb)
			}
		}
	}
	return false
}
func (g *Game) apply(player int, a Action, rng Random) (err error) {
	defer func() {
		if err == nil {
			g.ensureUnitHistory(false)
		}
	}()
	fail := func(s string) error { return errors.New(s) }
	// Preferences and pause controls can arrive while an earlier roll animates.
	if a.Revision != g.Revision && ((a.Type != "autodefense" && a.Type != "pause") || a.Revision > g.Revision) {
		return fail("Der Spielstand hat sich geändert. Bitte erneut versuchen.")
	}
	if g.Phase == "finished" {
		return fail("Diese Partie ist bereits beendet.")
	}
	if a.Type == "pause" {
		if player < 0 || player >= len(g.Players) || g.Players[player].Neutral || g.Players[player].Bot != "" || a.Enabled == nil || g.Phase == "lobby" {
			return fail("Nur ein Mitspieler kann eine laufende Partie pausieren oder fortsetzen.")
		}
		changed := g.Paused != *a.Enabled
		g.Paused = *a.Enabled
		if changed && g.Paused {
			g.PausedBy = player
			g.note("%s pausiert die Partie.", g.Players[player].Name)
		} else if changed {
			g.note("%s setzt die Partie fort.", g.Players[player].Name)
			g.finishReinforcement()
			if g.Phase == "defend" && g.Pending != nil && g.Players[g.Pending.Defender].AutoDefense && g.Players[g.Pending.Defender].Bot == "" && (g.Rules == "classic" || len(g.Pending.Attack) == g.Pending.Dice) {
				g.resolveBattle(g.automaticDefenseDice(g.Pending.To, g.Pending.Attack), rng)
			}
		}
		g.Revision++
		return nil
	}
	if a.Type == "autodefense" {
		if player < 0 || player >= len(g.Players) || g.Players[player].Neutral || g.Players[player].Bot != "" || a.Enabled == nil {
			return fail("Nur ein menschlicher Spieler kann seine automatische Verteidigung ändern.")
		}
		g.Players[player].AutoDefense = *a.Enabled
		if !g.Paused && *a.Enabled && g.Phase == "defend" && g.Pending != nil && g.Pending.Defender == player && (g.Rules == "classic" || len(g.Pending.Attack) == g.Pending.Dice) {
			g.resolveBattle(g.automaticDefenseDice(g.Pending.To, g.Pending.Attack), rng)
		}
		g.Revision++
		return nil
	}
	if g.Paused {
		return fail("Die Partie ist pausiert. Setze sie zuerst fort.")
	}
	if a.Type == "renamebot" || a.Type == "renamelocal" {
		if player != 0 || a.Player <= 0 || a.Player >= len(g.Players) || g.Players[a.Player].Neutral || (a.Type == "renamebot" && g.Players[a.Player].Bot == "") || (a.Type == "renamelocal" && !g.Players[a.Player].Local) {
			return fail("Nur der Gastgeber kann Bots und Menschen an diesem Gerät benennen.")
		}
		name, err := g.availableName(a.Name, a.Player)
		if err != nil {
			return err
		}
		g.note("%s heißt jetzt %s.", g.Players[a.Player].Name, name)
		g.Players[a.Player].Name = name
		g.Revision++
		return nil
	}
	if a.Type == "kick" {
		if player != 0 || a.Player <= 0 || a.Player >= len(g.Players) || g.Players[a.Player].Neutral || g.Players[a.Player].Bot != "" {
			return fail("Nur der Gastgeber kann andere Mitspieler entfernen.")
		}
		if len(g.Blocked) >= 128 {
			return fail("Die Sperrliste dieser Partie ist voll.")
		}
		p := &g.Players[a.Player]
		if p.IdentityHash != "" {
			g.Blocked = append(g.Blocked, p.IdentityHash)
		}
		if p.TokenHash != "" {
			g.Blocked = append(g.Blocked, p.TokenHash)
		}
		name := p.Name
		if g.Phase == "lobby" {
			g.Players = slices.Delete(g.Players, a.Player, a.Player+1)
		} else {
			// Preserve indexes and all pending combat/setup state. The existing
			// bot worker can finish any turn, including a pending defense.
			p.TokenHash, p.IdentityHash, p.Bot = "", "", "local"
			p.Local = false
			p.Name = string([]rune(name)[:min(20, len([]rune(name)))]) + " · KI"
		}
		g.note("%s wurde vom Gastgeber entfernt.", name)
		g.Revision++
		return nil
	}
	if a.Type == "arrange" {
		if g.Phase == "lobby" || player < 0 || player >= len(g.Players) || g.Players[player].Neutral || !g.mine(a.Territory, player) {
			return fail("Du kannst nur deine eigenen Figuren aufstellen.")
		}
		t := &g.Territories[a.Territory-1]
		if a.Piece < 0 || a.Piece >= pieceCount(t.Troops) || a.Position == nil || !g.board().Countries[a.Territory-1].contains(*a.Position) {
			return fail("Die Figur muss innerhalb ihres eigenen Landes bleiben.")
		}
		if g.Pending != nil && (g.Pending.From == a.Territory || g.Pending.To == a.Territory) {
			return fail("Warte, bis der Kampf in diesem Gebiet beendet ist.")
		}
		// Keep the stored layout bounded to the six visible miniatures.
		positions := make([]*Point, 6)
		copy(positions, t.Positions)
		p := *a.Position
		positions[a.Piece] = &p
		t.Positions = positions
		g.Revision++
		return nil
	}
	if a.Type == "addlocal" {
		if player != 0 || g.Phase != "lobby" || len(g.Players) >= 6 {
			return fail("Nur der Gastgeber kann im Wartezimmer Menschen an diesem Gerät hinzufügen; maximal sechs Spieler.")
		}
		name, err := g.availableName(a.Name, -1)
		if err != nil {
			return err
		}
		g.Players = append(g.Players, Player{Name: name, Local: true, Cards: []int{}})
		g.Revision++
		return nil
	}
	if a.Type == "addbot" || a.Type == "removebot" {
		if player != 0 || g.Phase != "lobby" {
			return fail("Nur der Gastgeber kann im Wartezimmer Computergegner ändern.")
		}
		if a.Type == "addbot" {
			if len(g.Players) >= 6 || (a.Bot != "local" && a.Bot != "berserker" && a.Bot != "annoying") {
				return fail("Wähle einen verfügbaren Computergegner; maximal sechs Spieler.")
			}
			label := "Strategie-Bot"
			if a.Bot == "berserker" {
				label = "Ragnar"
			} else if a.Bot == "annoying" {
				label = "Klaus Störtebeker"
			}
			name := strings.TrimSpace(a.Name)
			if name == "" {
				name = label
				for n := 2; slices.ContainsFunc(g.Players, func(p Player) bool { return strings.EqualFold(p.Name, name) }); n++ {
					name = fmt.Sprintf("%s %d", label, n)
				}
			} else {
				var err error
				name, err = g.availableName(name, -1)
				if err != nil {
					return err
				}
			}
			g.Players = append(g.Players, Player{Name: name, Bot: a.Bot, Cards: []int{}})
		} else {
			if a.Player <= 0 || a.Player >= len(g.Players) || g.Players[a.Player].Bot == "" {
				return fail("Dieser Computergegner kann nicht entfernt werden.")
			}
			g.Players = slices.Delete(g.Players, a.Player, a.Player+1)
		}
		g.Revision++
		return nil
	}
	if a.Type == "start" {
		if player != 0 || g.Phase != "lobby" {
			return fail("Nur der Gastgeber kann die Partie starten.")
		}
		if err := g.start(rng); err != nil {
			return err
		}
		g.Revision++
		return nil
	}
	if g.Phase == "lobby" || player != g.actor() {
		return fail("Du bist gerade nicht am Zug.")
	}
	p := g.Turn
	switch a.Type {
	case "build":
		if err := g.startConstruction(a.Territory, p, a.Level, a.Cards); err != nil {
			return err
		}
	case "capital":
		if g.Phase != "capital" || !g.mine(a.Territory, p) || g.Players[p].Capital != 0 {
			return fail("Wähle eines deiner eigenen Länder als Hauptstadt.")
		}
		g.Players[p].Capital = a.Territory
		if g.Rules == "domination" {
			g.Territories[a.Territory-1].BuildingLevel = 1
		}
		g.note("%s wählt %s als Hauptstadt.", g.Players[p].Name, g.board().Countries[a.Territory-1].Name)
		g.Turn = (p + 1) % g.activePlayerCount()
		if g.Turn == g.First {
			g.Phase = "setup"
		}
	case "claim":
		if g.Phase != "claim" || !g.territory(a.Territory) || g.Territories[a.Territory-1].Owner != -1 {
			return fail("Wähle ein freies Gebiet.")
		}
		g.Territories[a.Territory-1] = Territory{Owner: p, Troops: 1}
		g.Players[p].Reserve--
		if g.Setup == "frontier" {
			g.Turn = (p + 1) % g.activePlayerCount()
			chosen := 0
			for _, t := range g.Territories {
				if t.Owner >= 0 {
					chosen++
				}
			}
			if chosen == g.frontierStartingCountries()*g.activePlayerCount() {
				natives := len(g.Players) - 1
				for i, t := range g.Territories {
					if t.Owner < 0 {
						g.Territories[i] = Territory{Owner: natives, Troops: 1 + rng(3)}
					}
				}
				g.note("Jeder Spieler hat %d Länder gewählt. Die übrigen Länder werden von 1–3 Einheimischen verteidigt.", g.frontierStartingCountries())
				g.Turn = g.First
				g.beginSetup()
			}
			break
		}
		g.Turn = (p + 1) % len(g.Players)
		free := false
		for _, t := range g.Territories {
			if t.Owner < 0 {
				free = true
			}
		}
		if !free {
			g.beginSetup()
			g.Turn = g.First
		}
	case "place":
		if g.Phase == "setup" {
			if g.activePlayerCount() == 2 && g.Setup != "frontier" {
				// Complete setup games saved by the previous version while they
				// were waiting for a manual neutral placement.
				if g.SetupPlaced == 2 {
					g.placeRandomNeutral(rng)
					g.SetupPlaced = 0
					g.nextSetup()
					break
				}
				if !g.mine(a.Territory, p) || a.Amount != 1 || g.Players[p].Reserve < 1 {
					return fail("Platziere eine Einheit auf einem passenden Gebiet.")
				}
				g.Territories[a.Territory-1].Troops++
				g.Players[p].Reserve--
				g.SetupPlaced++
				if g.SetupPlaced == 2 {
					g.placeRandomNeutral(rng)
					g.SetupPlaced = 0
					g.nextSetup()
				}
			} else {
				validAmount := a.Amount == 1 || g.Setup == "frontier" && (a.Amount == 5 || a.Amount == 10)
				if !g.mine(a.Territory, p) || !validAmount || g.Players[p].Reserve < a.Amount {
					return fail("Wähle ein eigenes Gebiet und eine Figur, für die genügend Starteinheiten übrig sind.")
				}
				g.Territories[a.Territory-1].Troops += a.Amount
				g.Players[p].Reserve -= a.Amount
				g.nextSetup()
			}
		} else if g.Phase == "reinforce" {
			if g.mustTrade() {
				return fail("Tausche zuerst Karten ein, bis du höchstens vier hältst.")
			}
			if !g.mine(a.Territory, p) || a.Amount < 1 || a.Amount > g.Pool {
				return fail("Diese Verstärkung ist nicht möglich.")
			}
			g.Territories[a.Territory-1].Troops += a.Amount
			g.Pool -= a.Amount
			g.TradeOpen = false
			g.finishReinforcement()
		} else {
			return fail("Gerade können keine Truppen platziert werden.")
		}
	case "trade":
		if g.Phase != "reinforce" || !g.TradeOpen {
			return fail("Karten werden vor dem Platzieren eingetauscht.")
		}
		if g.ForcedTrade && !g.mustTrade() {
			return fail("Nach dem Pflichttauch darfst du keine weiteren Sätze tauschen.")
		}
		v := g.board().tradeValue(a.Cards, g.Mode, g.Trades)
		if v == 0 {
			return fail("Wähle drei gleiche Symbole oder je eines – Joker ersetzen ein Symbol.")
		}
		for _, id := range a.Cards {
			if !slices.Contains(g.Players[p].Cards, id) {
				return fail("Diese Karten gehören dir nicht.")
			}
		}
		eligible := []int{}
		for _, id := range a.Cards {
			t := g.board().Cards[id].Territory
			if g.mine(t, p) && !(g.Rules == "classic" && g.CardTerritoryBonusUsed) {
				eligible = append(eligible, t)
			}
		}
		if len(eligible) > 0 && !slices.Contains(eligible, a.Bonus) {
			return fail("Wähle eines deiner Kartengebiete für den Bonus von zwei Einheiten.")
		}
		for _, id := range a.Cards {
			g.Players[p].Cards = slices.DeleteFunc(g.Players[p].Cards, func(c int) bool { return c == id })
			g.Discard = append(g.Discard, id)
		}
		if len(eligible) > 0 {
			g.Territories[a.Bonus-1].Troops += 2
			g.CardTerritoryBonusUsed = true
		}
		g.Pool += v
		bonus := 0
		if len(eligible) > 0 {
			bonus = a.Bonus
		}
		g.recordTradeReinforcements(p, v, bonus)
		g.Trades++
		g.note("%s tauscht einen Kartensatz gegen %d Einheiten.", g.Players[p].Name, v)
	case "endattack":
		if g.Phase != "attack" || g.NativeDefense == nil || g.NativeDefense.Attacker != p || g.NativeDefense.From != a.From || g.NativeDefense.To != a.To {
			return fail("Dieser Angriff kann gerade nicht beendet werden.")
		}
		g.finishNativeDefense(rng)
	case "back":
		if g.Players[p].Bot != "" {
			return fail("Computergegner können nicht zur Angriffsphase zurückkehren.")
		}
		if g.Phase != "fortify" || g.Moved {
			return fail("Zurück zum Angriff geht nur, solange du noch keine Truppen verschoben hast.")
		}
		// Older saves in this phase have already awarded the conquest card.
		g.CardDrawn = g.CardDrawn || g.Conquered
		g.Phase = "attack"
	case "next":
		switch g.Phase {
		case "reinforce":
			if g.mustTrade() || g.Pool > 0 {
				return fail("Tausche nötige Karten und platziere alle Verstärkungen.")
			}
			g.finishReinforcement()
		case "attack":
			g.finishNativeDefense(rng)
			if g.Conquered && !g.CardDrawn {
				if len(g.Deck) == 0 {
					g.Deck = append([]int{}, g.Discard...)
					g.Discard = []int{}
					shuffle(g.Deck, rng)
				}
				if len(g.Deck) > 0 {
					g.Players[p].Cards = append(g.Players[p].Cards, g.Deck[len(g.Deck)-1])
					g.Deck = g.Deck[:len(g.Deck)-1]
					g.CardDrawn = true
					g.note("%s zieht eine Gebietskarte.", g.Players[p].Name)
				}
			}
			g.Phase = "fortify"
		case "fortify":
			g.Players[p].LastAttack = nil
			newRound := false
			for {
				g.Turn = (g.Turn + 1) % len(g.Players)
				if g.Turn == g.First {
					g.Round++
					newRound = true
					g.growNatives(rng)
				}
				if !g.Players[g.Turn].Neutral && g.owned(g.Turn) > 0 {
					break
				}
			}
			if !newRound || !g.startNativeRaid(rng) {
				g.beginTurn()
			}
			g.pruneConflicts()
		default:
			return fail("Diese Phase kann noch nicht beendet werden.")
		}
	case "attack":
		if g.Phase != "attack" || !g.mine(a.From, p) || !g.territory(a.To) || g.mine(a.To, p) || !slices.Contains(g.board().Countries[a.From-1].Neighbors, a.To) {
			return fail("Wähle ein eigenes Gebiet und einen benachbarten Gegner.")
		}
		if a.Dice < 1 || a.Dice > g.attackDice(a.From) {
			return fail("Für diese Anzahl Würfel fehlen Truppen.")
		}
		if previous := g.NativeDefense; previous != nil && (previous.Attacker != p || previous.From != a.From || previous.To != a.To) {
			g.finishNativeDefense(rng)
		}
		if g.Setup == "frontier" && g.Players[g.Territories[a.To-1].Owner].Neutral {
			g.NativeDefense = &NativeDefense{Attacker: p, Defender: g.Territories[a.To-1].Owner, From: a.From, To: a.To}
		}
		g.rememberFortification(a.To)
		g.Pending = &Pending{ID: g.Revision + 1, From: a.From, To: a.To, Dice: a.Dice, Defender: g.Territories[a.To-1].Owner}
		if g.Rules != "classic" {
			g.Pending.Attack = g.playerDice(p, a.Dice, rng)
		}
		if !g.Players[g.Pending.Defender].Neutral {
			g.Players[g.Pending.Defender].LastAttack = &AttackMemory{Player: p, Round: g.Round}
		}
		g.Phase = "defend"
		if g.Players[g.Pending.Defender].Neutral {
			g.resolveBattle(g.automaticDefenseDice(a.To, g.Pending.Attack), rng)
		} else if g.Players[g.Pending.Defender].AutoDefense && g.Players[g.Pending.Defender].Bot == "" {
			g.resolveBattle(g.automaticDefenseDice(a.To, g.Pending.Attack), rng)
		}
	case "defend":
		if g.Phase != "defend" || g.Pending == nil || a.Dice < 1 || a.Dice > g.defenseDice(g.Pending.To) {
			return fail("Wähle eine erlaubte Anzahl Verteidigungswürfel für dieses Gebiet.")
		}
		if g.Rules != "classic" && len(g.Pending.Attack) != g.Pending.Dice {
			return fail("Der Angriffswurf fehlt. Bitte verbinde dich erneut.")
		}
		g.resolveBattle(a.Dice, rng)
	case "occupy":
		if g.Phase != "occupy" || a.Amount < g.minimumOccupation() || a.Amount >= g.Territories[g.Pending.From-1].Troops {
			return fail("Ziehe mindestens die Zahl deiner letzten Angriffswürfel nach und lasse eine Einheit zurück.")
		}
		g.moveTroops(g.Pending.From, g.Pending.To, a.Amount)
		g.Pending = nil
		alive := 0
		for i, pl := range g.Players {
			if !pl.Neutral && g.owned(i) > 0 {
				alive++
			}
		}
		if alive == 1 && g.Goal != "mission" {
			g.Winner = p
			g.Phase = "finished"
			g.note("%s gewinnt die Partie!", g.Players[p].Name)
		} else if g.ForcedTrade {
			g.Phase = "reinforce"
			g.Resume = "attack"
			g.Pool = 0
			g.TradeOpen = true
		} else {
			g.Phase = "attack"
		}
	case "fortify":
		if g.Phase != "fortify" || g.Moved || a.From == a.To || !g.connected(a.From, a.To, p) || a.Amount < 1 || a.Amount >= g.Territories[a.From-1].Troops {
			return fail("Du darfst einmal durch eigene verbundene Gebiete ziehen und musst eine Einheit zurücklassen.")
		}
		g.moveTroops(a.From, a.To, a.Amount)
		g.Moved = true
		g.note("%s bewegt %d Einheiten nach %s.", g.Players[p].Name, a.Amount, g.board().Countries[a.To-1].Name)
	default:
		return fail("Unbekannte Spielaktion.")
	}
	g.checkMissionVictory()
	g.ensureStatistics()
	g.Revision++
	return nil
}
func rollDice(count int, rng Random) []int {
	dice := make([]int, count)
	for i := range dice {
		dice[i] = rng(6) + 1
	}
	slices.SortFunc(dice, func(a, b int) int { return b - a })
	return dice
}

func (g *Game) playerDice(seat, count int, rng Random) []int {
	return rollDice(count, rng)
}

// Older saves announced an attack without rolling it. Roll once and persist
// before exposing that pending defense to any player or bot.
func (g *Game) preparePendingAttack(rng Random) bool {
	q := g.Pending
	if g.Rules == "classic" {
		return false
	}
	if g.Phase != "defend" || q == nil || len(q.Attack) != 0 || q.Dice < 1 || !g.territory(q.From) || q.Dice > g.attackDice(q.From) {
		return false
	}
	q.Attack = g.playerDice(g.Territories[q.From-1].Owner, q.Dice, rng)
	g.Revision++
	q.ID = g.Revision
	return true
}

func (g *Game) rememberFortification(id int) int {
	t := &g.Territories[id-1]
	if t.FortificationTroops == 0 {
		t.FortificationTroops = t.Troops
	}
	return t.FortificationTroops
}

// Extra fortress dice can kill an attacker in the same roll that conquers
// the last defender. Occupation cannot require troops that no longer exist.
// Applying the cap here also makes older saved occupation states playable.
func (g *Game) minimumOccupation() int {
	if g.Pending == nil {
		return 1
	}
	return max(1, min(g.Pending.Minimum, g.Territories[g.Pending.From-1].Troops-1))
}

func (g *Game) resolveBattle(defense int, rng Random) {
	q := g.Pending
	if g.Rules == "classic" {
		q.Attack = g.playerDice(g.Territories[q.From-1].Owner, q.Dice, rng)
	}
	p := g.Turn
	b := &Battle{ID: g.Revision + 1, AttackID: q.ID, From: q.From, To: q.To, Attacker: p, Defender: q.Defender,
		AttackerTroops: g.Territories[q.From-1].Troops, DefenderTroops: g.Territories[q.To-1].Troops,
		BuildingLevel:       g.Territories[q.To-1].BuildingLevel,
		FortificationTroops: g.rememberFortification(q.To),
		Attack:              slices.Clone(q.Attack), Defense: g.playerDice(q.Defender, defense, rng)}
	if construction := g.Territories[q.To-1].Construction; construction != nil {
		snapshot := *construction
		b.Construction = &snapshot
	}
	for i := 0; i < min(len(b.Attack), len(b.Defense)); i++ {
		if b.Attack[i] > b.Defense[i] {
			b.DefenderLoss++
		} else {
			b.AttackerLoss++
		}
	}
	b.DefenderLoss = min(b.DefenderLoss, g.Territories[q.To-1].Troops)
	if g.Rules == "domination" {
		g.ensureUnitHistory(true)
		g.ExperienceTurn = max(1, g.ExperienceTurn)
		b.AttackerExperience, b.AttackerCasualties = resolveUnitExperience(&g.Territories[q.From-1], b.AttackerLoss, 1, g.ExperienceTurn, rng)
		b.DefenderExperience, b.DefenderCasualties = resolveUnitExperience(&g.Territories[q.To-1], b.DefenderLoss, 0, g.ExperienceTurn, rng)
	}
	g.Territories[q.From-1].Troops -= b.AttackerLoss
	g.Territories[q.To-1].Troops -= b.DefenderLoss
	g.Battle = b
	g.recordCombat(b)
	g.note("%s → %s: Angriff −%d, Verteidigung −%d.", g.board().Countries[q.From-1].Name, g.board().Countries[q.To-1].Name, b.AttackerLoss, b.DefenderLoss)
	if g.NativeRaid != nil {
		g.finishNativeRaid(b)
		return
	}
	if g.Territories[q.To-1].Troops == 0 {
		g.NativeDefense = nil
		b.Conquered = true
		g.Conquered = true
		g.Territories[q.To-1].Owner = p
		g.Territories[q.To-1].Construction = nil
		g.Territories[q.To-1].Positions = nil
		q.Minimum = min(q.Dice, g.Territories[q.From-1].Troops-1)
		g.Phase = "occupy"
		g.captureCapital(q.To, q.Defender, p)
		if g.owned(q.Defender) == 0 {
			g.Players[p].Cards = append(g.Players[p].Cards, g.Players[q.Defender].Cards...)
			g.Players[q.Defender].Cards = []int{}
			g.ForcedTrade = len(g.Players[p].Cards) >= 6
			g.note("%s ist ausgeschieden.", g.Players[q.Defender].Name)
		}
	} else {
		g.Pending = nil
		g.Phase = "attack"
		if g.Territories[q.From-1].Troops < 2 {
			b.DefenderGrowth = g.finishNativeDefense(rng)
		}
	}
	g.recordConflict(b)
}

type PublicPlayer struct {
	Reinforcements *PlayerReinforcementStats `json:"reinforcements,omitempty"`
	Combat         *PlayerCombatSummary      `json:"combat,omitempty"`
	Local          bool                      `json:"local,omitempty"`
	Capital        int                       `json:"capital,omitempty"`
	Name           string                    `json:"name"`
	Cards          int                       `json:"cards"`
	Reserve        int                       `json:"reserve"`
	Neutral        bool                      `json:"neutral"`
	Territories    int                       `json:"territories"`
	Troops         int                       `json:"troops"`
	Bot            string                    `json:"bot,omitempty"`
	BotDecision    *BotDecision              `json:"botDecision,omitempty"`
	OriginCountry  int                       `json:"originCountry,omitempty"`
}

func (g *Game) view(me int) map[string]any {
	players := []PublicPlayer{}
	for i, p := range g.Players {
		troops := 0
		for _, t := range g.Territories {
			if t.Owner == i {
				troops += t.Troops
			}
		}
		players = append(players, PublicPlayer{Local: p.Local, Capital: p.Capital, Name: p.Name, Cards: len(p.Cards), Reserve: p.Reserve, Neutral: p.Neutral, Territories: g.owned(i), Troops: troops, Bot: p.Bot, BotDecision: p.BotDecision, OriginCountry: p.OriginCountry})
		players[len(players)-1].Reinforcements = g.playerReinforcementStats(i)
		players[len(players)-1].Combat = g.playerCombatSummary(i)
	}
	pending := g.Pending
	if g.Phase == "occupy" && pending != nil {
		copy := *pending
		copy.Minimum = g.minimumOccupation()
		pending = &copy
	}
	view := map[string]any{"rules": g.Rules, "cardTerritoryBonusUsed": g.CardTerritoryBonusUsed, "goal": g.Goal, "paused": g.Paused, "pausedBy": g.PausedBy, "autoDefense": g.Players[me].AutoDefense, "setup": g.Setup, "map": g.mapID(), "code": g.Code, "mode": g.Mode, "phase": g.Phase, "players": players, "territories": g.Territories, "turn": g.Turn, "actor": g.actor(), "round": g.Round, "revision": g.Revision, "pool": g.Pool, "trades": g.Trades, "tradeOpen": g.TradeOpen, "mustTrade": g.Phase == "reinforce" && g.mustTrade(), "forcedTrade": g.ForcedTrade, "resume": g.Resume, "conquered": g.Conquered, "moved": g.Moved, "setupPlaced": g.SetupPlaced, "pending": pending, "battle": g.Battle, "winner": g.Winner, "log": g.Log, "me": me, "hand": g.Players[me].Cards, "deckCount": len(g.Deck), "botStatus": g.BotStatus}
	if mission := g.missionView(me); mission != nil {
		view["mission"] = mission
	}
	if g.Phase == "finished" {
		if mission := g.missionView(g.Winner); mission != nil {
			view["winningMission"] = mission
		}
		view["statistics"] = g.Statistics
		view["reinforcementStatistics"] = g.ReinforcementStatistics
	}
	view["nativeDefense"] = g.NativeDefense
	return view
}
