import { localize as tr } from './i18n.mjs';
// Historical motifs, not reproductions of standardized modern national flags.
// Sources and the deliberately conservative territory mapping: docs/historical-banners.md.
const motifs = {
  england: tr('Georgskreuz, vor 1700 belegt'),
  scotland: tr('Andreaskreuz, vor 1700 belegt'),
  union1606: tr('Unionsflagge von 1606, ohne das erst 1801 ergänzte Patrickskreuz'),
  netherlands: tr('Rot-Weiß-Blau der niederländischen Republik, 17. Jahrhundert'),
  denmark: tr('Dannebrog von Dänemark-Norwegen, um 1700'),
  sweden: tr('Schwedisches Kreuzbanner, um 1700; Finnland gehörte damals zu Schweden'),
  bavaria: tr('Weiß-blaue Rauten der Wittelsbacher, heraldisch vereinfacht'),
  swiss: tr('Weißes Kreuz auf Rot, historisches eidgenössisches Feldzeichen'),
  burgundy: tr('Rotes Burgunderkreuz der spanischen Monarchie, vor 1700 belegt'),
  aragon: tr('Vier rote Pfähle auf Gold, historisches Wappenmotiv Aragóns'),
  imperial: tr('Doppeladler des Heiligen Römischen Reiches, heraldisch vereinfacht'),
  austria: tr('Rot-weiß-roter österreichischer Bindenschild, vereinfachtes Wappenmotiv'),
  france: tr('Lilien der französischen Monarchie, vereinfachtes Wappenmotiv'),
  portugal: tr('Portugiesische Quinas, vereinfachtes historisches Wappenmotiv'),
  tokugawa: tr('Dreiblättriges Aoi-Mon der Tokugawa, vereinfachtes Herrschaftszeichen der Edo-Zeit'),
};

// Match names, never numeric IDs: the two boards assign different IDs to places.
// Broad regions and uncertain historical affiliations deliberately use a named
// neutral standard, rather than the flag of a modern country or colonial claimant.
const territories = new Map([
  ['England','england'], ['Schottland','scotland'], ['Großbritannien','union1606'],
  ['Niederlande','netherlands'], ['Dänemark','denmark'], ['Norwegen','denmark'],
  ['Schweden','sweden'], ['Finnland','sweden'],
  ['Kurfürstentum Bayern','bavaria'], ['Schweizer Eidgenossenschaft','swiss'],
  ['Kastilien','burgundy'], ['Aragon','aragon'],
  ['Deutsche Reichslande','imperial'], ['Japan','tokugawa'],
  ['Österreich','austria'], ['Frankreich','france'], ['Portugal','portugal'],
]);

export function countryBanner(country) {
  const name=country?.name||tr('Unbekanntes Land');
  if(country?.era===1871)return {type:'country',name,motif:'regional',description:tr`${country.polity||name} · 1871; neutrales Landesbanner`};
  const motif=territories.get(country?.sourceName||name)||'regional';
  return {type:'country',name,motif,description:motifs[motif]||tr('Neutrales Landesbanner; kein eindeutig belegtes gemeinsames Banner um 1700 zugeordnet')};
}

const field=color=>`<rect width="16" height="10" fill="${color}"/>`;
const cross=(background,color,x=5)=>field(background)+`<path d="M${x} 0v10M0 5h16" stroke="${color}" stroke-width="2"/>`;
const saltire=(background,color)=>field(background)+`<path d="M0 0l16 10M0 10 16 0" stroke="${color}" stroke-width="1.8"/>`;
const patterns={
  england:cross('#f3ecd7','#aa322b',8),
  scotland:saltire('#284c7b','#f3ecd7'),
  union1606:saltire('#284c7b','#f3ecd7')+'<path d="M8 0v10M0 5h16" stroke="#f3ecd7" stroke-width="3"/><path d="M8 0v10M0 5h16" stroke="#aa322b" stroke-width="1.6"/>',
  netherlands:field('#f3ecd7')+'<path d="M0 0h16v3.33H0z" fill="#aa322b"/><path d="M0 6.67h16V10H0z" fill="#284c7b"/>',
  denmark:cross('#a8322d','#f3ecd7'),
  sweden:cross('#28547c','#e8bb50'),
  bavaria:field('#f3ecd7')+Array.from({length:5},(_,x)=>Array.from({length:2},(_,y)=>`<path d="m${x*4-2} ${y*5} 2.8 1 1.2 4-2.8-1z" fill="#4b92bb"/>`).join('')).join(''),
  swiss:field('#aa322b')+'<path d="M8 2v6M5 5h6" stroke="#f3ecd7" stroke-width="2"/>',
  burgundy:saltire('#f3ecd7','#a8322d')+'<path d="m3 1 .5 2 2-.4M8 4l.5 2 2-.4m-6 2 1-2-2-.5m7-1 1-2-2-.5" fill="none" stroke="#a8322d" stroke-width=".8"/>',
  aragon:field('#e8bb50')+'<path d="M3 0v10M6.33 0v10M9.67 0v10M13 0v10" stroke="#aa322b" stroke-width="1.7"/>',
  imperial:field('#e8bb50')+'<g fill="#292e28"><path d="M8 8 5 9l1-2-3 1 1-2-3-1 1-1-1-3 5 3 1-1-2-1V1h2l1 2 1-2h2v1L9 3l1 1 5-3-1 3 1 1-3 1 1 2-3-1 1 2z"/></g>',
  austria:field('#aa322b')+'<path d="M0 3.33h16v3.34H0z" fill="#f3ecd7"/>',
  france:field('#284c7b')+[[-3,-2],[3,-2],[0,2]].map(([x,y])=>`<path transform="translate(${8+x} ${5+y})" d="M0-2C-1-1-1 0 0 1-3-3-4 1-1 1H1C4 1 3-3 0 1 1 0 1-1 0-2ZM-1 1v.5h2V1ZM0 1.5l-1 1h2z" fill="#e8bb50"/>`).join(''),
  portugal:field('#f3ecd7')+'<path d="M4 1h8v4q0 3-4 4-4-1-4-4Z" fill="#aa322b"/><path d="M5 2h6v3q0 2-3 3-3-1-3-3Z" fill="#f3ecd7"/>'+[[8,3],[6,4.5],[10,4.5],[8,4.5],[8,6]].map(([x,y])=>`<path d="M${x-.6} ${y-.5}h1.2v1l-.6.5-.6-.5Z" fill="#284c7b"/>`).join(''),
  tokugawa:field('#eee4c7')+'<g transform="translate(8 5)" fill="#303c32"><circle r="4.1" fill="none" stroke="#303c32" stroke-width=".65"/>'+[0,120,240].map(angle=>`<path transform="rotate(${angle})" d="M0 0C-3-1-2.5-4 0-2.6 2.5-4 3-1 0 0Z"/>`).join('')+'</g>',
};

// Only built-in vector artwork is accepted; no external assets or SVG from names.
export function countryBannerMotif(motif) { return Object.hasOwn(patterns,motif)?patterns[motif]:''; }
