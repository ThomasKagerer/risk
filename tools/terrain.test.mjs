import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initTerrain, updateSettlementBanners, terrainDetail } from '../web/terrain.mjs';

const board=JSON.parse(await readFile(new URL('../web/assets/world120.json',import.meta.url)));
const data=JSON.parse(await readFile(new URL('../web/assets/terrain.json',import.meta.url)));

test('each settlement has exactly one rooftop standard and a valid game territory',()=>{
  const layer={innerHTML:'',insertAdjacentHTML(){}},defs={insertAdjacentHTML(){}};
  const svg={querySelector:s=>s==='#terrain'?layer:s==='defs'?defs:null};
  initTerrain(svg,data,board);
  assert.equal((layer.innerHTML.match(/class="settlement-banner"/g)||[]).length,data.settlements.length);
  assert.equal(data.settlements.length,99);
  for(const town of data.settlements)assert.ok(board.countries.some(c=>c.id===town.territory),town.name);
  for(const [name,country] of [['London','England'],['München','Kurfürstentum Bayern'],['Bern','Schweizer Eidgenossenschaft'],['Singapura','Singapura']]){
    const town=data.settlements.find(t=>t.name===name);
    assert.equal(board.countries.find(c=>c.id===town.territory).name,country);
  }
  assert.equal(terrainDetail(7.9),2);assert.equal(terrainDetail(8),3);
});

test('settlements use their current owner and update only when ownership or banner changes',()=>{
  let writes=0;
  const node={dataset:{territory:'44'},html:'',set innerHTML(v){this.html=v;writes++;},setAttribute(n,v){this[n]=v;}};
  const svg={querySelectorAll:()=>[node]};
  const state={players:[{name:'Ada'},{name:'Ben'},{name:'Einheimische',neutral:true}],territories:Array.from({length:120},()=>({owner:2,troops:3}))};
  const color=i=>['#b84e40','#477ca0','#414e4b'][i];
  updateSettlementBanners(svg,board,state,color);
  assert.match(node.html,/data-country-banner="Kurfürstentum Bayern"/);
  assert.equal(node.fill,'#414e4b');
  updateSettlementBanners(svg,board,state,color);assert.equal(writes,1);
  state.territories[43].owner=0;updateSettlementBanners(svg,board,state,color);
  assert.match(node.html,/>Ada<\/text>/);assert.doesNotMatch(node.html,/data-country-banner/);assert.equal(node.fill,'#b84e40');
  state.players[0].name='Ada & Co';updateSettlementBanners(svg,board,state,color);
  assert.match(node.html,/Ada &amp; Co/);
  state.territories[43].owner=1;updateSettlementBanners(svg,board,state,color);
  assert.match(node.html,/>Ben<\/text>/);assert.equal(node.fill,'#477ca0');
  updateSettlementBanners(svg,board,null,color);assert.equal(node.html,'');
});

test('forest and compiled trees stay within their tiles and all detail bounds remain finite',()=>{
  let definitions='';
  const layer={innerHTML:'',insertAdjacentHTML(){}},defs={insertAdjacentHTML(_,html){definitions=html;}};
  initTerrain({querySelector:s=>s==='#terrain'?layer:s==='defs'?defs:null},data,board);
  assert.ok(data.forestTiles.length>50);
  assert.equal((definitions.match(/id="geo-forest-/g)||[]).length,data.forestTiles.length);
  for(let i=0;i<data.forestTiles.length;i++){
    assert.equal((layer.innerHTML.match(new RegExp(`href="#geo-forest-${i}"`,'g'))||[]).length,1);
    const tile=data.forestTiles[i];
    for(const [x,y,scale] of tile.trees){
      assert.ok(x>=tile.x&&x<tile.x+tile.width);assert.ok(y>=tile.y&&y<tile.y+tile.height);assert.ok(scale===1||scale===.8);
    }
    const coords=tile.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for(let j=0;j<coords.length;j+=2){
      assert.ok(coords[j]>=tile.x-.01&&coords[j]<=tile.x+tile.width+.01);
      assert.ok(coords[j+1]>=tile.y-.01&&coords[j+1]<=tile.y+tile.height+.01);
    }
  }
  for(const [,value] of layer.innerHTML.matchAll(/data-view-bounds="([^"]+)"/g)){
    const bounds=value.split(' ').map(Number);
    assert.equal(bounds.length,4);assert.ok(bounds.every(Number.isFinite));
    assert.ok(bounds[2]>0&&bounds[3]>0);
  }
  assert.doesNotMatch(layer.innerHTML,/d="M"/);
  assert.ok(data.forestTiles.flatMap(tile=>tile.trees).length>1000);
});
