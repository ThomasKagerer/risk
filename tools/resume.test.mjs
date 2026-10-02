import test from 'node:test';
import assert from 'node:assert/strict';
import { roomCodeFromHash, loadRoom, restoredView } from '../web/resume.mjs';

test('game links select exactly their room, including lowercase links',()=>{
  assert.equal(roomCodeFromHash('#s22dhv'),'S22DHV');
  for(const hash of ['', '#map-choice', '#S22DHV/other', '#<script>'])assert.equal(roomCodeFromHash(hash),'');
});

test('a temporary disconnect retries the same read and recovers the player',async()=>{
  let calls=0;const delays=[],game={code:'S22DHV',me:1};
  const result=await loadRoom(async()=>{if(++calls<3)throw new TypeError('offline');return game;},async ms=>delays.push(ms));
  assert.equal(result,game);assert.equal(calls,3);assert.deepEqual(delays,[750,2000]);
});

test('missing games and access failures stop; server failures have bounded retries',async()=>{
  for(const error of [{status:401},{status:403},{status:404},{authRequired:true},{status:503}]){
    let calls=0;
    await assert.rejects(()=>loadRoom(async()=>{calls++;throw Object.assign(new Error('failed'),error);},async()=>{}));
    assert.equal(calls,error.status===503?3:1);
  }
});

const board={countries:Array.from({length:42}),maxZoom:6};
const game={code:'S22DHV',me:1,map:'classic',revision:30};
const saved={...game,camera:{zoom:3,x:-950,y:-120},selected:14,target:15,amount:4,diceChoice:2,defenseChoice:1,battleFocus:'14:15'};
test('reload restores the map and selection without changing server game state',()=>{
  const before=JSON.stringify(game),view=restoredView(saved,game,board);
  assert.deepEqual(view.camera,saved.camera);assert.equal(view.selected,14);assert.equal(view.target,15);assert.equal(view.amount,4);
  assert.equal(JSON.stringify(game),before);
  assert.equal(restoredView(saved,{...game,me:0},board),null);
  assert.equal(restoredView(saved,{...game,code:'ABC234'},board),null);
  assert.equal(restoredView(saved,{...game,map:'world120'},board),null);
});

test('moves made while away invalidate stale selections but retain the map view',()=>{
  assert.deepEqual(restoredView(saved,{...game,revision:31},board),{camera:saved.camera});
  const pending={from:14,to:15};
  assert.equal(restoredView(saved,{...game,pending},board).battleFocus,'14:15');
  assert.equal(restoredView(saved,{...game,pending:{from:14,to:16}},board).battleFocus,undefined);
});

test('reload keeps a phone overview below the desktop zoom level',()=>{
  const viewport={width:260,height:500,insets:{left:20,right:30,top:85,bottom:165}};
  const camera={zoom:210/800,x:20,y:144.375};
  assert.deepEqual(restoredView({...saved,camera},game,board,viewport).camera,camera);
});

test('invalid stored preferences cannot break reconnecting',()=>{
  assert.equal(restoredView(null,game,board),null);
  assert.equal(restoredView({...saved,camera:{zoom:NaN,x:0,y:0}},game,board),null);
  const view=restoredView({...saved,selected:999,target:-1,amount:-4,camera:{zoom:99,x:200,y:-9999}},game,board);
  assert.equal(view.selected,0);assert.equal(view.target,0);assert.equal(view.amount,1);
  assert.deepEqual(view.camera,{zoom:6,x:0,y:-2500});
});

test('reload preserves veteran dice choices up to six attacking and ten defending',()=>{
 const view=restoredView({...saved,diceChoice:6,defenseChoice:10},game,board);
 assert.equal(view.diceChoice,6);assert.equal(view.defenseChoice,10);
 for(const defenseChoice of [0,11,2.5,'10'])assert.equal(restoredView({...saved,defenseChoice},game,board).defenseChoice,3);
});
