import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { startScreenMarkup } from '../web/start-screen.mjs';

const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
const renderHome=source.slice(source.indexOf('function renderHome()'),source.indexOf('function renderHome()')+source.slice(source.indexOf('function renderHome()')).indexOf('\nfunction '));
test('creating from either mode reads the existing select and preserves chosen map, goal and players',async()=>{
 for(const rules of ['classic','domination'])for(const map of ['classic','world120','europe1871','simple-world']){
  const nodes=new Map(),requests=[];let binding;
  const node=key=>{if(!nodes.has(key))nodes.set(key,{addEventListener(){}});return nodes.get(key);};
  for(const [key,value] of Object.entries({'#player-name':'Tom','#game-rules':rules,'#card-mode':rules==='classic'?'progressive':'fixed','#game-goal':rules==='classic'?'mission':'domination','input[name=map]:checked':map}))node(key).value=value;
  const players=[{name:'Bot A',kind:'local'},{name:'Bot B',kind:'berserker'}];
  const context=vm.createContext({$:key=>key==='input[name=rules]:checked'?null:node(key),
   location:{hash:''},roomCodeFromHash:()=>'',mapPicker:()=>'',board:{name:map},serverConfig:{},
   localStorage:{getItem:()=>'',setItem(){}},startScreenMarkup,
   bindStartScreen:(root,options)=>{binding=options;},draftPlayers:players,
   renderPlayerDraft(){},loadMyRooms(){},withForm:async(form,fn)=>fn(),connect:()=>{},
   api:async(path,body)=>{requests.push({path,body});return {};},
  });
  vm.runInContext(renderHome,context);context.renderHome();await binding.onCreate({});
  assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/rooms');
  assert.equal(requests[0].body.rules,rules);assert.equal(requests[0].body.map,map);
  assert.equal(requests[0].body.goal,rules==='classic'?'mission':'domination');assert.equal(requests[0].body.players,players);
 }
});
