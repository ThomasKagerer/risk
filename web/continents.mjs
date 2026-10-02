// Use the displayed game state, so badges follow the same event order as troops.
export function controlledContinents(board, game, owner) {
  if (!game || !game.players[owner] || game.players[owner].neutral || game.phase === 'lobby') return [];
  return board.continents.filter(continent => {
    const countries = board.countries.filter(country => country.continent === continent.id);
    return countries.length > 0 && countries.every(country => game.territories[country.id - 1]?.owner === owner);
  });
}

// Hover/focus previews a region; clicking pins it until clicked again.
export function continentSelection(onChange) {
  let pinned = 0, hovered = 0, focused = 0, suppressFocus = false;
  const publish = () => onChange(hovered || (!suppressFocus && focused) || pinned, pinned);
  return {
    hover(id) { hovered = id; publish(); },
    focus(id) { focused = id; suppressFocus = false; publish(); },
    toggle(id) { pinned = pinned === id ? 0 : id; hovered = 0; suppressFocus = true; publish(); },
    clear() { pinned = hovered = focused = 0; suppressFocus = false; publish(); },
  };
}
