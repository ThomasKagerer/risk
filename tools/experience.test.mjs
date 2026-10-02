import test from 'node:test';
import assert from 'node:assert/strict';
import { unitStars, armyExperience, maxAttackDice, figureMembers, experienceBadges } from '../web/experience.mjs';
import { attackingFigures, defendingFigures, battleCasualties, battleScene, artilleryShots } from '../web/figures.mjs';
import { rulesHTML } from '../web/rules.mjs';

test('stars and strict half-star thresholds include zero-experience recruits',()=>{
  assert.deepEqual([0,1,2,3,4,5,8].map(unitStars),[0,1,1,2,2,3,3]);
  for(const [experience,average,bonus] of [
    [[],0,0],[[1,1,1,1],.5,0],[[1,1,1,1,1],.625,1],
    [[3,3,3,3,1,1,1,1],1.5,1],[[3,3,3,3,3,1,1,1],1.625,2],
    [[5,5,5,5,3,3,3,3],2.5,2],[[5,5,5,5,5,3,3,3],2.625,3],
  ]){
    const army={troops:8,experience};
    assert.deepEqual(armyExperience(army),{average,bonus});
    assert.equal(maxAttackDice(army,'domination'),3+bonus);
    assert.equal(maxAttackDice(army,'classic'),3);
    assert.equal(maxAttackDice(army),3);
  }
  assert.equal(maxAttackDice({troops:3,experience:[5,5,5]},'domination'),2);
  assert.equal(maxAttackDice({troops:1,experience:[5]},'domination'),0);
});

test('every actual troop maps to exactly one displayed figure including large garrisons',()=>{
  for(const size of [1,8,13,55,150,501])for(const figures of [attackingFigures(size),defendingFigures(size,1),defendingFigures(size,70)]){
    const units=figureMembers(figures).flatMap(f=>f.units);
    assert.deepEqual(units,Array.from({length:size},(_,i)=>i));
  }
});

test('numbered yellow stars identify exact experience groups without giving recruits veteran ranks',()=>{
  const figure={units:[0,1,2,3,4]};
  const html=experienceBadges(figure,[0,1,3,5,5]);
  assert.match(html,/data-stars="1" data-units="1"/);
  assert.match(html,/data-stars="2" data-units="1"/);
  assert.match(html,/data-stars="3" data-units="2"/);
  assert.match(html,/fill="#ffda43"/);
  assert.match(html,/davon 1 ohne Sterne/);
  assert.equal(experienceBadges(figure,[]),'');
  const trained=battleScene(4,3,'red','blue','','',false,3,false,0,null,{a:[0,1,3,5],d:[1,3,5]});
  assert.equal((trained.match(/class="unit-experience"/g)||[]).length,6);
  assert.doesNotMatch(battleScene(4,3,'red','blue'),/class="unit-experience"/);
});

test('actual selected victims determine falls, partial group losses and cannon impacts',()=>{
  const infantry=battleCasualties(4,1,true,[3]);
  assert.equal(infantry[0].id,'infantry-3');
  assert.equal(infantry[0].partial,false);
  const group=battleCasualties(10,1,false,[7],1);
  assert.equal(group[0].id,'artillery-0');
  assert.equal(group[0].partial,true);
  assert.equal(group[0].lost,1);
  const shots=artilleryShots(21,4,0,1,false,1,1,{a:[],d:[3]});
  assert.ok(shots.some(shot=>shot.victim==='d-infantry-3'));
  assert.ok(shots.every(shot=>!shot.victim||shot.victim==='d-infantry-3'));
  assert.deepEqual(battleCasualties(4,0,false,[]),[]);
});

test('rules explain survival until the owner turn and restrict experience to domination',()=>{
  const domination=rulesHTML({rules:'domination'});
  assert.match(domination,/bis zum Beginn des nächsten Zugs ihres Spielers überlebt/);
  assert.match(domination,/mehr als 0,5 \/ 1,5 \/ 2,5/);
  assert.doesNotMatch(rulesHTML({rules:'classic'}),/Erfahrung und Sterne|plus Erfahrungsbonus/);
  assert.doesNotMatch(rulesHTML({}),/Erfahrung und Sterne|plus Erfahrungsbonus/);
});
