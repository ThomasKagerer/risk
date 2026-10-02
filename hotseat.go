package main

import "errors"

// Local seats belong to the authenticated host session. They never share
// credentials with online players and cannot be claimed by joining by name.
func (g *Game) localSeats(controller int) []int {
	seats := []int{controller}
	if controller == 0 {
		for i, p := range g.Players {
			if i > 0 && p.Local && !p.Neutral && p.Bot == "" {
				seats = append(seats, i)
			}
		}
	}
	return seats
}

func (g *Game) sessionPlayer(controller int) int {
	if controller == 0 && g.Phase != "lobby" && g.Phase != "finished" {
		actor := g.actor()
		if actor >= 0 && actor < len(g.Players) {
			p := g.Players[actor]
			if p.Local && !p.Neutral && p.Bot == "" {
				return actor
			}
		}
	}
	return controller
}

func (g *Game) sessionView(controller int) map[string]any {
	v := g.view(g.sessionPlayer(controller))
	v["controller"] = controller
	v["localPlayers"] = g.localSeats(controller)
	v["hotseat"] = len(g.localSeats(controller)) > 1
	return v
}

func (g *Game) sessionAction(controller int, a Action, rng Random) error {
	player := g.sessionPlayer(controller)
	switch a.Type {
	case "start", "addlocal", "addbot", "removebot", "kick", "renamebot", "renamelocal":
		player = controller
	default:
		// Explicit seat binding also protects preference requests, which may
		// otherwise accept an old revision while the next person is playing.
		if (a.ActingAs != nil && *a.ActingAs != player) || (len(g.localSeats(controller)) > 1 && a.ActingAs == nil) {
			return errors.New("Der aktive Spieler hat gewechselt. Bitte erneut versuchen.")
		}
	}
	return g.apply(player, a, rng)
}
