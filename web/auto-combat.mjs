import { hasFeature } from './content.mjs';
import { localize as tr } from './i18n.mjs';
import { maxDefenseDice } from './combat-ui.mjs';
import { maxAttackDice } from './experience.mjs';

export function automaticDefenseDice(territory, troops, attack, capital=false, rules='', buildingLevel=0, experience=[]) {
  const maximum = maxDefenseDice(territory, troops, capital, rules, buildingLevel, experience);
  return Math.max(1, maximum - ((attack||[]).filter(value => value >= 5).length >= maximum ? 1 : 0));
}

// Automate one border only. All actions still go through the normal server
// rules; occupation is manual and attack losses never trigger a retreat.
export function createAutoCombat({ getState, country, canAct, act, onChange, onStop,
  schedule = setTimeout, cancel = clearTimeout }) {
  let active = null, timer = null;
  function stop(reason = '') {
    if (!active) return;
    active = null;
    cancel(timer);
    timer = null;
    onChange();
    if (reason) onStop(reason);
  }
  function status(game, run) {
    if (!game || game.code !== run.code || game.me !== run.me || game.turn !== run.turn || game.round !== run.round)
      return tr('Automatik beendet: Die Partie oder der Zug hat gewechselt.');
    const from = game.territories[run.from - 1], to = game.territories[run.to - 1];
    if (game.phase === 'finished') return tr('Die Partie ist beendet.');
    if (to?.owner === run.attacker || game.phase === 'occupy') return run.mode === 'attack'
      ? tr('Zielland erobert. Wähle jetzt, wie viele Einheiten nachrücken.') : tr('Automatik beendet: Das Gebiet wurde erobert.');
    if (from?.owner !== run.attacker || to?.owner !== run.defender || !country(run.from)?.neighbors.includes(run.to))
      return tr('Automatik beendet: Dieser Kampf ist nicht mehr möglich.');
    if (from.troops < 2) return tr('Automatik beendet: Im Startland ist nur noch eine Einheit übrig.');
    if (game.phase === 'defend' && game.pending?.from === run.from && game.pending?.to === run.to
      && (run.mode === 'attack' || game.actor === run.me)) return '';
    if (game.phase !== 'attack' || game.actor !== run.turn) return tr('Automatik beendet: Die Spielphase oder der Kampf hat gewechselt.');
    return '';
  }
  async function tick(run) {
    if (active !== run) return;
    const game = getState();
    if(game?.paused){timer=schedule(()=>tick(run),250);return;}
    const reason = status(game, run);
    if (reason) { stop(reason); return; }
    if (game.phase === run.mode && game.actor === run.me && canAct() && game.revision !== run.lastRevision) {
      run.lastRevision = game.revision;
      let ok = false;
      const dice = run.mode === 'attack' ? maxAttackDice(game.territories[run.from - 1],game)
        : automaticDefenseDice(country(run.to), game.territories[run.to - 1].troops, game.pending.attack, game.goal==='capital'&&game.players.some(p=>p.capital===run.to), game, game.territories[run.to-1].buildingLevel, game.territories[run.to-1].experience);
      try { ok = await act(run.mode, { from: run.from, to: run.to, dice }); }
      catch { /* Connection/action failures must never trigger blind retries. */ }
      if (active !== run) return;
      // A pause can invalidate the UI's in-flight response. The server snapshot
      // received on resume tells us whether that move was already applied.
      if (!ok && getState()?.paused) { timer = schedule(() => tick(run), 250); return; }
      if (!ok) { stop(tr('Automatik gestoppt. Prüfe den Spielstand, bevor du erneut startest.')); return; }
    }
    if (active === run) timer = schedule(() => tick(run), 250);
  }
  return {
    get active() { return active; },
    start(mode, from, to) {
      const game = getState();
      if (active || game?.paused || !canAct() || !['attack', 'defend'].includes(mode) || game?.phase !== mode || game.actor !== game.me) return false;
      if (mode === 'defend' && hasFeature(game,'revealedAttack') && !game.pending?.attack?.length) return false;
      if (mode === 'attack' && (game.turn !== game.me || game.territories[from - 1]?.owner !== game.me)) return false;
      const run = { mode, code: game.code, me: game.me, turn: game.turn, round: game.round, from, to,
        attacker: game.territories[from - 1]?.owner, defender: game.territories[to - 1]?.owner, lastRevision: -1 };
      if (status(game, run)) return false;
      active = run;
      onChange();
      timer = schedule(() => tick(run), 250);
      return true;
    },
    stop,
  };
}
