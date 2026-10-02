import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingNames, buildingInfo, buildingDescription, mapBuilding, buildingArtworkTroops, buildingUpgradeDuration, constructionDuration, nextBuildingStage } from '../web/buildings.mjs';
import { buildingPanel, buildingPortrait } from '../web/building-panel.mjs';
import { maxDefenseDice, attackRollRevealed } from '../web/combat-ui.mjs';
import { automaticDefenseDice } from '../web/auto-combat.mjs';
import { battleScene, defendingFigures, capitalFortress } from '../web/figures.mjs';
import { startScreenMarkup } from '../web/start-screen.mjs';
import { rulesHTML } from '../web/rules.mjs';

test('explicit rules constrain dice independently of terrain, army size and capital ornamentation',()=>{
 for(let level=0;level<=5;level++)for(const troops of [1,2,3,6,8,12,100]){
  assert.equal(maxDefenseDice({mountainous:true},troops,true,'classic',level),Math.min(2,troops));
  assert.equal(maxDefenseDice({mountainous:true},troops,true,'domination',level),Math.min(2+level,troops));
 }
 const classic={phase:'defend',rules:'classic',pending:{id:99}};
 assert.equal(attackRollRevealed(classic,0),true);
 assert.equal(automaticDefenseDice({},10,undefined,false,'classic'),2);
 assert.equal(automaticDefenseDice({},10,[1,1,1],true,'domination',5),7);
});

test('veteran defense uses strict averages and adds its bonus to completed buildings only',()=>{
 for(const [experience,bonus] of [[[],0],[[1,1,1,1],0],[[1,1,1,1,1],1],[[3,3,3,3,1,1,1,1],1],[[3,3,3,3,3,1,1,1],2],[[5,5,5,5,3,3,3,3],2],[[5,5,5,5,5,3,3,3],3]]){
  for(let level=0;level<=5;level++){
   assert.equal(maxDefenseDice({},8,false,'domination',level,experience),Math.min(8,2+level+bonus));
   assert.equal(maxDefenseDice({},8,false,'classic',level,experience),2);
   assert.equal(maxDefenseDice({},8,false,'',level,experience),2);
  }
 }
 const t={owner:0,troops:12,buildingLevel:5,experience:Array(12).fill(5)},game={rules:'domination',me:0,territories:[t]};
 assert.equal(maxDefenseDice({},12,false,'domination',5,t.experience),10);
 assert.match(buildingDescription(t),/10 von 10 Verteidigungswürfeln · \+3 durch Erfahrung/);
 assert.match(buildingInfo(game,1),/10 \/ 10 Würfel · \+3 Erfahrung/);
 assert.match(buildingPanel(game,1,5),/10 \/ 10 Würfel besetzt · 12 Einheiten · \+3 durch Erfahrung/);
});

test('building controls use one card per stage, 2–6 turns, preserve a garrison and show current versus unfinished slots',()=>{
 for(let level=0;level<5;level++){
  const t={owner:0,troops:20,buildingLevel:level};
  const game={rules:'domination',phase:'attack',me:0,actor:0,hand:[0,1,2,3,4],territories:[t]};
  assert.match(buildingInfo(game,1),/data-open-building="1"/);
  assert.match(buildingPanel(game,1,level+1),/1 Karte/);
  assert.match(buildingPanel(game,1,level+1),new RegExp(`${level+2} eigene Runden`));
  game.hand=[];assert.match(buildingPanel(game,1,level+1),/id="building-confirm" disabled/);
  t.construction={level:level+1,remaining:level+2};
  assert.doesNotMatch(buildingPanel(game,1,level+1),/id="building-confirm"/);
  assert.match(buildingDescription(t),new RegExp(`${buildingNames[level+1]} im Bau`));
  assert.match(mapBuilding(t),/map-scaffold/);
  assert.match(mapBuilding(t),/construction-crane/);
  assert.match(buildingPanel(game,1,level),/construction-crane/);
  assert.match(battleScene(20,20,'red','blue','A','B',false,20,false,level,t.construction),/construction-crane/);
  t.construction=null;assert.doesNotMatch(mapBuilding(t),/map-scaffold/);
  assert.doesNotMatch(buildingPanel(game,1,level),/construction-crane/);
  assert.doesNotMatch(battleScene(20,20,'red','blue','A','B',false,20,false,level),/construction-crane/);
 }
});

test('each built stage has distinct map art and capitals keep their actual tier',()=>{
 const maps=new Set(buildingNames.map((_,buildingLevel)=>mapBuilding({buildingLevel,troops:100})));
 assert.equal(maps.size,6);
 for(let level=0;level<=5;level++){
  const scene=battleScene(20,100,'red','blue','A','B',false,100,true,level);
  assert.match(scene,new RegExp(`data-building-level="${level}"`));
  assert.doesNotMatch(scene,/NaN|undefined/);
  assert.equal(scene.includes('data-fortification="citadel"'),level===5);
  for(const troops of [1,5,6,9,10,20,99,1000]){
   const figures=defendingFigures(troops,buildingArtworkTroops[level]);
   assert.ok(figures.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)&&f.y<=170));
   assert.equal(new Set(figures.map(f=>`${f.x}:${f.y}`)).size,figures.length);
  }
 }
 assert.match(capitalFortress(false,1),/data-fortification="palisade"/);
});

test('create screen and rulebook present separate modes and the agreed construction costs',()=>{
 const html=startScreenMarkup({mapPicker:'',description:'',name:'',email:'',lastRoom:'',code:''});
 assert.match(html,/<option value="classic">Klassisch/);assert.match(html,/id="game-rules"><option value="domination">/);
 const dom=rulesHTML({rules:'domination'}),classic=rulesHTML({rules:'classic'});
 assert.match(dom,/<td>Palisade<\/td><td>1 \/ 2<\/td>/);
 assert.match(dom,/<td>Zitadelle<\/td><td>1 \/ 6<\/td><td>7<\/td>/);
 assert.match(classic,/42 Länder/);assert.doesNotMatch(classic,/im Bau|Einheimische wachsen/);
});


test('all target stages sum costs, keep the current defense and never offer downgrades',()=>{
 for(let current=0;current<=5;current++)for(let target=current;target<=5;target++){
  const t={owner:0,troops:50,buildingLevel:current};
  const g={rules:'domination',phase:'attack',me:0,actor:0,hand:[0,1,2,3,4],territories:[t],code:'TESTAA',revision:1};
  const cost=Array.from({length:target-current},(_,i)=>current+i+2).reduce((a,b)=>a+b,0);
  assert.equal(buildingUpgradeDuration(current,target),cost);
  const html=buildingPanel(g,1,target);
  assert.match(html,new RegExp(`Aktuell: ${buildingNames[current]}`));
  for(let lower=0;lower<current;lower++)assert.doesNotMatch(html,new RegExp(`<option value="${lower}"`));
  if(target>current){
   assert.match(html,new RegExp(`${target-current} Karte`));assert.match(html,new RegExp(`${cost} eigene Runden`));
   assert.match(html,/Jede fertige Stufe verbessert sofort den Schutz/);
   assert.match(html,new RegExp(`nach ${cost} eigenen Runden · ${target+2} Würfelplätze`));
   assert.doesNotMatch(html,/id="building-confirm" disabled/);
   g.hand=[];assert.match(buildingPanel(g,1,target),/id="building-confirm" disabled/);
   g.hand=[0,1,2,3,4];assert.doesNotMatch(buildingPanel(g,1,target),/id="building-confirm" disabled/);
  }else assert.match(html,/id="building-confirm" disabled/);
  assert.doesNotMatch(buildingPortrait(target),/NaN|undefined/);
 }
 assert.equal(buildingUpgradeDuration(0,5),20);
 const t={owner:0,troops:40,buildingLevel:2,construction:{level:5,duration:20,remaining:12}};
 const g={rules:'domination',phase:'attack',me:0,actor:0,hand:[0,1,2,3,4],territories:[t]};
 assert.match(buildingInfo(g,1),/value="8" max="20"/);
 assert.doesNotMatch(buildingPanel(g,1,5),/id="building-confirm"/);
 assert.match(buildingPanel(g,1,5),/Festung in 1 eigener Runde/);
 assert.deepEqual(nextBuildingStage(t),{level:3,remaining:1});
 assert.equal(constructionDuration({buildingLevel:3,construction:{level:4,remaining:3}}),5,'old saves need no duration field');
 t.construction=null;
 for(const change of [{paused:true},{actor:1},{phase:'defend'},{phase:'setup'}])assert.match(buildingPanel({...g,...change},1,5),/id="building-confirm" disabled/);
 assert.doesNotMatch(buildingPanel({...g,me:1},1,5),/building-target|building-confirm|Vorschau:|building-quote/);
});
