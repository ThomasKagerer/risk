package main

import (
	"math"
	"slices"
	"sync"
)

type weightedRoll struct {
	values      []int
	probability float64
	ways        int
}

var sortedRollCache sync.Map

// Enumerate six face counts instead of all 6^N permutations. Eight defenders
// have only 1,287 distinct sorted rolls, with exact multinomial probabilities.
func sortedDiceRolls(dice int) []weightedRoll {
	if value, ok := sortedRollCache.Load(dice); ok {
		return value.([]weightedRoll)
	}
	factorial := func(n int) float64 {
		v := 1.0
		for i := 2; i <= n; i++ {
			v *= float64(i)
		}
		return v
	}
	result := []weightedRoll{}
	var walk func(int, int, []int, float64)
	walk = func(face, left int, values []int, divisor float64) {
		if face == 0 {
			if left == 0 {
				result = append(result, weightedRoll{slices.Clone(values), factorial(dice) / divisor / math.Pow(6, float64(dice)), int(math.Round(factorial(dice) / divisor))})
			}
			return
		}
		for count := 0; count <= left; count++ {
			next := slices.Clone(values)
			for i := 0; i < count; i++ {
				next = append(next, face)
			}
			walk(face-1, left-count, next, divisor*factorial(count))
		}
	}
	walk(6, dice, nil, 1)
	actual, _ := sortedRollCache.LoadOrStore(dice, result)
	return actual.([]weightedRoll)
}

type diceCombatModel struct {
	chance [129][129]float64
	loss   [129][129]combatLosses
}
type lazyCombatModel struct {
	once  sync.Once
	model diceCombatModel
}

var buildingCombatModels sync.Map

func buildingCombatModel(limit int) *diceCombatModel {
	value, _ := buildingCombatModels.LoadOrStore(limit, &lazyCombatModel{})
	lazy := value.(*lazyCombatModel)
	lazy.once.Do(func() { lazy.model = buildDiceCombatModel(limit) })
	return &lazy.model
}
func buildDiceCombatModel(limit int) diceCombatModel {
	maximum := limit
	if maximum < 0 {
		maximum = -maximum
	}
	outcomes := make([][][]diceOutcome, 4)
	for a := 1; a <= 3; a++ {
		outcomes[a] = make([][]diceOutcome, maximum+1)
		for d := 1; d <= maximum; d++ {
			counts := map[[2]int]float64{}
			for _, attack := range sortedDiceRolls(a) {
				for _, defense := range sortedDiceRolls(d) {
					loss := [2]int{}
					for i := 0; i < min(a, d); i++ {
						if attack.values[i] > defense.values[i] {
							loss[1]++
						} else {
							loss[0]++
						}
					}
					counts[loss] += attack.probability * defense.probability
				}
			}
			for loss, probability := range counts {
				outcomes[a][d] = append(outcomes[a][d], diceOutcome{loss[0], loss[1], probability})
			}
			slices.SortFunc(outcomes[a][d], func(x, y diceOutcome) int { return x.attacker - y.attacker })
		}
	}
	var model diceCombatModel
	for a := 1; a <= 128; a++ {
		model.chance[a][0] = 1
		for d := 1; d <= 128; d++ {
			for _, o := range outcomes[min(3, a)][diceForDefense(d, limit)] {
				nextA, nextD := a-o.attacker, max(0, d-o.defender)
				model.chance[a][d] += o.probability * model.chance[nextA][nextD]
				previous := model.loss[nextA][nextD]
				model.loss[a][d].attacker += o.probability * (float64(o.attacker) + previous.attacker)
				model.loss[a][d].defender += o.probability * (float64(min(d, o.defender)) + previous.defender)
			}
		}
	}
	return model
}
