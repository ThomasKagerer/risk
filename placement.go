package main

import (
	"math"
	"regexp"
	"strconv"
)

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Our compiled SVG assets contain absolute M/L/Q/Z commands only. Flatten the
// classic rounded corners once at boot; geography never enters a game save.
func outline(path string) [][]Point {
	tokens := regexp.MustCompile(`[MLQZ]|-?\d+(?:\.\d+)?`).FindAllString(path, -1)
	var rings [][]Point
	var ring []Point
	var current Point
	number := func(s string) float64 {
		n, err := strconv.ParseFloat(s, 64)
		if err != nil {
			panic(err)
		}
		return n
	}
	for i := 0; i < len(tokens); {
		command := tokens[i]
		i++
		switch command {
		case "M", "L":
			current = Point{number(tokens[i]), number(tokens[i+1])}
			i += 2
			ring = append(ring, current)
		case "Q":
			control := Point{number(tokens[i]), number(tokens[i+1])}
			end := Point{number(tokens[i+2]), number(tokens[i+3])}
			i += 4
			for step := 1; step <= 12; step++ {
				t := float64(step) / 12
				u := 1 - t
				ring = append(ring, Point{u*u*current.X + 2*u*t*control.X + t*t*end.X, u*u*current.Y + 2*u*t*control.Y + t*t*end.Y})
			}
			current = end
		case "Z":
			rings = append(rings, ring)
			ring = nil
		default:
			panic("unsupported map outline command: " + command)
		}
	}
	return rings
}

func (c Country) contains(p Point) bool {
	if math.IsNaN(p.X) || math.IsNaN(p.Y) || math.IsInf(p.X, 0) || math.IsInf(p.Y, 0) {
		return false
	}
	inside := false
	for _, ring := range c.Outline {
		for i, a := range ring {
			b := ring[(i+1)%len(ring)]
			if (a.Y > p.Y) != (b.Y > p.Y) && p.X < (b.X-a.X)*(p.Y-a.Y)/(b.Y-a.Y)+a.X {
				inside = !inside
			}
		}
	}
	return inside
}

func pieceCount(troops int) int {
	count := 0
	for troops > 0 && count < 6 {
		value := 1
		if troops >= 10 {
			value = 10
		} else if troops >= 5 {
			value = 5
		}
		troops -= value
		count++
	}
	return count
}
