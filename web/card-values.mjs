import { mapConfig } from './content.mjs';
export function cardValue(value, map) {
  return Math.floor(value / Math.max(1,mapConfig(map).cardDivisor||1));
}

export function progressiveCardValue(trades, map) {
  return cardValue(trades < 6 ? [4, 6, 8, 10, 12, 15][trades] : 20 + (trades - 6) * 5, map);
}

export function fixedCardValues(map) {
  return [4, 6, 8, 10].map(value => cardValue(value, map));
}
