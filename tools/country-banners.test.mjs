import { mapPieces } from '../web/unit-info.mjs';
import { experienceBadges } from '../web/experience.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { countryBanner, countryBannerMotif } from '../web/country-banners.mjs';
import { playerBanner, battleScene, fallenBanner } from '../web/figures.mjs';

test('every territory on both boards has its own named banner and a documented motif or honest fallback',async()=>{
  for(const file of ['world120','board']){
    const board=JSON.parse(await readFile(new URL(`../web/assets/${file}.json`,import.meta.url)));
    for(const country of board.countries){
      const banner=countryBanner(country);
      assert.equal(banner.name,country.name);
      assert.ok(banner.description);
      assert.equal(Boolean(countryBannerMotif(banner.motif)),banner.motif!=='regional');
      assert.match(playerBanner(banner,'infantry'),/data-country-banner=/);
    }
  }
});

test('historical affiliations and broad regions never silently turn into modern national flags',()=>{
  for(const [name,motif] of [['Finnland','sweden'],['Norwegen','denmark'],['Großbritannien','union1606'],['Japan','tokugawa'],['Kurfürstentum Bayern','bavaria'],['China','regional'],['Inuit-Lande','regional'],['Nordeuropa','regional']]){
    assert.equal(countryBanner({name,id:1}).motif,motif);
  }
  assert.equal(countryBannerMotif('__proto__'),'');
  const html=playerBanner(countryBanner({name:'<Land "A"> & B'}),'cavalry',-1);
  assert.doesNotMatch(html,/<Land/);
  assert.match(html,/&lt;Land &quot;A&quot;&gt; &amp; B/);
  assert.match(html,/scale\(-1 1\)/);
});

test('each neutral map army gets a country banner while human players still use one strongest army',async()=>{
  const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  const countries=[{id:1,name:'England'},{id:2,name:'Schottland'},{id:3,name:'Polen'},{id:4,name:'Böhmen'}];
  const state={phase:'attack',me:0,players:[{name:'Ada'},{name:'Einheimische',neutral:true}],territories:[{owner:1,troops:8},{owner:1,troops:2},{owner:0,troops:16},{owner:0,troops:3}]};
  let appearance=[];
  const c=vm.createContext({mapPieces,experienceBadges,figurePlacement:{signature:()=>''},state,bannerCountries:new Map(),playerBanner,countryBanner,displayColor:()=> '#536051',escapeHTML:s=>s,piecePosition:()=>({x:0,y:0}),pieceTransform:()=>'',
    armies:{update(territories,color,banner){appearance=territories.map((t,i)=>banner(t,countries[i]));}}});
  vm.runInContext(source.slice(source.indexOf('function armyMarkup('),source.indexOf('const pieceFrame='))+source.slice(source.indexOf('function renderUnits()'),source.indexOf('function updateZoomDetails()')),c);
  c.renderUnits();
  for(let i=0;i<2;i++)assert.equal((c.armyMarkup(state.territories[i],countries[i]).match(/data-country-banner=/g)||[]).length,1);
  assert.match(c.armyMarkup(state.territories[2],countries[2]),/>Ada<\/text>/);
  assert.doesNotMatch(c.armyMarkup(state.territories[3],countries[3]),/player-banner/);
  const before=appearance[0];
  state.territories[0]={owner:0,troops:20};c.renderUnits();
  assert.notEqual(appearance[0],before);
  assert.doesNotMatch(c.armyMarkup(state.territories[0],countries[0]),/data-country-banner=/);
  assert.match(c.armyMarkup(state.territories[0],countries[0]),/>Ada<\/text>/);
});

test('neutral defenders fly exactly one country banner on cover at every size, with unchanged strength',()=>{
  for(const n of [1,5,9,10,15,30,50,70,75])for(const mountain of [false,true]){
    const scene=battleScene(28,n,'red','green','Ada',countryBanner({name:'Finnland'}),mountain);
    assert.equal((scene.match(/data-country-banner=/g)||[]).length,1);
    assert.match(scene,/<g class="fortification-banner"[\s\S]*data-country-banner="Finnland"/);
    const strength=[...scene.matchAll(/data-strength="(\d+)"/g)].reduce((sum,m)=>sum+Number(m[1]),0);
    assert.equal(strength,28+n);
  }
});

test('fallen standard is separate from the rotating soldier and has no waving cloth or ghost hand',()=>{
  const dropped=fallenBanner('Ada','red');
  assert.match(dropped,/class="fallen-standard"/);
  assert.doesNotMatch(dropped,/banner-cloth|player-banner|#d2a77f|animation/);
  assert.equal(fallenBanner('','red'),'');
  const scene=battleScene(28,3,'red','blue','Ada','Ben');
  assert.equal((scene.match(/class="fallen-standard"/g)||[]).length,1);
  assert.match(scene,/<\/g>\s*<g class="fallen-standard"/);
});
