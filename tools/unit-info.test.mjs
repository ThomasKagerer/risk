import './content-fixture.mjs';
import { setLanguage, localize as tr, currentLocale, serverText, localizeBoard } from '../web/i18n.mjs';
await setLanguage('de',{persist:false});
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPieces, inspectPiece, unitInfoHTML } from '../web/unit-info.mjs';
import { createFigurePlacement } from '../web/figure-placement.mjs';

const countries=[{name:'Alaska'},{name:'Ontario'}];
const game=()=>({code:'TEST',rules:'domination',round:7,players:[{name:'Ada'}],territories:[{owner:0,troops:6,experience:[0,1,3,5,0,1],unitHistory:Array.from({length:6},(_,i)=>({id:i+1,battles:8,bornRound:2,sinceRound:2}))},{owner:0,troops:0,experience:[],unitHistory:[]}]});

test('clicking a grouped figure exposes individual histories; infantry selects exactly one',()=>{
 const g=game(),group=inspectPiece(g,1,0),single=inspectPiece(g,1,1);
 assert.deepEqual(group.ids,[1,2,3,4,5]);assert.deepEqual(single.ids,[6]);
 let html=unitInfoHTML(g,{...group,unitId:4},countries);
 assert.match(html,/Einheit #4/);assert.match(html,/★ 3 \/ 3/);assert.match(html,/5 Runden · seit Runde 2/);assert.match(html,/<dt>Schlachten<\/dt><dd>8/);
 assert.equal((html.match(/<option /g)||[]).length,5);
 assert.doesNotMatch(unitInfoHTML(g,single,countries),/<select/);
 assert.equal(inspectPiece({...g,rules:'classic'},1,0),null);
});

test('unit inspection follows the same soldier after movement and reports unknown legacy age honestly',()=>{
 const g=game(),selection=inspectPiece(g,1,1);
 g.territories[1].unitHistory.push(g.territories[0].unitHistory.pop());g.territories[1].experience.push(1);
 assert.match(unitInfoHTML(g,selection,countries),/Ontario · Ada/);
 g.territories[1].unitHistory[0]={id:6,battles:2,sinceRound:5,partial:true};
 const html=unitInfoHTML(g,selection,countries);
 assert.match(html,/2 erfasst/);assert.match(html,/Unbekannt · erfasst seit Runde 5/);
 g.territories[1].unitHistory=[];
 assert.match(unitInfoHTML(g,selection,countries),/im Kampf gefallen/);
});

test('map miniature membership covers visible troops without duplicating overflow',()=>{
 for(const n of [1,6,15,29,58,200]){
  const pieces=mapPieces(n),units=pieces.flatMap(p=>p.units);
  assert.ok(pieces.length<=6);assert.equal(new Set(units).size,units.length);
  assert.deepEqual(units,Array.from({length:units.length},(_,i)=>i));
  assert.ok(units.length<=n);
 }
});

for(const success of [true,false])test(`dropped position remains stable until server ${success?'confirms':'rejects'} it`,async()=>{
 let current={code:'TEST',territories:[{positions:[{x:1,y:2}]}]},finish;
 const positions=[],send=new Promise(resolve=>finish=resolve);
 const controller=createFigurePlacement({getGame:()=>current,send:()=>send,render:()=>positions.push(controller.position(1,0)||current.territories[0].positions[0])});
 const moving=controller.move(1,0,{x:8,y:9});
 assert.deepEqual(positions,[{x:8,y:9}]);assert.deepEqual(controller.position(1,0),{x:8,y:9});
 // An unrelated snapshot may arrive while the arrange request is in flight.
 current={...current};assert.deepEqual(controller.position(1,0),{x:8,y:9});
 if(success)current.territories[0].positions[0]={x:8,y:9};
 finish(success);await moving;
 assert.deepEqual(positions,[{x:8,y:9},success?{x:8,y:9}:{x:1,y:2}]);
 assert.equal(controller.position(1,0),undefined);
});
