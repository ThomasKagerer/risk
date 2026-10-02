import { playerBanner } from './figures.mjs';
import { countryBanner } from './country-banners.mjs';

// Every location comes from the compiled geographical layer. Zoom only changes
// visibility; these nodes, paths and symbols survive every camera movement.
export function initTerrain(svg, data, board) {
  svg.querySelector('#geo-defs')?.remove();
  const layer=svg.querySelector('#terrain');
  if(!data)return;
  svg.querySelector('defs').insertAdjacentHTML('beforeend',`<g id="geo-defs">
    <g id="geo-mountain"><path d="M-1.5 1 0-1.8 1.5 1Z" fill="#777968" fill-opacity=".23" stroke="#70745f" stroke-width=".12"/><path d="m-.55-.8.55-1 .55 1L0-1.05Z" fill="#fff8df"/></g>
    <g id="geo-house"><path d="M-.55 0 .35-.2 .8.15.8.85-.05 1.1-.55.75Z" fill="#efe1bc" stroke="#746f59" stroke-width=".08"/><path d="M-.7.02-.1-.65.98.02.4.25Z" fill="#a46b53" stroke="#79513e" stroke-width=".08"/><path d="M.4.25.8.15V.85L.4.96Z" fill="#c6b18b"/><path d="M-.05 1.1V.58L.2.52V1.02" fill="#655f4e"/></g>
    <g id="geo-hall"><use href="#geo-house" transform="scale(1.6)"/><path d="M-.38-.55V-1.3L-.1-1.6.18-1.3V-.38" fill="#c6b18b" stroke="#746f59" stroke-width=".08"/></g>
    ${data.forestTiles.map((tile,i)=>`<path id="geo-forest-${i}" d="${tile.path}"/>`).join('')}
  </g>`);
  const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const used=new Set(),mountainTiles=new Map();
  for(const range of data.mountains)for(const [x,y] of range.points){
    const key=`${Math.round(x/2)}:${Math.round(y/2)}`;
    if(used.has(key))continue;used.add(key);
    const tx=Math.floor(x/40)*40,ty=Math.floor(y/40)*40,cell=`${tx}:${ty}`;
    if(!mountainTiles.has(cell))mountainTiles.set(cell,{x:tx,y:ty,markup:[]});
    mountainTiles.get(cell).markup.push(`<use href="#geo-mountain" transform="translate(${x} ${y})"><title>${escape(range.name)}</title></use>`);
  }
  const mountains=[...mountainTiles.values()].map(tile=>`<g data-view-bounds="${tile.x-2} ${tile.y-2} 44 44">${tile.markup.join('')}</g>`).join('');
  const forests=data.forestTiles.map((tile,i)=>`<g data-view-bounds="${tile.x} ${tile.y} ${tile.width} ${tile.height}"><use href="#geo-forest-${i}"/></g>`).join('');
  const trees=data.forestTiles.filter(tile=>tile.trees.length).map(tile=>{
    const trunks=[],crowns=[],shade=[],n=v=>Number(v.toFixed(2));
    for(const [x,y,s] of tile.trees){
      trunks.push(`M${x} ${n(y+.65*s)}v${n(.7*s)}`);
      crowns.push(`M${n(x-s)} ${n(y+.7*s)}L${x} ${n(y-1.3*s)}L${n(x+s)} ${n(y+.7*s)}Z`);
      shade.push(`M${x} ${n(y-1.3*s)}V${n(y+.7*s)}H${n(x+s)}Z`);
    }
    return `<g data-view-bounds="${tile.x-2} ${tile.y-2} ${tile.width+4} ${tile.height+4}"><path d="${trunks.join('')}" fill="none" stroke="#536e45" stroke-width=".16"/><path d="${crowns.join('')}" fill="#668655" stroke="#446c46" stroke-width=".1"/><path d="${shade.join('')}" fill="#355f45" opacity=".35"/></g>`;
  }).join('');
  layer.innerHTML=`<g>
      <g class="geo-landscape"><g class="forest-zone">${forests}</g><g class="geo-mountains">${mountains}</g>
      <g class="geo-rivers">${data.rivers.filter(r=>/\d/.test(r.path)).map(r=>`<path data-view-bounds="${pathBounds(r.path).join(' ')}" d="${r.path}"><title>${escape(r.name)}</title></path>`).join('')}</g></g>
      <g class="geo-trees">${trees}</g>
      <g class="geo-houses">${data.settlements.map(t=>{
        const {x,y}=t;
        return `<g class="settlement" data-view-bounds="${x-8} ${y-6} 16 10" transform="translate(${x} ${y})"><title>${escape(t.name)}</title><use href="#geo-hall"/><use href="#geo-house" x="-1.9" y=".8"/><use href="#geo-house" x="1.8" y=".6"/><use href="#geo-house" x="-.9" y="2.3"/><use href="#geo-house" x="1.4" y="2.1"/><g class="settlement-banner" data-territory="${t.territory}" transform="translate(-.1 -1.6) scale(.065) translate(-19 -16.5)"></g><text y="-3.8">${escape(t.name)}</text></g>`;
      }).join('')}</g>
    </g>`;
}

// Compiled river paths use absolute M/L pairs. Calculate their bounds once,
// never with a layout-dependent getBBox() during camera movement.
function pathBounds(path) {
  const values=path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(let i=0;i<values.length;i+=2){left=Math.min(left,values[i]);right=Math.max(right,values[i]);top=Math.min(top,values[i+1]);bottom=Math.max(bottom,values[i+1]);}
  return [left-.3,top-.3,right-left+.6,bottom-top+.6];
}

export function terrainViewportItems(svg) {
  return [...svg.querySelectorAll('[data-view-bounds]')].map(node=>({node,bounds:node.dataset.viewBounds.split(' ').map(Number)}));
}

export function updateSettlementBanners(svg, board, state, colorForOwner) {
  for(const node of svg.querySelectorAll('.settlement-banner')){
    const id=Number(node.dataset.territory),territory=state?.territories[id-1];
    const owner=territory&&state.players[territory.owner];
    const country=board.countries.find(c=>c.id===id);
    const banner=owner&&country?(owner.neutral?countryBanner(country):owner.name):'';
    const color=owner?colorForOwner(territory.owner):'';
    const key=JSON.stringify([banner,color]);
    if(node.dataset.bannerKey===key)continue;
    node.dataset.bannerKey=key;
    node.innerHTML=banner?playerBanner(banner,'infantry'):'';
    node.setAttribute('fill',color||'none');
  }
}

export function terrainDetail(zoom) {
  return zoom>=8?3:zoom>=4?2:zoom>=1.8?1:0;
}
