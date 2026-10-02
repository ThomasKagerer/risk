import { armyExperience } from './experience.mjs';

export function maxDefenseDice(country, troops, capital=false, rules='', buildingLevel=0, experience=[]) {
  if(rules==='classic')return Math.min(2,Math.max(0,troops));
  if(rules==='domination')return Math.min(2+buildingLevel+armyExperience({troops,experience}).bonus,Math.max(0,troops));
  return troops<1?0:capital?Math.min(4,troops+1):Math.min(country?.mountainous ? 3 : 2, troops);
}

export function attackRollRevealed(game, lastRevealedRoll) {
  return game?.phase === 'defend' && Boolean(game.pending) && (game.rules==='classic' || Boolean(game.pending.attack?.length) && game.pending.id <= lastRevealedRoll);
}

// Wait for the actual final die, including staggered CSS delays. A cancelled
// animation must not leave a reconnect or a reduced-motion view locked forever.
export async function waitForDice(root, reducedMotion) {
  if (reducedMotion) return;
  const rolls = root.getAnimations({ subtree: true }).filter(animation => animation.animationName === 'tumble');
  await Promise.allSettled(rolls.map(animation => animation.finished));
}

// A deliberate smaller choice belongs only to this particular roll. Changing
// targets, moving to the next roll or changing the available army resets it.
export function selectedDice(previousContext, context, maximum, choice) {
  return previousContext === context ? Math.max(1, Math.min(maximum, choice)) : maximum;
}

export function botController(player) {
  if (player?.bot === 'annoying') return { label: 'Störenfried', detail: 'Klaus Störtebeker · blockiert einen zufälligen Gegner, sammelt 10 Einheiten für größere Angriffe und holt Karten über schwache Nachbarn', fallback: false };
  if (player?.bot === 'berserker') return { label: 'Berserker', detail: 'Ragnar · greift ab 3 Einheiten im Ausgangsgebiet mit maximaler Würfelzahl an', fallback: false };
  if (!player.bot) return null;
  return { label: 'Lokale KI', detail: 'Lokaler Strategie-Bot', fallback: false };
}
