import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleIntro, attackRouteMarkup } from '../web/battle-intro.mjs';

const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const game={code:'TEST',turn:0,round:1},from={id:1,x:20,y:40},to={id:2,x:90,y:75};
function harness(){
  const events=[],timers=[];let focusReady;
  const camera=new Promise(resolve=>focusReady=resolve);
  const intro=createBattleIntro({
    show:(a,b)=>events.push(['show',a.id,b.id]),focus:()=>camera,
    tick:seconds=>events.push(['tick',seconds]),hide:completed=>events.push(['hide',completed]),
    schedule:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},
    cancel:timer=>{const i=timers.indexOf(timer);if(i>=0)timers.splice(i,1);},
  });
  return {intro,events,timers,focusReady,async step(){const timer=timers.shift();assert.equal(timer.ms,1000);timer.fn();await flush();}};
}
test('a new route stays visible for two full seconds after the camera arrives, also with reduced motion',async()=>{
  for(const reduced of [false,true]){
    const h=harness();let finished=false;
    const pending=h.intro.present(game,from,to,reduced).then(result=>{finished=result;});
    assert.deepEqual(h.events,[['show',1,2]]);assert.equal(h.timers.length,0);
    h.focusReady();await flush();assert.deepEqual(h.events.at(-1),['tick',2]);
    await h.step();assert.deepEqual(h.events.at(-1),['tick',1]);assert.equal(finished,false);
    await h.step();await pending;assert.equal(finished,true);assert.deepEqual(h.events.at(-1),['hide',true]);
    const previous=h.events.length;
    assert.equal(await h.intro.present(game,from,to,reduced),true);
    assert.equal(h.events.length,previous,'same border continues without another countdown');
    const next=h.intro.present(game,to,{...from,id:3},reduced);
    await flush();assert.deepEqual(h.events.at(-2),['show',2,3]);
    h.intro.cancel();assert.equal(await next,false);
  }
});
test('pause or reconnect cancels camera and countdown without a late restart',async()=>{
  for(const duringCountdown of [false,true]){
    const h=harness(),pending=h.intro.present(game,from,to,false);
    if(duringCountdown){h.focusReady();await flush();await h.step();}
    h.intro.cancel();assert.equal(await pending,false);assert.equal(h.timers.length,0);
    h.focusReady();await flush();assert.deepEqual(h.events.at(-1),['hide',false]);
    assert.equal(h.timers.length,0);
  }
});
test('the same border in a later player turn gets its own introduction',async()=>{
  const h=harness(),first=h.intro.present(game,from,to,false);
  h.focusReady();await flush();await h.step();await h.step();await first;
  const next=h.intro.present({...game,round:2},from,to,false);
  await flush();assert.deepEqual(h.events.at(-2),['show',1,2]);
  h.intro.cancel();await next;
});
test('route geometry points to the destination and remains finite for short and long routes',()=>{
  for(const end of [to,{id:3,x:20.01,y:40},{id:4,x:780,y:470}])for(const scale of [.08,1,3]){
    const svg=attackRouteMarkup(from,end,scale);
    assert.match(svg,/START/);assert.match(svg,/ZIEL/);assert.match(svg,/vector-effect="non-scaling-stroke"/);
    assert.doesNotMatch(svg,/NaN|Infinity/);
    assert(svg.includes(`translate(${end.x} ${end.y}) scale(${scale})`));
  }
  assert.equal(attackRouteMarkup(from,from),'');
});

test('attack labels and arrow keep their SVG nodes through panning and zooming',async()=>{
  const {renderAttackRoute}=await import('../web/battle-intro.mjs');
  let rebuilds=0,attributes=0;
  const root={firstChild:null,nodes:{},set innerHTML(value){rebuilds++;this.firstChild=value?{}:null;this.nodes=Object.fromEntries(['halo','line','arrow','start','end'].map(part=>[part,{attrs:{},setAttribute(name,value){attributes++;this.attrs[name]=value;}}]));},querySelector(selector){return this.nodes[selector.match(/"(.*?)"/)[1]];}};
  renderAttackRoute(root,from,to,1);
  const nodes={...root.nodes};
  for(let frame=0;frame<120;frame++)renderAttackRoute(root,from,to,1);
  assert.equal(rebuilds,1);assert.equal(attributes,0,'panning needs no route writes');
  for(let frame=1;frame<=120;frame++)renderAttackRoute(root,from,to,1/(1+frame/20));
  assert.equal(rebuilds,1,'zoom never replaces the arrow or text');
  assert.deepEqual(root.nodes,nodes);
  assert.equal(root.nodes.start.attrs.transform,`translate(${from.x} ${from.y}) scale(${1/7})`);
  root.innerHTML='';renderAttackRoute(root,from,to,.5);
  assert.equal(rebuilds,3,'a later introduction recreates a cleared layer once');
});
