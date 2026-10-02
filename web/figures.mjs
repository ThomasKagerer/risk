import { buildingArtworkTroops } from './buildings.mjs';
import { figureMembers, experienceBadges } from './experience.mjs';
import { buildingConstruction } from './construction-art.mjs';
import { countryBannerMotif } from './country-banners.mjs';

// Painted miniatures share the player's coat/saddle color. Natural materials,
// shaded limbs, equipment and separate moving parts remain legible when zoomed.
export const symbols = {
  infantry: `<g stroke="#30342e" stroke-width=".45" stroke-linejoin="round">
    <ellipse cx="12" cy="28" rx="9" ry="1.5" fill="#172822" opacity=".22" stroke="none"/>
    <g class="leg-back"><path d="m10 18 3 1-3 7-3 1 .4-2z" fill="#ddd0b5"/><path d="m7.5 24 3 .7-.6 3H6.5l-.5-1z" fill="#292b25"/></g>
    <g class="leg-front"><path d="m12 18 3-.4.8 7.4-2.8 1-1.5-5z" fill="#efe3c8"/><path d="m13 24.4 2.8-.2 1.3 2.5 2 .5v1h-5.7z" fill="#292b25"/></g>
    <path d="m7.8 9.6 6.5-.4 2.5 11-4.6-1.5-4.4 1.6z"/><path d="m8.2 12-.4 7 3.3-1.2-.7-7z" fill="#000" opacity=".17" stroke="none"/>
    <path d="m10 9.5 2.1-.2 1.4 8.9-2.7.6z" fill="#eee0bc"/><path d="m8.5 9.9 5.3 6M14.7 10.5l-6 6" fill="none" stroke="#e7d5ab" stroke-width="1.1"/>
    <path d="m8 17 7-.5" stroke="#3e3429" stroke-width="1.2"/><rect x="10.4" y="16.2" width="2" height="1.5" rx=".2" fill="#c5a44f"/>
    <path d="m7.8 10.5-2 4.1 3.8 2 1-1.5-2.3-1.7 1-2.6"/><path d="m8.6 14.4 2.2.6-.4 1.7-2.1-.3z" fill="#c69c73"/>
    <g class="weapon"><path d="m11.8 10.5 3.2 3 4.5-1.2.7 1.8-5.9 1.6-4-3.1"/><path d="m18.1 12.2 2.2-.3.4 1.7-2 .6z" fill="#d9b28c"/>
    <path d="m7 14 2 1.5 5-2 9-1.4-.2-1.2-11 1.5-1.7-.3z" fill="#76543b"/><path d="m13 11.9 11-1.2" stroke="#b5b9ad" stroke-width=".9"/><path d="m22.4 10.9 2.4-.2" stroke="#d4d7ca" stroke-width=".5"/></g>
    <path d="M10 7.1h3v3.4h-3z" fill="#b18763"/><path d="m9 3.5 4.7-.4 1.2 3.1-.8 2.2-2.6.5-2.3-2z" fill="#d2a77f"/>
    <path d="m8.9 4 .1 3.4 1.1.5-.2-3z" fill="#5b4534"/><path d="m13.5 5.6 1.5.8-1.2.4" fill="#d2a77f"/><path d="m6.7 4.2 2-3.2 3.3 1.1L15 1l1.1 3-4.6.7z" fill="#252c29"/><path d="m7.2 4 4.3.3 4-.5" fill="none" stroke="#d0b87c" stroke-width=".5"/><circle cx="13.4" cy="5.4" r=".23" fill="#30342e"/>
  </g>`,
  cavalry: `<g stroke="#352f27" stroke-width=".45" stroke-linejoin="round">
    <ellipse cx="12" cy="28" rx="11" ry="1.4" fill="#172822" opacity=".22" stroke="none"/>
    <path d="M5 16Q1 12 1 20l2 3 .3-5 3 1" fill="#302a24"/>
    <g class="leg-back"><path d="m6 19 2.5.7-3 6-2 .8-.6-1.3 1.8-.5zM15 18l2 1 3 5-1 3-2-.1.2-2 1-.7z" fill="#765039"/><path d="m3 26 2 .1v1.6H2.5zM17 26h2v1.6h-2.6z" fill="#2b2a24"/></g>
    <path d="m4 16 3-2.3 8.3.5 2-4.6 1-3.5 2.6 1.6 2.9 2.7-.8 2-3.1-.4-1.6 6.2-3 3.2-7.1.1L5 20z" fill="#a27650"/>
    <path d="m5 17 5 1 7-1-2 3.3-7 .2L5 19z" fill="#684630" opacity=".7" stroke="none"/>
    <path d="m17.3 10 1.2-3.9 1.2 2-1.2 5.5-2 2.1" fill="#392e25"/>
    <path d="m19 7.8.4-2.2 1.4 1.9" fill="#a27650"/><circle cx="21" cy="9.9" r=".4" fill="#171f1c"/>
    <path d="m19.3 11.2 4.1.9M20 10.5q-1.7 5.2-6 3.5" fill="none" stroke="#e0cc9a" stroke-width=".55"/>
    <g class="leg-front"><path d="m7 20 2.7.2-.6 4.7 2.4 1.6-.8 1.1-4-1.7zM16 19l2-1.1-.1 6.1 2.1 2-.8 1.3-3.4-2.5z" fill="#a27650"/><path d="m10 26 1.8.8-.5 1H9.4zM19 26l1.6 1-.6.9h-1.6z" fill="#262822"/></g>
    <path d="m8 13 7 .6-.4 5.1-6.9-.2z"/><path d="m8 18 6.5.2" stroke="#d8bd71"/><path d="m8.5 13 5 .4" stroke="#302c26" stroke-width="1.1"/>
    <path d="m10 11 4 1-2.1 4.4.3 3.4-2.6.1-.4-4 1.3-2.7z" fill="#e1d2b4"/><path d="m9.4 18.2 3-.3.5 3.1h-3z" fill="#2e2d27"/>
    <path d="m8 6 4-.2 2 6.3-5.7 1.1z"/><path d="m9.8 6 1.8 5.5" stroke="#e5d8b9" stroke-width="1"/>
    <path d="m11.6 6.7 3.1 2.5 2.2-.6.6 1.3-3.1 1-3.5-2.2"/><circle cx="17" cy="9.1" r=".8" fill="#d6ad82"/>
    <g class="weapon"><path d="m8.8 7-2.3 2L5 5.8" fill="none" stroke="inherit" stroke-width="1.8"/><circle cx="5" cy="5.5" r=".8" fill="#d6ad82"/><path d="m5.1 5.2 1.2-4.7" stroke="#e4e0c9" stroke-width=".75"/><path d="m3.7 5.3 2.7.5" stroke="#c9a95c"/></g>
    <path d="m8.6 2 3.5-.2.6 2.3-1.4 1.8-2.5-.7z" fill="#d6ad82"/><path d="m7 2.3 2-2 2 .6 2-.5.7 2.3z" fill="#292e29"/><path d="m7 2.3 6.7.4" stroke="#d1b47a"/>
  </g>`,
  artillery: `<g stroke="#34352c" stroke-width=".5" stroke-linejoin="round">
    <ellipse cx="12" cy="28" rx="11" ry="1.5" fill="#172822" opacity=".22" stroke="none"/>
    <path d="m2 21 2-1 2 6H3zM6 20l2 .5-.4 6H5.5z" fill="#d9cfb3"/><path d="M2.8 26H6v1.5H2zM5.5 26h3v1.5H5z" fill="#252c28"/>
    <path d="m2.6 11 4.5-.4 2.3 10H2z"/><path d="m3.2 11.5 4 8" stroke="#e5d7b5" stroke-width="1"/>
    <path d="m6.5 12 3 3 3-.3.3 1.6-4.5.3-3.4-3"/><circle cx="12.8" cy="15.3" r=".85" fill="#d0a77e"/>
    <path d="m10 9 6 13" stroke="#78563a" stroke-width=".8"/><path d="m9.7 8.5.8-.4 1 2-.9.4z" fill="#d6c5a2"/>
    <path d="m3 7 3.6-.2.9 2.4-1.3 1.6-2.7-.6z" fill="#d0a77e"/><path d="M1.5 7.5 3.2 5l2.4 1L8 5.4l.4 2.1z" fill="#28312a"/><path d="m2 7.4 5.5.1" stroke="#d3bd81"/>
    <path d="m11 19 4-.8 8 8-1.5 1.2-8.6-5.2z" fill="#78583a"/><path d="m14 20 7 5" stroke="#b79765"/>
    <g class="weapon"><path d="m7 17 13-5.8 2.1 4.7-13.6 5z" fill="#8c875f"/><path d="m8 17.2 12-5 1 1.9-12.3 4.8z" fill="#b1aa76" stroke="none"/><path d="m17.6 12.4 2.1 4.5M9.1 16.4l1.7 3.9" stroke="#494e3a" stroke-width="1.2"/><ellipse cx="21.5" cy="13.5" rx="1.4" ry="2.7" transform="rotate(-25 21.5 13.5)" fill="#2e3831"/><ellipse cx="21.6" cy="13.5" rx=".65" ry="1.8" transform="rotate(-25 21.6 13.5)" fill="#121c1b"/></g>
    <g class="wheel"><circle cx="11" cy="23" r="5" fill="#806244" stroke="#303930" stroke-width="1.2"/><circle cx="11" cy="23" r="3.8" fill="#d5c092"/><path d="M11 19v8M7 23h8m-6.8-2.8 5.6 5.6m0-5.6-5.6 5.6" stroke="#735a3b" stroke-width=".8"/><circle cx="11" cy="23" r="1.2" fill="#404b38"/></g>
  </g>`,
};

const figureValues = {artillery:10,cavalry:5,infantry:1};
const escapeText = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bannerCloth(banner, wind=1) {
  const native=banner?.type==='country',name=native?banner.name:banner;
  const motif=native?countryBannerMotif(banner.motif):'';
  const start=motif?17:3,width=45-start;
  return `${wind<0?'<g transform="translate(-48 0)">':''}<path d="${wind<0?'M48 0H0l3 5-3 5h48Z':'M0 0H48l-3 5 3 5H0Z'}" fill="${native?'#485348':'inherit'}" stroke="#e6cf91" stroke-width=".45"/>
    ${motif?`<svg x=".8" y=".8" width="13.44" height="8.4" viewBox="0 0 16 10">${motif}</svg>`:''}
    <path d="M${start} 1.5H45M${start} 8.5H45" stroke="#fff0bf" opacity=".3" stroke-width=".4"/>
    <text x="${start+width/2}" y="6.5" text-anchor="middle" textLength="${width-1}" lengthAdjust="spacingAndGlyphs" fill="#fff7dd" stroke="none" font-family="system-ui,sans-serif" font-weight="700" font-size="5">${escapeText(name)}</text>${wind<0?'</g>':''}`;
}
export function playerBanner(name, kind, facing = 1, scale = 1, wind = 1) {
  if (!name) return '';
  scale*=.7;
  const [x,y]={infantry:[19,13],cavalry:[17,9],artillery:[13,15]}[kind];
  const native=name?.type==='country';
  return `<g class="player-banner" ${native?`data-country-banner="${escapeText(name.name)}" role="img" aria-label="${escapeText(name.name+': '+name.description)}"`:'aria-hidden="true"'} transform="translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})">
    ${native?`<title>${escapeText(name.name+': '+name.description)}</title>`:''}
    <path d="M${x} ${y+5}V-9" stroke="#57472e" stroke-width=".85"/><circle cx="${x}" cy="-10" r="1" fill="#dfbe67"/>
    <g class="banner-cloth" style="transform-origin:${x}px -8px">
      <g transform="translate(${x} -8) scale(${facing<0?-1:1} 1)">${bannerCloth(name,wind)}</g>
    </g>
    <circle cx="${x}" cy="${y}" r=".9" fill="#d2a77f" stroke="#644c36" stroke-width=".25"/>
  </g>`;
}

export function fallenBanner(name, color) {
  if(!name)return '';
  // The dropped standard belongs to the ground plane, outside the rotating
  // soldier. Its cloth is foreshortened, creased and still, with a horizontal pole.
  return `<g class="fallen-standard" aria-hidden="true" fill="${color}">
    <path d="M5 1 48-2" stroke="#233129" stroke-width="2" opacity=".25"/>
    <path d="M5 0 48-3" stroke="#57472e" stroke-width="1"/><circle cx="48" cy="-3" r=".8" fill="#cfaf60"/>
    <g transform="matrix(.62 -.035 .55 .3 18 -2.5)">${bannerCloth(name)}
      <path d="m4 0 8 4-6 6m9-10 7 6-5 4m13-10-6 5 9 5m6-10-5 6 8 4" fill="none" stroke="#212e25" stroke-width="1.4" opacity=".35"/>
      <path d="m5 0 8 4-6 6m9-10 7 6-5 4" fill="none" stroke="#f4e4b8" stroke-width=".5" opacity=".5"/>
    </g>
  </g>`;
}
function figureCounts(troops) {
  return {artillery:Math.floor(troops/10),cavalry:Math.floor(troops%10/5),infantry:troops%5};
}

function attackFigureCounts(troops) {
  // Keep a foot soldier, then prioritize a gun and a horse whenever affordable.
  // Larger armies retain proportional artillery and substantial infantry ranks.
  const artillery=Math.max(troops>=11?1:0,Math.floor(troops/20),Math.ceil((troops-54)/10),0);
  const remaining=troops-artillery*10;
  const cavalry=remaining>=6?Math.max(1,Math.floor((remaining-10)/5)):0;
  return {artillery,cavalry,infantry:remaining-cavalry*5};
}

// Prefer individual figures. Only overflow beyond the available artillery
// positions shares the last slot; cavalry and infantry always remain individual.
export function battleFigures(troops, artillerySlots=11) {
  return Object.entries(figureCounts(troops)).flatMap(([kind,count]) =>
    Array.from({length:Math.min(count,kind==='artillery'?artillerySlots:4)},(_,i)=>({id:`${kind}-${i}`,kind,value:figureValues[kind],count:kind==='artillery'&&i===artillerySlots-1?count-i:1})));
}

export function attackingFigures(troops) {
  return Object.entries(attackFigureCounts(troops)).flatMap(([kind,count])=>{
    const visible=Math.min(count,kind==='artillery'?11:count);
    // The attack goes right. Ranks span the field's depth (screen y), with
    // a perspective slant; additional ranks stand behind them on the left.
    const [files,spacing,front,depth,scale]=kind==='infantry'?[5,15,237,24,1.05]:[3,20,158,30,1.05];
    const gunPositions=[[72,157],[20,85],[49,108],[21,134],[48,159],[18,110],[50,82],[47,134],[21,159],[76,85],[101,159]];
    return Array.from({length:visible},(_,i)=>{
      if(kind==='artillery')return {id:`${kind}-${i}`,kind,value:10,count:i===10?count-i:1,
        x:gunPositions[i][0],y:gunPositions[i][1],scale:.85,delay:i*55};
      const rank=Math.floor(i/files),file=i%files,members=Math.min(files,visible-rank*files);
      const y=120+(file-(members-1)/2)*spacing;
      return {id:`${kind}-${i}`,kind,value:figureValues[kind],count:1,
        x:front-rank*depth-(y-85)*.5,y,scale,rank,file,delay:rank*60+file*35};
    });
  });
}

// Replacements appear in the next battle, never by morphing figures on impact.
// Attackers always retain infantry in their next formation; this must not make
// a horse fall for a single casualty when a foot soldier can take that loss.
export function battleCasualties(troops, losses, attacking=false, casualties=null, fortificationTroops=troops) {
  if(casualties!==null){
    const dead=new Set(casualties);
    return figureMembers(attacking?attackingFigures(troops):defendingFigures(troops,fortificationTroops)).flatMap(figure=>{
      const lost=figure.units.filter(index=>dead.has(index)).length;
      return lost?[{...figure,lost,partial:lost<figure.units.length}]:[];
    });
  }
  if(attacking&&losses>0){
    const figures=attackingFigures(troops),infantry=figures.filter(f=>f.kind==='infantry');
    if(infantry.length>=losses)return infantry.slice(0,losses);
    const covering=figures.filter(f=>f.count===1&&f.value>=losses).sort((a,b)=>a.value-b.value)[0];
    if(covering)return [covering];
  }
  const counts=attacking?attackFigureCounts:figureCounts;
  const before=counts(troops),after=counts(Math.max(0,troops-losses));
  const removed=Object.fromEntries(Object.keys(before).map(kind=>[kind,Math.max(0,before[kind]-after[kind])]));
  return (attacking?attackingFigures(troops):battleFigures(troops)).flatMap(figure=>{
    const count=Math.min(figure.count,removed[figure.kind]);
    removed[figure.kind]-=count;
    return count?[{...figure,count}]:[];
  });
}

export function figureBadge(figure) {
  return figure.count>1?`<text class="figure-count" x="0" y="12" text-anchor="middle">×${figure.count}</text>`:'';
}

export function defensePosition(troops) {
  return troops<=5?'hut':troops<10?'palisade':troops<15?'castle':troops<30?'fort':troops<50?'bastion':troops<70?'stronghold':'citadel';
}

export function fortificationBanner(name, color, troops, scale=1.7) {
  if(!name||troops<1)return '';
  const position=defensePosition(troops);
  const [x,y]={hut:[441,64],palisade:[441,64],castle:[354,88],fort:[422,41],bastion:[422,35],stronghold:[422,26],citadel:[422,0]}[position];
  return `<g class="fortification-banner" fill="${color}" transform="translate(${x} ${y}) scale(${scale}) translate(-19 -13)">${playerBanner(name,'infantry')}</g>`;
}

export function defendingFigures(troops, fortificationTroops=troops) {
  const position=defensePosition(fortificationTroops);
  // Every y coordinate is a foot position on an explicit floor or platform.
  const ground=[{x:440,y:146},{x:382,y:148},{x:480,y:150},{x:342,y:151}];
  const artillery=[{x:354,y:96,scale:1.2,post:'tower'},{x:484,y:96,scale:1.2,post:'tower'},
    ...(['stronghold','citadel'].includes(position)?[{x:331,y:51,scale:.9,post:'upper-tower'},{x:495,y:51,scale:.9,post:'upper-tower'},
      ...[392,421,450].map(x=>({x,y:38,scale:.85,post:'keep'}))]:[]),
    ...[308,350,473,505].map(x=>({x,y:158,scale:1.1,post:'forecourt'}))];
  const infantry=[390,408,430,448].map(x=>({x,y:116,scale:1,post:'wall'}));
  const figures=battleFigures(troops,artillery.length);
  const used={artillery:0,cavalry:0,infantry:0};
  return figures.map((figure,figureIndex)=>{
    if((position==='hut'||position==='palisade')&&(figures.length>5||figures.some(f=>f.kind==='artillery'))){
      const slots=[...Array.from({length:8},(_,i)=>({x:302+i*29,y:160})),...Array.from({length:4},(_,i)=>({x:306+i*28,y:128}))];
      return {...figure,...slots[figureIndex],scale:1,post:'forecourt'};
    }
    if(position==='hut'||position==='palisade'){
      if(figure.kind==='cavalry')return {...figure,x:440,y:154,scale:1.15,post:'door'};
      const hasHorse=figures.some(f=>f.kind==='cavalry');
      const places=hasHorse?[ground[1],ground[2],ground[3],{x:403,y:152}]:ground;
      const index=used.infantry++;
      return {...figure,...places[index],scale:1.3,post:!hasHorse&&index===0?'door':'ground'};
    }
    const place=figure.kind==='artillery'?artillery[used.artillery++]:figure.kind==='infantry'?infantry[used.infantry++]:{x:419,y:151,scale:1.35,post:'gate'};
    return {...figure,...place};
  });
}

export function bannerBearer(figures) {
  return Math.max(0,figures.findIndex(figure=>figure.kind==='infantry'));
}

export const mountainLift=78;
export function mountainRise(x) {
  return Math.max(0,Math.min(mountainLift,(x-190)/130*mountainLift));
}

export function defenseHill() {
  return `<g class="defense-hill">
    <path d="M165 170 190 151 234 124 278 98 320 73H520V170Z" fill="#707c61" stroke="#485d4b" stroke-width="1.5"/>
    <path d="m205 170 29-46 44-26 42-25h200v25l-52-8-51 15-62-12-29 21-28-2-26 34-36 5-12 19z" fill="#92957a"/>
    <path d="m251 170 23-32 25-13 19-30 27-12 17 17-28 34-30 12-12 24zm155 0 12-50 32-24 31 4 10 37 29 15v18z" fill="#687569"/>
    <path d="m270 152 24-12 27-35m-4 48 22-23 16-31m84 33 16-23 18 4m-44 42 37-14 20 9" fill="none" stroke="#acac90" stroke-width="3"/>
    <path class="uphill-road" d="M186 159 240 139 221 137 290 111 268 111 329 87 359 81" fill="none" stroke="#c7b38b" stroke-width="10" stroke-linejoin="round"/>
    <path d="M186 155 235 137m-8-2 58-22m-9-4 51-20" fill="none" stroke="#e0c99e" stroke-width="1.5"/>
    <path d="M320 73h200" stroke="#b6ad87" stroke-width="3"/>
  </g>`;
}

// Scenery reflects the real defending army. It is visual cover, not another
// gameplay bonus. The separate foreground leaves soldiers and banners visible.
export function fortification(troops, foreground = false) {
  if(troops<1)return '';
  const position=defensePosition(troops),stone=troops>=10;
  if(foreground){
    if(position==='hut')return '<path d="M422 146h39l-3 4h-33z" fill="#645039"/>';
    return `<g class="defense-cover" fill="${stone?'#918d79':'#79583a'}" stroke="#4d5144" stroke-width="1">
      ${Array.from({length:stone?10:17},(_,i)=>{const x=stone?326+i*17:339+i*9;return stone?`<path d="M${x} 139v-7h9v7h8v13h-17z"/>`:`<path d="M${x} 149v-17l3-5 3 5v17z"/>`;}).join('')}
      <path d="M326 152h171" stroke="#353f34" stroke-width="3"/>
    </g>`;
  }
  if(!stone)return `<g data-fortification="${position}" stroke="#514636" stroke-width="1">
    <ellipse cx="440" cy="147" rx="43" ry="6" fill="#263f31" opacity=".28" stroke="none"/>
    <path d="M405 96h73v50h-73z" fill="#90714c"/><path d="M409 98v46m8-46v46m8-46v46m34-46v46m8-46v46m8-46v46" stroke="#b19062"/>
    <path d="m398 96 43-32 44 32z" fill="#b79b64"/><path d="m406 91 35-23 35 23m-57-8 22-13 22 13" fill="none" stroke="#d6bb81"/>
    <path d="M424 146v-34q16-13 32 0v34" fill="#403d2f"/><path d="M424 146h32" stroke="#c6ae7a" stroke-width="2"/><path d="M410 103h10v10h-10z" fill="#334038"/>
    ${position==='palisade'?'<path d="M354 114h43v34h-43z" fill="#7f6948"/><path d="m348 114 28-21 27 21z" fill="#a78b5d"/>':''}
  </g>`;
  const level=troops<15?1:troops<30?2:troops<50?3:troops<70?4:5;
  const wallTop=116,towerTop=96;
  return `<g data-fortification="${position}" stroke="#495346" stroke-width="1">
    ${level===5?`<g class="citadel-expansion">
      <path d="M282 157 289 90h224l7 67Z" fill="#626e59"/><path d="M293 80h220v74H293Z" fill="#818b72"/>
      ${[294,491].map(x=>`<path d="M${x} 35h28v121h-28Z" fill="#959c80"/><path d="M${x-2} 35V23h8v7h7v-7h8v7h9v-7h4v12Z" fill="#bdb899"/><path d="M${x+10} 47v14m9-14v14m-9 16v13m9-13v13" stroke="#445540" stroke-width="3"/>`).join('')}
      <path d="M374 12h98v112h-98Z" fill="#a3a58a"/><path d="M370 12V0h11v7h11V0h11v7h11V0h11v7h11V0h11v7h11V0h11v7h7v5Z" fill="#cdc3a0"/>
      <path d="M387 22v12m18-12v12m18-12v12m18-12v12m18-12v12" stroke="#4c5d45" stroke-width="4"/>
      <path d="M288 149 292 133h27v24h-31zm201-16h25l6 24h-31Z" fill="#a6a389"/>
    </g>`:''}
    <ellipse cx="415" cy="143" rx="94" ry="9" fill="#263f31" opacity=".25" stroke="none"/>
    ${level>=4?`<path d="M297 137 309 74h201l10 65-24 15H321Z" fill="#626e5b"/><path d="M317 66h191v57H317Z" fill="#848a73"/>
      ${[316,480].map(x=>`<path d="M${x} 51h30v88h-30z" fill="#93967e"/><path d="M${x-3} 51V39h9v7h8v-7h9v7h9v-7h7v12z" fill="#b7b396"/><path d="M${x+10} 63v11m10-11v11m-10 13v11m10-11v11" stroke="#3e5040" stroke-width="3"/>`).join('')}
      <path d="M377 118V38h86v80z" fill="#90967c"/><path d="M374 38V26h11v7h11v-7h11v7h11v-7h11v7h11v-7h11v7h11v-7h7v12z" fill="#c0b998"/>
      <path d="M390 50v14m18-14v14m18-14v14m18-14v14M390 78v13m18-13v13m18-13v13m18-13v13" stroke="#425541" stroke-width="4"/>
      <path d="M292 147 303 124 326 118 349 137l-8 17h-30zm194-12 18-18 16 11v26h-30z" fill="#96967a"/>`:''}
    ${level>=3?`<path d="M310 141 322 109 345 99 362 128h105l20-32 25 16 7 29-36 14H346Z" fill="#70745e"/><path d="M317 140 329 116 346 109M490 106l14 11 8 20" fill="none" stroke="#a3a28b" stroke-width="3"/>`:''}
    ${level>=2&&level<4?`<path d="M391 ${60-level*6}h62v71h-62z" fill="#969680"/><path d="M387 ${62-level*6}v-9h9v6h10v-6h10v6h10v-6h10v6h10v-6h10v9z" fill="#aaa98f"/><path d="M410 65v12m23-12v12M410 91v12m23-12v12" stroke="#39463b" stroke-width="4"/>`:''}
    <path d="M344 ${wallTop}h143v40H344z" fill="#989580"/>
    ${[334,464].map(x=>`<path d="M${x} ${towerTop}h40v55h-40z" fill="#a4a08b"/><path d="M${x-2} ${towerTop}v-8h8v5h7v-5h8v5h7v-5h8v8z" fill="#b6b096"/><path d="M${x} ${towerTop}h40" stroke="#d5c7a4" stroke-width="2"/><path d="M${x+20} ${towerTop+16}v13" stroke="#3f493c" stroke-width="4"/><path d="M${x+3} ${towerTop+34}h34m-34 11h34" stroke="#7b826d"/>`).join('')}
    <path d="M374 116h90" stroke="#d5c7a4" stroke-width="3"/>
    <path d="M398 151v-26q21-22 42 0v26" fill="#4e5140"/><path d="M402 126v25m8-29v29m8-33v33m8-29v29m8-25v25" stroke="#9c8b62"/>
    <path d="M370 ${wallTop+8}h98m-98 9h30m35 0h33m-98 10h27m39 0h32" stroke="#b8b29a"/>
    ${level>=4?'<path d="M351 111h28v25h-28zM453 111h28v25h-28z" fill="#747b65"/><path d="m357 124 12-3m-5-2 2 7M460 124l12-3m-5-2 2 7" stroke="#303e33" stroke-width="3"/>':''}
  </g>`;
}

// Capital architecture is permanent, independent of its current garrison.
export function capitalFortress(foreground=false, buildingLevel=null) {
  if(buildingLevel!==null){
    const troops=buildingArtworkTroops[buildingLevel];
    if(foreground)return fortification(troops,true);
    const [x,y]=buildingLevel<2?[441,91]:buildingLevel===2?[420,103]:[423,buildingLevel===3?63:buildingLevel===4?48:20];
    return `<g data-capital-fortress="true" data-building-level="${buildingLevel}">${fortification(troops)}<g transform="translate(${x} ${y})" stroke="#806638" stroke-width="1"><path d="M-10-7-8 2H8l2-9-6 4-4-6-4 6Z" fill="#eac569"/><path d="M-9 4H9" stroke="#eac569" stroke-width="3"/></g></g>`;
  }
  if(foreground)return fortification(70,true);
  return `<g data-capital-fortress="true">
    <g stroke="#665b43" stroke-width="1">
      <path d="M293 158 298 60h215l7 98Z" fill="#687763"/>
      ${[302,482].map(x=>`<path d="M${x} 17h25v109h-25Z" fill="#c3b891"/><path d="m${x-6} 17 18.5-28 18.5 28Z" fill="#365d60"/><path d="M${x+4} 20h17M${x+10} 34v15m0 13v15" stroke="#78623c" stroke-width="3"/><path d="M${x+12} -11v-13l18 5-18 5" fill="#dfbb62"/>`).join('')}
      <path d="M384-20h78v131h-78Z" fill="#d2c4a1"/>
      <path d="M379-20v-13h10v7h10v-7h10v7h10v-7h10v7h10v-7h10v7h10v-7h9v13Z" fill="#ead9ad"/>
      <path d="M382-16h82M390 4h65M390 25h65" stroke="#ab874a" stroke-width="3"/>
      ${[399,423,447].map(x=>`<path d="M${x-4} 18V3q4-9 8 0v15Z" fill="#45564a"/>`).join('')}
      <path d="m414-9 3-6 6 3 6-3 3 6-3 6h-12Z" fill="#dfb854"/>
    </g>
    ${fortification(70)}
    <path d="M334 98h40m90 0h40M374 118h90" stroke="#dabb74" stroke-width="3"/>
    <path d="M398 150v-25q21-22 42 0v25" fill="none" stroke="#cda859" stroke-width="3"/>
    <g fill="#e2c078" stroke="#7e6839" stroke-width=".6"><path d="M344 105h12v16l-6 6-6-6Z"/><path d="M480 105h12v16l-6 6-6-6Z"/></g>
  </g>`;
}

function battlePlacement(figure,side,mountainous){
  const x=mountainous&&side==='a'?20+(figure.x-20)*.7:figure.x;
  const scale=figure.scale*(mountainous&&side==='a'?.75:1);
  const y=figure.y-(mountainous&&side==='a'?mountainRise(x):0);
  const advance=side==='d'?0:figure.kind==='cavalry'?Math.min(100,288-x):figure.kind==='artillery'?12:32;
  return {x,y,scale,advance,climb:mountainous&&side==='a'?mountainRise(x)-mountainRise(x+advance):0,facing:side==='a'?1:-1};
}

export const cannonFlightMs=620;
export function artilleryShots(attackTroops,defenseTroops,attackerLoss,defenderLoss,mountainous=false,fortificationTroops=defenseTroops,battleId=0,unitCasualties=null){
  const armies={a:attackingFigures(attackTroops),d:defendingFigures(defenseTroops,fortificationTroops)};
  const shots=[];
  const foot=(figure,side)=>{const p=battlePlacement(figure,side,mountainous);return {x:p.x+p.advance,y:p.y+p.climb-(side==='d'&&mountainous?mountainLift:0),scale:p.scale,facing:p.facing};};
  // Seed visual scatter with the battle so all viewers see the same impacts.
  let scatter=battleId>>>0;
  const random=()=>{scatter=(scatter+0x6d2b79f5)>>>0;let n=Math.imul(scatter^(scatter>>>15),1|scatter);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
  const soldiers=Object.entries(armies).flatMap(([side,figures])=>figures.map(f=>foot(f,side)));
  const missedTarget=side=>{
    const point=x=>({x,y:156+random()*10-(mountainous?mountainRise(x):0)});
    for(let attempt=0;attempt<40;attempt++){
      const target=point(side==='a'?276+random()*230:145+random()*125);
      if(soldiers.every(p=>Math.abs(target.x-p.x)>24*p.scale || target.y<p.y-40*p.scale || target.y>p.y+12*p.scale))return target;
    }
    // Clear space beside the armies, even when their foreground is crowded.
    return side==='a'?point(276+random()*4):{x:150+random()*20,y:164+random()*2};
  };
  for(const side of ['a','d']){
    const other=side==='a'?'d':'a',guns=armies[side].filter(f=>f.kind==='artillery');
    if(!guns.length)continue;
    const casualties=battleCasualties(side==='a'?defenseTroops:attackTroops,side==='a'?defenderLoss:attackerLoss,other==='a',unitCasualties?.[other]??null,fortificationTroops);
    // Each visible cannon fires one ball per roll, regardless of losses.
    // Spare shots hit open ground, never a surviving soldier or the wrong army.
    for(let i=0;i<guns.length;i++){
      const gun=foot(guns[i],side),victim=casualties[i]&&armies[other].find(f=>f.id===casualties[i].id);
      const target=victim?foot(victim,other):missedTarget(side);
      const from={x:gun.x+gun.facing*9.5*gun.scale,y:gun.y-14.5*gun.scale};
      const to={x:target.x,y:target.y-(victim?8*target.scale:0)};
      const arc=Math.min(45,Math.abs(to.x-from.x)*.12);
      const points=Array.from({length:9},(_,j)=>{const t=j/8;return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t-4*arc*t*(1-t)};});
      shots.push({side,victim:victim?`${other}-${victim.id}`:null,from,to,ground:{x:target.x,y:target.y},points,stone:Boolean(victim&&other==='d'&&['wall','tower','upper-tower','keep'].includes(victim.post))});
    }
  }
  return shots;
}

export function artilleryEffects(shots){
  return shots.map((shot,i)=>{
    const points=shot.points.map((p,j)=>`--x${j}:${p.x.toFixed(2)}px;--y${j}:${p.y.toFixed(2)}px`).join(';');
    const dirt=shot.stone?'#b4ad95':'#9b8060';
    return `<g data-shell="${i}" ${shot.victim?`data-hit="${shot.victim}"`:''} style="--flight:${cannonFlightMs}ms">
      <g transform="translate(${shot.from.x} ${shot.from.y}) scale(${shot.side==='a'?1:-1} 1)"><path class="cannon-flash" d="M0-2 14-6 9 0 20 2 9 4 13 8 0 3Z" fill="#ffe1a0"/></g>
      <g class="cannon-projectile" style="${points}"><ellipse cx="${shot.side==='a'?-7:7}" rx="9" ry="1.1" fill="#d6b277" opacity=".4"/><circle r="3.1" fill="#202522" stroke="#b59b69" stroke-width=".6"/><circle cx="-.8" cy="-.9" r=".9" fill="#d9c6a0"/></g>
      <g transform="translate(${shot.ground.x} ${shot.ground.y})"><g class="impact-crater"><ellipse cy="1" rx="12" ry="3.8" fill="${dirt}"/><ellipse rx="8.5" ry="2.5" fill="#36352d"/><path d="m-11-1 5-2 4 1m7 1 5 2-4 1" fill="none" stroke="#c3aa80" stroke-width="1"/></g></g>
      <g transform="translate(${shot.to.x} ${shot.to.y})"><g class="shell-explosion"><circle class="blast-flash" r="15" fill="#ffbf4e"/><path class="blast-flash" d="m0-21 4 13 12-9-5 14 16 1-15 6 7 13-15-7-6 17-3-17-15 6 10-13-15-5 16-2-7-13 13 8z" fill="#ffd985"/><g class="blast-smoke" fill="#b6afa0"><circle cx="-8" cy="-4" r="9"/><circle cx="5" cy="-10" r="12"/><circle cx="14" cy="1" r="8"/></g><g class="blast-debris" fill="${dirt}">${Array.from({length:7},(_,n)=>{const a=n*Math.PI*2/7;return `<path d="m${Math.cos(a)*10} ${Math.sin(a)*10} 3-1 1 3-3 1z"/>`;}).join('')}</g></g></g>
    </g>`;
  }).join('');
}

export function battleScene(attackTroops, defenseTroops, attackColor, defenseColor, attackName='', defenseName='', mountainous=false, fortificationTroops=defenseTroops, capital=false, buildingLevel=null, construction=null, experience=null) {
  if(buildingLevel!==null)fortificationTroops=buildingArtworkTroops[buildingLevel];
  else if(capital)fortificationTroops=Math.max(70,fortificationTroops);
  const troops = (side, army, color, name, front=false) => {
    const figures=figureMembers(side==='d'?defendingFigures(army,fortificationTroops):attackingFigures(army)),bearer=bannerBearer(figures);
    return figures.map((figure, i) => {
    if(side==='d'&&(figure.post==='forecourt')!==front)return '';
    const {kind,id}=figure;
    // Assemble below the slope; the charge, rather than the initial ranks,
    // carries the attackers onto the defender's hill.
    const {x,y,scale,advance,climb,facing}=battlePlacement(figure,side,mountainous);
    return `<g transform="translate(${x} ${y})"${side==='d'?` data-post="${figure.post}"`:''}><g class="scene-advance" style="--advance:${advance}px;--climb:${climb}px;--delay:${figure.delay||0}ms">
      <g class="scene-fighter ${kind}" data-casualty="${side}-${id}" data-strength="${figure.value*figure.count}" style="--facing:${facing}">
        <g transform="scale(${facing*scale} ${scale}) translate(-12 -28)" fill="${color}">${symbols[kind]}${side==='a'&&i===bearer?playerBanner(name,kind,facing,1.7/scale,-1):''}</g>
        ${figureBadge(figure)}
        ${experienceBadges(figure,experience?.[side])}
        ${kind === 'infantry'?`<g transform="translate(${facing*21} -24) rotate(${mountainous?-20:0}) scale(${facing} 1)"><path class="muzzle-flash" d="M0 0 11-3 7 0 18 2 7 3 10 7 0 4Z" fill="#ffda83"/>${kind==='infantry'?'<path class="shot-trail" d="M14 1h52" stroke="#f9de9a" stroke-width="1.3"/>':''}<g class="gun-smoke" fill="#d8d3c0"><circle r="7"/><circle cx="8" cy="-3" r="6"/><circle cx="14" cy="1" r="4"/></g></g>`:''}
      </g>
      ${side==='a'&&i===bearer?fallenBanner(name,color):''}
      <ellipse class="march-dust" cx="0" cy="1" rx="17" ry="3" fill="#d6bd87"/>
    </g></g>`;
  }).join('');
  };
  return `<svg viewBox="0 ${mountainous?(capital?-178:-143):(capital?-100:-65)} 520 ${mountainous?(capital?348:313):(capital?270:235)}" class="battle-scene" role="img" aria-label="Truppen zu Kampfbeginn: Angriff ${attackTroops}, Verteidigung ${defenseTroops}">
    <defs><linearGradient id="battle-sky" x2="0" y2="1"><stop stop-color="#293e41"/><stop offset="1" stop-color="#899282"/></linearGradient></defs>
    <rect y="${mountainous?(capital?-178:-143):(capital?-100:-65)}" width="520" height="${mountainous?(capital?348:313):(capital?270:235)}" rx="7" fill="url(#battle-sky)"/>
    <path d="M0 58Q60 20 122 57T270 51 390 48 520 53V170H0" fill="#4d645a"/>
    <path d="M0 85Q130 58 260 79T520 72V170H0" fill="#6c7355"/>
    <path d="M0 112Q100 95 210 116T520 107V170H0" fill="#868164"/>
    <g stroke="#c2b489" opacity=".45"><path d="m34 110 2-7m4 8 3-5m68 11 1-5m117 6 3-7m129 5 2-6m77 5 3-7m7 8 2-5"/></g>
    <g class="scene-haze" fill="#ded7bc" opacity=".1"><ellipse cx="170" cy="66" rx="90" ry="12"/><ellipse cx="375" cy="56" rx="85" ry="10"/></g>
    <g class="battle-army-label"><text x="15" y="${mountainous?(capital?-160:-125):(capital?-82:-47)}">ANGRIFF · ${attackTroops}</text><text x="505" y="${mountainous?(capital?-160:-125):(capital?-82:-47)}" text-anchor="end">VERTEIDIGUNG · ${defenseTroops}</text></g>
    ${mountainous?defenseHill():''}
    <g class="defense-position" transform="translate(0 ${mountainous?-mountainLift:0})">
      ${capital?capitalFortress(false,buildingLevel):fortification(fortificationTroops)}
      ${capital&&buildingLevel===null?`<g transform="translate(0 -34)">${fortificationBanner(defenseName,defenseColor,fortificationTroops)}</g>`:fortificationBanner(defenseName,defenseColor,fortificationTroops)}
      <g class="scene-defender">${troops('d',defenseTroops,defenseColor,defenseName)}</g>
      ${capital?capitalFortress(true,buildingLevel):fortification(fortificationTroops,true)}
      ${construction&&buildingLevel!==null?buildingConstruction(buildingLevel):''}
      <g class="scene-defender">${troops('d',defenseTroops,defenseColor,defenseName,true)}</g>
    </g>
    <g class="scene-attacker">${troops('a',attackTroops,attackColor,attackName)}</g><g class="artillery-effects" aria-hidden="true"></g>
  </svg>`;
}
