import './content-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticDefenseDice, createAutoCombat } from '../web/auto-combat.mjs';

function harness() {
  let game = {code:'TEST',round:2,revision:10,turn:0,actor:0,me:0,phase:'attack',territories:[{owner:0,troops:9},{owner:1,troops:10}]};
  let ready = true, responder = async () => true;
  const tasks = new Map(), calls = [], messages = [];
  let sequence = 0;
  const controller = createAutoCombat({
    getState:()=>game, country:id=>({id,neighbors:[id===1?2:1]}), canAct:()=>ready,
    act:async(type,data)=>{calls.push({type,...data});return responder();},
    onChange(){},onStop:message=>messages.push(message),
    schedule:fn=>{tasks.set(++sequence,fn);return sequence;},cancel:id=>tasks.delete(id),
  });
  return {controller,calls,messages,tasks,get game(){return game;},set game(value){game=value;},
    set ready(value){ready=value;},set responder(value){responder=value;},
    async tick(){const next=tasks.entries().next().value;assert.ok(next,'a next tick is scheduled');tasks.delete(next[0]);await next[1]();},
    update(values){game={...game,revision:game.revision+1,...values};},
  };
}

test('normal defense uses two dice except for two fives/sixes, regardless of attack ordering',()=>{
  for (const roll of [[6,4],[5],[4,4,4],[6,4,3]]) assert.equal(automaticDefenseDice({},8,roll),2);
  for (const roll of [[5,5],[6,5],[6,6],[5,1,6]]) assert.equal(automaticDefenseDice({},8,roll),1);
  assert.equal(automaticDefenseDice({},1,[6,6,6]),1);
});

test('mountain defense scales to three dice and reduces only for three high attack dice',()=>{
  for (const roll of [[5,5],[6,6],[6,5,4],[6],[4,6,6]]) assert.equal(automaticDefenseDice({mountainous:true},8,roll),3);
  for (const roll of [[5,5,5],[6,5,6],[6,6,6]]) assert.equal(automaticDefenseDice({mountainous:true},8,roll),2);
  assert.equal(automaticDefenseDice({mountainous:true},2,[5,5,4]),1);
  assert.equal(automaticDefenseDice({mountainous:true},2,[6,4,3]),2);
  assert.equal(automaticDefenseDice({mountainous:true},1,[6,6,6]),1);
});

test('attack continues despite losses with maximum dice until the last legal attack',async()=>{
  const h=harness();assert.ok(h.controller.start('attack',1,2));
  for(const troops of [9,7,5,3,2]){
    h.update({territories:[{owner:0,troops},{owner:1,troops:10}]});
    await h.tick();
    assert.deepEqual(h.calls.at(-1),{type:'attack',from:1,to:2,dice:Math.min(3,troops-1)});
  }
  h.update({territories:[{owner:0,troops:1},{owner:1,troops:10}]});await h.tick();
  assert.equal(h.calls.length,5);assert.equal(h.controller.active,null);assert.equal(h.tasks.size,0);
});

test('stop works during animation and cancels scheduled rolls immediately',async()=>{
  const h=harness();h.controller.start('attack',1,2);
  h.ready=false;await h.tick();assert.equal(h.calls.length,0);
  h.controller.stop();h.ready=true;
  assert.equal(h.tasks.size,0);assert.equal(h.controller.active,null);
});

test('stopping with a request in flight cannot enqueue another attack',async()=>{
  const h=harness();let finish;
  h.responder=()=>new Promise(resolve=>finish=resolve);
  h.controller.start('attack',1,2);const pending=h.tick();
  h.controller.stop();finish(true);await pending;
  assert.equal(h.calls.length,1);assert.equal(h.tasks.size,0);
});

test('no duplicate requests for the same revision and no rolls during defense or animation',async()=>{
  const h=harness();h.controller.start('attack',1,2);
  await h.tick();await h.tick();assert.equal(h.calls.length,1);
  h.update({phase:'defend',actor:1,pending:{from:1,to:2,attack:[6,4,2]}});
  await h.tick();assert.equal(h.calls.length,1);
  h.update({phase:'attack',actor:0,pending:null});h.ready=false;
  await h.tick();assert.equal(h.calls.length,1);
  h.ready=true;await h.tick();assert.equal(h.calls.length,2);
});

test('defense waits for a revealed roll, applies the rule and waits for the next attack',async()=>{
  const h=harness();h.update({me:1,actor:1,phase:'defend',pending:{from:1,to:2,attack:[6,5,3]}});
  h.ready=false;assert.equal(h.controller.start('defend',1,2),false);
  h.ready=true;assert.equal(h.controller.start('defend',1,2),true);
  await h.tick();assert.deepEqual(h.calls[0],{type:'defend',from:1,to:2,dice:1});
  await h.tick();assert.equal(h.calls.length,1);
  h.update({phase:'attack',actor:0,pending:null});await h.tick();assert.equal(h.calls.length,1);
  h.update({phase:'defend',actor:1,pending:{from:1,to:2,attack:[5,4]}});await h.tick();
  assert.equal(h.calls.at(-1).dice,2);
  h.controller.stop();assert.equal(h.tasks.size,0);
});

test('conquest, phase/turn/room changes and a different combat stop the automatics',async()=>{
  for(const change of [
    {phase:'occupy'}, {phase:'finished'}, {phase:'fortify'}, {turn:1}, {round:3}, {code:'OTHER'},
    {territories:[{owner:0,troops:7},{owner:0,troops:0}]},
    {phase:'defend',pending:{from:1,to:3,attack:[6]}}
  ]){
    const h=harness();h.controller.start('attack',1,2);h.update(change);await h.tick();
    assert.equal(h.controller.active,null,JSON.stringify(change));assert.equal(h.calls.length,0);
  }
});

test('failed actions stop without retries and invalid starts do nothing',async()=>{
  const h=harness();h.responder=async()=>false;h.controller.start('attack',1,2);await h.tick();
  assert.equal(h.controller.active,null);assert.equal(h.tasks.size,0);
  assert.equal(h.controller.start('attack',2,1),false);
  assert.equal(h.controller.start('attack',1,1),false);
  assert.equal(h.controller.start('defend',1,2),false);
});

test('a game pause suspends automatic combat, including an in-flight response, until resume',async()=>{
  const h=harness();let finish;
  h.responder=()=>new Promise(resolve=>finish=resolve);
  assert.equal(h.controller.start('attack',1,2),true);
  const pending=h.tick();
  h.update({paused:true});finish(false);await pending;
  for(let i=0;i<4;i++)await h.tick();
  assert.ok(h.controller.active);assert.equal(h.calls.length,1);assert.equal(h.messages.length,0);
  h.responder=async()=>true;
  h.update({paused:false});await h.tick();
  assert.equal(h.calls.length,2);assert.ok(h.controller.active);
  h.update({paused:true});h.controller.stop();
  assert.equal(h.controller.start('attack',1,2),false);
  assert.equal(h.tasks.size,0);
});

test('automatic defense uses the capital bonus without exceeding four dice',()=>{
  assert.equal(automaticDefenseDice({},1,[2,2,2],true),2);
  assert.equal(automaticDefenseDice({},2,[2,2,2],true),3);
  assert.equal(automaticDefenseDice({mountainous:true},20,[6,6,6],true),4);
});

test('automatic attacks use veteran dice and recalculate after casualties or recruits',async()=>{
  const h=harness();h.update({rules:'domination',territories:[{owner:0,troops:9,experience:Array(9).fill(5)},{owner:1,troops:10}]});
  h.controller.start('attack',1,2);await h.tick();assert.equal(h.calls.at(-1).dice,6);
  h.update({territories:[{owner:0,troops:5,experience:[0,1,1,1,1]},{owner:1,troops:10}]});
  await h.tick();assert.equal(h.calls.at(-1).dice,4);
  h.update({territories:[{owner:0,troops:10},{owner:1,troops:10}]});
  await h.tick();assert.equal(h.calls.at(-1).dice,3);h.controller.stop();
});

test('automatic veteran defense combines building and experience and recalculates each round',async()=>{
  const h=harness();h.update({rules:'domination',me:1,actor:1,phase:'defend',pending:{from:1,to:2,attack:[6,5,3]},territories:[{owner:0,troops:9},{owner:1,troops:12,buildingLevel:5,experience:Array(12).fill(5)}]});
  assert.equal(h.controller.start('defend',1,2),true);await h.tick();
  assert.equal(h.calls.at(-1).dice,10);
  h.update({territories:[{owner:0,troops:9},{owner:1,troops:8,buildingLevel:0,experience:Array(8).fill(1)}]});
  await h.tick();assert.equal(h.calls.at(-1).dice,3);
  h.update({pending:{from:1,to:2,attack:[6,6,5]}});await h.tick();
  assert.equal(h.calls.at(-1).dice,2);h.controller.stop();
});
