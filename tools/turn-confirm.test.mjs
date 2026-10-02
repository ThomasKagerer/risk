import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
const advanceSource=source.slice(source.indexOf('function advancePhase()'),source.indexOf('function connect('));
function harness(patch={}){
  const nodes=new Map(),actions=[],notices=[],dialogs=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{open:false,disabled:false,close(){this.open=false;},focus(){this.focused=true;}});
    return nodes.get(id);
  };
  const context=vm.createContext({
    $:node,busy:false,animating:false,connectionEpoch:1,
    state:{code:'TURN01',revision:10,round:2,turn:0,actor:0,me:0,phase:'fortify',conquered:false,moved:false,paused:false,...patch},
    meActing:()=>context.state?.actor===context.state?.me,
    act(type){actions.push({type,revision:context.state.revision,me:context.state.me});},
    openModal(title,html){dialogs.push({title,html});node('#modal').open=true;},
    toast:text=>notices.push(text),
  });
  vm.runInContext(advanceSource,context);
  return {context,node,actions,notices,dialogs,confirm:()=>node('#confirm-end-turn').onclick({currentTarget:node('#confirm-end-turn')})};
}

test('ending a turn without conquest asks first, including after troop movement',async()=>{
  for(const moved of [false,true]){
    const h=harness({moved});h.context.advancePhase();
    assert.equal(h.node('#modal').open,true);assert.equal(h.actions.length,0);
    assert.match(h.dialogs[0].html,/keine Gebietskarte/);assert.match(h.dialogs[0].title,/ohne Eroberung/);
    assert.equal(h.node('#cancel-end-turn').focused,true,'Enter must not accidentally confirm');
    await h.confirm();
    assert.deepEqual(h.actions,[{type:'next',revision:10,me:0}]);assert.equal(h.node('#modal').open,false);
    assert.equal(h.node('#confirm-end-turn').disabled,true);
  }
});

test('cancelling leaves the turn unchanged and asks again on the next attempt',()=>{
  const h=harness();h.context.advancePhase();h.node('#cancel-end-turn').onclick();
  assert.equal(h.actions.length,0);assert.equal(h.node('#modal').open,false);assert.equal(h.context.state.phase,'fortify');
  h.context.advancePhase();assert.equal(h.dialogs.length,2);assert.equal(h.node('#modal').open,true);
});

test('a conquest ends the turn directly while earlier phase transitions remain unchanged',()=>{
  for(const patch of [{conquered:true},{phase:'attack'},{phase:'reinforce'}]){
    const h=harness(patch);h.context.advancePhase();
    assert.equal(h.dialogs.length,0);assert.equal(h.actions.length,1);
  }
});

test('an old confirmation cannot end a changed game or another hotseat player turn',async()=>{
  for(const change of [
    c=>c.state.revision++,c=>c.state.code='TURN02',c=>{c.state.me=1;c.state.actor=1;},
    c=>c.connectionEpoch++,c=>c.state.phase='attack',c=>c.state.paused=true,
    c=>c.state.actor=1,c=>c.state=null,
  ]){
    const h=harness();h.context.advancePhase();change(h.context);await h.confirm();
    assert.equal(h.actions.length,0);assert.equal(h.notices.length,1);assert.equal(h.node('#modal').open,false);
  }
});

test('paused, busy, animated or other-player states cannot open or submit the confirmation',async()=>{
  for(const change of [c=>c.busy=true,c=>c.animating=true,c=>c.state.paused=true,c=>c.state.actor=1,c=>c.state=null]){
    const h=harness();change(h.context);h.context.advancePhase();assert.equal(h.actions.length,0);assert.equal(h.dialogs.length,0);
  }
  for(const key of ['busy','animating']){
    const h=harness();h.context.advancePhase();h.context[key]=true;await h.confirm();
    assert.equal(h.actions.length,0);assert.equal(h.node('#modal').open,true);
  }
});
