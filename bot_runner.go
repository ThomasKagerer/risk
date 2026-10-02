package main

import (
	"context"
	"log"
	"time"
)

type botEngine struct {
	ctx                context.Context
	delay, battleDelay time.Duration
}

func (s *server) enableBots(ctx context.Context, key string) {
	s.bots = &botEngine{ctx: ctx, delay: 500 * time.Millisecond, battleDelay: 3 * time.Second}
}

// Called with the room lock held. No polling while a human is acting; no paid
// requests when everybody has left. SSE reconnect resumes a saved bot turn.
func (s *server) kickBotsLocked(r *room) {
	if s.bots == nil || r.closed || r.botRunning || len(r.clients) == 0 || r.game.Paused || r.game.Phase == "lobby" || r.game.Phase == "finished" || r.game.Players[r.game.actor()].Bot == "" {
		return
	}
	r.botRunning = true
	go s.runBots(r)
}
func waitBot(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(max(d, 0))
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
func (s *server) runBots(r *room) {
	b := s.bots
	failed := false
	defer func() {
		r.mu.Lock()
		r.botRunning = false
		// A human action or reconnect can arrive between the exit check and
		// cleanup. Recheck under the lock so that bot turns cannot get stranded.
		if !failed && b.ctx.Err() == nil {
			s.kickBotsLocked(r)
		}
		r.mu.Unlock()
	}()
	for {
		r.mu.Lock()
		if r.closed || len(r.clients) == 0 || r.game.Paused || r.game.Phase == "lobby" || r.game.Phase == "finished" || r.game.Players[r.game.actor()].Bot == "" {
			r.mu.Unlock()
			return
		}
		g := clone(r.game)
		delay := max(b.delay, time.Until(r.lastBattleAt.Add(b.presentationDelay(r))))
		r.mu.Unlock()
		if !waitBot(b.ctx, delay) {
			return
		}
		var options []botOption
		if g.Players[g.actor()].Bot == "berserker" {
			options = berserkerOptions(g)
		} else if g.Players[g.actor()].Bot == "annoying" {
			options = annoyingOptions(g, annoyingTarget(g, g.actor(), secureRandom))
		} else {
			options = botOptions(g)
		}
		if len(options) == 0 {
			failed = true
			log.Printf("bot: no legal options in phase %s", g.Phase)
			return
		}
		chosen := 0
		status := "Lokaler Strategie-Bot"
		engine := "local"
		if g.Players[g.actor()].Bot == "berserker" {
			status, engine = "Ragnar · Berserker · greift ab 3 Einheiten an", "berserker"
		} else if g.Players[g.actor()].Bot == "annoying" {
			status, engine = "Klaus Störtebeker · Störenfried · attackiert ab 4 Truppen ohne Rücksicht auf Verluste; bevorzugt einen zufällig gewählten Gegner", "annoying"
		}
		r.mu.Lock()
		if r.closed || r.game.Paused || len(r.clients) == 0 || b.ctx.Err() != nil {
			r.mu.Unlock()
			return
		}
		if r.game.Revision != g.Revision {
			r.mu.Unlock()
			continue
		}
		next := clone(r.game)
		if engine == "annoying" {
			next.Players[g.actor()].AnnoyingTarget = g.Players[g.actor()].AnnoyingTarget
		}
		if err := next.apply(g.actor(), options[chosen].Action, secureRandom); err != nil {
			failed = true
			r.mu.Unlock()
			log.Printf("bot action rejected: %v", err)
			return
		}
		next.Players[g.actor()].BotDecision = &BotDecision{Engine: engine, Detail: status, Revision: next.Revision}
		next.BotStatus = g.Players[g.actor()].Name + " · " + status
		if err := s.save(next); err != nil {
			failed = true
			r.mu.Unlock()
			log.Printf("bot save: %v", err)
			return
		}
		r.recordBattle(next)
		r.game = next
		r.notify()
		r.mu.Unlock()
	}
}

func (b *botEngine) presentationDelay(r *room) time.Duration {
	delay := b.battleDelay
	if r.lastBattleNew && delay > 0 {
		// Let viewers see the new route for two seconds before its battle.
		delay += 2 * time.Second
	}
	return delay
}
