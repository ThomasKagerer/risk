import { localize as tr } from './i18n.mjs';
// Timber staging and a treadwheel crane share one silhouette at every scale.
// Keep the gateway clear: diagonal braces belong to the side scaffold bays.
export function constructionArtwork(){
 return `<g class="construction-timber" stroke="#695237" stroke-width="1.2" stroke-linejoin="round">
  <g fill="#ac8756">
   <path d="M9 145V55h5v90zm29 0V55h5v90zm78 0V71h5v74zm29 0V71h5v74z"/>
   <path d="M6 59h42v5H6zm0 38h42v5H6zm0 38h42v5H6zm106-60h48v5h-48zm0 33h48v5h-48zm0 27h48v5h-48z" fill="#c1a16c"/>
   <path d="m14 99 24-34 3 2-24 34zm0 38 24-33 3 2-24 33zm108-26 22-29 3 2-22 29z"/>
  </g>
  <path d="M18 137 27 67m-1 8h10m-11 8h10m-11 8h10m-11 8h10m-11 8h10m-11 8h10m-11 8h10" fill="none" stroke="#e0bd83" stroke-width="2"/>
  <g class="construction-crane">
   <path d="M127 141V12h6v129zM67 10h87v6H67z" fill="#997244"/>
   <path d="m128 48-54-32 2-3 54 29zM115 141l14-33 14 33h-5l-9-23-9 23z" fill="#b08c59"/>
   <path d="M73 16v45m-2 0h4v5l-3 3" fill="none" stroke="#d3bd89" stroke-width="1.8"/>
   <path d="m62 71 10-5 12 5v10H62z" fill="#8b8b76"/><path d="m62 71 10 4 12-4m-12 4v6" fill="none" stroke="#b6ac8c"/>
   <path d="M145 117a16 16 0 1 1-32 0 16 16 0 1 1 32 0Z" fill="#80643f" stroke="#d1af75" stroke-width="3"/>
   <path d="M129 102v30m-15-15h30m-26-11 22 22m-22 0 22-22" fill="none" stroke="#c6a574" stroke-width="2"/>
   <path d="M133 117a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z" fill="#594b35"/>
  </g>
  <path d="M48 144h14v5H48zm5-5h15v5H53zm35 5h18v5H88z" fill="#aaa18a"/>
 </g>`;
}

export function buildingConstruction(level=0){
 const x=level===0?370:level===1?310:level===2?300:270;
 const width=level===0?155:level===1?215:250;
 const height=level<2?135:level===2?145:210;
 return tr`<g class="building-construction" aria-label="Gebäude wird erweitert" transform="translate(${x} ${156-height}) scale(${width/160} ${height/150})">${constructionArtwork()}</g>`;
}
