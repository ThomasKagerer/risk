import test from 'node:test';
import assert from 'node:assert/strict';
import { frameBatch, armyLayer, viewportLayer, clampCamera, cameraViewBox, markerScale, setAttributeChanged, setTextChanged } from '../web/rendering.mjs';

function fakeFrames() {
  let id = 0;
  const pending = new Map();
  return {
    request(fn) { pending.set(++id, fn); return id; },
    cancel(id) { pending.delete(id); },
    tick() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(fn => fn()); },
    get size() { return pending.size; },
  };
}

test('input bursts render only the latest camera once per frame, then stay idle', () => {
  const frames = fakeFrames(), camera = { x: 0 }, rendered = [];
  const batch = frameBatch(() => rendered.push(camera.x), frames.request, frames.cancel);
  for (let i = 1; i <= 1000; i++) { camera.x = i; batch.schedule(); }
  assert.equal(frames.size, 1);
  frames.tick();
  assert.deepEqual(rendered, [1000]);
  assert.equal(frames.size, 0);
  frames.tick();
  assert.deepEqual(rendered, [1000]);
  camera.x = 1200;
  batch.schedule();
  frames.tick();
  assert.deepEqual(rendered, [1000, 1200]);
});

test('flushing or cancelling a pending frame does not leave duplicate work', () => {
  const frames = fakeFrames();
  let renders = 0;
  const batch = frameBatch(() => renders++, frames.request, frames.cancel);
  batch.schedule();
  batch.flush();
  frames.tick();
  assert.equal(renders, 1);
  batch.schedule();
  batch.cancel();
  frames.tick();
  assert.equal(renders, 1);
  assert.equal(frames.size, 0);
});

class FakeNode {
  children = [];
  attrs = new Map();
  writes = { html: 0, text: 0, attribute: 0, display: 0 };
  ownerDocument = { createElementNS: () => new FakeNode() };
  style = new Proxy({}, { set: (target, name, value) => { this.writes[name]++; target[name] = value; return true; } });
  appendChild(node) { this.children.push(node); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.writes.attribute++; this.attrs.set(name, value); }
  set innerHTML(value) { this.writes.html++; this.html = value; }
  set textContent(value) { this.writes.text++; this.text = value; }
  get textContent() { return this.text; }
}

test('42 armies survive camera frames and only changed territories rebuild', () => {
  const root = new FakeNode();
  const countries = Array.from({ length: 42 }, (_, i) => ({ x: i * 10, y: i * 5 }));
  const territories = countries.map((_, i) => ({ owner: i % 6, troops: 16 + i % 18 }));
  const colors = ['red', 'blue', 'gold', 'green', 'purple', 'brown'];
  const color = owner => colors[owner];
  const layer = armyLayer(root, countries, t => `${color(t.owner)}:${t.troops}`);
  assert.equal(layer.update(territories, color), 42);
  const nodes = [...root.children];
  for (let frame = 0; frame < 180; frame++) {
    layer.setVisible(frame < 90);
    assert.equal(layer.update(territories, color), 0);
  }
  assert.equal(root.writes.display, 2);
  assert.deepEqual(root.children, nodes);
  assert.ok(nodes.every(node => node.writes.html === 1));

  territories[4].troops--;
  assert.equal(layer.update(territories, color), 1);
  assert.equal(nodes[4].html, 'purple:19');
  assert.equal(nodes[4].writes.html, 2);
  assert.ok(nodes.filter((_, i) => i !== 4).every(node => node.writes.html === 1));

  territories[4].owner = 1;
  assert.equal(layer.update(territories, color), 1);
  assert.equal(nodes[4].html, 'blue:19');
  territories[4].troops = 0;
  assert.equal(layer.update(territories, color), 1);
  assert.equal(nodes[4].html, '');
  assert.equal(layer.update(null, color), 41);
  assert.ok(nodes.every(node => node.html === ''));
});

test('unchanged SVG labels and attributes cause no repeated DOM writes', () => {
  const node = new FakeNode();
  for (let i = 0; i < 100; i++) {
    setAttributeChanged(node, 'r', 9);
    setTextChanged(node, 16);
  }
  assert.equal(node.writes.attribute, 1);
  assert.equal(node.writes.text, 1);
  setTextChanged(node, 15);
  assert.equal(node.textContent, '15');
  assert.equal(node.writes.text, 2);
});

test('battle suppression hides only involved armies and banner changes redraw just their owner',()=>{
  const root=new FakeNode(),countries=[{id:1,x:0,y:0},{id:2,x:20,y:0},{id:3,x:40,y:0}];
  const territories=countries.map(()=>({owner:0,troops:5}));
  let bearer=1,name='Ada';
  const layer=armyLayer(root,countries,()=>name);
  const appearance=(t,c)=>c.id===bearer?name:'';
  layer.update(territories,()=> 'red',appearance);
  layer.suppress([1,2]);
  assert.deepEqual(root.children.map(n=>n.style.visibility),['hidden','hidden','']);
  layer.suppress();assert.ok(root.children.every(n=>n.style.visibility===''));
  name='Bea';assert.equal(layer.update(territories,()=> 'red',appearance),1);
  bearer=3;assert.equal(layer.update(territories,()=> 'red',appearance),2);
});

test('camera remains within the board at all supported zoom levels', () => {
  for (const zoom of [-1, 1, 1.8, 3, 6, 20]) {
    for (const x of [-9999, -70, 100]) for (const y of [-9999, -40, 100]) {
      const c = clampCamera({ zoom, x, y });
      assert.ok(c.zoom >= 1 && c.zoom <= 6);
      assert.ok(c.x >= 800 * (1 - c.zoom) && c.x <= 0);
      assert.ok(c.y >= 500 * (1 - c.zoom) && c.y <= 0);
      if (c.zoom === 1) { assert.equal(c.x, 0); assert.equal(c.y, 0); }
    }
  }
});

test('army counters keep their screen size across phone, tablet and desktop zoom', () => {
  for (const width of [320, 390, 768, 1400, 2400]) {
    const pixelsPerUnit = width / 800;
    for (const zoom of [1, 1.5, 1.8, 3, 6, 12, 18]) {
      const counterWidth = 20 * pixelsPerUnit * zoom * markerScale(zoom, pixelsPerUnit);
      assert.ok(Math.abs(counterWidth - 20) < 1e-9);
    }
  }
});


test('changing a miniature position only rebuilds its own territory', () => {
  const root=new FakeNode(),layer=armyLayer(root,[{id:1,x:20,y:30},{id:2,x:50,y:60}],t=>JSON.stringify(t.positions||[]));
  const territories=[{owner:0,troops:6},{owner:1,troops:10}];
  layer.update(territories,()=> 'red');
  territories[0].positions=[{x:22,y:35}];
  assert.equal(layer.update(territories,()=> 'red'),1);
  assert.equal(root.children[1].writes.html,1);
});

test('viewport culling keeps edge detail, skips repeated writes and restores nodes when panning',()=>{
  const nodes=Array.from({length:4},()=>new FakeNode());
  const layer=viewportLayer([
    {node:nodes[0],bounds:[400,250,1,1]},
    {node:nodes[1],bounds:[498,250,1,1]}, // 90 px beyond the visible right edge
    {node:nodes[2],bounds:[502,250,1,1]},
    {node:nodes[3],bounds:[0,0,350,220]}, // its center is offscreen, but its edge is visible
  ]);
  const camera={zoom:5,x:-1650,y:-900}; // visible x:330–490, y:180–280
  layer.update(camera,2);
  assert.deepEqual(nodes.map(n=>n.style.display),['','','none','']);
  for(let i=0;i<100;i++)layer.update(camera,2);
  assert.ok(nodes.every(n=>n.writes.display===1));
  layer.update({...camera,x:-2150},2);
  assert.deepEqual(nodes.map(n=>n.style.display),['none','','','none']);
  layer.update({zoom:1,x:0,y:0},.4);
  assert.ok(nodes.every(n=>n.style.display===''));
  assert.ok(nodes.every(n=>n.writes.html===0));
});

test('offscreen armies receive state updates and reappear without being rebuilt on pan',()=>{
  const root=new FakeNode(),countries=[{x:600,y:300,bounds:[560,260,80,80]}];
  const armies=armyLayer(root,countries,t=>`${t.owner}:${t.troops}`);
  const territories=[{owner:0,troops:16}];
  armies.update(territories,()=> 'red');
  const details=viewportLayer(armies.viewportItems());
  details.update({zoom:10,x:0,y:0});
  assert.equal(root.children[0].style.display,'none');
  territories[0].troops=15;armies.update(territories,()=> 'red');
  const writes=root.children[0].writes.html;
  details.update({zoom:10,x:-5600,y:-2600});
  assert.equal(root.children[0].style.display,'');
  assert.equal(root.children[0].html,'0:15');
  assert.equal(root.children[0].writes.html,writes);
});

test('SVG camera viewports preserve map positions, hit coordinates and counter sizes',()=>{
  for(const viewport of [{width:800,height:500},{width:281.25,height:500},{width:800,height:440}]){
    for(const zoom of [.4,1,3,8,18])for(const x of [-2700,-100,90]){
      const camera={x,y:-340,zoom};
      const [left,top,width,height]=cameraViewBox(camera,viewport).split(' ').map(Number);
      assert.ok(Math.abs(width/height-viewport.width/viewport.height)<1e-12);
      for(const point of [{x:0,y:0},{x:414,y:267},{x:800,y:500}]){
        const screen={x:(point.x-left)*viewport.width/width,y:(point.y-top)*viewport.height/height};
        assert.ok(Math.abs(screen.x-(point.x*zoom+x))<1e-9);
        assert.ok(Math.abs(screen.y-(point.y*zoom+camera.y))<1e-9);
        assert.ok(Math.abs((screen.x-camera.x)/zoom-point.x)<1e-9,'pointer-to-map coordinates must stay valid');
        assert.ok(Math.abs((screen.y-camera.y)/zoom-point.y)<1e-9);
      }
      assert.ok(Math.abs(20*markerScale(zoom)*viewport.width/width-20)<1e-9);
    }
  }
});

test('moving camera reveals incoming detail without discarding existing SVG renderers until it settles',()=>{
  const nodes=Array.from({length:3},()=>new FakeNode());
  const layer=viewportLayer(nodes.map((node,i)=>({node,bounds:[100+i*240,100,20,20]})));
  const start={zoom:4,x:0,y:-200},end={zoom:4,x:-1920,y:-200};
  layer.update(start,1);
  assert.deepEqual(nodes.map(n=>n.style.display),['','none','none']);
  const firstNode=nodes[0];
  layer.update(end,1,{width:800,height:500},true);
  assert.deepEqual(nodes.map(n=>n.style.display),['','none','']);
  for(let i=0;i<100;i++)layer.update(i%2?start:end,1,{width:800,height:500},true);
  assert.equal(firstNode.writes.display,1,'dragging back and forth must not blink existing detail');
  assert.equal(nodes[2].writes.display,2,'incoming detail is only revealed once');
  layer.update(end,1);
  assert.deepEqual(nodes.map(n=>n.style.display),['none','none','']);
  assert.equal(layer.stats().visible,1,'offscreen work is removed when the camera stops');
});

test('experience-only updates refresh map badges without rebuilding armies during camera movement',()=>{
 const root=new FakeNode(),layer=armyLayer(root,[{id:1,x:20,y:30},{id:2,x:50,y:60}],t=>JSON.stringify(t.experience||[]));
 const territories=[{owner:0,troops:6,experience:[0,1]},{owner:1,troops:10}];
 layer.update(territories,()=> 'red');territories[0].experience[1]=3;
 assert.equal(layer.update(territories,()=> 'red'),1);assert.equal(root.children[0].html,'[0,3]');
 for(let frame=0;frame<50;frame++)assert.equal(layer.update(territories,()=> 'red'),0);
});

test('overview shows the whole world inside the area left by portrait and landscape menus',()=>{
 for(const viewport of [
  {width:210,height:500,insets:{left:10,right:10,top:60,bottom:210}},
  {width:800,height:450,insets:{left:15,right:280,top:65,bottom:25}},
  {width:800,height:290,insets:{left:20,right:300,top:60,bottom:30}},
  {width:800,height:500},
 ]){
  const {left=0,right=0,top=0,bottom=0}=viewport.insets||{};
  const width=viewport.width-left-right,height=viewport.height-top-bottom;
  for(const offset of [-9999,0,9999]){
   const c=clampCamera({zoom:.01,x:offset,y:offset},6,viewport);
   assert.ok(c.x>=left-1e-9&&c.y>=top-1e-9);
   assert.ok(c.x+800*c.zoom<=left+width+1e-9);
   assert.ok(c.y+500*c.zoom<=top+height+1e-9);
   assert.ok(Math.abs(c.x+400*c.zoom-(left+width/2))<1e-9);
   assert.ok(Math.abs(c.y+250*c.zoom-(top+height/2))<1e-9);
  }
 }
});
