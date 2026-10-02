import { hasFeature, ruleConfig } from './content.mjs';
import { localize as tr } from './i18n.mjs';
import { armyExperience } from './experience.mjs';

export function maxDefenseDice(country, troops, capital=false, rules='', buildingLevel=0, experience=[]) {
  const id=typeof rules==='object'?rules.rules:rules,config=ruleConfig(rules);
  if(id)return Math.min(2+(config.buildings?buildingLevel:0)+(config.experience?armyExperience({troops,experience},config).bonus:0),Math.max(0,troops));
  return troops<1?0:capital?Math.min(4,troops+1):Math.min(country?.mountainous ? 3 : 2, troops);
}

export function attackRollRevealed(game, lastRevealedRoll) {
  return game?.phase === 'defend' && Boolean(game.pending) && (!hasFeature(game,'revealedAttack') || Boolean(game.pending.attack?.length) && game.pending.id <= lastRevealedRoll);
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
  if (player?.bot === 'annoying') return { label: tr('Störenfried'), detail: tr('Klaus Störtebeker · blockiert einen zufälligen Gegner, sammelt 10 Einheiten für größere Angriffe und holt Karten über schwache Nachbarn'), fallback: false };
  if (player?.bot === 'berserker') return { label: tr('Berserker'), detail: tr('Ragnar · greift ab 3 Einheiten im Ausgangsgebiet mit maximaler Würfelzahl an'), fallback: false };
  if (!player.bot) return null;
  return { label: tr('Lokale KI'), detail: tr('Lokaler Strategie-Bot'), fallback: false };
}
