import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
const activationSource=source.slice(source.indexOf('function activateMapTarget('),source.indexOf('function selectTerritory('));
const inputSource=source.slice(source.indexOf('function initZoom(){'),source.indexOf('function zoomTo('));

function harness(fullscreen=true,building=false){
  const listeners={},nodes=new Map(),selections=[],buildings=[],actions=[],updates=[];
  let scheduled=0;
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set(),attributes=new Map();
      nodes.set(id,{dataset:{},addEventListener(type,fn){listeners[type]=fn;},setPointerCapture(){},
        getBoundingClientRect:()=>({left:0,top:0,width:800,height:500}),
        setAttribute:(k,v)=>attributes.set(k,v),getAttribute:k=>attributes.get(k)??null,
        classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)}});
    }
    return nodes.get(id);
  }
  const context=vm.createContext({
    $:node,ResizeObserver:class{observe(){}},window:{addEventListener(){}},
    document:{elementFromPoint:()=>({closest:selector=>selector==='[data-building-id]'?(building?{dataset:{buildingId:'1'}}:null):{dataset:{id:'1'}}})},
    camera:{x:-500,y:-250,zoom:2},viewport:{width:800,height:500},pixelsPerUnit:1,
    pointers:new Map(),drag:null,pieceDrag:null,dragMoved:false,cameraMotion:0,
    state:{phase:'attack',paused:false,pending:null},board:{maxZoom:18},busy:false,animating:false,
    fullscreenMap:()=>fullscreen,minimumZoom:()=>1,
    cameraFrame:{schedule(){scheduled++;}},pieceFrame:{schedule(){},cancel(){},flush(){const d=context.pieceDrag;d.node.setAttribute('transform',`translate(${d.last.x} ${d.last.y})`);}},
    inspectFigure:id=>selections.push(id),
    figurePlacement:{move(id,piece,position){actions.push({type:'arrange',territory:id,piece,position});}},
    openBuilding:id=>buildings.push(id),applyCamera(){updates.push({...context.camera});},selectTerritory:id=>selections.push(id),
    insideLand:()=>true,act:(type,args)=>actions.push({type,...args}),
    cancelPieceDrag(restore=true){if(context.pieceDrag&&restore)context.pieceDrag.node.setAttribute('transform',context.pieceDrag.original);context.pieceDrag=null;node('#world').classList.remove('arranging');},
  });
  vm.runInContext(activationSource+inputSource+'\ninitZoom();',context);
  function event(type,id,x,y,{pointerType='touch',figure=null,scale=1}={}){
    listeners[type]({type,pointerId:id,button:0,pointerType,clientX:x,clientY:y,
      scale,preventDefault(){},target:{closest:()=>figure}});
  }
  const figure=node('figure');figure.dataset={id:'1',piece:'0',x:'350',y:'225'};
  figure.setAttribute('transform','translate(350 225)');
  return {context,event,selections,buildings,actions,updates,figure,get scheduled(){return scheduled;}};
}
const cameraOf=h=>({...h.context.camera});

test('one touch selects countries but cannot pan the map in either layout',()=>{
  for(const fullscreen of [false,true]){
    const h=harness(fullscreen),initial=cameraOf(h);
    h.event('pointerdown',1,200,200);h.event('pointermove',1,310,260);h.event('pointerup',1,310,260);
    assert.deepEqual(cameraOf(h),initial);assert.deepEqual(h.selections,[]);assert.equal(h.updates.length,0);
    h.event('pointerdown',2,200,200);h.event('pointerup',2,200,200);
    assert.deepEqual(h.selections,[1]);
  }
});

test('two touches pan and pinch, then the remaining finger cannot pan or select',()=>{
  const h=harness();
  h.event('pointerdown',1,200,200);h.event('pointerdown',2,400,200);
  h.event('pointermove',1,240,230);h.event('pointermove',2,440,230);
  assert.deepEqual(cameraOf(h),{x:-460,y:-220,zoom:2});
  h.event('pointermove',2,540,230);
  assert.equal(h.context.camera.zoom,3);
  const pinched=cameraOf(h);
  h.event('pointerup',2,540,230);h.event('pointermove',1,340,330);h.event('pointerup',1,340,330);
  assert.deepEqual(cameraOf(h),pinched);assert.deepEqual(h.selections,[]);
  assert.equal(h.context.pointers.size,0);assert.equal(h.context.drag,null);
  assert.equal(h.scheduled,1,'release schedules the final viewport cleanup');
});

test('one touch can arrange an own figure; adding a second touch cancels arrangement and pans',()=>{
  const h=harness(),initial=cameraOf(h);
  h.event('pointerdown',1,200,200,{figure:h.figure});h.event('pointermove',1,240,220);h.event('pointerup',1,240,220);
  assert.deepEqual(cameraOf(h),initial);assert.equal(h.actions.length,1);
  assert.equal(h.actions[0].type,'arrange');assert.equal(h.actions[0].position.x,370);assert.equal(h.actions[0].position.y,235);
  assert.equal(h.figure.getAttribute('transform'),'translate(370 235)','drop stays at its destination while the request is pending');
  h.event('pointerdown',2,200,200,{figure:h.figure});h.event('pointermove',2,230,200);
  h.event('pointerdown',3,400,200);
  assert.equal(h.context.pieceDrag,null);assert.equal(h.figure.getAttribute('transform'),'translate(370 235)');
  h.event('pointermove',2,260,220);h.event('pointermove',3,430,220);
  assert.notDeepEqual(cameraOf(h),initial);
  h.event('pointerup',3,430,220);h.event('pointerup',2,260,220);
  assert.equal(h.actions.length,1,'pinch never saves an intermediate figure position');assert.deepEqual(h.selections,[]);
});

test('cancelled touches do not issue commands and the next tap works normally',()=>{
  const h=harness();
  h.event('pointerdown',1,200,200,{figure:h.figure});h.event('pointermove',1,240,220);h.event('pointercancel',1,240,220);
  assert.deepEqual(h.actions,[]);assert.deepEqual(h.selections,[]);assert.equal(h.context.pointers.size,0);
  h.event('pointerdown',2,200,200,{figure:h.figure});h.event('pointerup',2,200,200);
  assert.deepEqual(h.selections,[1]);
});

test('mouse dragging continues to pan with one pointer',()=>{
  const h=harness();
  h.event('pointerdown',1,200,200,{pointerType:'mouse'});h.event('pointermove',1,250,230,{pointerType:'mouse'});h.event('pointerup',1,250,230,{pointerType:'mouse'});
  assert.deepEqual(cameraOf(h),{x:-450,y:-220,zoom:2});assert.deepEqual(h.selections,[]);
});

test('Safari gesture events cannot apply pinch twice but trackpad gestures still zoom',()=>{
  const h=harness();
  h.event('pointerdown',1,200,200);h.event('pointerdown',2,400,200);
  h.event('gesturestart',0,300,200);h.event('pointermove',2,500,200);
  const pinched=cameraOf(h);
  h.event('gesturechange',0,300,200,{scale:1.5});
  assert.deepEqual(cameraOf(h),pinched);
  h.event('pointerup',2,500,200);h.event('pointerup',1,200,200);h.event('gestureend',0,300,200);
  h.event('gesturestart',0,300,200);h.event('gesturechange',0,300,200,{scale:2});h.event('gestureend',0,300,200);
  assert.equal(h.context.camera.zoom,pinched.zoom*2);
});


test('building taps open the building, while dragging or pinching never opens it',()=>{
 for(const pointerType of ['mouse','touch']){
  const h=harness(true,true);
  h.event('pointerdown',1,200,200,{pointerType});h.event('pointerup',1,200,200,{pointerType});
  assert.deepEqual(h.buildings,[1]);assert.deepEqual(h.selections,[]);
  assert.equal(h.context.dragMoved,true,'suppress the subsequent click after handling pointerup');
  h.event('pointerdown',2,200,200,{pointerType});h.event('pointermove',2,240,220,{pointerType});h.event('pointerup',2,240,220,{pointerType});
  assert.deepEqual(h.buildings,[1]);
 }
 const h=harness(true,true);
 h.event('pointerdown',1,200,200);h.event('pointerdown',2,400,200);h.event('pointermove',2,500,200);
 h.event('pointerup',2,500,200);h.event('pointerup',1,200,200);
 assert.deepEqual(h.buildings,[]);assert.deepEqual(h.selections,[]);
});
