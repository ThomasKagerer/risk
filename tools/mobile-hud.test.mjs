import './content-fixture.mjs';
import { setLanguage, localize as tr, currentLocale, serverText, localizeBoard } from '../web/i18n.mjs';
await setLanguage('de',{persist:false});
import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileOrder} from '../web/mobile-hud.mjs';
import {clampCamera, viewportLayer} from '../web/rendering.mjs';
const countries=[{id:1,name:'Bayern'},{id:2,name:'Böhmen'}];
const base={code:'TEST',me:0,actor:0,phase:'attack',players:[{name:'Tom',territories:5},{name:'Bot'}],territories:[{owner:0,troops:24},{owner:1,troops:3}]};
const order=(changes={},from=0,to=0)=>mobileOrder({...base,...changes},from,to,countries);
test('the mini-world command counts two starting countries',()=>{
 assert.match(order({phase:'claim',rules:'domination',map:'simple-world',players:[{name:'Tom',territories:1}]}).hint,/1 von 2 gewählt/);
});
test('mobile commands follow actor, mandatory card trade, pause and occupation',()=>{
 assert.equal(order({phase:'reinforce'}).placement,true);
 assert.equal(order({phase:'reinforce',mustTrade:true}).action,'#force-trade');
 assert.equal(order({phase:'reinforce',actor:1}).placement,undefined);
 assert.equal(order({paused:true}).action,'#resume-game');
 assert.equal(order({phase:'occupy',pending:{to:2}}).sheet,'orders');
 assert.match(order({phase:'occupy',pending:{to:2}}).title,/Böhmen/);
});
test('capital confirmation only appears for owned land and troop movement needs its destination',()=>{
 assert.equal(order({phase:'capital'},1).action,'#choose-capital');
 assert.equal(order({phase:'capital'},2).action,null);
 assert.equal(order({phase:'fortify'},1).action,'#next');
 assert.equal(order({phase:'fortify'},1,2).sheet,'orders');
 assert.equal(order({phase:'fortify',moved:true},1,2).action,'#next');
 assert.equal(order({phase:'finished',winner:0}).sheet,'statistics');
});
test('camera keeps the overview clear of floating HUD controls and allows panning when zoomed',()=>{
 for(const viewport of [{width:231,height:500,insets:{left:18,right:27,top:74,bottom:142}},{width:800,height:370,insets:{left:33,right:360,top:100,bottom:62}}]){
  const i=viewport.insets,w=viewport.width-i.left-i.right,h=viewport.height-i.top-i.bottom;
  const near=clampCamera({zoom:2,x:10000,y:10000},12,viewport);
  assert.equal(near.x,i.left);assert.equal(near.y,i.top);
  const far=clampCamera({zoom:2,x:-10000,y:-10000},12,viewport);
  assert.equal(far.x,i.left+w-1600);assert.equal(far.y,i.top+h-1000);
  const overview=clampCamera({zoom:0,x:0,y:0},12,viewport);
  assert.ok(overview.x>=i.left&&overview.y>=i.top);
  assert.ok(overview.x+800*overview.zoom<=viewport.width-i.right+.0001);
  assert.ok(overview.y+500*overview.zoom<=viewport.height-i.bottom+.0001);
 }
});
test('portrait culling follows the actual narrow viewport and restores countries after a pan',()=>{
 const node={style:{}};const layer=viewportLayer([{node,bounds:[500,200,10,10]}]);
 layer.update({zoom:2,x:0,y:0},1,{width:230,height:500});assert.equal(node.style.display,'none');
 layer.update({zoom:2,x:-900,y:0},1,{width:230,height:500});assert.equal(node.style.display,'');
});
