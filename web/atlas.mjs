import { localize as tr } from './i18n.mjs';
// Static artwork, constructed once. No filters, bitmap textures or animation loop.
export const continentColors = ['#dbc080', '#a8b995', '#acc6ce', '#dfb08a', '#bdc19c', '#bdaac5', '#b6bccb', '#c59f9b'];

const ridges = [
  [57,84,.8],[80,87,.7],[98,124,.8],[110,159,.7],[138,203,.65],
  [281,42,.65],[304,75,.7],[226,307,.7],[231,339,.8],[241,377,.7],[240,414,.55],
  [414,63,.6],[396,147,.55],[424,160,.55],[359,235,.6],[451,287,.7],[431,381,.55],
  [525,100,.65],[549,68,.8],[582,59,.65],[570,173,.85],[587,178,.85],[601,177,.7],
  [648,124,.55],[720,78,.7],[716,191,.5],[715,365,.65],[729,391,.65],
];
const forests = [[145,70],[174,82],[215,104],[241,113],[280,322],[293,339],
  [391,128],[450,90],[417,299],[406,309],[567,100],[582,115],[625,67],[655,76],
  [622,236],[633,308],[691,310],[638,367]];

export function initAtlas(svg, board) {
  const defs = svg.querySelector('defs');
  defs.querySelector('#atlas-defs')?.remove();
  defs.insertAdjacentHTML('beforeend', `<g id="atlas-defs">
    <path id="atlas-land" d="${board.coastPath || board.countries.map(c => c.path).join('')}"/>
    <clipPath id="atlas-land-clip"><use href="#atlas-land"/></clipPath>
    <linearGradient id="land-light" x2=".15" y2="1"><stop stop-color="#fff9e5" stop-opacity=".28"/><stop offset=".5" stop-color="#fff9e5" stop-opacity="0"/><stop offset="1" stop-color="#4d5544" stop-opacity=".08"/></linearGradient>
    <pattern id="land-grain" width="17" height="13" patternUnits="userSpaceOnUse"><path d="M2 3h.5m8 5h1m-6 3h.7" stroke="#514c38" stroke-width=".4" opacity=".2"/></pattern>
    <g id="atlas-mountain"><path d="m-7 4 7-12 7 12z" fill="#797f6a" fill-opacity=".23"/><path d="m-7 4 7-12 7 12M0-8 2 1 0-1-2 2" fill="none" stroke="#697762" stroke-width=".7"/><path d="m-3-3 3-5 3 5-3-1z" fill="#faf7e5" fill-opacity=".7"/></g>
    <g id="atlas-tree"><path d="M0 3v4M-3 2 0-4 3 2ZM-2-1 0-6 2-1Z" fill="#547861" fill-opacity=".3" stroke="#547861" stroke-width=".5"/></g></g>`);
  svg.querySelector('#coastlines').innerHTML = '<use href="#atlas-land" class="coastal-shelf"/><use href="#atlas-land" class="coastal-edge"/>';
  svg.querySelector('#terrain').innerHTML = `
    <use href="#atlas-land" fill="url(#land-light)"/>
    <use href="#atlas-land" fill="url(#land-grain)"/>
    <g clip-path="url(#atlas-land-clip)" class="terrain-ink">
      ${ridges.map(([x,y,s]) => `<g transform="translate(${x} ${y}) scale(${s})"><use href="#atlas-mountain" x="-5" y="3"/><use href="#atlas-mountain" x="3"/><use href="#atlas-mountain" x="10" y="5"/></g>`).join('')}
      ${forests.map(([x,y]) => `<g transform="translate(${x} ${y})"><use href="#atlas-tree" x="-4" y="2"/><use href="#atlas-tree"/><use href="#atlas-tree" x="4" y="3"/></g>`).join('')}
      <path class="atlas-river" d="M267 310q8 6 17 3t18 9M418 256q-4-10 2-20M615 181q16-7 26 1t21-5"/>
    </g>`;
  if(board.id==='simple-world')svg.querySelector('#terrain').innerHTML='<use href="#atlas-land" fill="url(#land-light)"/>';
  const historical=!!board.artwork?.startsWith('historical-');
  svg.querySelector('.ocean-type').innerHTML=board.id==='europe1871'
    ? tr('<text x="185" y="330" transform="rotate(-76 185 330)">ATLANTISCHER OZEAN</text><text x="333" y="200">NORDSEE</text><text x="395" y="455">MITTELMEER</text><text x="657" y="385">SCHWARZES MEER</text>')
    : historical
    ? tr('<text x="70" y="300">GROSSER OZEAN</text><text x="346" y="307" transform="rotate(-76 346 307)">ATLANTISCHES MEER</text><text x="548" y="355">INDISCHES MEER</text>')
    : tr('<text x="91" y="287">PAZIFISCHER</text><text x="105" y="302">OZEAN</text><text x="298" y="198" transform="rotate(-68 298 198)">ATLANTISCHER OZEAN</text><text x="502" y="444">INDISCHER OZEAN</text>');
  svg.querySelector('.atlas-caption-small').textContent=tr`${board.countries.length} GEBIETE / ${historical?tr`UM ${board.era||1700}`:tr('6 KONTINENTE')}`;
}
