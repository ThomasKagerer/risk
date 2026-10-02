import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { controlledContinents, continentSelection } from '../web/continents.mjs';

const boards=await Promise.all(['board','world120','europe1871','simple-world'].map(async name=>JSON.parse(await readFile(new URL(name==='world120'?'../web/dlcs/world-1700/world120.json':name==='europe1871'?'../web/dlcs/europe-1871/europe1871.json':name==='simple-world'?'../web/dlcs/mini-world/simple-world.json':`../web/assets/${name}.json`,import.meta.url)))));

test('continent control follows complete ownership, including an immediate loss and reconquest',()=>{
  for(const board of boards){
    const game={phase:'attack',players:[{}, {}, {neutral:true}],territories:board.countries.map(()=>({owner:2,troops:1}))};
    const continent=board.continents[0],countries=board.countries.filter(c=>c.continent===continent.id);
    assert.deepEqual(controlledContinents(board,game,2),[],'neutral garrisons are not players with continent bonuses');
    for(const c of countries)game.territories[c.id-1].owner=0;
    assert.deepEqual(controlledContinents(board,game,0).map(c=>c.id),[continent.id]);
    game.territories[countries.at(-1).id-1].owner=1;
    assert.deepEqual(controlledContinents(board,game,0),[]);
    assert.deepEqual(controlledContinents(board,game,1),[]);
    game.territories[countries.at(-1).id-1].owner=0;
    assert.deepEqual(controlledContinents(board,game,0).map(c=>c.id),[continent.id]);
    game.territories[countries.at(-1).id-1].owner=-1;
    assert.deepEqual(controlledContinents(board,game,0),[],'unclaimed countries prevent control');
    assert.deepEqual(controlledContinents(board,null,0),[]);
  }
});

test('hover previews another continent and restores the pinned selection on exit',()=>{
  let shown,pinned;
  const selection=continentSelection((a,p)=>{shown=a;pinned=p;});
  selection.toggle(3);
  selection.hover(1);
  assert.equal(shown,1);assert.equal(pinned,3);
  selection.hover(0);
  assert.equal(shown,3);
  selection.toggle(3);
  assert.equal(shown,0);assert.equal(pinned,0);
});

test('keyboard and touch toggles can clear a highlight even while the button retains focus',()=>{
  let shown,pinned;
  const selection=continentSelection((a,p)=>{shown=a;pinned=p;});
  selection.focus(3);selection.toggle(3);
  assert.equal(pinned,3);
  selection.toggle(3);
  assert.equal(shown,0);
  selection.focus(4);
  assert.equal(shown,4);
  selection.clear();
  assert.equal(shown,0);assert.equal(pinned,0);
  selection.toggle(8);selection.focus(0);
  assert.equal(shown,8);
});

test('all selectable maps have separate continent outlines and valid overview label positions',()=>{
  for(const board of boards)for(const c of board.continents){
    assert.match(c.outline,/^M.+Z$/);
    assert.equal(c.bounds.length,4);
    assert.ok(c.bounds[2]>0&&c.bounds[3]>0);
    const [x,y]=c.labelPosition;
    assert.ok(x>0&&x<800&&y>0&&y<500,`${board.id} ${c.name}`);
  }
});
