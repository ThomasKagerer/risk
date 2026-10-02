import { armyExperience } from './experience.mjs';
import { constructionArtwork } from './construction-art.mjs';
export const buildingNames=['Holzhütte','Palisade','Steinburg','Festung','Bastion','Zitadelle'];
// The existing artwork uses these thresholds. Explicit buildings choose the
// artwork directly, independent of current or previous army strength.
export const buildingArtworkTroops=[1,6,10,15,50,70];
export function buildingDescription(territory,capital=false){
  const level=territory.buildingLevel||0,c=territory.construction,bonus=armyExperience(territory).bonus,limit=2+level+bonus;
  return `${capital?'Hauptstadt · ':''}${buildingNames[level]} · ${Math.min(territory.troops,limit)} von ${limit} Verteidigungswürfeln${bonus?` · +${bonus} durch Erfahrung`:""}${c?` · ${buildingNames[c.level]} im Bau: noch ${c.remaining} eigene Runden`:''}`;
}
export function buildingUpgradeDuration(from,to){let cost=0;for(let level=from+1;level<=to;level++)cost+=level+1;return cost;}
export function constructionDuration(t){return t.construction?.duration||buildingUpgradeDuration(t.buildingLevel||0,t.construction?.level||0);}
export function nextBuildingStage(t){const c=t.construction;return c?{level:(t.buildingLevel||0)+1,remaining:Math.max(0,c.remaining-buildingUpgradeDuration((t.buildingLevel||0)+1,c.level))}:null;}
export function buildingInfo(game,id,capital=false){
 const t=game.territories[id-1],level=t.buildingLevel||0,c=t.construction,next=nextBuildingStage(t),bonus=armyExperience(t).bonus,limit=2+level+bonus;
 return `<section class="building-info" aria-label="Gebäude"><div class="building-heading"><strong>${capital?'Hauptstadt · ':''}${buildingNames[level]}</strong><span>${Math.min(t.troops,limit)} / ${limit} Würfel${bonus?` · +${bonus} Erfahrung`:""}</span></div>${c?`<div class="construction-progress" role="status"><strong>${buildingNames[c.level]} im Bau</strong><span>${buildingNames[next.level]} in ${next.remaining} ${next.remaining===1?'eigener Runde':'eigenen Runden'} · Ziel in ${c.remaining}</span><progress value="${Math.max(0,constructionDuration(t)-c.remaining)}" max="${constructionDuration(t)}" aria-label="Baufortschritt"></progress></div>`:''}<button class="secondary building-open" data-open-building="${id}">Gebäude ansehen${t.owner===game.me?' & ausbauen':''}</button></section>`;
}
export function mapBuilding(t,capital=false){
  const level=t.buildingLevel||0,c=t.construction;
  const wood='<path d="M-8 8V-1H8v9" fill="#b69767"/><path d="M-11-1 0-9 11-1Z" fill="#705740"/><path d="M-2 8V2h4v6" fill="#403f32"/>';
  const posts=Array.from({length:9},(_,i)=>`<path d="M${i*3-12} 10V3l1.5-3L${i*3-9} 3v7Z"/>`).join('');
  const towers=level<2?'':[-10,10].map(x=>`<path d="M${x-4} 10V-9h2v3h2v-3h2v3h2V10Z"/>`).join('');
  const keep=level<3?'':`<path d="M-5 2V${8-level*5}h2v3h2v-3h2v3h2v-3h2V2Z"/>`;
  const outer=level<4?'':`<path d="M-17 11V-2h3v4h3v-4h3v13m16 0V-2h3v4h3v-4h3v13"/>`;
  const scaffoldHeight=Math.max(44,26+level*4);
  return `<title>${buildingDescription(t,capital)}</title><g class="map-building-art" stroke="#5c5942" stroke-width="1" stroke-linejoin="round">${level<2?wood:''}<g fill="${level===1?'#8b704c':'#c5c1a3'}">${level===1?posts:level>=2?`${keep}${towers}<path d="M-10 10V-1h20v11"/>${outer}<path d="M-3 10V5a3 3 0 0 1 6 0v5" fill="#4b5346"/>`:''}</g>${capital?'<path d="M-4-20-3-15h6l1-5-3 2-1-3-1 3Z" fill="#e9bd51" stroke="#7b632d"/>':''}${c?`<g class="map-scaffold" transform="translate(-24 ${12-scaffoldHeight}) scale(.3 ${scaffoldHeight/150})">${constructionArtwork()}</g>`:''}</g>${c?`<g class="map-build-count"><rect x="14" y="-10" width="14" height="13" rx="3" fill="#a86d23"/><text x="21" y="0" text-anchor="middle" fill="#fff9e8">${c.remaining}</text></g>`:''}`;
}
