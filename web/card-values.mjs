export function cardValue(value, map) {
  return map === 'simple-world' ? Math.floor(value / 2) : value;
}

export function progressiveCardValue(trades, map) {
  return cardValue(trades < 6 ? [4, 6, 8, 10, 12, 15][trades] : 20 + (trades - 6) * 5, map);
}

export function fixedCardValues(map) {
  return [4, 6, 8, 10].map(value => cardValue(value, map));
}
