import test from 'node:test';
import assert from 'node:assert/strict';
import { variantPicker, soundPlan, createSoundPlayer, bindSoundLifecycle } from '../web/sound-effects.mjs';

test('all five variants play before refill and adjacent variants never repeat',()=>{
  for(const random of [()=>0,()=>0.5,()=>0.999,Math.random]){
    const pick=variantPicker(random),values=Array.from({length:100},()=>pick('battle'));
    for(let i=1;i<values.length;i++)assert.notEqual(values[i],values[i-1]);
    for(let i=0;i<values.length;i+=5)assert.equal(new Set(values.slice(i,i+5)).size,5);
  }
});

test('every event has five distinct bounded sound plans with finite, valid synthesis parameters',()=>{
  for(const name of ['select','place','move','card','battle','impact','conquer']){
    const plans=Array.from({length:5},(_,variant)=>soundPlan(name,variant,()=>0.5));
    assert.equal(new Set(plans.map(plan=>JSON.stringify(plan))).size,5,name);
    for(const plan of plans)for(const note of plan){
      assert.ok(note.at>=0&&note.at+note.duration<2);
      assert.ok(note.duration>0&&note.volume>0&&note.volume<=0.3);
      assert.ok(Number.isFinite(note.frequency)&&note.frequency>0);
      if(note.wave!=='noise')assert.ok(Number.isFinite(note.end)&&note.end>0);
    }
  }
});

test('muted sound is lazy and missing Web Audio never prevents play',()=>{
  let requested=0;
  const player=createSoundPlayer({contextFactory:()=>{requested++;throw new Error('unsupported');}});
  player.unlock();player.play('battle');assert.equal(requested,0);
  player.setEnabled(true);player.play('battle');assert.equal(requested,2);
  player.setEnabled(false);player.play('conquer');assert.equal(requested,2);
});

test('dice and standalone attack rolls are silent',()=>{
  assert.deepEqual(soundPlan('dice',0),[]);
  assert.deepEqual(soundPlan('attack',0),[]);
});

function audioHarness(options={}){
  const contexts=[];let permitted=false;
  const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){},gain:parameter(),frequency:parameter(),Q:parameter(),threshold:parameter(),knee:parameter(),ratio:parameter()});
  const player=createSoundPlayer({enabled:true,random:()=>0.5,...options,contextFactory:()=>{
    const context={state:'suspended',currentTime:1,sampleRate:4,destination:{},starts:0,resumes:0,
      createGain:node,createDynamicsCompressor:node,createBiquadFilter:node,
      createBuffer:()=>({getChannelData:()=>new Float32Array(4)}),
      createOscillator(){return {...node(),start:()=>context.starts++,stop(){}};},
      createBufferSource(){return this.createOscillator();},
      resume(){this.resumes++;if(permitted){this.state='running';return Promise.resolve();}return Promise.reject(new Error('gesture required'));},
      suspend(){this.state='suspended';return Promise.resolve();},
      close(){this.closed=true;this.state='closed';return Promise.resolve();},
    };contexts.push(context);return context;
  }});
  const page=new EventTarget(),document=new EventTarget();document.hidden=false;
  return {player,page,document,contexts,permit(){permitted=true;}};
}

test('remembered audio starts on reload when allowed and unlocks on the first gesture when blocked',async()=>{
  for(const allowedInitially of [false,true]){
    const h=audioHarness();if(allowedInitially)h.permit();
    bindSoundLifecycle(h.player,h.page,h.document);await Promise.resolve();
    assert.equal(h.contexts.length,1);const context=h.contexts[0];
    h.player.play('battle');assert.equal(context.starts>0,allowedInitially);
    if(!allowedInitially){
      h.permit();h.page.dispatchEvent(new Event('pointerup'));await Promise.resolve();
      assert.equal(context.starts,0,'blocked old sounds must not be replayed');
      h.player.play('battle');assert.ok(context.starts>0);
    }
  }
});

test('audio recovers after interruption and page restore while a muted preference stays muted',async()=>{
  const h=audioHarness();h.permit();bindSoundLifecycle(h.player,h.page,h.document);
  const context=h.contexts[0];context.state='interrupted';
  h.document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();
  assert.equal(context.state,'running');h.player.play('cannon');assert.ok(context.starts>0);
  context.state='closed';h.page.dispatchEvent(new Event('pageshow'));
  assert.equal(h.contexts.length,2);assert.equal(h.contexts[1].state,'running');
  h.player.setEnabled(false);const resumed=h.contexts[1].resumes;
  for(const event of ['pageshow','focus','click','pointerdown','pointerup','keydown'])h.page.dispatchEvent(new Event(event));
  h.document.dispatchEvent(new Event('visibilitychange'));h.player.play('battle');
  assert.equal(h.contexts[1].resumes,resumed);assert.equal(h.contexts[1].starts,0);
});


test('a stuck interrupted context is replaced on a gesture without replaying queued battle audio',async()=>{
 const h=audioHarness();h.permit();await h.player.unlock();const old=h.contexts[0];
 h.player.background();old.state='interrupted';old.resume=()=>new Promise(()=>{});
 h.player.foreground();h.player.play('battle');assert.equal(old.starts,0);
 await h.player.unlock({gesture:true});
 assert.equal(old.closed,true);assert.equal(h.contexts.length,2);
 assert.equal(h.player.status,'ready');assert.equal(h.contexts[1].starts,0);
 h.player.play('cannon');assert.ok(h.contexts[1].starts>0);
});

test('a running but frozen audio clock is detected and rebuilt after returning',async()=>{
 let clock=0,id=0;const timers=new Map();
 const h=audioHarness({now:()=>clock,schedule:fn=>{timers.set(++id,fn);return id;},cancel:id=>timers.delete(id)});
 h.permit();await h.player.unlock();await h.player.foreground();
 clock=300;for(const fn of [...timers.values()])fn();
 assert.equal(h.player.status,'blocked');
 await h.player.unlock({gesture:true});assert.equal(h.contexts.length,2);assert.equal(h.player.status,'ready');
});

test('background effects are dropped, a late resume cannot unmute, and off stays off on return',async()=>{
 const h=audioHarness();h.permit();await h.player.unlock();
 h.player.background();h.player.play('battle');assert.equal(h.contexts[0].starts,0);
 let finish;const ctx=h.contexts[0];ctx.resume=()=>new Promise(resolve=>{finish=()=>{ctx.state='running';ctx.onstatechange?.();resolve();};});
 h.player.foreground();h.player.setEnabled(false);finish();await Promise.resolve();
 assert.equal(h.player.status,'off');assert.equal(ctx.state,'suspended');
 h.player.foreground();await h.player.unlock({gesture:true});h.player.play('battle');
 assert.equal(h.contexts.length,1);assert.equal(ctx.starts,0);
});

test('visibility and pagehide stop voices and cleanup removes all recovery listeners',()=>{
 const page=new EventTarget(),doc=new EventTarget();doc.hidden=false;const calls=[];
 const unbind=bindSoundLifecycle({unlock:()=>calls.push('unlock'),background:()=>calls.push('sleep'),foreground:()=>calls.push('wake')},page,doc);
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));page.dispatchEvent(new Event('click'));
 assert.deepEqual(calls,['unlock','sleep']);
 doc.hidden=false;page.dispatchEvent(new Event('pageshow'));assert.equal(calls.at(-1),'wake');
 page.dispatchEvent(new Event('touchend'));assert.equal(calls.at(-1),'unlock');
 page.dispatchEvent(new Event('pagehide'));assert.equal(calls.at(-1),'sleep');
 unbind();const count=calls.length;
 for(const event of ['pointerdown','touchend','pageshow','pagehide','focus'])page.dispatchEvent(new Event(event));
 doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls.length,count);
});
