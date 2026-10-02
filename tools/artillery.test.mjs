import test from 'node:test';
import assert from 'node:assert/strict';
import { artilleryShots,artilleryEffects,attackingFigures,defendingFigures,battleCasualties,battleScene,mountainLift,mountainRise } from '../web/figures.mjs';

test('each visible cannon fires exactly one ball per roll even with several casualties',()=>{
 for(const mountain of [false,true])for(const [a,d] of [[11,12],[26,12],[47,23],[80,75],[5000,3000]])for(const [al,dl] of [[0,0],[1,2],[2,1],[3,3]]){
  const shots=artilleryShots(a,d,al,dl,mountain);
  for(const [side,figures] of [['a',attackingFigures(a)],['d',defendingFigures(d)]]){
   const fired=shots.filter(s=>s.side===side);
   assert.equal(fired.length,figures.filter(f=>f.kind==='artillery').length);
   assert.equal(new Set(fired.map(s=>`${s.from.x},${s.from.y}`)).size,fired.length,'no cannon fires twice');
  }
  assert.equal((artilleryEffects(shots).match(/class="cannon-projectile"/g)||[]).length,shots.length);
 }
 assert.equal(battleCasualties(12,2).length,2,'regression scenario has two separate casualties');
 assert.equal(artilleryShots(26,12,0,2).filter(s=>s.side==='a').length,1);
});

test('misses scatter across rolls but are repeatable for every viewer of the same battle',()=>{
 for(const mountain of [false,true]){
  const impacts=new Set();
  for(let id=1;id<=30;id++){
   const shots=artilleryShots(80,75,0,0,mountain,75,id);
   assert.deepEqual(shots,artilleryShots(80,75,0,0,mountain,75,id));
   for(const s of shots){
    assert.equal(s.victim,null);
    assert(s.to.x>=145&&s.to.x<=506);
    const groundY=s.to.y+(mountain?mountainRise(s.to.x):0);
    assert(groundY>=156&&groundY<=166,'misses stay on the ground');
    const location=`${s.to.x.toFixed(2)},${s.to.y.toFixed(2)}`;
    assert(!impacts.has(location),'each impact has its own position');impacts.add(location);
   }
  }
  const hits=id=>artilleryShots(47,23,1,1,mountain,23,id).filter(s=>s.victim);
  assert.deepEqual(hits(1),hits(2),'scatter never moves actual hits');
 }
});
test('artillery targets only the correct actual casualties and misses spare all survivors',()=>{
 for(const mountain of [false,true])for(const [a,d,al,dl] of [[47,23,1,2],[80,75,2,1],[26,1,0,1],[3,70,1,0],[5000,3000,3,0]]) {
  const shots=artilleryShots(a,d,al,dl,mountain,d);
  const allowed=new Set([...battleCasualties(a,al,true).map(f=>'a-'+f.id),...battleCasualties(d,dl,false).map(f=>'d-'+f.id)]);
  assert(shots.length<40,'huge armies still have bounded effects');
  for(const shot of shots){
   if(shot.victim){assert(allowed.has(shot.victim));assert(shot.victim.startsWith(shot.side==='a'?'d-':'a-'));}
   assert.deepEqual(shot.points[0],shot.from);assert(Math.abs(shot.points.at(-1).x-shot.to.x)<1e-9&&Math.abs(shot.points.at(-1).y-shot.to.y)<1e-9);
   assert(shot.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
   assert(shot.ground.y>=shot.to.y);
  }
 }
 assert.equal(artilleryShots(9,3,1,1).length,0);
 assert(artilleryShots(47,23,0,0).every(s=>s.victim===null));
});
test('mountain defensive artillery and its targets use the same raised foot coordinates as the scene',()=>{
 const flat=artilleryShots(47,23,1,1,false),hill=artilleryShots(47,23,1,1,true);
 const flatGun=flat.find(s=>s.side==='d'),hillGun=hill.find(s=>s.side==='d');
 assert.equal(flatGun.from.y-hillGun.from.y,mountainLift);
 const flatHit=flat.find(s=>s.side==='a'&&s.victim),hillHit=hill.find(s=>s.side==='a'&&s.victim);
 assert.equal(flatHit.to.y-hillHit.to.y,mountainLift);
 const effects=artilleryEffects(hill);
 assert.match(effects,/impact-crater/);assert.match(effects,/data-hit="d-/);assert.match(effects,/--flight:620ms/);assert.doesNotMatch(effects,/filter=/);
});
test('attacker cloth extends left with readable text, defender stays right',()=>{
 const scene=battleScene(26,23,'red','blue','Ada','Ben');
 const attacker=scene.slice(scene.indexOf('class="scene-attacker"'));
 assert.match(attacker,/translate\(-48 0\)/);assert.match(attacker,/M48 0H0l3 5-3 5h48Z/);
 assert.match(scene,/M0 0H48l-3 5 3 5H0Z/);
});
