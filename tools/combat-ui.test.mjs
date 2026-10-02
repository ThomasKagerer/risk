import test from 'node:test';
import assert from 'node:assert/strict';
import { maxDefenseDice, selectedDice, botController, attackRollRevealed, waitForDice } from '../web/combat-ui.mjs';

test('every new roll defaults to its maximum, while a manual choice survives rerenders', () => {
  assert.equal(selectedDice('', 'attack:1:2', 3, 1), 3);
  assert.equal(selectedDice('attack:1:2', 'attack:1:2', 3, 1), 1);
  assert.equal(selectedDice('attack:1:2', 'attack:1:3', 3, 1), 3);
  assert.equal(selectedDice('defend:17', 'defend:18', 3, 1), 3);
  assert.equal(selectedDice('defend:18', 'defend:18', 2, 3), 2);
  assert.equal(selectedDice('small-army', 'large-army', 3, 1), 3);
});

test('mountain defense bonus respects the surviving army', () => {
  assert.equal(maxDefenseDice({}, 5), 2);
  assert.equal(maxDefenseDice({mountainous:true}, 5), 3);
  assert.equal(maxDefenseDice({mountainous:true}, 2), 2);
  assert.equal(maxDefenseDice({mountainous:true}, 1), 1);
});

test('custom names do not hide the configured controller', () => {
  assert.equal(botController({name:'Timo',bot:'local'}).label,'Lokale KI');
  assert.equal(botController({name:'Timo',bot:'annoying'}).label,'Störenfried');
  assert.match(botController({bot:'annoying'}).detail,/Klaus Störtebeker/);
  assert.equal(botController({name:'Timo'}),null);
});

test('a new attack stays hidden until its own roll has settled', () => {
  const game={phase:'defend',pending:{id:12,attack:[6,4,2]}};
  assert.equal(attackRollRevealed(game,11),false);
  assert.equal(attackRollRevealed(game,12),true);
  assert.equal(attackRollRevealed({...game,phase:'attack'},12),false);
});

test('dice reveal waits for every staggered animation, tolerating cancellation', async () => {
  let finishFirst,finishLast,cancelMiddle,done=false;
  const root={getAnimations:()=>[
    {animationName:'tumble',finished:new Promise(r=>finishFirst=r)},
    {animationName:'tumble',finished:new Promise((r,j)=>cancelMiddle=j)},
    {animationName:'tumble',finished:new Promise(r=>finishLast=r)},
    {animationName:'unrelated',finished:new Promise(()=>{})},
  ]};
  const waiting=waitForDice(root,false).then(()=>done=true);
  finishFirst();cancelMiddle(new Error('cancelled'));
  await Promise.resolve();await Promise.resolve();
  assert.equal(done,false);
  finishLast();await waiting;
  assert.equal(done,true);
  await waitForDice({getAnimations:()=>{throw new Error('motion should be skipped');}},true);
});

test('capital dice include one extra die, cap at four and replace mountain bonus',()=>{
  for(const mountainous of [false,true])for(const [troops,dice] of [[0,0],[1,2],[2,3],[3,4],[99,4]]){
    assert.equal(maxDefenseDice({mountainous},troops,true),dice);
  }
});
